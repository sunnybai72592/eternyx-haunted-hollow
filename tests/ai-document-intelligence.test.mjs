import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const helper = await read("src/lib/ai/document-local-tools.ts");
const page = await read("src/pages/AIDocumentIntelligence.tsx");
const app = await read("src/App.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const compiled = ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const local = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

const file = (name, text, type = "text/plain") => ({
  name, type, size: Buffer.byteLength(text, "utf8"), text: async () => text,
});

test("AI Document Intelligence has an authenticated route and Arsenal link", () => {
  assert.ok(app.includes('const AIDocumentIntelligence = lazy(() => import("./pages/AIDocumentIntelligence"));'));
  assert.ok(app.includes('path="/ai-arsenal/documents" element={<RequireAuth><AIDocumentIntelligence /></RequireAuth>}'));
  assert.ok(hub.includes('to="/ai-arsenal/documents"'));
  assert.ok(hub.includes("Local workspace ready · AI disabled"));
});

test("supported local text files are loaded with bounded sizes and distinct types", async () => {
  for (const name of ["memo.txt", "notes.md", "notes.markdown", "table.csv", "data.json", "event.log"]) {
    const result = await local.readLocalDocument(file(name, "Example"));
    assert.equal(result.text, "Example");
    assert.equal(result.name, name);
    assert.equal(result.kind, name.endsWith("markdown") ? "md" : name.split(".").pop());
  }
  assert.equal(local.MAX_DOCUMENT_BYTES, 1024 * 1024);
});

test("invalid files and binary content fail before inspecting or uploading", async () => {
  for (const name of ["report.pdf", "photo.png", "unknown.bin", "", "x".repeat(256) + ".txt"]) {
    await assert.rejects(() => local.readLocalDocument(file(name, "Text")), { code: "invalid_file" });
  }
  await assert.rejects(() => local.readLocalDocument(file("x.txt", "a\u0000b")), { code: "invalid_text" });
  await assert.rejects(() => local.readLocalDocument({ ...file("x.txt", "ok"), size: 0 }), { code: "invalid_file" });
  await assert.rejects(() => local.readLocalDocument({ ...file("x.txt", "ok"), size: 1024 * 1024 + 1 }), { code: "invalid_file" });
});

test("file read failure maps to typed local error", async () => {
  await assert.rejects(() => local.readLocalDocument({
    name: "notes.md", size: 3, type: "text/markdown", text: async () => { throw Error("read"); },
  }), { code: "read_failed" });
});

test("document metrics count lines, words, characters and paragraphs deterministically", () => {
  const text = "Hello world\r\n\r\nSecond part";
  assert.deepEqual(local.measureDocumentText(text), {
    characters: text.length, words: 4, lines: 3, paragraphs: 2,
  });
});

test("case-sensitive and insensitive text search report real line and column positions", () => {
  const text = "Alpha alpha\nbeta Alpha";
  const insensitive = local.findDocumentMatches(text, "alpha");
  assert.equal(insensitive.total, 3);
  assert.deepEqual(insensitive.matches.map(x => [x.line, x.column]), [[1, 1], [1, 7], [2, 6]]);
  const sensitive = local.findDocumentMatches(text, "Alpha", true);
  assert.equal(sensitive.total, 2);
  assert.throws(() => local.findDocumentMatches(text, " "), { code: "invalid_search" });
});

test("large document searches cap result display while counting all matches", () => {
  const report = local.findDocumentMatches("x ".repeat(160), "x");
  assert.equal(report.total, 160);
  assert.equal(report.matches.length, 50);
  assert.equal(report.truncated, true);
});

test("Markdown heading inspection captures level and source line and caps results", () => {
  const outline = local.extractLocalMarkdownHeadings("# One\nbody\n## Two\n### Three");
  assert.deepEqual(outline.headings.map(x => [x.level, x.line, x.text]), [[1, 1, "One"], [2, 3, "Two"], [3, 4, "Three"]]);
  const many = local.extractLocalMarkdownHeadings("# Heading\n".repeat(110));
  assert.equal(many.headings.length, 100);
  assert.equal(many.truncated, true);
});

test("JSON inspection reports parsed structure but no inferred meanings", () => {
  const result = local.inspectLocalDocument('{"name":"value","items":[1,2]}', "json");
  assert.deepEqual(result.json.topLevelKeys, ["name", "items"]);
  assert.equal(result.json.root, "object");
  assert.equal(result.json.valid, true);
  assert.equal(local.inspectLocalJson("[1,2,3]").itemCount, 3);
  assert.equal(local.inspectLocalJson("{broken").valid, false);
  assert.equal(local.inspectLocalDocument("ordinary text", "txt").json, null);
});

test("CSV parser handles quoted commas, newlines and escaped quotes", () => {
  const csv = local.inspectLocalCsv('a,b\n"hi, there","first\nsecond"\n"a ""quote""",ok');
  assert.equal(csv.valid, true);
  assert.equal(csv.rows, 3);
  assert.equal(csv.columns, 2);
  assert.deepEqual(csv.preview[1], ["hi, there", "first\nsecond"]);
  assert.deepEqual(csv.preview[2], ['a "quote"', "ok"]);
  assert.equal(csv.inconsistentRows, 0);
});

test("CSV parser marks malformed quotes and inconsistent widths", () => {
  assert.equal(local.inspectLocalCsv('a,b\n"unfinished').valid, false);
  const malformed = local.inspectLocalCsv("a,b\none,two,three");
  assert.equal(malformed.valid, true);
  assert.equal(malformed.inconsistentRows, 1);
});

test("local document request drafts use existing feature keys but never generate results", () => {
  const analyze = local.prepareDocumentDraft("Document text", "txt", "analyze", " What are the facts? ");
  assert.deepEqual(analyze, {
    featureKey: "ai.documents.analyze", task: "analyze", kind: "txt",
    source: "Document text", instruction: "What are the facts?",
  });
  const extract = local.prepareDocumentDraft('{"amount":1}', "json", "extract", "amount");
  assert.equal(extract.featureKey, "ai.documents.extract");
  assert.match(local.formatDocumentDraft(extract), /BEGIN UNTRUSTED DOCUMENT TEXT/);
  assert.throws(() => local.prepareDocumentDraft("text", "txt", "extract", ""), { code: "invalid_instruction" });
  assert.throws(() => local.prepareDocumentDraft("text", "txt", "unknown", ""), { code: "invalid_task" });
});

test("stale file reads and derived findings are invalidated on source changes", () => {
  for (const fragment of [
    "const version = ++fileReadVersion.current",
    "if (version !== fileReadVersion.current) return",
    "fileReadVersion.current += 1;",
    "setInspection(null);",
    "setSearchResults(null);",
    "setDraft(null);",
    "setEditedSource(e.target.value)",
  ]) assert.ok(page.includes(fragment), "Missing local state boundary: " + fragment);
});

test("local workflows stay browser-only while AI requests require an explicit action", () => {
  assert.doesNotMatch(page + helper, /supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(|\beval\(/);
  assert.match(page, /No automatic upload, PDF parsing, OCR, image analysis/);
  assert.match(page, /Only clicking Analyze with AI Chat sends/);
  assert.match(page, /useAIStudioChat/);
  assert.match(page, /ai\.run\(request\.featureKey, formatDocumentDraft\(request\)\)/);
  assert.match(page, /setAiPassage\(null\)/);
  assert.match(page, /captureSelectedPassage/);
  assert.match(page, /source\.slice\(field\.selectionStart, field\.selectionEnd\)/);
  assert.match(page, /ai\.error/);
  assert.match(page, /ai\.result/);
  assert.match(page, /4,000 characters/);
  assert.match(page, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(page, /role="alert"/);
});

test("matches map back to source and preview across Unicode and mixed newlines", () => {
  const text = "İ🙂 [A+B]\r\nnext [a+b]\rlast";
  const result = local.findDocumentMatches(text, "[a+b]");
  assert.deepEqual(result.matches.map(m => [m.line, m.column]), [[1, 5], [2, 6]]);
  for (const m of result.matches) {
    const selected = text.replace(/\r\n?/g, "\n").slice(m.sourceOffset, m.sourceOffset + m.length);
    assert.equal(selected.toLowerCase(), "[a+b]");
    assert.equal(m.excerpt.slice(m.excerptOffset, m.excerptOffset + m.length), selected);
  }
});
