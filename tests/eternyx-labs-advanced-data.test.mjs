import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,hkdfSync,createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {
  deriveHkdfLocally,demonstrateEcdsaP256Locally,demonstrateAadLocally,
  redactStructuredJsonLocally,fingerprintJsonLocally,
} from "../src/lib/eternyxLabsAdvancedData.mjs";
import {labCatalog} from "../src/lib/eternyxLabs.mjs";

const salt="00112233445566778899aabbccddeeff";
test("real HKDF-SHA256 equals independently computed Node crypto HKDF vectors",async()=>{
  for(const length of [16,32,64]){
    const material="synthetic-key-material-2026",info="eternyx-hkdf-training";
    const out=await deriveHkdfLocally(material,{saltHex:salt,info,length,cryptoApi:webcrypto});
    const node=Buffer.from(hkdfSync("sha256",Buffer.from(material),Buffer.from(salt,"hex"),Buffer.from(info),length)).toString("hex");
    assert.equal(out.derivedHex,node);
    assert.equal(out.derivedBytes,length);
    assert.equal(out.keyExportable,false);
    assert.equal(out.savedToAccount,false);
    assert.equal(out.requestsSent,0);
  }
  const other=await deriveHkdfLocally("synthetic-key-material-2026",{saltHex:salt,info:"another",cryptoApi:webcrypto});
  const original=await deriveHkdfLocally("synthetic-key-material-2026",{saltHex:salt,info:"eternyx-hkdf-training",cryptoApi:webcrypto});
  assert.notEqual(original.derivedHex,other.derivedHex);
  const fresh=await deriveHkdfLocally("synthetic-key-material-2026",{cryptoApi:webcrypto});
  assert.equal(fresh.saltHex.length,32);
  assert.notEqual(fresh.saltHex,salt);
});
test("HKDF enforces input bounds and rejects absent Web Crypto without invented output",async()=>{
  for(const [material,args] of [
    ["tiny",{cryptoApi:webcrypto}],["x".repeat(129),{cryptoApi:webcrypto}],
    ["synthetic-key",{saltHex:"zz".repeat(16),cryptoApi:webcrypto}],
    ["synthetic-key",{saltHex:"aa".repeat(15),cryptoApi:webcrypto}],
    ["synthetic-key",{length:17,cryptoApi:webcrypto}],
    ["synthetic-key",{info:"x".repeat(129),cryptoApi:webcrypto}],
    ["synthetic-key",{saltHex:salt,cryptoApi:{}}],
    ["synthetic-key",{cryptoApi:{subtle:webcrypto.subtle}}],
  ])await assert.rejects(deriveHkdfLocally(material,args));
});
test("ECDSA P-256 signs and verifies real messages and rejects changes",async()=>{
  const result=await demonstrateEcdsaP256Locally("Signed synthetic evidence 🌍",webcrypto);
  assert.equal(result.signatureBytes,64);
  assert.match(result.signatureHex,/^[0-9a-f]{128}$/);
  assert.equal(result.verified,true);
  assert.equal(result.modifiedMessageRejected,true);
  assert.equal(result.keyExportable,false);
  assert.equal(result.requestsSent,0);
  const blank=await demonstrateEcdsaP256Locally("",webcrypto);
  assert.equal(blank.messageBytes,0);
  assert.equal(blank.modifiedMessageRejected,true);
  await assert.rejects(demonstrateEcdsaP256Locally("message",{}),/Web Crypto/);
  await assert.rejects(demonstrateEcdsaP256Locally("x".repeat(2049),webcrypto),/bounded/);
});
test("AES-GCM binds additional authenticated data and ciphertext using actual decryption",async()=>{
  const result=await demonstrateAadLocally("hello 🌍","role=student 🌍",webcrypto);
  assert.equal(result.plaintextBytes,new TextEncoder().encode("hello 🌍").length);
  assert.equal(result.aadBytes,new TextEncoder().encode("role=student 🌍").length);
  assert.equal(result.ciphertextBytes,result.plaintextBytes+16);
  assert.equal(result.authenticated,true);
  assert.equal(result.changedAadRejected,true);
  assert.equal(result.changedCiphertextRejected,true);
  assert.match(result.nonceHex,/^[0-9a-f]{24}$/);
  assert.equal(result.savedToAccount,false);
  const blank=await demonstrateAadLocally("","",webcrypto);
  assert.equal(blank.ciphertextBytes,16);
  assert.equal(blank.changedAadRejected,true);
  await assert.rejects(demonstrateAadLocally("x","context",{}),/Web Crypto/);
  await assert.rejects(demonstrateAadLocally("x","context",{subtle:webcrypto.subtle}),/randomness/);
  await assert.rejects(demonstrateAadLocally("x","x".repeat(513),webcrypto),/bounded/);
});
test("structured redaction actually masks nested sensitive named fields and preserves safe content",()=>{
  const r=redactStructuredJsonLocally(JSON.stringify({
    title:"safe note",api_key:101,
    nested:[{password:202,data:"public"},{secret:303}],
    profile:{city:"Test"},
  }));
  assert.equal(r.redactedFields,3);
  assert.equal(r.anyRedacted,true);
  assert.equal(r.requestsSent,0);
  assert.equal(r.savedToAccount,false);
  assert.ok(r.fieldsVisited>=6);
  assert.ok(r.redactedJson.includes("safe note"));
  assert.ok(r.redactedJson.includes("public"));
  assert.equal(JSON.parse(r.redactedJson).nested[0].password,"[REDACTED]");
  assert.equal(JSON.parse(r.redactedJson).nested[1].secret,"[REDACTED]");
  assert.equal(JSON.parse(r.redactedJson).api_key,"[REDACTED]");
  const safe=redactStructuredJsonLocally('{"title":"demo","items":[1,2]}');
  assert.equal(safe.redactedFields,0);
  assert.equal(safe.anyRedacted,false);
  const odd=redactStructuredJsonLocally('{"__proto__":{"token":0},"safe":1}');
  assert.equal(JSON.parse(odd.redactedJson).__proto__.token,"[REDACTED]");
  assert.equal(({}).token,undefined);
});
test("structured JSON refuses malformed, oversized, excessively nested or 300+ node inputs",()=>{
  for(const text of [
    "{invalid}",'{"x":1'.repeat(3),"x".repeat(8193),
    '{"a":'.repeat(9)+"0"+"}".repeat(9),
    JSON.stringify(Array.from({length:301},()=>0)),
  ])assert.throws(()=>redactStructuredJsonLocally(text));
});
test("sorted-key JSON hashing uses actual SHA-256 and ignores only object key ordering",async()=>{
  const first='{"a":1,"b":{"x":true,"y":2}}';
  const equivalent='{"b":{"y":2,"x":true},"a":1}';
  const result=await fingerprintJsonLocally(first,equivalent,webcrypto);
  const canonical='{"a":1,"b":{"x":true,"y":2}}';
  const independentlyHashed=createHash("sha256").update(canonical,"utf8").digest("hex");
  assert.equal(result.sameDigest,true);
  assert.equal(result.firstDigest,independentlyHashed);
  assert.equal(result.secondDigest,result.firstDigest);
  assert.equal(result.digestBytes,32);
  assert.equal(result.requestsSent,0);
  const changed=await fingerprintJsonLocally(first,'{"a":2,"b":{"x":true,"y":2}}',webcrypto);
  assert.equal(changed.sameDigest,false);
  assert.notEqual(changed.firstDigest,changed.secondDigest);
  const arr=await fingerprintJsonLocally('{"a":[1,2]}','{"a":[2,1]}',webcrypto);
  assert.equal(arr.sameDigest,false);
  await assert.rejects(fingerprintJsonLocally(first,equivalent,{}),/Web Crypto/);
  await assert.rejects(fingerprintJsonLocally(first,'{"broken"',webcrypto),/JSON/);
});
test("all 40 catalog workstations have one unique identifier and five advanced tools render",async()=>{
  assert.equal(labCatalog.length,40);
  assert.equal(new Set(labCatalog.map(x=>x.id)).size,40);
  assert.equal(new Set(labCatalog.map(x=>x.title)).size,40);
  const expected=["hkdf","ecdsa","aesaad","jsonmask","jsonhash"];
  assert.deepEqual(labCatalog.slice(-5).map(x=>x.id),expected);
  const [page,ui,engine]=await Promise.all([
    readFile(new URL("../src/pages/EternyxLabs.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/components/labs/BrowserAdvancedDataDefense.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/lib/eternyxLabsAdvancedData.mjs",import.meta.url),"utf8"),
  ]);
  assert.match(page,/BrowserAdvancedDataDefense selected=\{selected\}/);
  assert.match(page,/40 working exercises/);
  assert.match(page,/Search 40 workstations/);
  assert.match(ui,/role="alert"/);
  assert.match(ui,/aria-live="polite"/);
  assert.match(ui,/sequence.current/);
  for(const id of expected)assert.ok(ui.includes('selected==="'+id+'"'),id);
  for(const code of [ui,engine])
    assert.doesNotMatch(code,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|createServer|WebSocket|Math\.random/);
});
