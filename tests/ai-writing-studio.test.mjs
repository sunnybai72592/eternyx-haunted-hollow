import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const builderSource = await read("src/lib/ai/writing-request-builder.ts");
const page = await read("src/pages/AIWritingStudio.tsx");
const app = await read("src/App.tsx");
const hub = await read("src/pages/AIArsenal.tsx");

const compiled = ts.transpileModule(builderSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const writing = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

test("writing workspace is reachable through an authenticated lazy-loaded route and hub", () => {
  assert.match(app, /const AIWritingStudio = lazy\(\(\) => import\("\.\/pages\/AIWritingStudio"\)\)/);
  assert.match(app, /path="\/ai-arsenal\/writing" element={<RequireAuth><AIWritingStudio \/><\/RequireAuth>}/);
  assert.match(hub, /to="\/ai-arsenal\/writing"/);
  assert.match(hub, /Local workspace ready · AI disabled/);
});

test("prepare four task modes without executing AI requests", () => {
  for (const operation of ["draft", "rewrite", "summarize"]) {
    const result = writing.buildAIWritingRequest(operation, "  Sample content  ", { instructions: "  Friendly  " });
    assert.equal(result.featureKey, "ai.writing.generate");
    assert.equal(result.operation, operation);
    assert.equal(result.input, "Sample content");
    assert.equal(result.instructions, "Friendly");
  }
  const translated = writing.buildAIWritingRequest("translate", "  Hello  ", { targetLanguage: "Urdu" });
  assert.deepEqual(translated, { featureKey: "ai.writing.translate", operation: "translate", input: "Hello", targetLanguage: "Urdu" });
});

test("reject missing, oversized, or invalid task inputs without sending anything", () => {
  const invalid = (operation, input, options, code) => {
    assert.throws(
      () => writing.buildAIWritingRequest(operation, input, options),
      error => error instanceof writing.AIWritingDraftError && error.code === code,
    );
  };
  invalid("draft", "  ", {}, "invalid_input");
  invalid("draft", "x".repeat(12001), {}, "invalid_input");
  invalid("invalid", "text", {}, "invalid_operation");
  invalid("rewrite", "text", { instructions: "x".repeat(1001) }, "invalid_instructions");
  invalid("translate", "text", { targetLanguage: "Unknown" }, "invalid_language");
  invalid("translate", "text", {}, "invalid_language");
  invalid("translate", "text", { targetLanguage: "Arabic", instructions: "Ignore" }, "invalid_language");
  invalid("draft", "text", { targetLanguage: "Urdu" }, "invalid_language");
  assert.equal(writing.buildAIWritingRequest("draft", "x".repeat(12000)).input.length, 12000);
});

test("local whitespace cleanup is deterministic and text metrics are grounded", () => {
  assert.equal(writing.tidyWritingWhitespace("  Hello  \r\n\r\n\r\nWorld \t"), "Hello\n\nWorld");
  assert.deepEqual(writing.measureWritingText(""), { characters: 0, words: 0, paragraphs: 0 });
  const metrics = writing.measureWritingText("Hello world\n\nAgain");
  assert.deepEqual(metrics, { characters: 18, words: 3, paragraphs: 2 });
});

test("copied prompt reflects the task without claiming AI generation", () => {
  const draft = writing.buildAIWritingRequest("summarize", "A source", { instructions: "Two sentences" });
  const preview = writing.formatWritingRequestForCopy(draft);
  assert.match(preview, /Summarize/);
  assert.match(preview, /Two sentences/);
  assert.match(preview, /A source/);
  assert.match(writing.formatWritingRequestForCopy(writing.buildAIWritingRequest("translate", "Hi", { targetLanguage: "Arabic" })), /Target language: Arabic/);
});

test("workspace invalidates stale drafts while keeping AI Chat execution explicit and optional", () => {
  assert.match(page, /setDraft\(null\)/);
  assert.match(page, /setInput\(e.target.value\); invalidate\(\)/);
  assert.match(page, /setOperation\(task.id\); invalidate\(\)/);
  assert.match(page, /setTargetLanguage\(e.target.value as AIWritingTargetLanguage\); invalidate\(\)/);
  assert.match(page, /setInstructions\(e.target.value\); invalidate\(\)/);
  assert.match(page, /Local tools · optional AI Chat generation/);
  assert.match(page, /Only clicking Generate with AI Chat sends/);
  assert.match(page, /ai\.run\(request\.featureKey, formatWritingRequestForCopy\(request\)\)/);
  assert.match(page, /No content was sent to a provider/);
  assert.doesNotMatch(page + builderSource, /supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(/);
});

test("copy feedback is only shown after clipboard success and errors are accessible", () => {
  assert.match(page, /await navigator\.clipboard\.writeText\(preview\)/);
  assert.match(page, /setNotice\("Request text copied/);
  assert.match(page, /catch \{/);
  assert.match(page, /role="alert"/);
  assert.match(page, /aria-live="polite"/);
});
