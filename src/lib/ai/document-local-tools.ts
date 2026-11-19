/**
 * ETERNYX local-only text document inspection. This module does not transmit,
 * execute, persist or generate AI responses from user documents.
 */
export const MAX_DOCUMENT_BYTES = 1024 * 1024;
export const MAX_DOCUMENT_CHARACTERS = 100000;
export const MAX_DOCUMENT_SEARCH_RESULTS = 50;
export const MAX_DOCUMENT_HEADINGS = 100;
export const MAX_DOCUMENT_CSV_COLUMNS = 100;
export const MAX_DOCUMENT_CSV_PREVIEW_ROWS = 5;
export const DOCUMENT_KINDS = ["txt", "md", "csv", "json", "log"] as const;
export type LocalDocumentKind = (typeof DOCUMENT_KINDS)[number];
export type LocalDocumentTask = "analyze" | "extract";

export type LocalDocumentFile = Pick<File, "name" | "size" | "type" | "text">;
export interface LocalDocument {
  readonly name: string;
  readonly kind: LocalDocumentKind;
  readonly text: string;
  readonly size: number;
}
export interface DocumentMetrics {
  readonly characters: number;
  readonly words: number;
  readonly lines: number;
  readonly paragraphs: number;
}
export interface DocumentSearchMatch {
  readonly line: number;
  readonly column: number;
  readonly excerpt: string;
}
export interface DocumentSearchResults {
  readonly query: string;
  readonly total: number;
  readonly matches: readonly DocumentSearchMatch[];
  readonly truncated: boolean;
}
export interface DocumentHeading {
  readonly level: number;
  readonly line: number;
  readonly text: string;
}
export interface LocalDocumentInspection {
  readonly kind: LocalDocumentKind;
  readonly metrics: DocumentMetrics;
  readonly headings: readonly DocumentHeading[];
  readonly headingsTruncated: boolean;
  readonly json: null | { readonly valid: boolean; readonly root: string; readonly topLevelKeys: readonly string[]; readonly itemCount: number | null };
  readonly csv: null | { readonly valid: boolean; readonly rows: number; readonly columns: number; readonly inconsistentRows: number; readonly preview: readonly (readonly string[])[] };
}
export interface LocalDocumentDraft {
  readonly featureKey: "ai.documents.analyze" | "ai.documents.extract";
  readonly task: LocalDocumentTask;
  readonly kind: LocalDocumentKind;
  readonly source: string;
  readonly instruction: string;
}
export class LocalDocumentError extends Error {
  readonly code: "invalid_file" | "invalid_text" | "invalid_kind" | "invalid_search" | "invalid_task" | "invalid_instruction" | "read_failed";
  constructor(code: LocalDocumentError["code"]) {
    super(code);
    this.name = "LocalDocumentError";
    this.code = code;
  }
}
export function documentKindFromName(name: string): LocalDocumentKind {
  if (typeof name !== "string" || !name.trim() || name.length > 255) throw new LocalDocumentError("invalid_file");
  const match = /\.([^.]+)$/.exec(name.toLowerCase());
  const ext = match?.[1] === "markdown" ? "md" : match?.[1];
  if (!ext || !(DOCUMENT_KINDS as readonly string[]).includes(ext)) throw new LocalDocumentError("invalid_file");
  return ext as LocalDocumentKind;
}
function validateKind(kind: LocalDocumentKind): void {
  if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) throw new LocalDocumentError("invalid_kind");
}
export function validateDocumentText(text: string): string {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_DOCUMENT_CHARACTERS ||
      text.includes("\u0000")) throw new LocalDocumentError("invalid_text");
  return text;
}
export function validateLocalDocumentFile(file: LocalDocumentFile): LocalDocumentKind {
  if (!file || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_DOCUMENT_BYTES ||
      typeof file.text !== "function") throw new LocalDocumentError("invalid_file");
  const kind = documentKindFromName(file.name);
  // A file extension is not a verified format. Reject clearly binary MIME claims.
  if (typeof file.type !== "string" || (file.type &&
      !file.type.startsWith("text/") &&
      !["application/json", "application/csv", "application/octet-stream"].includes(file.type))) {
    throw new LocalDocumentError("invalid_file");
  }
  return kind;
}
export async function readLocalDocument(file: LocalDocumentFile): Promise<LocalDocument> {
  const kind = validateLocalDocumentFile(file);
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new LocalDocumentError("read_failed");
  }
  return { name: file.name, kind, text: validateDocumentText(text), size: file.size };
}
export function measureDocumentText(text: string): DocumentMetrics {
  validateDocumentText(text);
  const normalized = text.replace(/\r\n?/g, "\n");
  const trimmed = normalized.trim();
  return {
    characters: text.length,
    words: trimmed ? trimmed.split(/\s+/u).length : 0,
    lines: normalized.split("\n").length,
    paragraphs: trimmed ? trimmed.split(/\n\s*\n/u).filter(Boolean).length : 0,
  };
}
export function findDocumentMatches(text: string, query: string, caseSensitive = false): DocumentSearchResults {
  validateDocumentText(text);
  if (typeof query !== "string" || !query.trim() || query.length > 100) {
    throw new LocalDocumentError("invalid_search");
  }
  const needle = caseSensitive ? query.trim() : query.trim().toLowerCase();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const matches: DocumentSearchMatch[] = [];
  let total = 0;
  lines.forEach((line, i) => {
    const haystack = caseSensitive ? line : line.toLowerCase();
    let offset = 0;
    while (offset <= haystack.length - needle.length) {
      const found = haystack.indexOf(needle, offset);
      if (found < 0) break;
      total += 1;
      if (matches.length < MAX_DOCUMENT_SEARCH_RESULTS) {
        matches.push({
          line: i + 1,
          column: found + 1,
          excerpt: line.slice(Math.max(0, found - 60), Math.min(line.length, found + needle.length + 60)),
        });
      }
      offset = found + needle.length;
    }
  });
  return { query: query.trim(), total, matches, truncated: total > matches.length };
}
export function extractLocalMarkdownHeadings(text: string): { headings: DocumentHeading[]; truncated: boolean } {
  validateDocumentText(text);
  const headings: DocumentHeading[] = [];
  let total = 0;
  text.replace(/\r\n?/g, "\n").split("\n").forEach((line, i) => {
    const match = /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;
    total += 1;
    if (headings.length < MAX_DOCUMENT_HEADINGS) {
      headings.push({ level: match[1].length, line: i + 1, text: match[2].trim().slice(0, 200) });
    }
  });
  return { headings, truncated: total > headings.length };
}
export function inspectLocalJson(text: string): NonNullable<LocalDocumentInspection["json"]> {
  validateDocumentText(text);
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return { valid: true, root: "array", topLevelKeys: [], itemCount: parsed.length };
    if (parsed !== null && typeof parsed === "object") {
      return { valid: true, root: "object", topLevelKeys: Object.keys(parsed).slice(0, 50), itemCount: null };
    }
    return { valid: true, root: "primitive", topLevelKeys: [], itemCount: null };
  } catch {
    return { valid: false, root: "invalid", topLevelKeys: [], itemCount: null };
  }
}

