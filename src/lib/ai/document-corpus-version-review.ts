/** Local version comparison. Pairing is explicit, not a provenance claim. */
import {addCorpusDocuments,type CorpusDocument} from "./document-corpus-tools";
import {compareLocalDocuments,DocumentCompareError,type DocumentComparison} from "./document-compare-tools";
import type {CorpusWorkspace} from "./document-corpus-workspace";
import type {CorpusImportReview} from "./document-corpus-import-review";
import type {planCorpusRecovery} from "./document-corpus-recovery";

export const VERSION_PREVIEW_ROWS=20;
export const VERSION_PREVIEW_CHARS=240;
export function compareCorpusVersions(current:readonly CorpusDocument[], backup:CorpusWorkspace, currentId:string, backupId:string) {
  const before=addCorpusDocuments([],current).find(d=>d.id===currentId);
  const after=addCorpusDocuments([],backup.documents).find(d=>d.id===backupId);
  if (!before || !after) throw new Error("invalid_pair");
  let lines:DocumentComparison|null=null;
  let lineLimitExceeded=false;
  try {
    lines=compareLocalDocuments(before.text,after.text);
  } catch (reason) {
    if (!(reason instanceof DocumentCompareError) || reason.code!=="too_many_lines") throw reason;
    lineLimitExceeded=true;
  }
  return {
    sameId:before.id===after.id, sameName:before.name===after.name,
    sameKind:before.kind===after.kind, exactText:before.text===after.text,
    beforeChars:before.text.length, afterChars:after.text.length,
    lineLimitExceeded, lines,
    preview: (lines?.changes ?? []).slice(0,VERSION_PREVIEW_ROWS).map(change=>({
      kind:change.kind,beforeLine:change.beforeLine,afterLine:change.afterLine,
      text:change.text.slice(0,VERSION_PREVIEW_CHARS),truncated:change.text.length>VERSION_PREVIEW_CHARS,
    })),
    omittedRows:Math.max(0,(lines?.changes.length??0)-VERSION_PREVIEW_ROWS),
  };
}

export type RecoveryReceipt = Readonly<{
  action:"selective-recovery"|"full-replacement";
  encrypted:boolean;
  beforeFiles:number; afterFiles:number;
  beforeCharacters:number; afterCharacters:number;
  added:number; copied:number; removed:number; textChanged:number; metadataChanged:number;
  settingsChanged:number;
}>;
export function selectiveRecoveryReceipt(plan:ReturnType<typeof planCorpusRecovery>, encrypted:boolean):RecoveryReceipt {
  return {
    action:"selective-recovery",encrypted,
    beforeFiles:plan.fileCount-plan.additions.length,afterFiles:plan.fileCount,
    beforeCharacters:plan.characterCount-plan.additions.reduce((sum,a)=>sum+a.document.text.length,0),
    afterCharacters:plan.characterCount,
    added:plan.additions.length-plan.copiedCount,copied:plan.copiedCount,
    removed:0,textChanged:0,metadataChanged:0,settingsChanged:0,
  };
}
export function replacementReceipt(review:CorpusImportReview,encrypted:boolean):RecoveryReceipt {
  return {
    action:"full-replacement",encrypted,
    beforeFiles:review.currentFiles,afterFiles:review.incomingFiles,
    beforeCharacters:review.currentCharacters,afterCharacters:review.incomingCharacters,
    added:review.counts.added,copied:0,removed:review.counts.removed,
    textChanged:review.counts["content-changed"],metadataChanged:review.counts["metadata-changed"],
    settingsChanged:Object.values(review.changedSettings).filter(Boolean).length,
  };
}
/** Whitelisted scalar fields only; no IDs, filenames, contents, digests or search values. */
export function formatRecoveryReceipt(receipt:RecoveryReceipt):string {
  return [
    "ETERNYX LOCAL RECOVERY RECEIPT",
    "Informational only; not tamper-proof, independently verified or a persistent audit log.",
    "Action: "+receipt.action,
    "Backup format: "+(receipt.encrypted?"encrypted":"plaintext"),
    "Files: "+receipt.beforeFiles+" -> "+receipt.afterFiles,
    "Decoded UTF-16 characters: "+receipt.beforeCharacters+" -> "+receipt.afterCharacters,
    "New sources: "+receipt.added,"Conflict copies: "+receipt.copied,
    "Removed sources: "+receipt.removed,"Changed text: "+receipt.textChanged,
    "Changed metadata only: "+receipt.metadataChanged,"Changed settings: "+receipt.settingsChanged,
    "Recovery performed locally; no source authenticity claim.",
  ].join("\n");
}
