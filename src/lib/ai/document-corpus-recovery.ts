/** Phase 17: additive recovery from an already verified local backup.
 * No source authentication, persistence, network or AI invocation.
 */
import { addCorpusDocuments, MAX_CORPUS_FILES, MAX_CORPUS_TOTAL_CHARS, type CorpusDocument } from "./document-corpus-tools";
import type { CorpusWorkspace } from "./document-corpus-workspace";

export type RecoveryKind = "add" | "copy" | "already-present";
export type RecoveryCandidate = {
  id: string; name: string; kind: RecoveryKind; reason: string;
};
const nameKey = (name: string) => name.toLocaleLowerCase();

function inputs(current: readonly CorpusDocument[], backup: CorpusWorkspace) {
  return {
    existing: addCorpusDocuments([], current),
    incoming: addCorpusDocuments([], backup.documents.map(({id,name,kind,text})=>({id,name,kind,text}))),
  };
}

export function listCorpusRecovery(current: readonly CorpusDocument[], backup: CorpusWorkspace): RecoveryCandidate[] {
  const {existing,incoming} = inputs(current,backup);
  return incoming.map(doc => {
    const sameId = existing.find(item=>item.id===doc.id);
    if (sameId && sameId.name===doc.name && sameId.kind===doc.kind && sameId.text===doc.text) {
      return {id:doc.id,name:doc.name,kind:"already-present",reason:"Exact source already present"};
    }
    const sameName = existing.some(item=>nameKey(item.name)===nameKey(doc.name));
    if (sameId || sameName) return {
      id:doc.id,name:doc.name,kind:"copy",
      reason:sameId && sameName ? "Source ID and filename collide" : sameId ? "Source ID collides" : "Filename collides",
    };
    return {id:doc.id,name:doc.name,kind:"add",reason:"New source"};
  });
}
export class CorpusRecoveryError extends Error {
  constructor(readonly code: "invalid_selection" | "file_limit" | "too_large") {
    super(code); this.name="CorpusRecoveryError";
  }
}

export function planCorpusRecovery(
  current: readonly CorpusDocument[], backup: CorpusWorkspace, selectedIds: readonly string[],
) {
  const {existing,incoming} = inputs(current,backup);
  const candidates = listCorpusRecovery(existing,backup);
  const selected = new Set(selectedIds);
  if (selectedIds.length > MAX_CORPUS_FILES || selected.size !== selectedIds.length ||
      [...selected].some(id=>!candidates.some(c=>c.id===id && c.kind!=="already-present"))) {
    throw new CorpusRecoveryError("invalid_selection");
  }
  // Reserve all original IDs and names, even unselected backup entries, so a
  // generated copy can never steal an original identity during this preview.
  const reservedIds = new Set([...existing,...incoming].map(doc=>doc.id));
  const reservedNames = new Set([...existing,...incoming].map(doc=>nameKey(doc.name)));
  const additions: {sourceId:string; kind:"add"|"copy"; document:CorpusDocument}[] = [];
  let counter=0;
  for (const doc of incoming) {
    if (!selected.has(doc.id)) continue;
    const candidate = candidates.find(c=>c.id===doc.id)!;
    if (candidate.kind==="add") {
      additions.push({sourceId:doc.id,kind:"add",document:doc});
      continue;
    }
    // Copying a conflicting revision is explicit, with a new identity and
    // a visible filename. Preserve every decoded character and the file kind.
    let id: string, name: string;
    do {
      counter++;
      id="recovered-"+counter;
      const labelled="Recovered "+counter+" - "+doc.name;
      name=labelled.length<=255 ? labelled : "Recovered "+counter+"."+doc.kind;
    } while(reservedIds.has(id)||reservedNames.has(nameKey(name)));
    reservedIds.add(id); reservedNames.add(nameKey(name));
    additions.push({sourceId:doc.id,kind:"copy",document:{...doc,id,name}});
  }
  const fileCount=existing.length+additions.length;
  const characterCount=[...existing,...additions.map(a=>a.document)].reduce((sum,doc)=>sum+doc.text.length,0);
  if (fileCount>MAX_CORPUS_FILES) throw new CorpusRecoveryError("file_limit");
  if (characterCount>MAX_CORPUS_TOTAL_CHARS) throw new CorpusRecoveryError("too_large");
  const documents=addCorpusDocuments(existing,additions.map(a=>a.document));
  return {documents, additions, fileCount, characterCount, copiedCount:additions.filter(a=>a.kind==="copy").length};
}
