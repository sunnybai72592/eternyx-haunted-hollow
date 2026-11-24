/** Opt-in, one-step recovery checkpoint. Never persistent or encrypted storage. */
import {addCorpusDocuments} from "./document-corpus-tools";
import type {CorpusWorkspaceInput} from "./document-corpus-workspace";
export type CorpusCheckpoint = Readonly<{
  action:"selective-recovery"|"full-replacement";
  before:CorpusWorkspaceInput;
  after:CorpusWorkspaceInput;
}>;
function snapshot(input:CorpusWorkspaceInput):CorpusWorkspaceInput {
  const documents=addCorpusDocuments([],input.documents);
  if (input.sourceFilter!==null && !documents.some(doc=>doc.id===input.sourceFilter)) throw new Error("invalid_filter");
  // Preserve local draft settings exactly, including unfinished queries.
  return {documents,query:input.query,mode:input.mode,sourceFilter:input.sourceFilter,question:input.question};
}
export function sameCorpusSnapshot(a:CorpusWorkspaceInput,b:CorpusWorkspaceInput):boolean {
  return a.query===b.query && a.mode===b.mode && a.sourceFilter===b.sourceFilter &&
    a.question===b.question && a.documents.length===b.documents.length &&
    a.documents.every((doc,i)=>{
      const other=b.documents[i];
      return doc.id===other.id && doc.name===other.name && doc.kind===other.kind && doc.text===other.text;
    });
}
export function createCorpusCheckpoint(before:CorpusWorkspaceInput,after:CorpusWorkspaceInput,action:CorpusCheckpoint["action"]):CorpusCheckpoint|null {
  const previous=snapshot(before), next=snapshot(after);
  if(sameCorpusSnapshot(previous,next)) return null;
  return {before:previous,after:next,action};
}
export function canUndoCorpusCheckpoint(checkpoint:CorpusCheckpoint,current:CorpusWorkspaceInput):boolean {
  return sameCorpusSnapshot(checkpoint.after,current);
}
export function undoCorpusCheckpoint(checkpoint:CorpusCheckpoint,current:CorpusWorkspaceInput):CorpusWorkspaceInput {
  if(!canUndoCorpusCheckpoint(checkpoint,current)) throw new Error("checkpoint_stale");
  return snapshot(checkpoint.before);
}
/** No source text, names, IDs or query values in this UI summary. */
export function summarizeCorpusCheckpoint(checkpoint:CorpusCheckpoint) {
  return {
    beforeFiles:checkpoint.before.documents.length,afterFiles:checkpoint.after.documents.length,
    beforeCharacters:checkpoint.before.documents.reduce((n,d)=>n+d.text.length,0),
    afterCharacters:checkpoint.after.documents.reduce((n,d)=>n+d.text.length,0),
    settingsChanged:["query","mode","sourceFilter","question"].filter(key=>{
      const k=key as "query"|"mode"|"sourceFilter"|"question";
      return checkpoint.before[k]!==checkpoint.after[k];
    }).length,
  };
}
