import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const url=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const core=url(compile(await read("src/lib/ai/document-corpus-tools.ts")));
const load=async name=>import(url(compile(await read("src/lib/ai/"+name+".ts")).replace('"./document-corpus-tools"',JSON.stringify(core))));
const indexApi=await load("document-corpus-knowledge");
const evidence=await load("document-corpus-knowledge-evidence");
const doc=(id,text)=>({id,name:id+".txt",kind:"txt",text});
test("alternative terms broaden any mode but never relax all-mode primary terms",()=>{
 const idx=indexApi.buildKnowledgeIndex([doc("a","pipe corrosion"),doc("b","pipeline"),doc("c","pipe protection")]);
 const options={expansion:"pipeline"};
 assert.deepEqual(indexApi.searchKnowledgeIndex(idx,"pipe corrosion","all",null,options).results.map(x=>x.documentId),["a"]);
 const result=indexApi.searchKnowledgeIndex(idx,"pipe","any",null,options);
 assert.equal(result.totalMatches,3);assert.equal(result.matchingSources,3);assert.deepEqual(result.expansionTerms,["pipeline"]);
 assert.ok(result.results.some(x=>x.documentId==="b"));
});
test("alternative terms receive exactly half BM25 weight, duplicates ignored",()=>{
 const idx=indexApi.buildKnowledgeIndex([doc("a","pipe"),doc("b","steel")]);
 const result=indexApi.searchKnowledgeIndex(idx,"pipe","any",null,{expansion:"PIPE steel steel"});
 assert.deepEqual(result.expansionTerms,["steel"]);
 assert.equal(result.results[1].score,result.results[0].score/2);
 assert.throws(()=>indexApi.searchKnowledgeIndex(idx,"a b c d e f g h","any",null,{expansion:"i"}),/invalid_query/);
});
test("diversified ranking round-robins sources without losing match count or filter",()=>{
 const idx=indexApi.buildKnowledgeIndex([doc("a","pipe ".repeat(800)),doc("b","pipe extra words")]);
 const normal=indexApi.searchKnowledgeIndex(idx,"pipe","all");
 const mixed=indexApi.searchKnowledgeIndex(idx,"pipe","all",null,{diversify:true});
 assert.equal(mixed.totalMatches,normal.totalMatches);assert.equal(mixed.matchingSources,2);
 assert.equal(new Set(mixed.results.slice(0,2).map(x=>x.documentId)).size,2);
 assert.ok(indexApi.searchKnowledgeIndex(idx,"pipe","all","a",{diversify:true}).results.every(x=>x.documentId==="a"));
});
test("suggestions are actual indexed prefix variants, never invented synonyms",()=>{
 const idx=indexApi.buildKnowledgeIndex([doc("a","pipe pipes pipeline"),doc("b","pipeline corrosion")]);
 assert.deepEqual(evidence.suggestKnowledgeTerms(idx,"PIPE"),["pipeline","pipes"]);
 assert.deepEqual(evidence.suggestKnowledgeTerms(idx,"xy"),[]);
});
test("exact Unicode CRLF evidence and stable labels follow displayed result order",()=>{
 const docs=[doc("a","pipe العربية\r\nnext"),doc("b","pipe پښتو")];
 const idx=indexApi.buildKnowledgeIndex(docs),result=indexApi.searchKnowledgeIndex(idx,"pipe","all");
 const ids=result.results.map(x=>x.id).reverse();
 const packet=evidence.prepareKnowledgeEvidence(docs,idx,result,ids,"What is documented?");
 assert.equal(packet.sourceCount,2);
 assert.deepEqual(packet.passages.map(p=>p.label),["E1","E2"]);
 assert.deepEqual(packet.passages.map(p=>p.text),result.results.map(x=>x.text));
 assert.match(packet.draft,/untrusted evidence/);assert.match(packet.draft,/independent verification/);
 const data=JSON.parse(packet.draft.split("\n\n")[1]);
 assert.equal(data.evidence[0].text,result.results[0].text);
});
test("chunk ending in CRLF retains valid physical line ranges",()=>{
 const docs=[doc("a",("pipe ".repeat(170)+"\r\n").repeat(2))];
 const idx=indexApi.buildKnowledgeIndex(docs),result=indexApi.searchKnowledgeIndex(idx,"pipe","all");
 const packet=evidence.prepareKnowledgeEvidence(docs,idx,result,result.results.map(x=>x.id),"Question?");
 assert.deepEqual(packet.passages.map(p=>[p.startLine,p.endLine]),[[1,1],[2,2]]);
});
test("rejects stale source text, altered offsets and fabricated line coordinates",()=>{
 const docs=[doc("a","pipe exact evidence")],idx=indexApi.buildKnowledgeIndex(docs),result=indexApi.searchKnowledgeIndex(idx,"pipe","all"),hit=result.results[0];
 assert.throws(()=>evidence.prepareKnowledgeEvidence([doc("a","pipe altered evidence")],idx,result,[hit.id],"Q?"),/stale_source/);
 for(const change of [{startLine:99},{endOffset:2},{text:"fabricated"}]){
 const fake={...result,results:[{...hit,...change}]};
 assert.throws(()=>evidence.prepareKnowledgeEvidence(docs,idx,fake,[hit.id],"Q?"),/stale_source/);
 }
});
test("selection and question validation fail closed; oversized JSON packet is not truncated",()=>{
 const docs=[doc("a","pipe "+'"'.repeat(990)),doc("b","pipe "+'"'.repeat(990)),doc("c","pipe "+'"'.repeat(990)),doc("d","pipe")];
 const idx=indexApi.buildKnowledgeIndex(docs),result=indexApi.searchKnowledgeIndex(idx,"pipe","all");
 const ids=result.results.map(x=>x.id),id=ids[0];
 for(const selection of [[],[id,id],["missing"],ids])assert.throws(()=>evidence.prepareKnowledgeEvidence(docs,idx,result,selection,"Q?"),/invalid_selection/);
 assert.throws(()=>evidence.prepareKnowledgeEvidence(docs,idx,result,[id],""),/invalid_question/);
 const large=result.results.filter(x=>x.documentId!=="d").map(x=>x.id);
 assert.throws(()=>evidence.prepareKnowledgeEvidence(docs,idx,result,large,"Q?"),/too_large/);
});
test("UI invalidates selections and prompts on changed query and never auto-submits",async()=>{
 const page=await read("src/pages/AIDocumentIntelligence.tsx");
 for(const fragment of ["Find indexed word variants","Diversify ranking across sources","setKnowledgeSelected([])","invalidateKnowledgePacket()","Prepare verified local evidence packet","Copy answer-preparation prompt","No AI answer is generated or sent"])assert.ok(page.includes(fragment),fragment);
 const handler=page.slice(page.indexOf("const prepareLocalKnowledgePacket="),page.indexOf("const invalidateKnowledgeIndex="));
 assert.match(handler,/prepareKnowledgeEvidence\(corpusFiles,activeKnowledgeIndex/);
 assert.doesNotMatch(handler,/\.run\(|fetch\(|\.invoke\(/);
});
