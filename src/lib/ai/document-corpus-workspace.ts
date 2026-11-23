/**
 * ETERNYX Phase 14 — portable local multi-document workspace snapshots.
 *
 * JSON backups are unencrypted and contain original user-supplied text.
 * SHA-256 checks detect accidental changes to backed-up decoded text, NOT
 * source authenticity or maliciously rewritten bundles. Nothing is uploaded.
 */
import {
  MAX_CORPUS_FILES, MAX_CORPUS_TOTAL_CHARS, MAX_CORPUS_FILE_CHARS,
  CORPUS_KINDS, addCorpusDocuments,
  type CorpusDocument, type CorpusMatchMode,
} from "./document-corpus-tools";

export const CORPUS_WORKSPACE_FORMAT = "eternyx.local-corpus-workspace";
export const CORPUS_WORKSPACE_VERSION = 1;
export const MAX_CORPUS_WORKSPACE_BYTES = 3 * 1024 * 1024;

export interface CorpusWorkspace {
  readonly format: typeof CORPUS_WORKSPACE_FORMAT;
  readonly version: typeof CORPUS_WORKSPACE_VERSION;
  readonly query: string;
  readonly mode: CorpusMatchMode;
  readonly sourceFilter: string | null;
  readonly question: string;
  readonly documents: readonly (CorpusDocument & { readonly sha256: string })[];
}
export type CorpusWorkspaceInput = {
  documents: readonly CorpusDocument[];
  query: string;
  mode: CorpusMatchMode;
  sourceFilter: string | null;
  question: string;
};
export class CorpusWorkspaceError extends Error {
  readonly code: "invalid_file" | "too_large" | "invalid_json" | "invalid_schema" |
    "invalid_document" | "invalid_search" | "crypto_unavailable" | "hash_mismatch";
  constructor(code: CorpusWorkspaceError["code"]) {
    super(code);
    this.name = "CorpusWorkspaceError";
    this.code = code;
  }
}
const names = (value: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(value).length === expected.length &&
  Object.keys(value).every(key => expected.includes(key)) &&
  expected.every(key => Object.prototype.hasOwnProperty.call(value, key));
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const toText = (value: string): Uint8Array => new TextEncoder().encode(value);
function verifySize(value: string): void {
  if (toText(value).byteLength > MAX_CORPUS_WORKSPACE_BYTES) {
    throw new CorpusWorkspaceError("too_large");
  }
}
async function digest(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new CorpusWorkspaceError("crypto_unavailable");
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", toText(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function validateSearchOptions(
  docs: readonly CorpusDocument[], query: unknown, mode: unknown,
  sourceFilter: unknown, question: unknown,
): asserts mode is CorpusMatchMode {
  if (typeof query !== "string" || query.length > 120 || query.includes("\u0000") ||
      typeof question !== "string" || question.length > 250 || question.includes("\u0000") ||
      !["all", "any", "phrase", "near"].includes(mode as string) ||
      !(sourceFilter === null || (typeof sourceFilter === "string" && docs.some(doc => doc.id === sourceFilter)))) {
    throw new CorpusWorkspaceError("invalid_search");
  }
  if (query.trim()) {
    const tokens = query.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}_]+/gu) ?? [];
    if (!tokens.length || new Set(tokens).size > 8 ||
        (mode === "phrase" && tokens.length > 8)) throw new CorpusWorkspaceError("invalid_search");
  }
}
function parsedFields(candidate: unknown): {
  docs: CorpusDocument[];
  query: string; mode: CorpusMatchMode; sourceFilter: string | null; question: string;
  original: CorpusWorkspace["documents"];
} {
  if (!record(candidate) ||
      !names(candidate, ["format", "version", "query", "mode", "sourceFilter", "question", "documents"]) ||
      candidate.format !== CORPUS_WORKSPACE_FORMAT ||
      candidate.version !== CORPUS_WORKSPACE_VERSION ||
      !Array.isArray(candidate.documents) || candidate.documents.length > MAX_CORPUS_FILES) {
    throw new CorpusWorkspaceError("invalid_schema");
  }
  const imports: Array<CorpusDocument & {sha256:string}> = [];
  for (const item of candidate.documents) {
    if (!record(item) ||
        !names(item, ["id", "name", "kind", "text", "sha256"]) ||
        typeof item.id !== "string" || typeof item.name !== "string" ||
        typeof item.kind !== "string" || typeof item.text !== "string" ||
        !CORPUS_KINDS.includes(item.kind as (typeof CORPUS_KINDS)[number]) ||
        typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw new CorpusWorkspaceError("invalid_document");
    }
    imports.push({
      id: item.id, name: item.name,
      kind: item.kind as CorpusDocument["kind"],
      text: item.text, sha256: item.sha256,
    });
  }
  let docs: CorpusDocument[];
  try {
    docs = addCorpusDocuments([], imports.map(({id,name,kind,text})=>({id,name,kind,text})));
  } catch {
    throw new CorpusWorkspaceError("invalid_document");
  }
  validateSearchOptions(docs, candidate.query, candidate.mode, candidate.sourceFilter, candidate.question);
  return {
    docs,
    query: candidate.query as string,
    mode: candidate.mode as CorpusMatchMode,
    sourceFilter: candidate.sourceFilter as string | null,
    question: candidate.question as string,
    original: imports,
  };
}
export async function exportCorpusWorkspace(input: CorpusWorkspaceInput): Promise<string> {
  let docs: CorpusDocument[];
  try { docs = addCorpusDocuments([], input.documents); }
  catch { throw new CorpusWorkspaceError("invalid_document"); }
  validateSearchOptions(docs, input.query, input.mode, input.sourceFilter, input.question);
  const documents: Array<CorpusDocument & {sha256:string}> = [];
  for (const doc of docs) {
    documents.push({...doc, sha256: await digest(doc.text)});
  }
  const workspace: CorpusWorkspace = {
    format: CORPUS_WORKSPACE_FORMAT, version: CORPUS_WORKSPACE_VERSION,
    query: input.query, mode: input.mode, sourceFilter: input.sourceFilter,
    question: input.question, documents,
  };
  const encoded = JSON.stringify(workspace, null, 2) + "\n";
  verifySize(encoded);
  return encoded;
}
export async function parseCorpusWorkspace(text: string): Promise<CorpusWorkspace> {
  if (typeof text !== "string" || !text.trim()) throw new CorpusWorkspaceError("invalid_json");
  verifySize(text);
  let candidate: unknown;
  try { candidate = JSON.parse(text); }
  catch { throw new CorpusWorkspaceError("invalid_json"); }
  const verified = parsedFields(candidate);
  // Verify every document before returning even one importable item.
  for (let index = 0; index < verified.docs.length; index++) {
    if (await digest(verified.docs[index].text) !== verified.original[index].sha256) {
      throw new CorpusWorkspaceError("hash_mismatch");
    }
  }
  return {
    format: CORPUS_WORKSPACE_FORMAT, version: CORPUS_WORKSPACE_VERSION,
    query: verified.query, mode: verified.mode,
    sourceFilter: verified.sourceFilter, question: verified.question,
    documents: verified.docs.map((doc,index) => ({
      ...doc, sha256: verified.original[index].sha256,
    })),
  };
}
export async function readCorpusWorkspaceFile(
  file: Pick<File, "name"|"size"|"type"|"text">,
): Promise<CorpusWorkspace> {
  if (!file || typeof file.name !== "string" ||
      !file.name.toLocaleLowerCase().endsWith(".json") ||
      typeof file.text !== "function" || !Number.isSafeInteger(file.size) ||
      file.size < 1 || file.size > MAX_CORPUS_WORKSPACE_BYTES ||
      (file.type && !["application/json", "text/plain", "application/octet-stream"].includes(file.type))) {
    throw new CorpusWorkspaceError("invalid_file");
  }
  let decoded: string;
  try { decoded = await file.text(); }
  catch { throw new CorpusWorkspaceError("invalid_file"); }
  return parseCorpusWorkspace(decoded);
}
export function formatCorpusWorkspaceInventory(workspace: CorpusWorkspace): string {
  const charCount = workspace.documents.reduce((sum, doc) => sum + doc.text.length, 0);
  return [
    "ETERNYX LOCAL CORPUS WORKSPACE INVENTORY (no full source text)",
    "Format: " + workspace.format + " | version: " + workspace.version,
    "Files: " + workspace.documents.length + " / " + MAX_CORPUS_FILES,
    "Decoded UTF-16 characters: " + charCount + " / " + MAX_CORPUS_TOTAL_CHARS,
    "Search words: " + workspace.query,
    "Mode: " + workspace.mode,
    "Filtered source ID: " + (workspace.sourceFilter ?? "(all)"),
    "Document labels and decoded-text digests (NOT author authentication):",
    ...workspace.documents.map(doc => doc.name.replace(/[\r\n\t]/g," ") +
      " [" + doc.id + "] " + doc.kind + " | " + doc.text.length +
      " characters | SHA-256(decoded text): " + doc.sha256),
    "Integrity checks detect differences in backed-up decoded text; a modified bundle can also contain modified digests.",
    "No source authenticity, external source verification, AI request, cloud upload, or automatic persistence.",
  ].join("\n");
}
