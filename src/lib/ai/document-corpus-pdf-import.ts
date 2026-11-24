import {addCorpusDocuments,type CorpusDocument} from "./document-corpus-tools";
export const MAX_STORED_PDF_CHUNKS=750;
export type StoredPdfDocument={id:string;file_name:string;user_id:string;file_type:string;status:string|null;mime_type:string|null};
export type StoredPdfChunk={document_id:string;chunk_index:number;content:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateReadyPdf(doc:StoredPdfDocument,owner:string){
  if(!uuid.test(owner)||!uuid.test(doc.id)||doc.user_id!==owner||doc.status!=="ready"||doc.file_type!=="pdf"||doc.mime_type!=="application/pdf"||
    typeof doc.file_name!=="string"||!doc.file_name.trim()||doc.file_name.length>255||/[\u0000-\u001f\u007f]/.test(doc.file_name))throw new Error("invalid_pdf_record");
  return doc;
}
export function inspectStoredPdfChunks(doc:StoredPdfDocument,owner:string,rows:readonly StoredPdfChunk[]){
  validateReadyPdf(doc,owner);
  if(!rows.length||rows.length>MAX_STORED_PDF_CHUNKS)throw new Error("invalid_chunks");
  return [...rows].sort((a,b)=>a.chunk_index-b.chunk_index).map((row,i)=>{
    if(row.document_id!==doc.id||row.chunk_index!==i||typeof row.content!=="string"||row.content.length>1000||!row.content.trim()||row.content.includes("\u0000"))throw new Error("invalid_chunks");
    const marker=/^\[PDF page ([1-9]\d*)\]\n/.exec(row.content);
    const page=marker?Number(marker[1]):null;
    // Stored markers are not independently authenticated parser metadata.
    // Older or unmarked chunks remain segment-only; never infer a page number.
    return {...row,page:page!==null&&Number.isSafeInteger(page)&&page<=60?page:null};
  });
}
export function planStoredPdfImport(existing:readonly CorpusDocument[],doc:StoredPdfDocument,owner:string,rows:readonly StoredPdfChunk[],selection:readonly number[]){
  const chunks=inspectStoredPdfChunks(doc,owner,rows);
  if(!selection.length||selection.length>8||new Set(selection).size!==selection.length||selection.some(n=>!Number.isInteger(n)||!chunks.some(c=>c.chunk_index===n)))throw new Error("invalid_selection");
  const additions:CorpusDocument[]=chunks.filter(c=>selection.includes(c.chunk_index)).map(c=>{
    const suffix=" · "+(c.page===null?"page unknown":"reported page "+c.page)+" · segment "+(c.chunk_index+1)+".txt";
    return {id:"pdf-"+doc.id+"-"+c.chunk_index,name:doc.file_name.slice(0,255-suffix.length)+suffix,kind:"txt",text:c.content};
  });
  return addCorpusDocuments(existing,additions);
}
