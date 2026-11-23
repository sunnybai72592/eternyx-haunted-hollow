/**
 * Browser-local evidence review for user-loaded text documents.
 * All quoted spans are validated against the CURRENT decoded source text.
 * Neither line integrity nor a local hash authenticates the source author.
 */
import {
  MAX_CORPUS_AI_EVIDENCE,
  addCorpusDocuments,
  type CorpusDocument, type CorpusHit, type CorpusSearch,
} from "./document-corpus-tools";

export const MAX_CORPUS_CONTEXT_RADIUS = 2;
export const MAX_CORPUS_CONTEXT_LINE_CHARS = 340;

export class CorpusReviewError extends Error {
  readonly code: "stale_source" | "invalid_selection" | "crypto_unavailable";
  constructor(code: CorpusReviewError["code"]) {
    super(code);
    this.name = "CorpusReviewError";
    this.code = code;
  }
}
export interface CorpusContextLine {
  readonly line: number;
  readonly snippet: string;
  readonly startColumn: number;
  readonly sourceLength: number;
  readonly partial: boolean;
  readonly selected: boolean;
}
export interface CorpusContext {
  readonly fileName: string;
  readonly documentId: string;
  readonly centerLine: number;
  readonly lines: readonly CorpusContextLine[];
  readonly caveat: string;
}
export interface CorpusCoverageRow {
  readonly fileId: string;
  readonly fileName: string;
  readonly matchingLines: number;
  readonly matchedTerms: readonly string[];
  readonly hasMatches: boolean;
}
export interface CorpusCoverageReview {
  readonly totalFiles: number;
  readonly filesWithMatches: number;
  readonly rows: readonly CorpusCoverageRow[];
  readonly caveat: string;
}
export interface CorpusTextFingerprint {
  readonly id: string;
  readonly fileName: string;
  readonly utf16Characters: number;
  readonly sha256OfDecodedTextUtf8: string;
}
function sourceLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}
/**
 * Prevent accidental/stale snippet-to-document mismatch before quoting or AI.
 * Validation checks user-chosen text, NOT provenance of the underlying file.
 */