/** Read-only CSV parser: quote-aware, supports CRLF and multiline quoted cells. */
export function inspectLocalCsv(text: string): NonNullable<LocalDocumentInspection["csv"]> {
  validateDocumentText(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  let valid = true;
  let rowCount = 0;
  let maxColumns = 0;
  let firstWidth: number | null = null;
  let inconsistentRows = 0;
  const finishField = () => {
    row.push(field.slice(0, 160));
    field = "";
    closedQuote = false;
  };
  const finishRow = () => {
    maxColumns = Math.max(maxColumns, row.length);
    if (firstWidth === null) firstWidth = row.length;
    else if (firstWidth !== row.length) inconsistentRows += 1;
    rowCount += 1;
    if (rows.length < MAX_DOCUMENT_CSV_PREVIEW_ROWS + 1) rows.push(row.slice(0, MAX_DOCUMENT_CSV_COLUMNS));
    row = [];
  };
  const src = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closedQuote = true; }
      else field += c;
    } else if (c === ",") { finishField(); }
    else if (c === "\n") { finishField(); finishRow(); }
    else if (c === '"' && !field && !closedQuote) { quoted = true; }
    else if (closedQuote || c === '"') { valid = false; break; }
    else field += c;
  }
  if (quoted) valid = false;
  if (valid && (field || row.length || closedQuote || !src.endsWith("\n"))) {
    finishField(); finishRow();
  }
  return {
    valid, rows: rowCount, columns: maxColumns, inconsistentRows,
    preview: rows,
  };
}
export function inspectLocalDocument(text: string, kind: LocalDocumentKind): LocalDocumentInspection {
  validateKind(kind);
  const metrics = measureDocumentText(text);
  const headingData = kind === "md" ? extractLocalMarkdownHeadings(text) : { headings: [], truncated: false };
  return {
    kind, metrics, headings: headingData.headings, headingsTruncated: headingData.truncated,
    json: kind === "json" ? inspectLocalJson(text) : null,
    csv: kind === "csv" ? inspectLocalCsv(text) : null,
  };
}
export function prepareDocumentDraft(text: string, kind: LocalDocumentKind, task: LocalDocumentTask, instruction: string): LocalDocumentDraft {
  validateDocumentText(text);
  validateKind(kind);
  if (task !== "analyze" && task !== "extract") throw new LocalDocumentError("invalid_task");
  if (typeof instruction !== "string" || instruction.length > 1000 ||
      (task === "extract" && !instruction.trim())) throw new LocalDocumentError("invalid_instruction");
  return {
    featureKey: task === "analyze" ? "ai.documents.analyze" : "ai.documents.extract",
    task, kind, source: text, instruction: instruction.trim(),
  };
}
export function formatDocumentDraft(draft: LocalDocumentDraft): string {
  return [
    draft.task === "analyze"
      ? "Analyze the following user-provided document. Explain uncertainty and cite only provided text."
      : "Extract only the requested fields from the following user-provided document. Do not invent missing values.",
    "Reported document type: " + draft.kind,
    draft.instruction ? "Instructions: " + draft.instruction : "",
    "BEGIN UNTRUSTED DOCUMENT TEXT",
    draft.source,
    "END UNTRUSTED DOCUMENT TEXT",
  ].filter(Boolean).join("\n\n");
}
