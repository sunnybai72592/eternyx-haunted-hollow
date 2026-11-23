/**
 * Deterministic page-aware chunking for PDFs with genuine text layers.
 * The upstream extractor emits [PDF page N] before each page's text.
 * Scanned pages with no text still require separate OCR.
 */
export interface PDFPageChunk {
  readonly content: string;
  readonly page: number;
}

export function chunkExtractedPDFByPage(
  text: string,
  chunkSize = 500,
  overlap = 75,
): PDFPageChunk[] {
  if (typeof text !== "string" || !text.startsWith("[PDF page ") ||
      !Number.isInteger(chunkSize) || chunkSize < 100 || chunkSize > 1000 ||
      !Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize / 2) {
    throw new Error("Invalid PDF page-chunk input");
  }
  const markers = [...text.matchAll(/^\[PDF page ([1-9]\d*)\]\n/gm)];
  if (!markers.length || markers[0].index !== 0 || markers.length > 60) {
    throw new Error("Invalid PDF page markers");
  }
  const results: PDFPageChunk[] = [];
  let lastPage = 0;
  for (let i = 0; i < markers.length; i++) {
    const page = Number(markers[i][1]);
    if (!Number.isSafeInteger(page) || page <= lastPage || page > 60) {
      throw new Error("Invalid PDF page order");
    }
    lastPage = page;
    const prefix = "[PDF page " + page + "]\n";
    const start = markers[i].index! + markers[i][0].length;
    const end = markers[i + 1]?.index ?? text.length;
    const body = text.slice(start, end).trim();
    const size = chunkSize - prefix.length;
    if (size <= overlap) throw new Error("Invalid PDF chunk size");
    if (!body) continue;
    for (let offset = 0; offset < body.length;) {
      results.push({ page, content: prefix + body.slice(offset, offset + size) });
      if (results.length > 750) throw new Error("PDF has too many text chunks");
      if (offset + size >= body.length) break;
      offset += size - overlap;
    }
  }
  return results;
}

/** Bind to known page markers, never guess a PDF page from generic prose. */
export function parsePDFPageMarker(content: string): number | null {
  if (typeof content !== "string") return null;
  const match = /^\[PDF page ([1-9]\d*)\]\n/.exec(content);
  const page = match ? Number(match[1]) : null;
  return page && Number.isSafeInteger(page) && page <= 60 ? page : null;
}