export function verifyCurrentCorpusHit(
  docs: readonly CorpusDocument[],
  hit: CorpusHit,
): true {
  if (!hit || !Number.isSafeInteger(hit.line) || hit.line < 1 ||
      !Number.isSafeInteger(hit.snippetStartColumn) || hit.snippetStartColumn < 1 ||
      typeof hit.snippet !== "string" || hit.snippet.length > MAX_CORPUS_CONTEXT_LINE_CHARS) {
    throw new CorpusReviewError("stale_source");
  }
  const document = docs.find(doc => doc.id === hit.documentId);
  if (!document || document.name !== hit.documentName || document.kind !== hit.kind ||
      hit.id !== document.id + ":" + hit.line) throw new CorpusReviewError("stale_source");
  const lines = sourceLines(document.text);
  const original = lines[hit.line - 1];
  if (original === undefined || original.length !== hit.sourceLineLength) {
    throw new CorpusReviewError("stale_source");
  }
  const offset = hit.snippetStartColumn - 1;
  if (offset >= original.length || hit.snippet !== original.slice(offset, offset + hit.snippet.length) ||
      hit.partial !== (original.length > MAX_CORPUS_CONTEXT_LINE_CHARS) ||
      (hit.partial && hit.snippet.length !== MAX_CORPUS_CONTEXT_LINE_CHARS) ||
      (!hit.partial && (hit.snippetStartColumn !== 1 || hit.snippet !== original))) {
    throw new CorpusReviewError("stale_source");
  }
  if (hit.matchSpan &&
    (!Number.isSafeInteger(hit.matchSpan.startColumn) ||
     !Number.isSafeInteger(hit.matchSpan.endColumn) ||
     hit.matchSpan.startColumn < 1 ||
     hit.matchSpan.endColumn < hit.matchSpan.startColumn ||
     hit.matchSpan.endColumn > original.length)) {
    throw new CorpusReviewError("stale_source");
  }
  return true;
}
export function getCorpusSourceContext(
  docs: readonly CorpusDocument[],
  hit: CorpusHit,
  radius = 1,
): CorpusContext {
  if (!Number.isSafeInteger(radius) || radius < 0 || radius > MAX_CORPUS_CONTEXT_RADIUS) {
    throw new CorpusReviewError("invalid_selection");
  }
  verifyCurrentCorpusHit(docs, hit);
  const source = docs.find(doc => doc.id === hit.documentId)!;
  const lines = sourceLines(source.text);
  const result: CorpusContextLine[] = [];
  for (let i = Math.max(0, hit.line - radius - 1);
       i < Math.min(lines.length, hit.line + radius); i++) {
    const text = lines[i];
    if (i + 1 === hit.line) {
      result.push({
        line: i + 1, snippet: hit.snippet,
        startColumn: hit.snippetStartColumn, sourceLength: text.length,
        partial: hit.partial, selected: true,
      });
    } else {
      const start = 0;
      result.push({
        line: i + 1, snippet: text.slice(start, start + MAX_CORPUS_CONTEXT_LINE_CHARS),
        startColumn: 1, sourceLength: text.length,
        partial: text.length > MAX_CORPUS_CONTEXT_LINE_CHARS,
        selected: false,
      });
    }
  }
  return {
    fileName: source.name, documentId: source.id, centerLine: hit.line, lines: result,
    caveat: "Only decoded, user-loaded local text. Context lines longer than 340 characters are partial. No original file authentication, OCR or external source verification.",
  };
}
export function summarizeCorpusCoverage(
  docs: readonly CorpusDocument[],
  search: CorpusSearch,
): CorpusCoverageReview {
  // This validates the documents without changing the user-owned arrays.
  const files = addCorpusDocuments([], docs).filter(doc =>
    search.sourceFilter === null || doc.id === search.sourceFilter);
  const rows: CorpusCoverageRow[] = files.map(file => {
    const hits = search.hits.filter(hit => hit.documentId === file.id);
    const matched = new Set(hits.flatMap(hit => hit.matchedTerms));
    return {
      fileId: file.id, fileName: file.name, matchingLines: hits.length,
      matchedTerms: search.terms.filter(term => matched.has(term)),
      hasMatches: hits.length > 0,
    };
  });
  return {
    totalFiles: rows.length,
    filesWithMatches: rows.filter(row => row.hasMatches).length,
    rows,
    caveat: "Counts are local keyword-hit lines, not confirmed agreement, independent citations, source credibility or AI assessment. A file with zero hits may still discuss the subject using other wording.",
  };
}
export function formatCorpusCoverage(coverage: CorpusCoverageReview): string {
  return [
    "ETERNYX LOCAL DOCUMENT EVIDENCE COVERAGE",
    coverage.caveat,
    "Files searched: " + coverage.totalFiles,
    "Files with matching lines: " + coverage.filesWithMatches,
    ...coverage.rows.map(row =>
      row.fileName.replace(/[\r\n\t]/g, " ") + " [" + row.fileId + "]: " +
      row.matchingLines + " matching lines; matched query words: " +
      (row.matchedTerms.join(", ") || "(none)")),
  ].join("\n");
}
export function formatSelectedCorpusContext(
  docs: readonly CorpusDocument[],
  search: CorpusSearch,
  selectedIds: readonly string[],
): string {
  if (!Array.isArray(selectedIds) || selectedIds.length < 1 ||
      selectedIds.length > MAX_CORPUS_AI_EVIDENCE ||
      new Set(selectedIds).size !== selectedIds.length) {
    throw new CorpusReviewError("invalid_selection");
  }
  const byId = new Map(search.hits.map(hit => [hit.id, hit]));
  const lines = [
    "ETERNYX LOCAL REVIEWED SOURCE EXCERPTS",
    "Local decoded text only. Sources, authenticity and content have NOT been independently verified.",
    "Query: " + search.query + " (" + search.mode + " matching)",
    "All displayed context is manually reviewable and may contain private data.",
  ];
  for (const id of selectedIds) {
    const hit = byId.get(id);
    if (!hit) throw new CorpusReviewError("invalid_selection");
    const context = getCorpusSourceContext(docs, hit, 1);
    lines.push("", "Source: " + context.fileName + " [" + context.documentId + "]",
      "Selected source line: " + context.centerLine);
    for (const entry of context.lines) {
      lines.push(
        (entry.selected ? ">> " : "   ") + "line " + entry.line +
        ", starting column " + entry.startColumn +
        (entry.partial ? " [PARTIAL — original line " + entry.sourceLength + " characters]" : ""),
        entry.snippet,
      );
    }
  }
  return lines.join("\n");
}
export async function fingerprintCorpusDecodedText(
  docs: readonly CorpusDocument[],
): Promise<readonly CorpusTextFingerprint[]> {
  const files = addCorpusDocuments([], docs);
  if (!globalThis.crypto?.subtle) throw new CorpusReviewError("crypto_unavailable");
  const result: CorpusTextFingerprint[] = [];
  for (const doc of files) {
    // TextEncoder encodes the decoded in-memory text. This is not the original
    // uploaded raw file byte sequence and is not a signed/authenticated proof.
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256", new TextEncoder().encode(doc.text),
    );
    const hash = [...new Uint8Array(digest)].map(byte =>
      byte.toString(16).padStart(2, "0")).join("");
    result.push({
      id: doc.id, fileName: doc.name, utf16Characters: doc.text.length,
      sha256OfDecodedTextUtf8: hash,
    });
  }
  return result;
}
export function formatCorpusFingerprints(fingerprints: readonly CorpusTextFingerprint[]): string {
  return [
    "ETERNYX LOCAL DECODED-TEXT SHA-256 MANIFEST",
    "SHA-256 of UTF-8 encoded in-memory text, NOT necessarily the original file bytes.",
    "Fingerprints do not authenticate authors, guarantee integrity outside this session, or prove source truth.",
    ...fingerprints.map(item => item.fileName.replace(/[\r\n\t]/g, " ") + " [" + item.id + "] " +
      item.utf16Characters + " UTF-16 characters | SHA-256 " + item.sha256OfDecodedTextUtf8),
  ].join("\n");
}
