import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const lib = await read("src/lib/ai/document-structured-compare.ts");
const page = await read("src/pages/AIDocumentIntelligence.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const chat = await read("src/lib/ai/studio-chat-request.ts");
const compiled = ts.transpileModule(lib, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const s = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
const api = await import("data:text/javascript;base64," +
  Buffer.from(ts.transpileModule(chat, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString("base64"));

test("JSON structural diff ignores property order and reports real nested RFC 6901 pointers", () => {
  const a = '{"profile":{"name":"A","score":10},"tags":["CP","IR"],"z":null}';
  const b = '{"tags":["CP","DCVG"],"profile":{"score":12,"name":"A","new":true},"z":null}';
  const report = s.compareStructuredJson(a, b, { sourceA: "old.json", sourceB: "new.json" });
  assert.equal(report.mode, "json");
  assert.equal(report.sourceA, "old.json");
  assert.equal(report.sourceB, "new.json");
  assert.equal(report.identical, false);
  assert.deepEqual(report.changes, [
    { kind: "added", location: "/profile/new", before: null, after: "true" },
    { kind: "changed", location: "/profile/score", before: "10", after: "12" },
    { kind: "changed", location: "/tags/1", before: '"IR"', after: '"DCVG"' },
  ]);
  assert.equal(report.unchanged, 3);
  assert.match(s.formatStructuredComparison(report), /\/profile\/score/);
  assert.match(s.formatStructuredComparison(report), /BEFORE: 10/);
});

test("JSON pointer escaping, missing-vs-null and types are never guessed", () => {
  const a = '{"a/b":{"x~y":null},"num":1}';
  const b = '{"a/b":{"x~y":"value"},"num":"1","empty":null}';
  const report = s.compareStructuredJson(a, b);
  assert.deepEqual(report.changes, [
    { kind: "changed", location: "/a~1b/x~0y", before: "null", after: '"value"' },
    { kind: "added", location: "/empty", before: null, after: "null" },
    { kind: "changed", location: "/num", before: "1", after: '"1"' },
  ]);
  const reverse = s.compareStructuredJson('{"x":null}', "{}");
  assert.deepEqual(reverse.changes, [
    { kind: "removed", location: "/x", before: "null", after: null },
  ]);
  assert.deepEqual(s.compareStructuredJson('{"b":2,"a":1}', '{"a":1,"b":2}').changes, []);
  assert.equal(s.compareStructuredJson("1", "2").changes[0].location, "");
  assert.equal(s.compareStructuredJson("[]", "[]").identical, true);
});

test("JSON size, nesting, node and change caps fail closed without partial reports", () => {
  assert.throws(() => s.compareStructuredJson("{bad", "{}"), { code: "invalid_json" });
  assert.throws(() => s.compareStructuredJson("", "{}"), { code: "invalid_input" });
  assert.throws(() => s.compareStructuredJson("1".repeat(100001), "1"), { code: "too_long" });
  const deep = "[".repeat(34) + "1" + "]".repeat(34);
  assert.throws(() => s.compareStructuredJson(deep, deep), { code: "too_deep" });
  assert.throws(() => s.compareStructuredJson(JSON.stringify(Array(5100).fill(1)),
    JSON.stringify(Array(5100).fill(1))), { code: "too_many_nodes" });
  assert.throws(() => s.compareStructuredJson(JSON.stringify(Array(2100).fill(1)),
    JSON.stringify(Array(2100).fill(2))), { code: "too_many_changes" });
});

test("CSV parser understands CRLF, quoted commas, multiline values and escaped quotes", () => {
  const { header, rows } = s.parseStructuredCsv('\uFEFFid,note\r\n1,"a,b"\r\n2,"first\r\nsecond"\r\n3,"a ""quote"""\r\n');
  assert.deepEqual(header, ["id", "note"]);
  assert.deepEqual(rows, [["1", "a,b"], ["2", "first\nsecond"], ["3", 'a "quote"']]);
});

test("CSV comparison aligns by exact unique key irrespective of row or column order", () => {
  const before = 'id,name,note\n1,Alice,"a,b"\n2,Bob,Before\n';
  const after = 'note,id,name\n"a,b",1,Alicia\nNew,3,Cara\n';
  const report = s.compareStructuredCsv(before, after, "id");
  assert.equal(report.mode, "csv");
  assert.equal(report.keyColumn, "id");
  assert.equal(report.added, 1);
  assert.equal(report.removed, 1);
  assert.equal(report.changed, 1);
  assert.equal(report.unchanged, 1);
  assert.deepEqual(report.changes, [
    { kind: "changed", location: 'row "1" / column "name"', before: '"Alice"', after: '"Alicia"' },
    { kind: "removed", location: 'row "2"', before: '{"id":"2","name":"Bob","note":"Before"}', after: null },
    { kind: "added", location: 'row "3"', before: null, after: '{"note":"New","id":"3","name":"Cara"}' },
  ]);
  assert.match(s.formatStructuredComparison(report), /CSV key column: id/);
  assert.match(s.formatStructuredComparison(report), /Alicia/);
  assert.equal(s.compareStructuredCsv("id,v\n1,a\n2,b", "v,id\nb,2\na,1", "id").identical, true);
});

test("CSV invalid schema, duplicate/missing keys, malformed quotes and unequal widths are rejected", () => {
  assert.throws(() => s.compareStructuredCsv("id,name\n1,A", "id,name\n1,A", ""), { code: "invalid_key" });
  assert.throws(() => s.compareStructuredCsv("id,name\n1,A", "id,name\n1,A", "missing"), { code: "invalid_key" });
  assert.throws(() => s.compareStructuredCsv("id,name\n1,A\n1,B", "id,name\n1,A", "id"), { code: "duplicate_key" });
  assert.throws(() => s.compareStructuredCsv("id,name\n,A", "id,name\n1,A", "id"), { code: "invalid_key" });
  assert.throws(() => s.compareStructuredCsv("id,name\n1,A", "id,age\n1,20", "id"), { code: "schema_mismatch" });
  assert.throws(() => s.parseStructuredCsv('id,name\n1,"unclosed'), { code: "invalid_csv" });
  assert.throws(() => s.parseStructuredCsv("id,id\n1,2"), { code: "invalid_csv" });
  assert.throws(() => s.parseStructuredCsv("id,name\n1"), { code: "invalid_csv" });
  assert.throws(() => s.parseStructuredCsv("id,name\n1,2,3"), { code: "invalid_csv" });
});

test("CSV caps reject oversized rows and columns; empty datasets remain valid", () => {
  assert.throws(() => s.parseStructuredCsv(Array.from({ length: 101 }, (_, i) => "c" + i).join(",")), {
    code: "too_many_columns",
  });
  assert.throws(() => s.parseStructuredCsv("id\n" + Array.from({ length: 1201 }, (_, i) => String(i)).join("\n")), {
    code: "too_many_rows",
  });
  assert.equal(s.compareStructuredCsv("id,name\n", "id,name\n", "id").identical, true);
});

test("AI Chat only receives a whole bounded report after explicit user click", () => {
  const report = s.compareStructuredJson('{"level":2}', '{"level":3}');
  const prompt = s.prepareStructuredComparisonAIRequest(report, "What changed?");
  const request = api.prepareStudioChatMessage("ai.documents.analyze", prompt);
  assert.ok(request.length <= api.STUDIO_CHAT_MAX_MESSAGE_LENGTH);
  assert.match(request, /BEGIN UNTRUSTED STRUCTURED DIFF/);
  assert.match(request, /BEFORE: 2/);
  assert.match(request, /untrusted input/);
  assert.throws(() => s.prepareStructuredComparisonAIRequest(report, "x".repeat(251)), {
    code: "invalid_question",
  });
  assert.throws(() => s.prepareStructuredComparisonAIRequest(s.compareStructuredJson('{"a":1}', '{"a":1}'), ""), {
    code: "no_changes",
  });
  const many = s.compareStructuredJson(JSON.stringify(Array(13).fill(1)), JSON.stringify(Array(13).fill(2)));
  assert.throws(() => s.prepareStructuredComparisonAIRequest(many, ""), { code: "too_many_changes" });
  const long = s.compareStructuredJson('{"key":"short"}', JSON.stringify({ key: "x".repeat(3900) }));
  assert.throws(() => s.prepareStructuredComparisonAIRequest(long, ""), { code: "too_long" });
});

test("UI supports line, JSON and CSV modes with stale-result invalidation and complete local exports", () => {
  for (const token of [
    'value={comparisonMode}', '<option value="line">', '<option value="json">', '<option value="csv">',
    "setStructuredComparison(null)", "setComparison(null)", "comparisonAI.invalidate()",
    "compareStructuredJson(source, comparisonSource, options)",
    "compareStructuredCsv(source, comparisonSource, comparisonCsvKey, options)",
    "comparisonCsvKey", 'id="document-comparison-key"',
    "formatStructuredComparison(structuredComparison)",
    "JSON.stringify(structuredComparison, null, 2)",
    "structuredComparison.changes.slice(0, 50)", "downloadStructuredComparison",
    "prepareStructuredComparisonAIRequest(structuredComparison, comparisonQuestion)",
    'comparisonAI.run("ai.documents.analyze", prompt)',
  ]) assert.ok(page.includes(token), "Missing integration: " + token);
  assert.doesNotMatch(page + lib, /supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(/);
  assert.match(hub, /AI Document Intelligence/);
});
