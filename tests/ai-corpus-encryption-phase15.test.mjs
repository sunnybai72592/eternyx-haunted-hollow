import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {readFile} from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const coreSource = await read("src/lib/ai/document-corpus-tools.ts");
const workspaceSource = await read("src/lib/ai/document-corpus-workspace.ts");
const encryptedSource = await read("src/lib/ai/document-corpus-crypto.ts");
const pageSource = await read("src/pages/AIDocumentIntelligence.tsx");
const hubSource = await read("src/pages/AIArsenal.tsx");
const transpile = source => ts.transpileModule(source, {
  compilerOptions: {module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
}).outputText;
const asURL = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const coreURL = asURL(transpile(coreSource));
const workspaceURL = asURL(transpile(workspaceSource)
  .replace(/(["'])\.\/document-corpus-tools\1/, JSON.stringify(coreURL)));
const encryptedURL = asURL(transpile(encryptedSource)
  .replace(/(["'])\.\/document-corpus-workspace\1/, JSON.stringify(workspaceURL)));
const crypto = await import(encryptedURL);
const workspace = await import(workspaceURL);

const password = "correct horse battery staple 🌙";
const sample = () => ({
  documents: [
    {id:"cp",name:"private-pipeline.txt",kind:"txt",text:"On potential -850 mV\r\n😀 پابندي"},
    {id:"field",name:"user-notes.md",kind:"md",text:"# Observations\nInternal field observations"},
  ],
  query:"CP inspection",mode:"near",sourceFilter:"cp",
  question:"What does the local evidence demonstrate?",
});
const plain = () => workspace.exportCorpusWorkspace(sample());

function replacement(envelope, changes) {
  return JSON.stringify({...envelope,...changes});
}
function changeCiphertext(encoded) {
  const original=JSON.parse(encoded);
  const bytes=Buffer.from(original.ciphertext,"base64");
  bytes[0]^=1;
  return replacement(original,{ciphertext:bytes.toString("base64")});
}

test("encrypted backup authenticates and round-trips exact Phase 14 text and settings", async () => {
  const source=await plain();
  const encrypted=await crypto.encryptCorpusWorkspace(source,password);
  const opened=await crypto.decryptCorpusWorkspace(encrypted,password);
  const baseline=await workspace.parseCorpusWorkspace(source);
  assert.deepEqual(opened,baseline);
  const archive=JSON.parse(encrypted);
  assert.deepEqual(Object.keys(archive).sort(),
    ["format","version","kdf","iterations","salt","cipher","nonce","ciphertext"].sort());
  assert.equal(archive.format,"eternyx.encrypted-corpus-workspace");
  assert.equal(archive.version,1);
  assert.equal(archive.kdf,"PBKDF2-HMAC-SHA256");
  assert.equal(archive.cipher,"AES-256-GCM");
  assert.equal(archive.iterations,600000);
  assert.equal(Buffer.from(archive.salt,"base64").length,16);
  assert.equal(Buffer.from(archive.nonce,"base64").length,12);
  assert.ok(Buffer.from(archive.ciphertext,"base64").length>16);
  for(const secret of ["private-pipeline.txt","user-notes.md","Internal field observations",
    "What does the local evidence", "-850 mV",password,"CP inspection"]){
    assert.ok(!encrypted.includes(secret),"Unencrypted metadata leaked: "+secret);
  }
});

test("independent encryptions use fresh random nonce/salt and produce distinct ciphertext",async()=>{
  const source=await plain();
  const first=JSON.parse(await crypto.encryptCorpusWorkspace(source,password));
  const second=JSON.parse(await crypto.encryptCorpusWorkspace(source,password));
  assert.notEqual(first.salt,second.salt);
  assert.notEqual(first.nonce,second.nonce);
  assert.notEqual(first.ciphertext,second.ciphertext);
});

test("incorrect passphrase and modified ciphertext both fail identically before import", async()=>{
  const encrypted=await crypto.encryptCorpusWorkspace(await plain(),password);
  for(const [description,value] of [
    ["wrong passphrase",encrypted],
    ["altered encrypted text",changeCiphertext(encrypted)],
  ]){
    await assert.rejects(
      ()=>crypto.decryptCorpusWorkspace(value,description==="wrong passphrase" ? "incorrect passphrase longer than 12":password),
      {code:"authentication_failed"});
  }
});

test("unknown fields and altered algorithm, version, iteration count or salt/nonce fail closed",async()=>{
  const decoded=JSON.parse(await crypto.encryptCorpusWorkspace(await plain(),password));
  const broken=[
    {format:"alien.backup"}, {version:2}, {kdf:"PBKDF2-HMAC-SHA1"},
    {iterations:1}, {iterations:20000000}, {cipher:"AES-CBC"},
    {salt:"AA=="}, {nonce:"AA=="}, {nonce:decoded.nonce.slice(0,-1)+"!"},
    {salt:"!!!!"}, {nonce:""}, {permission:"admin"},
    {ciphertext:"AAAA"}, {ciphertext:"test-no-base64"},
  ];
  for(const change of broken) {
    await assert.rejects(
      ()=>crypto.decryptCorpusWorkspace(replacement(decoded,change),password),
      {code:"invalid_envelope"},
      "Invalid envelope unexpectedly accepted: "+JSON.stringify(change).slice(0,40));
  }
  await assert.rejects(()=>crypto.decryptCorpusWorkspace("{bad",password),{code:"invalid_envelope"});
  await assert.rejects(()=>crypto.decryptCorpusWorkspace("{}",password),{code:"invalid_envelope"});
});

test("password length and NUL validation reject unsafe empty or oversized inputs",async()=>{
  const source=await plain();
  for(const pass of ["", "short", "12345678901", "A".repeat(257), "good\u0000invalid-x"]){
    await assert.rejects(()=>crypto.encryptCorpusWorkspace(source,pass),{code:"invalid_password"});
    await assert.rejects(()=>crypto.decryptCorpusWorkspace("{}",pass),{code:"invalid_password"});
  }
  assert.equal(crypto.MIN_ENCRYPTED_CORPUS_PASSWORD,12);
  assert.equal(crypto.MAX_ENCRYPTED_CORPUS_PASSWORD,256);
  const minPass="G".repeat(12);
  const encrypted=await crypto.encryptCorpusWorkspace(source,minPass);
  const restored=await crypto.decryptCorpusWorkspace(encrypted,minPass);
  assert.equal(restored.documents.length,2);
});

test("wrong formats cannot accidentally import as the other backup mode",async()=>{
  const source=await plain();
  const encrypted=await crypto.encryptCorpusWorkspace(source,password);
  await assert.rejects(()=>crypto.decryptCorpusWorkspace(source,password),{code:"invalid_envelope"});
  await assert.rejects(()=>workspace.parseCorpusWorkspace(encrypted),{code:"invalid_schema"});
  await assert.rejects(()=>crypto.encryptCorpusWorkspace("{bad",password),
    {code:"invalid_json"});
});

test("encrypted file loader checks filename, content type and byte length before decryption",async()=>{
  const contents=await crypto.encryptCorpusWorkspace(await plain(),password);
  const file=(name,text,type="application/json")=>({
    name,size:Buffer.byteLength(text),type,text:async()=>text,
  });
  const accepted=await crypto.readEncryptedCorpusFile(file("backup.json",contents),password);
  assert.equal(accepted.documents.length,2);
  for(const bad of [
    file("backup.txt",contents), file("backup.json",contents,"image/png"),
    {...file("backup.json",contents),size:-1},
    {...file("backup.json",contents),size:crypto.MAX_ENCRYPTED_CORPUS_BYTES+1},
    {...file("backup.json",contents),size:NaN},
    {...file("backup.json",contents),text:async()=>{throw Error("read error")}},
  ]) {
    await assert.rejects(()=>crypto.readEncryptedCorpusFile(bad,password),
      {code:bad.text.toString().includes("read error")?"invalid_file":"invalid_file"});
  }
  await assert.rejects(()=>crypto.readEncryptedCorpusFile(file("backup.json",contents),"wrong-but-long-password"),
    {code:"authentication_failed"});
});

test("encrypted backup max bytes is enforced before decrypting or executing KDF",async()=>{
  const huge="x".repeat(crypto.MAX_ENCRYPTED_CORPUS_BYTES+1);
  await assert.rejects(()=>crypto.decryptCorpusWorkspace(huge,password),{code:"too_large"});
  assert.ok(crypto.MAX_ENCRYPTED_CORPUS_BYTES>=4*1024*1024);
});

test("browser crypto unavailable rejects secure operation rather than silently saving plaintext",async()=>{
  const source=await plain();
  const original=globalThis.crypto;
  Object.defineProperty(globalThis,"crypto",{configurable:true,value:undefined});
  try {
    await assert.rejects(()=>crypto.encryptCorpusWorkspace(source,password),{code:"crypto_unavailable"});
    await assert.rejects(()=>crypto.decryptCorpusWorkspace("{}",password),{code:"crypto_unavailable"});
  } finally {
    if(original === undefined) delete globalThis.crypto;
    else Object.defineProperty(globalThis,"crypto",{configurable:true,value:original});
  }
});

test("already invalid Phase 14 snapshot cannot be encrypted as an apparently legitimate backup",async()=>{
  const serialized=JSON.parse(await plain());
  serialized.documents[0].text+=" TAMPERED";
  await assert.rejects(()=>crypto.encryptCorpusWorkspace(JSON.stringify(serialized),password),
    {code:"hash_mismatch"});
});

test("UI requires explicit opt-in, separate passwords, no persistence and the existing restore gate",()=>{
  for(const token of [
    'id="corpus-encrypted-export-password"',
    'id="corpus-encrypted-export-confirm"',
    'id="corpus-encrypted-import-password"',
    'id="corpus-encrypted-import-file"',
    'type="password"',
    "passphrase !== confirmation",
    'setEncryptedExportPassword("")',
    'setEncryptedExportConfirm("")',
    'setEncryptedImportPassword("")',
    "encryptCorpusWorkspace(serialized, passphrase)",
    "readEncryptedCorpusFile(file, passphrase)",
    "if (operation !== corpusWorkspaceEpoch.current) return",
    "setPendingCorpusWorkspace(verified)",
    "setPendingCorpusEncrypted(true)",
    "restoreCorpusWorkspace",
    "window.confirm(",
    "invalidateCorpusWorkspace()",
    "readCorpusWorkspaceFile(file)",
    "Export full local evidence workspace (.json, UNENCRYPTED)",
    "AES-256-GCM authenticated",
    "there is no recovery",
  ]) assert.ok(pageSource.includes(token),"Missing encrypted-workspace boundary: "+token);
  assert.doesNotMatch(pageSource+encryptedSource, /localStorage\.|sessionStorage\.|fetch\(|supabase\.functions\.invoke/);
  assert.match(hubSource,/AI Document Intelligence/);
});
