import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const rankingSource = await read("supabase/functions/_shared/document-context-ranking.ts");
const chunkSource = await read("supabase/functions/_shared/pdf-page-chunks.ts");
const chat = await read("supabase/functions/eternyx-ai-chat/index.ts");
const processDoc = await read("supabase/functions/process-document/index.ts");
const sql = await read("docs/sql/ai_document_search_fts_review.sql");
const ui = await read("src/pages/EternyxAI.tsx");
const load = async (source) => import("data:text/javascript;base64," +
  Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText).toString("base64"));
const rank = await load(rankingSource);
const pages = await load(chunkSource);

test("indexed search formats only validated Unicode tokens joined by authored OR operators", () => {
  assert.equal(rank.buildIndexedDocumentSearchQuery("CP IR pH"), "cp | ir | ph");
  assert.equal(rank.buildIndexedDocumentSearchQuery("the and what"), "");
  assert.equal(rank.buildIndexedDocumentSearchQuery("coating'); drop table documents; --"), "documents | coating | table | drop");
  assert.ok(rank.buildIndexedDocumentSearchQuery("hello world").length < 200);
  assert.equal(rank.buildIndexedDocumentSearchQuery(Array.from({ length: 20 }, (_, i) =>
    "term" + i).join(" ")).split(" | ").length, 8);
});

test("genuine PDF pages are chunked without crossing original page boundaries", () => {
  const input = "[PDF page 1]\n" + "Alpha ".repeat(65) + "\n\n[PDF page 3]\n" + "Holiday ".repeat(40);
  const chunks = pages.chunkExtractedPDFByPage(input, 180, 30);
  assert.ok(chunks.length > 3);
  assert.deepEqual([...new Set(chunks.map(item => item.page))], [1, 3]);
  for (const chunk of chunks) {
    assert.ok(chunk.content.startsWith("[PDF page " + chunk.page + "]\n"));
    assert.ok(chunk.content.length <= 180);
    assert.equal(pages.parsePDFPageMarker(chunk.content), chunk.page);
    assert.ok(!chunk.content.slice(15).includes("[PDF page 3]"));
  }
  assert.equal(pages.parsePDFPageMarker("A user wrote [PDF page 7]\n"), null);
});

test("PDF page input guards fail closed on excessive pages, invalid ordering and malformed markers", () => {
  assert.throws(() => pages.chunkExtractedPDFByPage("not a PDF"), /Invalid PDF page/);
  assert.throws(() => pages.chunkExtractedPDFByPage("[PDF page 2]\nHi\n[PDF page 1]\nBad"), /Invalid PDF page order/);
  assert.throws(() => pages.chunkExtractedPDFByPage("[PDF page 61]\nHi"), /Invalid PDF page order/);
  assert.throws(() => pages.chunkExtractedPDFByPage("[PDF page 1]\nHi", 90), /Invalid PDF page-chunk input/);
});

test("evidence shows real PDF page and searches near question keywords instead of only opening bytes", () => {
  const chunk = "[PDF page 4]\n" + "Before ".repeat(130) + "holiday test result" + " after".repeat(75);
  const evidence = rank.buildDocumentEvidence([{ content: chunk, chunk_index: 250 }], "holiday test");
  assert.equal(evidence[0].segment, 251);
  assert.equal(evidence[0].page, 4);
  assert.ok(evidence[0].excerpt.includes("holiday test result"));
  assert.ok(chunk.includes(evidence[0].excerpt));
  assert.ok(rank.formatDocumentEvidenceForPrompt(evidence).includes("[Document segment 251, PDF page 4]"));
  assert.ok(rank.buildDocumentEvidence([{ content: "plain text", chunk_index: 1 }])[0].page === undefined);
});

test("opt-in indexed lookup remains disabled until explicitly approved; bounded fallback preserved", () => {
  assert.match(chat, /ETERNYX_AI_DOCUMENT_FTS_ENABLED/);
  assert.match(chat, /=== "true"/);
  assert.match(chat, /\.rpc\("search_owned_document_chunks"/);
  assert.match(chat, /p_document_id: documentId/);
  assert.match(chat, /p_query: searchQuery/);
  assert.match(chat, /p_limit: 80/);
  assert.match(chat, /\.eq\("document_id", documentId\)/);
  assert.match(chat, /\.ilike\("content", "%" \+ term \+ "%"\)/);
  assert.match(chat, /rankDocumentContext\(question, \[\.\.\.uniqueChunks\.values\(\)\], limit\)/);
  assert.match(chat, /searchMode: documentId/);
  assert.match(chat, /Indexed document search is unavailable/);
});

test("SQL search function uses a GIN index, invoker RLS, owner constraints and minimum grants", () => {
  assert.match(sql, /using gin \(pg_catalog\.to_tsvector/);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /d\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /d\.status = 'ready'/);
  assert.match(sql, /c\.document_id = p_document_id/);
  assert.match(sql, /to_tsquery\('simple'/);
  assert.match(sql, /p_limit > 80/);
  assert.match(sql, /revoke all on function public\.search_owned_document_chunks/);
  assert.match(sql, /grant execute on function public\.search_owned_document_chunks/);
  assert.doesNotMatch(sql, /security definer/i);
});

test("frontend labels actual parsed PDF pages, retrieval type and nonpersistent evidence", () => {
  assert.match(ui, /page\?: number/);
  assert.match(ui, /Document segment \{item\.segment\}\{item\.page/);
  assert.match(ui, /data\.searchMode === 'indexed-lexical'/);
  assert.match(ui, /Bounded lexical search/);
  assert.match(ui, /Evidence for previous conversations is not currently retained/);
  assert.match(processDoc, /chunkExtractedPDFByPage\(extractedText\)/);
  assert.match(processDoc, /chunks\.length > 750/);
  assert.doesNotMatch(processDoc, /TextDecoder\("utf-8", \{ fatal: false \}\)\.decode\(pdfBuffer\)/);
});

test("no matching context still returns 422 before charges and no OCR is silently enabled", () => {
  const deny = chat.indexOf('if (documentId && contextChunks.length === 0)');
  const debit = chat.indexOf('await consumeToolCredits(supabase');
  assert.ok(deny > 0 && debit > deny);
  assert.match(chat, /NO_DOCUMENT_EVIDENCE/);
  assert.match(processDoc, /body\.ocrConsent !== true/);
  assert.match(processDoc, /fileType === "pdf"/);
});
