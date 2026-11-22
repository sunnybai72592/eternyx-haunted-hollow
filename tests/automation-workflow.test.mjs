import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  WORKFLOW_OPERATIONS, WORKFLOW_PRESETS, MAX_WORKFLOW_INPUT, MAX_WORKFLOW_STEPS,
  MAX_WORKFLOW_LINES, LocalWorkflowError, exportWorkflowConfiguration,
  getWorkflowPreset, normalizeWorkflowSteps, parseWorkflowConfiguration, runLocalWorkflow,
} from "../src/lib/automationWorkflow.mjs";

const step = (kind, extra = {}) => ({ id: kind, kind, ...extra });
const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("every advertised workflow operation is implemented and uniquely identified", () => {
  assert.equal(WORKFLOW_OPERATIONS.length, 10);
  assert.equal(new Set(WORKFLOW_OPERATIONS.map((item) => item.kind)).size, 10);
  for (const kind of WORKFLOW_OPERATIONS.map((item) => item.kind)) {
    const args = ["keep_contains", "drop_contains", "prefix", "suffix"].includes(kind) ? { value: "a" } :
      kind === "replace" ? { value: "a", replacement: "b" } : {};
    assert.doesNotThrow(() => runLocalWorkflow("a\nb", [step(kind, args)]));
  }
});

test("multistep cleanup executes in order and produces actual measured traces", () => {
  const result = runLocalWorkflow("  Alpha \n\nalpha\nBeta\nBeta", getWorkflowPreset("sort"));
  assert.equal(result.output, "Alpha\nBeta");
  assert.equal(result.outputLines, 2);
  assert.equal(result.trace.length, 4);
  assert.deepEqual(result.trace.map((entry) => [entry.beforeLines, entry.afterLines]), [[5, 5], [5, 4], [4, 2], [2, 2]]);
  assert.equal(result.trace[0].changed, true);
  assert.equal(result.trace[3].changed, false);
});

test("filter keeps and drops literal substrings with case controls", () => {
  assert.equal(runLocalWorkflow("Review\nreview\nother", [step("keep_contains", { value: "review" })]).output, "Review\nreview");
  assert.equal(runLocalWorkflow("Review\nreview\nother", [step("keep_contains", { value: "review", caseSensitive: true })]).output, "review");
  assert.equal(runLocalWorkflow("Review\nreview\nother", [step("drop_contains", { value: "review" })]).output, "other");
});

test("replacement is literal, case-insensitive by default and can erase matches", () => {
  assert.equal(runLocalWorkflow("A.b\na.b\nabc", [step("replace", { value: "A.B", replacement: "x" })]).output, "x\nx\nabc");
  assert.equal(runLocalWorkflow("fooFOO", [step("replace", { value: "foo", replacement: "", caseSensitive: false })]).output, "");
  assert.equal(runLocalWorkflow("FOOfoo", [step("replace", { value: "foo", replacement: "x", caseSensitive: true })]).output, "FOOx");
});

test("prefix/suffix and sort do not change the original input", () => {
  const input = "b\na";
  const result = runLocalWorkflow(input, [
    step("sort_asc"), step("prefix", { id: "prefix2", value: "[" }),
    step("suffix", { id: "suffix2", value: "]" }),
  ]);
  assert.equal(result.output, "[a]\n[b]");
  assert.equal(input, "b\na");
});

test("dedupe preserves first occurrence with optional case sensitivity", () => {
  assert.equal(runLocalWorkflow("ABC\nabc\nABC", [step("unique")]).output, "ABC");
  assert.equal(runLocalWorkflow("ABC\nabc\nABC", [step("unique", { caseSensitive: true })]).output, "ABC\nabc");
});

test("empty workflow and invalid step configuration fail closed", () => {
  assert.throws(() => runLocalWorkflow("a", []), (e) => e.code === "empty_workflow");
  assert.throws(() => runLocalWorkflow("a", [step("unknown")]), (e) => e.code === "invalid_step");
  assert.throws(() => runLocalWorkflow("a", [step("replace", { value: "x" })]), (e) => e.code === "invalid_value");
  assert.throws(() => runLocalWorkflow("a", [step("keep_contains", { value: "" })]), (e) => e.code === "invalid_value");
  assert.throws(() => normalizeWorkflowSteps([step("trim"), step("trim")]), (e) => e.code === "invalid_step");
  assert.throws(() => normalizeWorkflowSteps([step("unique", { caseSensitive: "yes" })]), (e) => e.code === "invalid_value");
});

test("preset plans are copies and do not mutate shared templates", () => {
  const first = getWorkflowPreset("clean");
  first[0].kind = "sort_desc";
  assert.equal(getWorkflowPreset("clean")[0].kind, "trim");
  assert.equal(WORKFLOW_PRESETS.length, 3);
  assert.throws(() => getWorkflowPreset("not-real"), (e) => e.code === "invalid_config");
});

test("export-import round trip carries steps, not processing input or personal data", () => {
  const original = getWorkflowPreset("review");
  const config = exportWorkflowConfiguration(original);
  assert.deepEqual(parseWorkflowConfiguration(config), original);
  assert.equal(JSON.parse(config).version, 1);
  assert.deepEqual(Object.keys(JSON.parse(config)).sort(), ["steps", "version"]);
  assert.ok(!config.includes("user-supplied input data"));
});

test("unknown versions, malformed JSON, duplicate IDs and oversized configs are rejected", () => {
  for (const bad of [
    "{",
    "{}",
    JSON.stringify({ version: 2, steps: [] }),
    JSON.stringify({ version: 1, steps: [step("trim"), step("trim")] }),
    "x".repeat(16001),
  ]) assert.throws(() => parseWorkflowConfiguration(bad), LocalWorkflowError);
});

test("execution enforces input, line, step and expanded-output budgets", () => {
  assert.throws(() => runLocalWorkflow("x".repeat(MAX_WORKFLOW_INPUT + 1), [step("trim")]), (e) => e.code === "input_too_large");
  assert.throws(() => runLocalWorkflow("x\n".repeat(MAX_WORKFLOW_LINES + 1), [step("trim")]), (e) => e.code === "too_many_lines");
  assert.throws(() => normalizeWorkflowSteps(Array.from({ length: MAX_WORKFLOW_STEPS + 1 }, (_, n) => ({ id: "id" + n, kind: "trim" }))), (e) => e.code === "invalid_steps");
  assert.throws(() => runLocalWorkflow("x".repeat(49999), [step("prefix", { value: "Y".repeat(120) })]), (e) => e.code === "output_too_large");
});

test("automation route exposes a real workbench, preserves list cleaner and has no privileged executor", async () => {
  const page = await read("src/pages/EcosystemPillarPage.tsx");
  const studio = await read("src/components/AutomationWorkflowStudio.tsx");
  const engine = await read("src/lib/automationWorkflow.mjs");
  assert.match(page, /<AutomationWorkflowStudio \/>/);
  assert.match(page, /<LineWorkflow \/>/);
  assert.match(studio, /runLocalWorkflow\(input, steps\)/);
  assert.match(studio, /Execution trace/);
  assert.match(studio, /Import config JSON/);
  assert.doesNotMatch(engine, /\bfetch\s*\(|\beval\s*\(|new Function|supabase|setInterval/);
});
