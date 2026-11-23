/**
 * PDF.js text-layer extraction in the Edge runtime; NOT OCR.
 * Version-pinned unpdf ships a serverless/worker-free PDF.js build.
 * Server-side credentials or third-party model APIs are not used here.
 */
import { getDocumentProxy } from "npm:unpdf@2.2.1";
import {
  PDFIngestError, MAX_PDF_EXTRACTED_CHARACTERS,
  validatePdfBytes, validatePdfPageCount, flattenPDFTextItems,
} from "./pdf-ingest-guards.ts";

const PDF_PARSE_TIMEOUT_MS = 20_000;
const PDF_MAX_IMAGE_PIXELS = 16_777_216;

/**
 * A soft deadline bounds awaited work; the Edge runtime must enforce its
 * own hard CPU/memory limits, because synchronous PDF parsing cannot be
 * forcibly interrupted by Promise.race.
 */
async function withPDFDeadline<T>(job: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      job(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PDFIngestError("pdf_timeout")), PDF_PARSE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function extractTextFromPDF(bytes: Uint8Array): Promise<string> {
  validatePdfBytes(bytes);
  return await withPDFDeadline(async () => {
    // A serverless PDF parser; do not enable PDF JavaScript evaluation.
    const pdf = await getDocumentProxy(bytes, {
      isEvalSupported: false,
      maxImageSize: PDF_MAX_IMAGE_PIXELS,
      stopAtErrors: true,
    });
    try {
      validatePdfPageCount(pdf.numPages);
      const pages: string[] = [];
      let used = 0;
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const remaining = MAX_PDF_EXTRACTED_CHARACTERS - used;
        if (remaining <= 0) throw new PDFIngestError("text_too_large");
        const text = flattenPDFTextItems(
          content.items as { str?: string; hasEOL?: boolean }[], remaining,
        );
        if (text) {
          const segment = "[PDF page " + n + "]\n" + text;
          used += segment.length + 2;
          if (used > MAX_PDF_EXTRACTED_CHARACTERS) {
            throw new PDFIngestError("text_too_large");
          }
          pages.push(segment);
        }
        page.cleanup();
      }
      if (!pages.length) throw new PDFIngestError("no_text_layer");
      return pages.join("\n\n");
    } finally {
      await pdf.destroy();
    }
  });
}
