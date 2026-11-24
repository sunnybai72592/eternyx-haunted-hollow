import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const coreSource = await read("src/lib/ai/document-corpus-tools.ts");
const workspaceSource = await read("src/lib/ai/document-corpus-workspace.ts");
const cryptoSource = await read("src/lib/ai/document-corpus-crypto.ts");
const reviewSource = await read("src/lib/ai/document-corpus-import-review.ts");
const page = await read("src/pages/AIDocumentIntelligence.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const transpile = source => ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}
}).outputText;
const toURL = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const coreURL = toURL(transpile(coreSource));
const workspaceURL = toURL(transpile(workspaceSource).replace(
  /(["'])\.\/document-corpus-tools\1/,JSON.stringify(coreURL)));
const cryptoURL = toURL(transpile(cryptoSource).replace(
  /(["'])\.\/document-corpus-workspace\1/,JSON.stringify(workspaceURL)));
const reviewURL = toURL(transpile(reviewSource)
  .replace(/(["'])\.\/document-corpus-tools\1/,JSON.stringify(coreURL))
  .replace(/(["'])\.\/document-corpus-workspace\1/,JSON.stringify(workspaceURL)));
const cryptoApi = await import(cryptoURL);
const backups = await import(workspaceURL);
const reviewApi = await import(reviewURL);
const oldPass = "Old-Safe-Unique-Passphrase-2026";
const newPass = "New-Long-Unique-Passphrase-2026";
const doc=(id,name,text,kind="txt")=>({id,name,text,kind});
const current=()=>({
  documents:[
    doc("a","pipeline-internal.txt","CP potentials -850 mV\r\nRecords: Ûniçodé"),
    doc("b","old-private.md","Do not share person@example.test","md"),
    doc("d","same-content.txt","unchanged"),
    doc("e","rename-me.txt","same decoded text"),
  ],
  query:"secret inspection",mode:"all",sourceFilter:"a",question:"What is different?",
});
const incoming=()=>({
  documents:[
    doc("a","pipeline-internal.txt","CP potentials -855 mV\r\nRecords: Ûniçodé"),
    doc("c","new-private.log","New private document +42 123-45-6789","log"),
    doc("d","same-content.txt","unchanged"),
    doc("e","renamed-meta.txt","same decoded text"),
  ],
  query:"different query",mode:"phrase",sourceFilter:null,question:"Different private question?",
});
const asFile=(name,content,type="application/json")=>({
  name,size:Buffer.byteLength(content),type,text:async()=>content,
});
const incomingParsed=async()=>backups.parseCorpusWorkspace(
  await backups.exportCorpusWorkspace(incoming()));

test("review classifies exact source-ID additions, removals, text and metadata changes",async()=>{
  const diff=reviewApi.compareCorpusImport(current(),await incomingParsed());
  assert.equal(diff.currentFiles,4);
  assert.equal(diff.incomingFiles,4);
  assert.deepEqual(diff.counts,{
    added:1,removed:1,"content-changed":1,"metadata-changed":1,unchanged:1,
  });
  assert.deepEqual(diff.changes.map(x=>[x.id,x.status]),[
    ["a","content-changed"],["b","removed"],["d","unchanged"],
    ["e","metadata-changed"],["c","added"],
  ]);
  assert.deepEqual(diff.changedSettings,{
    query:true,mode:true,sourceFilter:true,question:true,
  });
  assert.equal(diff.replacementHasEffects,true);
  assert.equal(diff.changes[1].newChars,0);
  assert.equal(diff.changes[4].oldChars,0);
  assert.match(diff.warning,/not independent source verification/);
});

test("same filename with new ID does not hide a remove/add as unchanged",async()=>{
  const input={...current(),documents:[doc("old","shared.txt","text")]};
  const backup=await backups.parseCorpusWorkspace(
    await backups.exportCorpusWorkspace({...input,documents:[doc("new","shared.txt","text")]}));
  const diff=reviewApi.compareCorpusImport(input,backup);
  assert.equal(diff.counts.removed,1);
  assert.equal(diff.counts.added,1);
  assert.equal(diff.counts.unchanged,0);
});

test("exact Unicode and CRLF text differences count as content changes",async()=>{
  const input={...current(),documents:[doc("ar","unicode.md","المعالجة\r\nپښتو","md")]};
  const backup=await backups.parseCorpusWorkspace(
    await backups.exportCorpusWorkspace({...input,documents:[doc("ar","unicode.md","المعالجة\nپښتو","md")]}));
  const diff=reviewApi.compareCorpusImport(input,backup);
  assert.equal(diff.counts["content-changed"],1);
  assert.equal(diff.counts["metadata-changed"],0);
});

test("identical files and settings are an explicit no-op restore",async()=>{
  const input=current();
  const backup=await backups.parseCorpusWorkspace(
    await backups.exportCorpusWorkspace(input));
  const diff=reviewApi.compareCorpusImport(input,backup);
  assert.equal(diff.counts.unchanged,input.documents.length);
  assert.equal(diff.replacementHasEffects,false);
  assert.ok(Object.values(diff.changedSettings).every(x=>!x));
});

test("settings-only change requires conscious confirmation, but reports no file changes",async()=>{
  const input=current();
  const candidate={...input,query:"new secret query"};
  const backup=await backups.parseCorpusWorkspace(
    await backups.exportCorpusWorkspace(candidate));
  const diff=reviewApi.compareCorpusImport(input,backup);
  assert.equal(diff.counts.unchanged,4);
  assert.equal(diff.replacementHasEffects,true);
  assert.deepEqual(diff.changedSettings,{
    query:true,mode:false,sourceFilter:false,question:false,
  });
});

test("safe review export contains counts/flags, not any text, filename, source ID, hash or query",async()=>{
  const diff=reviewApi.compareCorpusImport(current(),await incomingParsed());
  const report=reviewApi.formatPrivateCorpusImportReview(diff);
  assert.match(report,/Added: 1/);
  assert.match(report,/Removed: 1/);
  assert.match(report,/Content changed: 1/);
  assert.match(report,/Query setting changed: yes/);
  assert.match(report,/Preview only/);
  for(const secret of [
    "pipeline-internal.txt","old-private.md","new-private.log",
    "CP potentials","person@example.test","New private document",
    "secret inspection","different query","Different private question?",
    "rename-me.txt","renamed-meta.txt","Ûniçodé",
  ]) assert.ok(!report.includes(secret),"Leaked confidential content "+secret);
});

test("rekeyed archive decrypts exactly with new passphrase and not with old",async()=>{
  const valid=await backups.exportCorpusWorkspace(current());
  const original=await cryptoApi.encryptCorpusWorkspace(valid,oldPass);
  const rotated=await cryptoApi.rotateEncryptedCorpusFile(
    asFile("original.json",original),oldPass,newPass);
  assert.deepEqual(await cryptoApi.decryptCorpusWorkspace(rotated,newPass),
    await backups.parseCorpusWorkspace(valid));
  await assert.rejects(()=>cryptoApi.decryptCorpusWorkspace(rotated,oldPass),
    {code:"authentication_failed"});
  const first=JSON.parse(original), second=JSON.parse(rotated);
  assert.notEqual(first.salt,second.salt);
  assert.notEqual(first.nonce,second.nonce);
  assert.notEqual(first.ciphertext,second.ciphertext);
  assert.equal(second.format,first.format);
  assert.equal(second.iterations,first.iterations);
  for(const secret of ["pipeline-internal.txt","old-private.md","-850 mV",
    "secret inspection","person@example.test",oldPass,newPass]) {
    assert.ok(!rotated.includes(secret),"Leaked "+secret);
  }
});

test("wrong old password, tampered old archive, and same new password all fail closed",async()=>{
  const original=await cryptoApi.encryptCorpusWorkspace(
    await backups.exportCorpusWorkspace(current()),oldPass);
  await assert.rejects(()=>cryptoApi.rotateEncryptedCorpusFile(
    asFile("old.json",original),"incorrect-old-passphrase",newPass),
  {code:"authentication_failed"});
  await assert.rejects(()=>cryptoApi.rotateEncryptedCorpusFile(
    asFile("old.json",original),oldPass,oldPass),
  {code:"unchanged_password"});
  const changed=JSON.parse(original);
  const bytes=Buffer.from(changed.ciphertext,"base64");
  bytes[0]^=1;
  changed.ciphertext=bytes.toString("base64");
  await assert.rejects(()=>cryptoApi.rotateEncryptedCorpusFile(
    asFile("old.json",JSON.stringify(changed)),oldPass,newPass),
  {code:"authentication_failed"});
  await assert.rejects(()=>cryptoApi.rotateEncryptedCorpusFile(
    asFile("old.txt",original),oldPass,newPass),
  {code:"invalid_file"});
});

test("rotating must use a valid strong new passphrase and never fall back to plaintext",async()=>{
  const original=await cryptoApi.encryptCorpusWorkspace(
    await backups.exportCorpusWorkspace(current()),oldPass);
  for(const candidate of ["","short","x".repeat(11),"x".repeat(257)]){
    await assert.rejects(()=>cryptoApi.rotateEncryptedCorpusFile(
      asFile("old.json",original),oldPass,candidate),
    {code:"invalid_password"});
  }
  assert.doesNotMatch(cryptoSource,/localStorage\.|sessionStorage\.|fetch\(/);
});

test("UI previews exact changes for encrypted AND plaintext imports before destructive replace",()=>{
  for(const fragment of [
    "compareCorpusImport({", "pendingCorpusWorkspace",
    "pendingCorpusReview.counts.removed",
    'pendingCorpusReview.counts["content-changed"]',
    "pendingCorpusReview.changedSettings.query",
    "formatPrivateCorpusImportReview(pendingCorpusReview)",
    "No replacement needed.",
    "!pendingCorpusReview?.replacementHasEffects",
    "window.confirm(",
    "readEncryptedCorpusFile(file, passphrase)",
    "readCorpusWorkspaceFile(file)",
    "invalidateCorpusWorkspace()",
    "setCorpusFiles(imported.documents.map",
  ]) assert.ok(page.includes(fragment),"Missing preview boundary: "+fragment);
});

test("rotation UI uses three separate passphrase fields, no plaintext downloads or background sends",()=>{
  for(const fragment of [
    'id="corpus-rotation-old"',
    'id="corpus-rotation-new"',
    'id="corpus-rotation-confirm"',
    'id="corpus-rotation-file"',
    "rotateEncryptedCorpusFile(file, oldPassphrase, newPassphrase)",
    "newPassphrase !== confirmation",
    'setRotateOldPassword("")',
    'setRotateNewPassword("")',
    'setRotateConfirmPassword("")',
    'anchor.download = "eternyx-local-evidence-rekeyed-v1.json"',
    "The old file still exists",
  ]) assert.ok(page.includes(fragment),"Missing rotation boundary: "+fragment);
  assert.doesNotMatch(page+cryptoSource+reviewSource,/localStorage\.|sessionStorage\.|fetch\(|supabase\.functions\.invoke/);
  assert.match(hub,/AI Document Intelligence/);
});
