import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const url=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const bridge=url(compile(await read("src/lib/ai/studio-chat-request.ts")));
const source=await read("src/lib/ai/document-corpus-rag.ts");
const api=await import(url(compile(source).replace('"./studio-chat-request"',JSON.stringify(bridge))));
const packet={passages:[{label:"E1",source:"a.txt",startLine:1,endLine:2,startOffset:0,endOffset:10,text:"pipe\r\nsteel"},{label:"E2",source:"b.txt",startLine:1,endLine:1,startOffset:0,endOffset:4,text:"coat"}]};
const answer=(claims,status="answered",uncertainty="")=>JSON.stringify({status,claims,uncertainty});
test("exact outgoing request includes selected source data and outer bridge instructions",()=>{
 const result=api.prepareKnowledgeRagRequest(packet,"What is stated?");
 assert.match(result.message,/ETERNYX studio task/);assert.match(result.prompt,/untrusted evidence/);
 const data=JSON.parse(result.prompt.split("\n\n").at(-1));
 assert.deepEqual(data,{question:"What is stated?",evidence:packet.passages});
 assert.ok(result.message.length<=4000);
});
test("bridge enforces total character budget instead of truncating source data",()=>{
 const large={passages:[{...packet.passages[0],text:'"'.repeat(3000)}]};
 assert.throws(()=>api.prepareKnowledgeRagRequest(large,"Q?"),{code:"too_long"});
});
test("valid labels link claims to reviewed evidence and expose unused labels",()=>{
 const result=api.reviewKnowledgeRagResponse(answer([{text:"Pipe is mentioned.",citations:["E1"]}]),packet);
 assert.equal(result.valid,true);assert.deepEqual(result.usedLabels,["E1"]);assert.deepEqual(result.unusedLabels,["E2"]);
});
test("multiple citations and one fenced JSON object are accepted",()=>{
 const raw=answer([{text:"Both sources are relevant.",citations:["E2","E1"]}]);
 const result=api.reviewKnowledgeRagResponse("\x60\x60\x60json\n"+raw+"\n\x60\x60\x60",packet);
 assert.equal(result.valid,true);assert.deepEqual(result.usedLabels,["E1","E2"]);
});
test("insufficient evidence permits zero claims with an uncertainty explanation",()=>{
 const result=api.reviewKnowledgeRagResponse(answer([],"insufficient","The evidence does not specify a value."),packet);
 assert.equal(result.valid,true);assert.equal(result.status,"insufficient");assert.deepEqual(result.unusedLabels,["E1","E2"]);
 assert.equal(api.reviewKnowledgeRagResponse(answer([],"insufficient",""),packet).valid,false);
 assert.equal(api.reviewKnowledgeRagResponse(answer([]),packet).valid,false);
});
test("unknown, duplicated or missing citation labels are rejected",()=>{
 for(const citations of [["E3"],["E1","E1"],["e1"],[1],[]]){
 const result=api.reviewKnowledgeRagResponse(answer([{text:"Claim",citations}]),packet);
 assert.equal(result.valid,false);assert.equal(result.reason,citations.length?"unknown_citation":"missing_citation");
 }
});
test("rejects hidden inline labels, unexpected fields, malformed and oversized responses",()=>{
 for(const raw of ["not JSON","x".repeat(12001),answer([{text:"Claim [E9]",citations:["E1"]}]),answer([{text:"Claim",citations:["E1"],extra:true}]),answer([{text:"Claim",citations:["E1"]}],"answered","[E9]"),answer([{text:"x".repeat(1201),citations:["E1"]}])])assert.equal(api.reviewKnowledgeRagResponse(raw,packet).valid,false);
});
test("structural acceptance does not imply entailment or accuracy",()=>{
 const result=api.reviewKnowledgeRagResponse(answer([{text:"An arbitrary claim not entailed by the source.",citations:["E1"]}]),packet);
 assert.equal(result.valid,true);
 assert.equal("verifiedTruth" in result,false);
});
test("UI separates local preparation from opt-in submission and invalidates stale output",async()=>{
 const page=await read("src/pages/AIDocumentIntelligence.tsx");
 const local=page.slice(page.indexOf("const prepareLocalKnowledgePacket="),page.indexOf("const invalidateKnowledgeIndex="));
 assert.doesNotMatch(local,/\.run\(/);
 const send=page.slice(page.indexOf("const submitRag="),page.indexOf("const ragReview="));
 for(const fragment of ["!ragConsent","knowledgeAI.loading","getCurrentRag()","fresh.message!==ragPrepared.message","window.confirm(","setRagConsent(false)",'knowledgeAI.run("ai.documents.analyze",fresh.prompt)'])assert.ok(send.includes(fragment),fragment);
 assert.match(page,/knowledgeAI.invalidate\(\)/);
 assert.match(page,/inspectDocumentPrivacy\(\[knowledgeQuestion/);
 assert.match(page,/not whether the claims are true/);
 assert.match(page,/raw model output below is unvalidated/);
});
