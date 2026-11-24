/**
 * Phase 16: local backup change preview. Caller must pass an ALREADY VERIFIED
 * Phase 14/15 snapshot. This does not authenticate sources or prove correctness.
 * No network, persistence, AI, hashes, content excerpts or raw-text exports.
 */
import { addCorpusDocuments, type CorpusDocument } from "./document-corpus-tools";
import type { CorpusWorkspace, CorpusWorkspaceInput } from "./document-corpus-workspace";

export type CorpusChangeKind = "added" | "removed" | "content-changed" |
  "metadata-changed" | "unchanged";
export interface CorpusImportChange {
  readonly id: string;
  readonly name: string;
  readonly beforeName: string | null;
  readonly afterName: string | null;
  readonly status: CorpusChangeKind;
  readonly oldChars: number;
  readonly newChars: number;
}
export interface CorpusImportReview {
  readonly changes: readonly CorpusImportChange[];
  readonly counts: Readonly<Record<CorpusChangeKind, number>>;
  readonly changedSettings: {
    readonly query: boolean;
    readonly mode: boolean;
    readonly sourceFilter: boolean;
    readonly question: boolean;
  };
  readonly currentFiles: number;
  readonly incomingFiles: number;
  readonly currentCharacters: number;
  readonly incomingCharacters: number;
  readonly replacementHasEffects: boolean;
  readonly warning: string;
}

/**
 * Exact ID matching, preserving source identity.
 * Same name with DIFFERENT ID = removed + added, never silently correlated.
 * Content comparison is exact decoded JS string equality, including CRLF.
 * Names and kinds can differ while content remains unchanged.
 */
export function compareCorpusImport(
  current: CorpusWorkspaceInput,
  incoming: CorpusWorkspace,
): CorpusImportReview {
  const existing = addCorpusDocuments([], current.documents);
  const restored = addCorpusDocuments([], incoming.documents.map(
    ({id,name,kind,text}) => ({id,name,kind,text}),
  ));
  const existingById = new Map(existing.map(doc => [doc.id,doc]));
  const restoredById = new Map(restored.map(doc => [doc.id,doc]));
  const changes: CorpusImportChange[] = [];
  const push = (doc: CorpusDocument, old: CorpusDocument | undefined,
    replacement: CorpusDocument | undefined, status: CorpusChangeKind) => {
    changes.push({
      id: doc.id,
      name: replacement?.name ?? old?.name ?? doc.name,
      beforeName: old?.name ?? null,
      afterName: replacement?.name ?? null,
      status,
      oldChars: old?.text.length ?? 0,
      newChars: replacement?.text.length ?? 0,
    });
  };
  for (const doc of existing) {
    const next = restoredById.get(doc.id);
    if (!next) {
      push(doc,doc,undefined,"removed");
    } else if (doc.text !== next.text) {
      push(next,doc,next,"content-changed");
    } else if (doc.name !== next.name || doc.kind !== next.kind) {
      push(next,doc,next,"metadata-changed");
    } else {
      push(next,doc,next,"unchanged");
    }
  }
  for (const doc of restored) {
    if (!existingById.has(doc.id)) push(doc,undefined,doc,"added");
  }
  const counts: Record<CorpusChangeKind,number> = {
    added:0,removed:0,"content-changed":0,"metadata-changed":0,unchanged:0,
  };
  for (const change of changes) counts[change.status]++;
  const changedSettings = {
    query: current.query !== incoming.query,
    mode: current.mode !== incoming.mode,
    sourceFilter: current.sourceFilter !== incoming.sourceFilter,
    question: current.question !== incoming.question,
  };
  const replacementHasEffects = counts.added > 0 || counts.removed > 0 ||
    counts["content-changed"] > 0 || counts["metadata-changed"] > 0 ||
    Object.values(changedSettings).some(Boolean);
  return {
    changes,counts,changedSettings,
    currentFiles:existing.length,incomingFiles:restored.length,
    currentCharacters: existing.reduce((sum,doc)=>sum+doc.text.length,0),
    incomingCharacters: restored.reduce((sum,doc)=>sum+doc.text.length,0),
    replacementHasEffects,
    warning:"Local file-ID comparison only, not independent source verification. " +
      "A removed file will be lost from this in-memory workspace after replacement. " +
      "Full original decoded contents remain inside the backup; this review does not display or transmit them.",
  };
}

/**
 * Portable local report omits filenames, IDs, document contents, search terms,
 * passphrases, hashes, and AI questions. Only counts and yes/no flags.
 */
export function formatPrivateCorpusImportReview(review: CorpusImportReview): string {
  const {counts,changedSettings} = review;
  return [
    "ETERNYX LOCAL BACKUP RESTORE CHANGE SUMMARY",
    "This report contains counts only. No document text, identifiers, filenames, hashes or search values.",
    "Source trust or authorship: NOT VERIFIED",
    "Current files: "+review.currentFiles,
    "Incoming files: "+review.incomingFiles,
    "Current decoded UTF-16 characters: "+review.currentCharacters,
    "Incoming decoded UTF-16 characters: "+review.incomingCharacters,
    "Added: "+counts.added,
    "Removed: "+counts.removed,
    "Content changed: "+counts["content-changed"],
    "Metadata only changed: "+counts["metadata-changed"],
    "Unchanged: "+counts.unchanged,
    "Query setting changed: "+(changedSettings.query?"yes":"no"),
    "Match mode changed: "+(changedSettings.mode?"yes":"no"),
    "Source filter changed: "+(changedSettings.sourceFilter?"yes":"no"),
    "AI question changed: "+(changedSettings.question?"yes":"no"),
    "Replacement differs: "+(review.replacementHasEffects?"yes":"no"),
    "Preview only. No restore or AI call was performed.",
  ].join("\n");
}
