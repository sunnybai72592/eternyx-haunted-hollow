import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const url=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const load=async(name,deps={})=>{
 let source=compile(await read("src/lib/ai/"+name+".ts"));
 for(const [key,value] of Object.entries(deps)) source=source.replaceAll('"./'+key+'"',JSON.stringify(value));
 return url(source);
};
const core=await load("document-corpus-tools");
const diff=await load("document-compare-tools");
const deps={"document-corpus-tools":core};
const workspace=await import(await load("document-corpus-workspace",deps));
const recovery=await import(await load("document-corpus-recovery",deps));
const imports=await import(await load("document-corpus-import-review",deps));
const api=await import(await load("document-corpus-version-review",{...deps,"document-compare-tools":diff}));
const doc=(id,name,text,kind="txt")=>({id,name,text,kind});
const input=documents=>({documents,query:"secret query",mode:"all",sourceFilter:null,question:"secret question"});
const backup=async documents=>workspace.parseCorpusWorkspace(await workspace.exportCorpusWorkspace(input(documents)));
test("explicit different-ID pairs show actual line differences without implying common identity",async()=>{
 const current=[doc("old","private-old.txt","same\nremove me")];
 const b=await backup([doc("new","private-new.md","same\nadd me","md")]);
 const result=api.compareCorpusVersions(current,b,"old","new");
 assert.equal(result.sameId,false);assert.equal(result.sameName,false);assert.equal(result.sameKind,false);
 assert.equal(result.exactText,false);assert.equal(result.lines.unchangedLines,1);
 assert.deepEqual(result.preview.map(x=>[x.kind,x.text]),[["removed","remove me"],["added","add me"]]);
});
test("CRLF normalization does not hide exact text differences; Unicode retained",async()=>{
 const current=[doc("a","a.txt","العربية\r\nپښتو")];
 const b=await backup([doc("a","a.txt","العربية\nپښتو")]);
 const result=api.compareCorpusVersions(current,b,"a","a");
 assert.equal(result.exactText,false);assert.equal(result.lines.identical,true);
 assert.equal(result.beforeChars,result.afterChars+1);
});
test("metadata changes remain visible even if text is identical",async()=>{
 const b=await backup([doc("a","new.md","text","md")]);
 const result=api.compareCorpusVersions([doc("a","old.txt","text")],b,"a","a");
 assert.equal(result.exactText,true);assert.equal(result.sameId,true);assert.equal(result.sameName,false);assert.equal(result.sameKind,false);
});
test("invalid pair is rejected, not substituted",async()=>{
 const b=await backup([doc("b","b.txt","text")]);
 assert.throws(()=>api.compareCorpusVersions([doc("a","a.txt","text")],b,"b","b"),/invalid_pair/);
});
test("line-limit fallback preserves exact summary and returns no partial diff",async()=>{
 const b=await backup([doc("a","a.txt","y\n".repeat(1201))]);
 const result=api.compareCorpusVersions([doc("a","a.txt","x")],b,"a","a");
 assert.equal(result.lineLimitExceeded,true);assert.equal(result.lines,null);assert.deepEqual(result.preview,[]);assert.equal(result.exactText,false);
});
test("preview limits rows and individual lines, preserves exact total count",async()=>{
 const b=await backup([doc("a","a.txt",Array.from({length:30},(_,i)=>"new"+i+"y".repeat(300)).join("\n"))]);
 const result=api.compareCorpusVersions([doc("a","a.txt","x".repeat(300))],b,"a","a");
 assert.equal(result.preview.length,20);assert.equal(result.omittedRows,11);
 assert.equal(result.preview[0].text.length,240);assert.equal(result.preview[0].truncated,true);
 assert.equal(result.lines.addedLines,30);assert.equal(result.lines.removedLines,1);
});
test("selective receipt records completed-plan counts with no source data",async()=>{
 const current=[doc("a","private.txt","secret text")];
 const b=await backup([doc("a","private.txt","changed"),doc("new","secret-name.txt","other")]);
 const plan=recovery.planCorpusRecovery(current,b,["a","new"]);
 const receipt=api.selectiveRecoveryReceipt(plan,true);
 assert.equal(receipt.beforeFiles,1);assert.equal(receipt.afterFiles,3);assert.equal(receipt.added,1);assert.equal(receipt.copied,1);
 assert.equal(receipt.removed,0);assert.equal(receipt.settingsChanged,0);
 assert.equal(receipt.beforeCharacters,11);assert.equal(receipt.afterCharacters,23);
 const report=api.formatRecoveryReceipt(receipt);
 for(const value of ["private.txt","secret-name.txt","secret text","secret query","secret question","recovered-1"]) assert.ok(!report.includes(value));
 assert.match(report,/not tamper-proof/);
});
test("replacement receipt distinguishes removals, content, metadata and settings",async()=>{
 const current=input([doc("a","a.txt","old"),doc("b","b.txt","remove"),doc("c","c.txt","same")]);
 const b=await workspace.parseCorpusWorkspace(await workspace.exportCorpusWorkspace({...input([doc("a","a.txt","new"),doc("c","renamed.txt","same"),doc("d","d.txt","added")]),query:"other"}));
 const receipt=api.replacementReceipt(imports.compareCorpusImport(current,b),false);
 assert.deepEqual([receipt.added,receipt.removed,receipt.textChanged,receipt.metadataChanged,receipt.settingsChanged],[1,1,1,1,1]);
 assert.equal(receipt.encrypted,false);assert.equal(receipt.action,"full-replacement");
});
test("UI resets version reviews when backup invalidates and only creates receipts in confirmed mutation paths",async()=>{
 const page=await read("src/pages/AIDocumentIntelligence.tsx");
 assert.match(page,/setPendingCorpusWorkspace\(null\);\s*resetVersionReview\(\);/);
 const selected=page.slice(page.indexOf("const recoverSelectedCorpus ="),page.indexOf("const restoreCorpusWorkspace ="));
 const replacement=page.slice(page.indexOf("const restoreCorpusWorkspace ="),page.indexOf("const downloadCorpusResults ="));
 for(const [handler,receipt] of [[selected,"selectiveRecoveryReceipt"],[replacement,"replacementReceipt"]]){
 assert.ok(handler.indexOf("window.confirm(")>=0);
 assert.ok(handler.indexOf("setRecoveryReceipt("+receipt)>handler.indexOf("setCorpusFiles("));
 }
 assert.match(page,/Copy recovery receipt/);assert.match(page,/Clear receipt/);
 assert.match(page,/preview truncated/);
});
