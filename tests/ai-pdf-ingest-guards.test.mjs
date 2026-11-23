import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const source = await read("supabase/functions/_shared/pdf-ingest-guards.ts");
const extractor = await read("supabase/functions/_shared/pdf-text-extract.ts");
const handler = await read("supabase/functions/process-document/index.ts");
const ui = await read("src/pages/EternyxAI.tsx");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const pdf = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

const valid = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 37, 37, 69, 79, 70]);
const owner = "123e4567-e89b-42d3-a456-426614174000";
test("PDF header and byte limits reject unrelated or oversized payloads", () => {
  assert.doesNotThrow(() => pdf.validatePdfBytes(valid));
  assert.throws(() => pdf.validatePdfBytes(new TextEncoder().encode("This is not a PDF")), { code: "invalid_pdf" });
  assert.throws(() => pdf.validatePdfBytes(new Uint8Array(7)), { code: "invalid_pdf" });
  const large = new Uint8Array(pdf.MAX_PDF_BYTES + 1);
  large.set(valid);
  assert.throws(() => pdf.validatePdfBytes(large), { code: "pdf_too_large" });
  assert.equal(pdf.MAX_PDF_BYTES, 12 * 1024 * 1024);
});

test("PDF page, text and resource bounds are deterministic", () => {
  assert.equal(pdf.MAX_PDF_PAGES, 60);
  assert.equal(pdf.MAX_PDF_EXTRACTED_CHARACTERS, 240000);
  for (const value of [0, 61, -1, NaN, Infinity, 1.5]) {
    assert.throws(() => pdf.validatePdfPageCount(value));
  }
  assert.doesNotThrow(() => pdf.validatePdfPageCount(60));
  assert.equal(pdf.flattenPDFTextItems([{ str: "Hello" }, { str: "world", hasEOL: true }]), "Hello world");
  assert.equal(pdf.flattenPDFTextItems([{ str: "a\u0000b", hasEOL: true }]), "ab");
  assert.throws(() => pdf.flattenPDFTextItems([{ str: "abcd" }], 3), { code: "text_too_large" });
  assert.throws(() => pdf.flattenPDFTextItems([{ str: "x".repeat(240001) }]), { code: "text_too_large" });
});

test("storage-path ownership guard blocks traversal, cross-owner and unexpected keys", () => {
  assert.equal(pdf.validOwnedDocumentPath(owner + "/abc-123", owner), true);
  assert.equal(pdf.validOwnedDocumentPath(owner + "/abc123.pdf", owner), true);
  for (const path of [
    "00000000-0000-4000-8000-000000000000/abc123",
    "../" + owner + "/abc",
    owner + "/../../private",
    owner + "//other",
    owner + "/subfolder/object",
    owner + "/bad%2Fpath",
    owner + "/test\\name",
    owner + "/",
  ]) assert.equal(pdf.validOwnedDocumentPath(path, owner), false, path);
});

test("declared image signatures must match actual file bytes", () => {
  assert.ok(pdf.matchesDeclaredImageBytes(new Uint8Array([137,80,78,71,13,10,26,10,1]), "image/png"));
  assert.ok(pdf.matchesDeclaredImageBytes(new Uint8Array([255,216,255,224]), "image/jpeg"));
  assert.ok(pdf.matchesDeclaredImageBytes(new TextEncoder().encode("RIFF0000WEBPstuff"), "image/webp"));
  assert.equal(pdf.matchesDeclaredImageBytes(valid, "image/png"), false);
  assert.equal(pdf.matchesDeclaredImageBytes(valid, "image/jpeg"), false);
});

test("PDF parsing uses a real pinned serverless text-layer parser, never UTF-8-decoded PDF bytes", () => {
  assert.match(extractor, /npm:unpdf@2\.2\.1/);
  assert.match(extractor, /getDocumentProxy\(bytes/);
  assert.match(extractor, /isEvalSupported: false/);
  assert.match(extractor, /maxImageSize: PDF_MAX_IMAGE_PIXELS/);
  assert.match(extractor, /validatePdfPageCount\(pdf\.numPages\)/);
  assert.match(extractor, /page\.getTextContent\(\)/);
  assert.match(extractor, /flattenPDFTextItems\(/);
  assert.match(extractor, /pdf\.destroy\(\)/);
  assert.doesNotMatch(extractor + handler, /TextDecoder\("utf-8".*pdfBuffer/);
});

test("processing only downloads owned objects and returns sanitized scanned-PDF failure", () => {
  assert.match(handler, /\.eq\("user_id", user\.id\)/);
  assert.match(handler, /validOwnedDocumentPath\(document\.storage_path, user\.id\)/);
  assert.match(handler, /fileData\.size !== document\.file_size/);
  assert.match(handler, /matchesDeclaredImageBytes\(bytes, mimeType\)/);
  assert.match(handler, /extractTextFromPDF\(bytes\)/);
  assert.match(handler, /chunks\.length > 750/);
  assert.match(handler, /Scanned PDFs require OCR/);
  assert.match(handler, /error_message: responseMessage/);
  assert.match(ui, /const maxBytes = isPDF \? 12 \* 1024 \* 1024/);
  assert.match(ui, /processed\?\.success !== true/);
  assert.match(ui, /processError\.context\?\.json\?\.\(\)/);
});
