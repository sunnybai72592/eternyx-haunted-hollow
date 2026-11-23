import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const rankingSource = await read("supabase/functions/_shared/document-context-ranking.ts");
const chat = await read("supabase/functions/eternyx-ai-chat/index.ts");
const processDocument = await read("supabase/functions/process-document/index.ts");
const guards = await read("supabase/functions/_shared/pdf-ingest-guards.ts");
const ui = await read("src/pages/EternyxAI.tsx");
const code = ts.transpileModule(rankingSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const ranking = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

test("two-character corrosion/CP terms are searchable without generic filler words", () => {
  assert.deepEqual(ranking.getDocumentQueryTerms("What is CP IR pH?"), ["cp", "ir", "ph"]);
  assert.deepEqual(ranking.getDocumentQueryTerms("the and in to"), []);
});

test("search avoids substring matches, rewards exact adjacent terms, and breaks ties deterministically", () => {
  const chunks = [
    { chunk_index: 5, content: "An application may appear appealing." },
    { chunk_index: 9, content: "Review the coating holiday test after application." },
    { chunk_index: 8, content: "Holiday inspection for coating testing." },
    { chunk_index: 6, content: "A painting process is not the same as paint." },
  ];
  assert.deepEqual(ranking.rankDocumentContext("coating holiday test", chunks, 2).map(x => x.chunk_index), [9, 8]);
  assert.deepEqual(ranking.rankDocumentContext("app", chunks), []);
  assert.deepEqual(ranking.rankDocumentContext("paint", chunks).map(x => x.chunk_index), [6]);
  assert.deepEqual(ranking.rankDocumentContext("no-match-query", chunks), []);
});

test("evidence exports exact bounded snippets and original segment numbers, never a model citation", () => {
  const ranked = [
    { chunk_index: 230, content: "Holiday test confirmed after coating." },
    { chunk_index: 2, content: "B".repeat(950) },
  ];
  const evidence = ranking.buildDocumentEvidence(ranked);
  assert.deepEqual(evidence.map(item => item.segment), [231, 3]);
  assert.equal(evidence[0].excerpt, ranked[0].content);
  assert.equal(evidence[1].excerpt.length, 700);
  assert.ok(ranking.formatDocumentEvidenceForPrompt(evidence).includes("[Document segment 231]"));
  assert.ok(!ranking.formatDocumentEvidenceForPrompt(evidence).includes("page 231"));
  assert.equal(ranking.buildDocumentEvidence(Array.from({ length: 10 }, (_, n) =>
    ({ chunk_index: n, content: "sample " + n })).slice(0, 10)).length, 5);
});

test("source extraction and cross-document authorization remain server-only", () => {
  assert.ok(chat.includes('select("id, status")'));
  assert.ok(chat.includes('.eq("user_id", user.id)'));
  assert.ok(chat.includes('document.status !== "ready"'));
  assert.ok(chat.includes('buildDocumentEvidence('));
  assert.ok(chat.includes('formatDocumentEvidenceForPrompt(contextChunks)'));
  assert.ok(chat.includes('evidence: documentId ? contextChunks : []'));
  assert.ok(chat.includes('contextUsed: contextChunks.length > 0'));
});

test("no evidence means no provider call, no credit debit, and actionable 422", () => {
  const refuseAt = chat.indexOf('if (documentId && contextChunks.length === 0)');
  const chargeAt = chat.indexOf('await consumeToolCredits(supabase');
  const providerAt = chat.indexOf('await generateChatCompletion(');
  assert.ok(refuseAt > -1 && chargeAt > refuseAt && providerAt > chargeAt);
  assert.match(chat, /NO_DOCUMENT_EVIDENCE/);
  assert.match(chat, /No matching document passages were found/);
  assert.match(chat, /}, 422\)/);
  assert.ok(ui.includes("if (status === 422)"));
});

test("visible chat response labels document evidence accurately and exports it", () => {
  assert.ok(ui.includes("interface ChatDocumentEvidence"));
  assert.ok(ui.includes("Array.isArray(data.evidence)"));
  assert.ok(ui.includes("View retrieved document evidence"));
  assert.ok(ui.includes("Segment numbers are chunk indices, not verified PDF page numbers"));
  assert.ok(ui.includes("Evidence for previous conversations is not currently retained"));
  assert.ok(ui.includes("Retrieved document segments (not independent citation checks)"));
  assert.ok(ui.includes("No matching document text was retrieved"));
});

test("OCR page-image route requires explicit end-user confirmation and authenticated API consent", () => {
  assert.ok(ui.includes("isImage && !window.confirm("));
  assert.ok(ui.includes("ocrConsent: isImage"));
  assert.ok(ui.includes("export it as PNG, JPEG, or WebP"));
  assert.ok(processDocument.includes('body.ocrConsent !== true'));
  assert.ok(processDocument.includes('OCR_CONSENT_REQUIRED'));
  assert.ok(processDocument.indexOf('body.ocrConsent !== true') < processDocument.indexOf('extractTextFromImage(toBase64(bytes), mimeType)'));
  assert.ok(guards.includes("MAX_IMAGE_OCR_BYTES = 6 * 1024 * 1024"));
  assert.ok(processDocument.includes("MAX_IMAGE_OCR_BYTES"));
  assert.ok(processDocument.includes("signal: AbortSignal.timeout(20_000)"));
});

test("overlapping processing is compare-and-set gated before invoking costly OCR", () => {
  assert.ok(processDocument.includes('.in("status", ["uploaded", "failed"])'));
  assert.ok(processDocument.includes(".maybeSingle()"));
  assert.ok(processDocument.includes("if (!processingRecord)"));
  assert.ok(processDocument.includes('document.status === "ready"'));
  assert.ok(processDocument.indexOf('if (!processingRecord)') < processDocument.indexOf('extractTextFromImage(toBase64(bytes), mimeType)'));
  assert.ok(processDocument.includes("Array.isArray(data.output)"));
  assert.ok(processDocument.includes("OCR output exceeds the processing limit"));
});
