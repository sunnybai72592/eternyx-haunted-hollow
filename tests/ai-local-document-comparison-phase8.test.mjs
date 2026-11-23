import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const source = await read("src/lib/ai/document-compare-tools.ts");
const page = await read("src/pages/AIDocumentIntelligence.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const requestSource = await read("src/lib/ai/studio-chat-request.ts");
async function compile(input) {
  const js = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
const diff = await compile(source);
const chat = await compile(requestSource);

test("bounded LCS diff reports exact original before/after line numbers", () => {
  const report = diff.compareLocalDocuments("Alpha\nBravo\nCharlie", "Alpha\nCharlie\nDelta", {
    beforeName: "old.txt", afterName: "new.txt",
  });
  assert.equal(report.beforeName, "old.txt");
  assert.equal(report.afterName, "new.txt");
  assert.equal(report.unchangedLines, 2);
  assert.equal(report.addedLines, 1);
  assert.equal(report.removedLines, 1);
  assert.deepEqual(report.changes, [
    { kind: "removed", beforeLine: 2, afterLine: null, text: "Bravo" },
    { kind: "added", beforeLine: null, afterLine: 3, text: "Delta" },
  ]);
  assert.equal(report.identical, false);
  assert.match(diff.formatDocumentComparison(report), /\- \[A line 2\] Bravo/);
  assert.match(diff.formatDocumentComparison(report), /\+ \[B line 3\] Delta/);
});

test("the same local text produces no fabricated differences", () => {
  const report = diff.compareLocalDocuments("A\nB\nC", "A\nB\nC");
  assert.equal(report.identical, true);
  assert.equal(report.unchangedLines, 3);
  assert.deepEqual(report.changes, []);
  assert.throws(() => diff.prepareDocumentComparisonAIRequest(report, ""), { code: "no_changes" });
});

test("Unicode and Windows line endings are compared without loss", () => {
  const report = diff.compareLocalDocuments("مرحبا\r\nSwat 🏔", "مرحبا\nSwat 🏔\nUpdated");
  assert.equal(report.unchangedLines, 2);
  assert.equal(report.addedLines, 1);
  assert.equal(report.changes[0].text, "Updated");
  assert.equal(report.changes[0].afterLine, 3);
});

test("whitespace-insensitive mode does not claim to change original source", () => {
  const exact = diff.compareLocalDocuments("one   two\nnext", "one two\nnext");
  assert.equal(exact.identical, false);
  const ignore = diff.compareLocalDocuments("one   two\nnext", "one two\nnext", { ignoreWhitespace: true });
  assert.equal(ignore.identical, true);
  assert.equal(ignore.unchangedLines, 2);
  assert.equal(ignore.ignoreWhitespace, true);
  assert.deepEqual(ignore.changes, []);
});

test("repeated lines and reordering remain deterministic and preserve the full diff", () => {
  const before = "A\nB\nA\nC";
  const after = "A\nA\nB\nC";
  const first = diff.compareLocalDocuments(before, after);
  const second = diff.compareLocalDocuments(before, after);
  assert.deepEqual(first, second);
  assert.equal(first.unchangedLines, 3);
  assert.equal(first.removedLines, 1);
  assert.equal(first.addedLines, 1);
  assert.match(diff.formatDocumentComparison(first), /Line reorderings may appear as removals/);
});

test("source and line limits are hard caps, not silent truncation", () => {
  assert.equal(diff.MAX_COMPARISON_CHARACTERS, 100000);
  assert.equal(diff.MAX_COMPARISON_LINES, 1200);
  assert.throws(() => diff.compareLocalDocuments("", "example"), { code: "invalid_source" });
  assert.throws(() => diff.compareLocalDocuments("example", "  "), { code: "invalid_source" });
  assert.throws(() => diff.compareLocalDocuments("x\u0000y", "z"), { code: "invalid_source" });
  assert.throws(() => diff.compareLocalDocuments("x".repeat(100001), "z"), { code: "too_long" });
  assert.throws(() => diff.compareLocalDocuments("x", "y\n".repeat(1200) + "z"), { code: "too_many_lines" });
  const boundary = diff.compareLocalDocuments("a\n".repeat(1199) + "a", "a\n".repeat(1199) + "a");
  assert.equal(boundary.unchangedLines, 1200);
});

test("the optional AI request sends complete small changes and stays within shared chat limits", () => {
  const changes = diff.compareLocalDocuments("A\nOld", "A\nNew");
  const prompt = diff.prepareDocumentComparisonAIRequest(changes, "What changed?");
  const request = chat.prepareStudioChatMessage("ai.documents.analyze", prompt);
  assert.ok(request.length <= chat.STUDIO_CHAT_MAX_MESSAGE_LENGTH);
  assert.match(request, /BEGIN UNTRUSTED TEXT COMPARISON/);
  assert.match(request, /Original A: Source A/);
  assert.match(request, /Original B: Source B/);
  assert.match(request, /Old/);
  assert.match(request, /New/);
  assert.match(request, /untrusted data/);
  assert.throws(() => diff.prepareDocumentComparisonAIRequest(changes, "x".repeat(251)), { code: "invalid_question" });
});

test("big diffs and giant changed lines cannot start an AI request", () => {
  const large = diff.compareLocalDocuments(
    Array.from({ length: 14 }, (_, i) => "Old" + i).join("\n"),
    Array.from({ length: 14 }, (_, i) => "New" + i).join("\n"),
  );
  assert.ok(large.changes.length > 12);
  assert.throws(() => diff.prepareDocumentComparisonAIRequest(large, ""), { code: "too_many_changes" });
  const oversized = diff.compareLocalDocuments("Old", "x".repeat(3800));
  assert.throws(() => diff.prepareDocumentComparisonAIRequest(oversized, ""), { code: "too_long" });
});

test("UI integrates real local diff and explicit paid AI analysis with no automatic calls", () => {
  assert.match(page, /compareLocalDocuments\(source, comparisonSource/);
  assert.match(page, /readLocalDocument\(file\)/);
  assert.match(page, /const version = \+\+comparisonReadVersion\.current/);
  assert.match(page, /if \(version !== comparisonReadVersion\.current\) return/);
  assert.match(page, /comparisonReadVersion\.current \+= 1/);
  assert.match(page, /invalidateComparison\(\)/);
  assert.match(page, /comparisonAI\.invalidate\(\)/);
  assert.match(page, /comparison\.changes\.slice\(0, 60\)/);
  assert.match(page, /formatDocumentComparison\(comparison\)/);
  assert.match(page, /JSON\.stringify\(comparison, null, 2\)/);
  assert.match(page, /prepareDocumentComparisonAIRequest\(comparison!?, comparisonQuestion\)/);
  assert.match(page, /comparisonAI\.run\("ai\.documents\.analyze", prompt\)/);
  assert.match(page, /Only clicking Analyze changes with AI Chat/);
  assert.match(page, /existing ai\.chat credits/);
  assert.match(page, /No automatic upload, PDF parsing, OCR, image analysis/);
  assert.doesNotMatch(page + source, /supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(/);
  assert.match(hub, /AI Document Intelligence/);
});
