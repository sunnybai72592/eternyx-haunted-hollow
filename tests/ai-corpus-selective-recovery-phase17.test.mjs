import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const read = path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const transpile = source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url = source=>"data:text/javascript;base64,"+Buffer.from(source).toString("base64");
const core = url(transpile(await read("src/lib/ai/document-corpus-tools.ts")));
const workspace = await import(url(transpile(await read("src/lib/ai/document-corpus-workspace.ts")).replace(/(["'])\.\/document-corpus-tools\1/,JSON.stringify(core))));
const source = await read("src/lib/ai/document-corpus-recovery.ts");
const {listCorpusRecovery,planCorpusRecovery} = await import(url(transpile(source).replace(/(["'])\.\/document-corpus-tools\1/,JSON.stringify(core))));
const page=await read("src/pages/AIDocumentIntelligence.tsx");
const doc=(id,name,text="text",kind="txt")=>({id,name,kind,text});
const backup=async documents=>workspace.parseCorpusWorkspace(await workspace.exportCorpusWorkspace({documents,query:"different",mode:"phrase",sourceFilter:null,question:"different question"}));
test("classifies identity, same-name different ID, and changed same-ID independently",async()=>{
 const current=[doc("a","same.txt"),doc("b","current.txt"),doc("c","old.txt")];
 const incoming=await backup([doc("a","same.txt"),doc("new","CURRENT.TXT"),doc("c","renamed.txt","changed"),doc("fresh","fresh.txt")]);
 assert.deepEqual(listCorpusRecovery(current,incoming).map(c=>[c.id,c.kind]),[["a","already-present"],["new","copy"],["c","copy"],["fresh","add"]]);
});
test("selected subset preserves current objects by value and exact Unicode/CRLF text",async()=>{
 const current=[doc("a","keep.txt","original")];
 const incoming=await backup([doc("b","new.md","العربية\r\nپښتو","md"),doc("c","skip.txt")]);
 const plan=planCorpusRecovery(current,incoming,["b"]);
 assert.deepEqual(plan.documents,[...current,doc("b","new.md","العربية\r\nپښتو","md")]);
 assert.equal(plan.fileCount,2); assert.equal(plan.characterCount,plan.documents.reduce((n,d)=>n+d.text.length,0));
 assert.deepEqual(current,[doc("a","keep.txt","original")]); assert.equal(plan.copiedCount,0);
});
test("conflicting revisions get deterministic independent identities and leave originals untouched",async()=>{
 const current=[doc("a","old.txt","old"),doc("recovered-1","other.txt"),doc("x","Recovered 2 - old.txt")];
 const incoming=await backup([doc("a","old.txt","new"),doc("recovered-3","reserved.txt"),doc("b","fresh.txt")]);
 const plan=planCorpusRecovery(current,incoming,["a","b"]);
 assert.deepEqual(plan.documents.slice(0,current.length),current);
 assert.equal(plan.copiedCount,1);
 assert.deepEqual(plan.additions[0].document,doc("recovered-4","Recovered 4 - old.txt","new"));
 assert.deepEqual(plan,planCorpusRecovery(current,incoming,["b","a"]));
 assert.equal(plan.documents[4].id,"b");
});
test("long filenames are recovered with a bounded non-conflicting fallback",async()=>{
 const long="x".repeat(251)+".txt";
 const current=[doc("a",long)];
 const incoming=await backup([doc("a",long,"changed")]);
 const plan=planCorpusRecovery(current,incoming,["a"]);
 assert.equal(plan.additions[0].document.name,"Recovered 1.txt");
 assert.equal(plan.additions[0].document.text,"changed");
});
test("empty selection is a no-op; stale, repeated and exact duplicate selections reject",async()=>{
 const current=[doc("a","a.txt")];
 const incoming=await backup([doc("a","a.txt"),doc("b","b.txt")]);
 assert.deepEqual(planCorpusRecovery(current,incoming,[]).documents,current);
 for(const ids of [["a"],["missing"],["b","b"]]) assert.throws(()=>planCorpusRecovery(current,incoming,ids),{code:"invalid_selection"});
});
test("file cap rejects the whole batch rather than truncating",async()=>{
 const current=Array.from({length:7},(_,i)=>doc("a"+i,"a"+i+".txt"));
 const incoming=await backup([doc("b","b.txt"),doc("c","c.txt")]);
 assert.throws(()=>planCorpusRecovery(current,incoming,["b","c"]),{code:"file_limit"});
 assert.equal(current.length,7);
 assert.equal(planCorpusRecovery(current,incoming,["b"]).fileCount,8);
});
test("combined character limit is atomic and exact boundary is allowed",async()=>{
 const current=Array.from({length:3},(_,i)=>doc("a"+i,"a"+i+".txt","x".repeat(100000)));
 const incoming=await backup([doc("b","b.txt","y".repeat(100000)),doc("c","c.txt","z")]);
 assert.equal(planCorpusRecovery(current,incoming,["b"]).characterCount,400000);
 assert.throws(()=>planCorpusRecovery(current,incoming,["b","c"]),{code:"too_large"});
 assert.equal(current.length,3);
});
test("UI explicitly selects, previews, confirms and clears stale derived evidence while retaining settings",()=>{
 for(const value of ["Select new sources only","Recover as separate copy","New copy filename:","none selected by default","setCorpusRecoveryIds([])","!recoveryPreview?.plan?.additions.length","aria-label=\"Selective non-destructive backup recovery\""]) assert.ok(page.includes(value),value);
 const handler=page.slice(page.indexOf("const recoverSelectedCorpus ="),page.indexOf("const restoreCorpusWorkspace ="));
 for(const value of ["planCorpusRecovery(corpusFiles,pendingCorpusWorkspace,corpusRecoveryIds)","window.confirm(","invalidateCorpusWorkspace()","invalidateCorpusFingerprints()","invalidateCorpus()","setCorpusFiles(plan.documents)"]) assert.ok(handler.includes(value),value);
 assert.doesNotMatch(handler,/setCorpus(Query|Mode|Filter|Question)\(|\.run\(|fetch\(/);
 assert.doesNotMatch(source,/localStorage\.|sessionStorage\.|fetch\(/);
});
