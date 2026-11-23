/**
 * Pure safety checks for server-side processing of user-owned PDF files.
 * These checks do not imply a scanned PDF can be read without OCR.
 */
export const MAX_PDF_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_OCR_BYTES = 6 * 1024 * 1024;
export const MAX_PDF_PAGES = 60;
export const MAX_PDF_EXTRACTED_CHARACTERS = 240_000;

export type PDFIngestCode =
  | "invalid_pdf" | "pdf_too_large" | "too_many_pages"
  | "text_too_large" | "no_text_layer" | "pdf_timeout";

export class PDFIngestError extends Error {
  constructor(readonly code: PDFIngestCode) {
    super(code);
    this.name = "PDFIngestError";
  }
}

export function validatePdfBytes(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 8 ||
      String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
    throw new PDFIngestError("invalid_pdf");
  }
  if (bytes.byteLength > MAX_PDF_BYTES) throw new PDFIngestError("pdf_too_large");
}

export function validatePdfPageCount(pages: number): void {
  if (!Number.isSafeInteger(pages) || pages < 1) throw new PDFIngestError("invalid_pdf");
  if (pages > MAX_PDF_PAGES) throw new PDFIngestError("too_many_pages");
}

/** Turn PDF.js text items into bounded, non-executable plain text. */
export function flattenPDFTextItems(
  items: readonly { str?: string; hasEOL?: boolean }[],
  maxCharacters = MAX_PDF_EXTRACTED_CHARACTERS,
): string {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 1 ||
      maxCharacters > MAX_PDF_EXTRACTED_CHARACTERS) {
    throw new PDFIngestError("text_too_large");
  }
  let result = "";
  for (const item of items) {
    if (!item || typeof item.str !== "string") continue;
    const chunk = item.str.replace(/\u0000/g, "");
    const separator = item.hasEOL ? "\n" : " ";
    if (result.length + chunk.length + separator.length > maxCharacters) {
      throw new PDFIngestError("text_too_large");
    }
    result += chunk + separator;
  }
  return result.trim();
}

/** Never let a user-controlled document row reference a different owner's object. */
export function validOwnedDocumentPath(path: unknown, ownerId: string): boolean {
  if (typeof path !== "string" || typeof ownerId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(ownerId)) return false;
  if (!path.startsWith(ownerId + "/") || path.length > 300 ||
      path.includes("\\") || path.includes("..") || path.includes("//") ||
      path.includes("%")) return false;
  const suffix = path.slice(ownerId.length + 1);
  return /^[a-zA-Z0-9_-]{1,128}(?:\.[a-zA-Z0-9]{1,12})?$/.test(suffix);
}

export function matchesDeclaredImageBytes(bytes: Uint8Array, mime: string): boolean {
  if (!(bytes instanceof Uint8Array)) return false;
  if (mime === "image/png") return bytes.length >= 8 &&
    [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
  if (mime === "image/jpeg") return bytes.length >= 4 &&
    bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  if (mime === "image/webp") return bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0,4))==="RIFF" &&
    String.fromCharCode(...bytes.subarray(8,12))==="WEBP";
  return false;
}
