import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const url=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const core=url(compile(await read("src/lib/ai/document-corpus-tools.ts")));
const source=await read("src/lib/ai/document-corpus-checkpoint.ts");
const api=await import(url(compile(source).replace('"./document-corpus-tools"',JSON.stringify(core))));
const doc=(id,name,text,kind="txt")=>({id,name,text,kind});
const before=()=>({documents:[doc("a","private.txt","العربية\r\nپښتو"),doc("b","b.md","old","md")],query:"unfinished !!!",mode:"near",sourceFilter:"b",question:"private question"});
const after=()=>({documents:[doc("a","renamed.txt","new")],query:"new",mode:"all",sourceFilter:null,question:""});
test("full replacement undo restores exact source text, order, ID, metadata and unfinished draft settings",()=>{
 const a=before(),b=after(),c=api.createCorpusCheckpoint(a,b,"full-replacement");
 assert.ok(api.canUndoCorpusCheckpoint(c,b));
 assert.deepEqual(api.undoCorpusCheckpoint(c,b),a);
 assert.notEqual(c.before.documents,a.documents);
 assert.notEqual(c.before.documents[0],a.documents[0]);
});
test("selective recovery rollback drops only recovered additions and retains original settings",()=>{
 const a=before(),b={...a,documents:[...a.documents,doc("recovered-1","Recovered 1.txt","copy")]};
 const c=api.createCorpusCheckpoint(a,b,"selective-recovery");
 assert.deepEqual(api.undoCorpusCheckpoint(c,b),a);
 assert.equal(api.summarizeCorpusCheckpoint(c).settingsChanged,0);
});
test("subsequent source text, metadata, ID, order and search setting changes each block undo",()=>{
 const a=before(),b={...a,documents:[...a.documents,doc("c","c.txt","added")]};
 const c=api.createCorpusCheckpoint(a,b,"selective-recovery");
 const variants=[
 {...b,documents:b.documents.map((d,i)=>i?d:{...d,text:d.text.replace("\r\n","\n")})},
 {...b,documents:b.documents.map((d,i)=>i?d:{...d,name:"changed.txt"})},
 {...b,documents:b.documents.map((d,i)=>i?d:{...d,kind:"log"})},
 {...b,documents:b.documents.map((d,i)=>i?d:{...d,id:"changed"})},
 {...b,documents:[...b.documents].reverse()},
 {...b,documents:b.documents.slice(1)},
 {...b,query:"new"}, {...b,mode:"phrase"}, {...b,sourceFilter:null}, {...b,question:"new"}
 ];
 for(const v of variants){assert.equal(api.canUndoCorpusCheckpoint(c,v),false);assert.throws(()=>api.undoCorpusCheckpoint(c,v),/checkpoint_stale/);}
});
test("no-op creates no checkpoint; settings-only change can be undone",()=>{
 const a=before();assert.equal(api.createCorpusCheckpoint(a,a,"full-replacement"),null);
 const b={...a,query:"different"};
 const c=api.createCorpusCheckpoint(a,b,"full-replacement");
 assert.deepEqual(api.undoCorpusCheckpoint(c,b),a);
});
test("empty before workspace can be restored",()=>{
 const a={documents:[],query:"",mode:"all",sourceFilter:null,question:""},b=after();
 assert.deepEqual(api.undoCorpusCheckpoint(api.createCorpusCheckpoint(a,b,"full-replacement"),b),a);
});
test("checkpoint capture is isolated from later changes to input objects",()=>{
 const a=before(),b=after(),c=api.createCorpusCheckpoint(a,b,"full-replacement");
 a.documents[0].text="modified";b.documents[0].text="modified";
 assert.equal(c.before.documents[0].text,"العربية\r\nپښتو");
 assert.equal(c.after.documents[0].text,"new");
});
test("invalid document and stale filter are rejected during checkpoint capture",()=>{
 const a=before(),b=after();
 assert.throws(()=>api.createCorpusCheckpoint({...a,sourceFilter:"missing"},b,"full-replacement"),/invalid_filter/);
 assert.throws(()=>api.createCorpusCheckpoint({...a,documents:[doc("bad","bad.txt","")]},b,"full-replacement"));
});
test("summary has only numeric counts and no retained text, names or query values",()=>{
 const c=api.createCorpusCheckpoint(before(),after(),"full-replacement");
 const s=api.summarizeCorpusCheckpoint(c);
 assert.deepEqual(Object.keys(s).sort(),["afterCharacters","afterFiles","beforeCharacters","beforeFiles","settingsChanged"]);
 assert.ok(Object.values(s).every(Number.isFinite));assert.equal(s.settingsChanged,4);
 assert.doesNotMatch(source,/localStorage|sessionStorage|fetch\(/);
});
test("UI requires opt-in, exact guard and confirmation, invalidates derived state, consumes undo and discards on edits",async()=>{
 const page=await read("src/pages/AIDocumentIntelligence.tsx");
 assert.match(page,/\[keepRecoveryCheckpoint,setKeepRecoveryCheckpoint\] = useState\(false\)/);
 const undo=page.slice(page.indexOf("const undoLastRecovery ="),page.indexOf("const recoverSelectedCorpus ="));
 for(const f of ["!checkpointCanUndo","window.confirm(","undoCorpusCheckpoint(recoveryCheckpoint,currentCorpusSnapshot)","invalidateCorpusWorkspace()","invalidateCorpusFingerprints()","invalidateCorpus()","discardRecoveryCheckpoint()","setRecoveryReceipt(null)"]) assert.ok(undo.includes(f),f);
 for(const setter of ["setCorpusQuery","setCorpusMode","setCorpusFilter","setCorpusQuestion"]) assert.ok(page.includes("discardRecoveryCheckpoint(); invalidateCorpusWorkspace(); "+setter));
 assert.match(page,/setCorpusFiles\(\[\]\);\s*discardRecoveryCheckpoint\(\)/);
 assert.match(page,/Discard undo checkpoint/);
 assert.match(page,/keepRecoveryCheckpoint \? createCorpusCheckpoint/);
 assert.match(page,/if \(keepRecoveryCheckpoint\) nextCheckpoint=createCorpusCheckpoint/);
});
