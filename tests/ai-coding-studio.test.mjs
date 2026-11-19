import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const helper = await read("src/lib/ai/coding-local-tools.ts");
const page = await read("src/pages/AICodingStudio.tsx");
const app = await read("src/App.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const output = ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const local = await import("data:text/javascript;base64," + Buffer.from(output).toString("base64"));

test("Coding Studio has a protected lazy route and explicit directory link", () => {
  assert.ok(app.includes('const AICodingStudio = lazy(() => import("./pages/AICodingStudio"));'));
  assert.ok(app.includes('path="/ai-arsenal/coding" element={<RequireAuth><AICodingStudio /></RequireAuth>}'));
  assert.ok(hub.includes('to="/ai-arsenal/coding"'));
  assert.ok(hub.includes('Local workspace ready · AI disabled'));
});

test("source inspection reports exact line and character metrics and tracked patterns", () => {
  const input = "const a = 1;  \n\t// TODO refactor\nok";
  const result = local.inspectLocalCode(input, "javascript");
  assert.equal(result.characters, input.length);
  assert.equal(result.lines, 3);
  assert.equal(result.nonemptyLines, 3);
  assert.deepEqual(result.findings.map(x => [x.line, x.kind]), [
    [1, "trailing_whitespace"], [2, "indent_tabs"], [2, "todo_marker"],
  ]);
  assert.equal(result.jsonValid, null);
});

test("long lines and bounded findings are reported without unbounded UI output", () => {
  const long = "x".repeat(121);
  assert.deepEqual(local.inspectLocalCode(long, "python").findings.map(x => x.kind), ["long_line"]);
  const repeated = ("// TODO \t\n").repeat(200);
  const result = local.inspectLocalCode(repeated, "typescript");
  assert.equal(result.findings.length, 100);
  assert.equal(result.truncated, true);
  assert.match(local.formatInspectionReport(result), /Additional findings omitted/);
});

test("only JSON syntax receives parser validation; no JavaScript is executed", () => {
  assert.equal(local.inspectLocalCode('{"ok":true}', "json").jsonValid, true);
  assert.equal(local.inspectLocalCode('{"ok":}', "json").jsonValid, false);
  assert.equal(local.inspectLocalCode("const x = ???;", "javascript").jsonValid, null);
  assert.doesNotMatch(helper, /\beval\(|new Function\(/);
});

test("JSON pretty-printing is deterministic and rejects invalid JSON", () => {
  assert.equal(local.formatLocalJson('{"one":1,"two":{"value":true}}'), '{\n  "one": 1,\n  "two": {\n    "value": true\n  }\n}');
  assert.throws(() => local.formatLocalJson("{bad json}"), { code: "invalid_json" });
  assert.throws(() => local.formatLocalJson(" "), { code: "invalid_code" });
  assert.throws(() => local.formatLocalJson("x".repeat(50001)), { code: "invalid_code" });
});

test("formatting cannot exceed the code workspace limit", () => {
  const compact = "[" + Array(15000).fill("0").join(",") + "]";
  assert.ok(compact.length < local.MAX_LOCAL_CODE_LENGTH);
  assert.throws(() => local.formatLocalJson(compact), { code: "too_large" });
});

test("whitespace removal is explicit, bounded and normalizes CRLF", () => {
  assert.equal(local.removeLocalTrailingWhitespace("let x = 1; \r\n  const y = 2;\t\r\n"), "let x = 1;\n  const y = 2;\n");
  assert.throws(() => local.removeLocalTrailingWhitespace("x".repeat(50001)), { code: "invalid_code" });
});

test("invalid language, empty source and oversized source fail closed", () => {
  assert.throws(() => local.inspectLocalCode("code", "ruby"), { code: "invalid_language" });
  assert.throws(() => local.inspectLocalCode("   ", "python"), { code: "invalid_code" });
  assert.throws(() => local.inspectLocalCode("x".repeat(50001), "javascript"), { code: "invalid_code" });
});

test("review/explain request drafts reuse registry keys and retain source without submitting", () => {
  const source = "function example() { return 1; }";
  const review = local.prepareCodingRequest(source, "javascript", "review", "  Focus on tests  ");
  assert.deepEqual(review, {
    featureKey: "ai.coding.review", task: "review", language: "javascript",
    source, context: "Focus on tests",
  });
  const explain = local.prepareCodingRequest(source, "javascript", "explain");
  assert.equal(explain.featureKey, "ai.coding.assist");
  assert.match(local.formatCodingRequest(explain), /do not execute/);
  assert.match(local.formatCodingRequest(review), /Focus on tests/);
  assert.throws(() => local.prepareCodingRequest(source, "javascript", "fix"), { code: "invalid_task" });
  assert.throws(() => local.prepareCodingRequest(source, "javascript", "review", "x".repeat(1001)), { code: "invalid_context" });
});

test("report includes explicit mechanical-scope and non-security warnings", () => {
  const report = local.formatInspectionReport(local.inspectLocalCode("x", "plaintext"));
  assert.match(report, /Not a compiler, vulnerability scan, runtime test, or AI code review/);
  assert.match(page, /does not compile/);
  assert.match(page, /Source code stays in this browser/);
});

test("editing inputs clears stale inspection and request previews", () => {
  for (const fragment of [
    "setInspection(null);", "setDraft(null);",
    "setSource(e.target.value); invalidate();",
    "setLanguage(e.target.value as CodingLanguage); invalidate();",
    "setContext(e.target.value); invalidate();",
    'setTask("review"); invalidate();',
    'setTask("explain"); invalidate();',
  ]) assert.ok(page.includes(fragment), "Missing draft invalidation: " + fragment);
});

test("no provider invocation, code execution, billing, or AI results are claimed", () => {
  assert.doesNotMatch(page + helper, /supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(|\beval\(/);
  assert.match(page, /AI code review and generation are not enabled/);
  assert.match(page, /No AI output or credit charge is claimed/);
  assert.match(page, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(page, /role="alert"/);
  assert.match(page, /aria-live="polite"/);
});
