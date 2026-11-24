import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const url=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const core=url(compile(await read("src/lib/ai/document-corpus-tools.ts")));
const source=await read("src/lib/ai/document-corpus-pdf-import.ts");
const api=await import(url(compile(source).replace('"./document-corpus-tools"',JSON.stringify(core))));
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const doc={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",file_name:"inspection.pdf",user_id:owner,file_type:"pdf",status:"ready",mime_type:"application/pdf"};
const rows=[{document_id:doc.id,chunk_index:0,content:"[PDF page 2]\nExact evidence پښتو"},{document_id:doc.id,chunk_index:1,content:"[PDF page 5]\nSteel pipe"},{document_id:doc.id,chunk_index:2,content:"Legacy text without marker"}];
test("accepts only the current owner's ready PDF metadata",()=>{
 assert.deepEqual(api.validateReadyPdf(doc,owner),doc);
 for(const changed of [{user_id:doc.id},{status:"processing"},{file_type:"image"},{mime_type:"image/png"},{file_name:"bad\nname.pdf"}])assert.throws(()=>api.validateReadyPdf({...doc,...changed},owner),/invalid_pdf_record/);
});
test("page markers are reported, never guessed for legacy or invalid markers",()=>{
 assert.deepEqual(api.inspectStoredPdfChunks(doc,owner,[...rows].reverse()).map(c=>c.page),[2,5,null]);
 for(const content of ["[PDF page 61]\ntext","[PDF page 0]\ntext","text\n[PDF page 2]\nother"])assert.equal(api.inspectStoredPdfChunks(doc,owner,[{...rows[0],content}])[0].page,null);
});
test("rejects foreign, duplicate, gapped, empty, oversized and malformed chunks",()=>{
 for(const bad of [[],[rows[1]],[rows[0],rows[0]],[{...rows[0],document_id:owner}],[{...rows[0],content:" "}],[{...rows[0],content:"x".repeat(1001)}],[{...rows[0],content:"x\u0000y"}]])assert.throws(()=>api.inspectStoredPdfChunks(doc,owner,bad),/invalid_chunks/);
});
test("imports selected segments in canonical order with exact stored text and stable source labels",()=>{
 const existing=[{id:"local",name:"local.txt",kind:"txt",text:"existing"}];
 const result=api.planStoredPdfImport(existing,doc,owner,rows,[2,0]);
 assert.deepEqual(result[0],existing[0]);
 assert.equal(result[1].text,rows[0].content);
 assert.equal(result[2].text,rows[2].content);
 assert.match(result[1].name,/reported page 2 · segment 1/);
 assert.match(result[2].name,/page unknown · segment 3/);
 assert.equal(result[1].kind,"txt");
});
test("rejects stale selections, repeated selections and duplicate imported identity",()=>{
 for(const selection of [[],[0,0],[99],[-1],[0.5]])assert.throws(()=>api.planStoredPdfImport([],doc,owner,rows,selection),/invalid_selection/);
 const imported=api.planStoredPdfImport([],doc,owner,rows,[0]);
 assert.throws(()=>api.planStoredPdfImport(imported,doc,owner,rows,[0]));
});
test("eight-source workspace admission is atomic",()=>{
 const existing=Array.from({length:7},(_,i)=>({id:"local-"+i,name:"file-"+i+".txt",kind:"txt",text:"text"}));
 assert.throws(()=>api.planStoredPdfImport(existing,doc,owner,rows,[0,1]));
 assert.equal(existing.length,7);
 assert.equal(api.planStoredPdfImport(existing,doc,owner,rows,[0]).length,8);
});
test("long labels keep the reported-page and segment suffix",()=>{
 const result=api.planStoredPdfImport([],{...doc,file_name:"x".repeat(251)+".pdf"},owner,rows,[0]);
 assert.ok(result[0].name.length<=255);
 assert.match(result[0].name,/reported page 2 · segment 1\.txt$/);
});
test("actual knowledge index and retrieval preserve imported evidence text and source label",async()=>{
 const knowledge=await import(url(compile(await read("src/lib/ai/document-corpus-knowledge.ts")).replace('"./document-corpus-tools"',JSON.stringify(core))));
 const docs=api.planStoredPdfImport([],doc,owner,rows,[0,1]);
 const result=knowledge.searchKnowledgeIndex(knowledge.buildKnowledgeIndex(docs),"steel","all");
 assert.equal(result.results.length,1);
 assert.equal(result.results[0].text,rows[1].content);
 assert.match(result.results[0].documentName,/reported page 5/);
});
test("account reads are explicit, bounded, owner scoped and source-only",async()=>{
 const component=await read("src/components/ai/StoredPdfCorpusImport.tsx");
 for(const fragment of ['supabase.auth.getUser()', '.eq("user_id",ownerId)', '.eq("status","ready")', '.eq("document_id",doc.id)', 'count!==rows.length','MAX_STORED_PDF_CHUNKS+1','currentOwner()','window.confirm(','onImport(planStoredPdfImport'])assert.ok(component.includes(fragment),fragment);
 assert.doesNotMatch(component,/\.insert\(|\.update\(|\.delete\(|\.upload\(|functions\.invoke\(/);
});
test("workspace remounts across account changes and imports invalidate prior derived state",async()=>{
 const page=await read("src/pages/AIDocumentIntelligence.tsx");
 assert.match(page,/AIDocumentIntelligenceWorkspace key=\{ownerId\}/);
 const handler=page.slice(page.indexOf("const importStoredPdfSources"),page.indexOf("const loadCorpusFiles"));
 for(const fragment of ["discardRecoveryCheckpoint()","invalidateCorpusWorkspace()","invalidateCorpusFingerprints()","invalidateCorpus()","setCorpusFiles(next)","user?.id!==ownerId"])assert.ok(handler.includes(fragment),fragment);
});
