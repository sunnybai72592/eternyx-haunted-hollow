import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../supabase/functions/_shared/document-context-ranking.ts", import.meta.url), "utf8");
const chat = await readFile(new URL("../supabase/functions/eternyx-ai-chat/index.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const rank = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

const chunks = [
  { chunk_index: 0, content: "The system has an introductory overview." },
  { chunk_index: 1, content: "The coating inspection uses dry film thickness and a holiday test." },
  { chunk_index: 2, content: "The coating adhesion criteria are presented in another section." },
  { chunk_index: 3, content: "Budget and staffing information is elsewhere." },
];

test("selects relevant document chunks by question rather than first N", () => {
  const selected = rank.rankDocumentContext("coating holiday test inspection", chunks, 2);
  assert.deepEqual(selected.map(c => c.chunk_index), [1, 2]);
});

test("relevance search returns empty for absent concepts rather than unrelated context", () => {
  assert.deepEqual(rank.rankDocumentContext("microbiology culture", chunks, 5), []);
  assert.deepEqual(rank.rankDocumentContext("the and what how", chunks, 5), []);
});

test("query terms are deduplicated, stopword filtered, and limited to 20", () => {
  assert.deepEqual(rank.getDocumentQueryTerms("Coating, coating and HOLIDAY inspection"), ["coating", "holiday", "inspection"]);
  assert.equal(rank.getDocumentQueryTerms(Array.from({ length: 40 }, (_, i) => "term" + i).join(" ")).length, 20);
});

test("tie breaking is deterministic and candidate/result bounds are enforced", () => {
  assert.deepEqual(rank.rankDocumentContext("coating", chunks, 2).map(c => c.chunk_index), [1, 2]);
  assert.throws(() => rank.rankDocumentContext("coating", chunks, 11), /Invalid document context limit/);
  assert.deepEqual(rank.rankDocumentContext("coating", [{ chunk_index: 0, content: "coating".repeat(5000) }]), []);
});

test("backend caller retains owner check, scans at most 200 and uses question-aware lookup", () => {
  assert.match(chat, /\.eq\("user_id", user\.id\)/);
  assert.match(chat, /\.limit\(200\)/);
  assert.match(chat, /rankDocumentContext\(question, data \?\? \[\], limit\)/);
  assert.match(chat, /retrieveRelevantChunks\(supabase, documentId, message, 5\)/);
});
