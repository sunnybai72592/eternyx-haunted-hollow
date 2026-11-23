import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,pbkdf2Sync} from "node:crypto";
import {readFile} from "node:fs/promises";
import {labCatalog} from "../src/lib/eternyxLabs.mjs";
import {
  derivePbkdf2Locally,demonstrateAesGcmLocally,calculateTotpLocally,
  compareWebOriginsLocally,neutralizeCsvFormulasLocally,
} from "../src/lib/eternyxLabsCryptoDefense.mjs";
const source=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("40 distinct real Labs workstations include all five crypto/data-security tools",()=>{
  const ids=labCatalog.map(x=>x.id);
  assert.equal(ids.length,40);
  assert.equal(new Set(ids).size,40);
  assert.equal(new Set(labCatalog.map(x=>x.title)).size,40);
  assert.deepEqual(ids.slice(30,35),["pbkdf2","aesgcm","totp","origins","csvsafe"]);
});
test("PBKDF2 SHA-256 real Web Crypto matches independent Node PBKDF2 reference",async()=>{
  const text="synthetic-example-only",saltHex="00112233445566778899aabbccddeeff";
  for(const iterations of [1000,10000]){
    const result=await derivePbkdf2Locally(text,{iterations,saltHex,cryptoApi:webcrypto});
    const expected=pbkdf2Sync(text,Buffer.from(saltHex,"hex"),iterations,32,"sha256").toString("hex");
    assert.equal(result.derivedHex,expected);
    assert.equal(result.saltHex,saltHex);
    assert.equal(result.derivedBytes,32);
    assert.equal(result.passwordSaved,false);
    assert.equal(result.requestsSent,0);
  }
});
test("PBKDF2 picks a new 16-byte salt via secure crypto randomness when none supplied",async()=>{
  let called=0;
  const api={subtle:webcrypto.subtle,getRandomValues(buffer){called++;buffer.fill(0x7b);return buffer;}};
  const r=await derivePbkdf2Locally("synthetic-password",{iterations:1000,cryptoApi:api});
  assert.equal(called,1);
  assert.equal(r.saltHex,"7b".repeat(16));
  assert.equal(r.derivedHex.length,64);
  const real=await derivePbkdf2Locally("synthetic-password",{iterations:1000,cryptoApi:webcrypto});
  assert.equal(real.saltHex.length,32);
  assert.notEqual(real.saltHex,r.saltHex);
});
test("PBKDF2 refuses insecure fallbacks and malformed input bounds",async()=>{
  for(const [password,settings] of [
    ["short",{cryptoApi:webcrypto}],["a".repeat(129),{cryptoApi:webcrypto}],
    ["synthetic", {iterations:999,cryptoApi:webcrypto}],
    ["synthetic", {iterations:150001,cryptoApi:webcrypto}],
    ["synthetic", {iterations:1.5,cryptoApi:webcrypto}],
    ["synthetic", {saltHex:"nothex",cryptoApi:webcrypto}],
    ["synthetic", {saltHex:"a".repeat(30),cryptoApi:webcrypto}],
    ["synthetic", {cryptoApi:{subtle:webcrypto.subtle}}],
    ["synthetic", {cryptoApi:{}}],
  ])await assert.rejects(derivePbkdf2Locally(password,settings));
});
test("AES-256-GCM truly encrypts and decrypts, refusing modified ciphertext",async()=>{
  const r=await demonstrateAesGcmLocally("Synthetic message 🌍",webcrypto);
  const utf8Bytes=new TextEncoder().encode("Synthetic message 🌍").length;
  assert.equal(r.messageBytes,utf8Bytes);
  assert.equal(r.ciphertextBytes,utf8Bytes+16);
  assert.equal(r.authenticationTagBits,128);
  assert.equal(r.decryptedSuccessfully,true);
  assert.equal(r.tamperingRejected,true);
  assert.equal(r.keyExportable,false);
  assert.equal(r.keySaved,false);
  assert.equal(r.requestsSent,0);
  assert.match(r.nonceHex,/^[0-9a-f]{24}$/);
  assert.match(r.ciphertextHex,/^[0-9a-f]+$/);
  assert.ok(!r.ciphertextHex.includes("Synthetic"));
  const fresh=await demonstrateAesGcmLocally("Synthetic message 🌍",webcrypto);
  assert.notEqual(fresh.nonceHex,r.nonceHex);
  assert.notEqual(fresh.ciphertextHex,r.ciphertextHex);
  const empty=await demonstrateAesGcmLocally("",webcrypto);
  assert.equal(empty.messageBytes,0);
  assert.equal(empty.ciphertextBytes,16);
  assert.equal(empty.tamperingRejected,true);
});
test("AES-GCM fails explicitly without secure randomness or required crypto functions",async()=>{
  await assert.rejects(demonstrateAesGcmLocally("secret",{subtle:webcrypto.subtle}),/randomness/);
  await assert.rejects(demonstrateAesGcmLocally("secret",{}),/Web Crypto/);
  await assert.rejects(demonstrateAesGcmLocally("x".repeat(2049),webcrypto),/bounded/);
});
test("TOTP Web Crypto HMAC-SHA1 matches published RFC 6238 8-digit vectors",async()=>{
  const secret="12345678901234567890";
  for(const [epoch,expected] of [[59,"94287082"],[1111111109,"07081804"],[1111111111,"14050471"],[1234567890,"89005924"],[2000000000,"69279037"]]){
    const r=await calculateTotpLocally(secret,{epochSeconds:epoch,digits:8,cryptoApi:webcrypto});
    assert.equal(r.code,expected,String(epoch));
    assert.equal(r.counter,String(Math.floor(epoch/30)));
    assert.equal(r.digits,8);
    assert.equal(r.algorithm,"HMAC-SHA1 (RFC 6238)");
    assert.equal(r.secretSaved,false);
    assert.equal(r.secretExposed,false);
    assert.equal(r.requestsSent,0);
  }
  const short=await calculateTotpLocally(secret,{epochSeconds:59,digits:6,cryptoApi:webcrypto});
  assert.equal(short.code,"287082");
  assert.equal(short.secondsRemaining,1);
});
test("TOTP rejects timestamp, seed and output constraints instead of faking a code",async()=>{
  for(const [secret,args] of [
    ["short",{cryptoApi:webcrypto}],["x".repeat(129),{cryptoApi:webcrypto}],
    ["12345678901234567890",{epochSeconds:-1,cryptoApi:webcrypto}],
    ["12345678901234567890",{epochSeconds:59.1,cryptoApi:webcrypto}],
    ["12345678901234567890",{epochSeconds:4102444801,cryptoApi:webcrypto}],
    ["12345678901234567890",{period:27,cryptoApi:webcrypto}],
    ["12345678901234567890",{digits:7,cryptoApi:webcrypto}],
    ["12345678901234567890",{cryptoApi:{}}],
  ])await assert.rejects(calculateTotpLocally(secret,args));
});
test("URL origin comparison correctly normalizes host, effective ports, and schemes",()=>{
  const same=compareWebOriginsLocally(
    "https://EXAMPLE.test:443/path?token=PRIVATE_QUERY","https://example.test/other");
  assert.equal(same.sameOrigin,true);
  assert.equal(same.sameHostname,true);
  assert.equal(same.schemeDiffers,false);
  assert.equal(same.portDiffers,false);
  assert.equal(same.firstOrigin,"https://example.test");
  assert.equal(same.requestsSent,0);
  assert.equal(same.dnsQueriesSent,0);
  assert.equal(same.queriesHidden,true);
  assert.ok(same.warnings.some(x=>x.includes("query string")));
  assert.ok(!JSON.stringify(same).includes("PRIVATE_QUERY"));
  const different=compareWebOriginsLocally("http://example.test:8080","https://example.test/");
  assert.equal(different.sameOrigin,false);
  assert.equal(different.sameHostname,true);
  assert.equal(different.schemeDiffers,true);
  assert.equal(different.portDiffers,true);
});
test("Origin comparison reports credential and loopback hints without revealing URL userinfo",()=>{
  const r=compareWebOriginsLocally(
    "https://alice:PRIVATE_PASS@localhost/private","https://localhost/");
  assert.equal(r.sameOrigin,true);
  assert.ok(r.warnings.some(x=>x.includes("embedded credentials")));
  assert.ok(r.warnings.some(x=>x.includes("loopback")));
  assert.ok(!JSON.stringify(r).includes("alice"));
  assert.ok(!JSON.stringify(r).includes("PRIVATE_PASS"));
  for(const url of [
    "ftp://example.test","javascript:alert(1)","//example.test",
    "example.test","http://", "x".repeat(2049),
    "https://example.test\nSet-Cookie: x",
  ])assert.throws(()=>compareWebOriginsLocally(url,"https://example.test"));
});
test("CSV neutralization actually quotes cells and prefixes dangerous spreadsheet formulas",()=>{
  const r=neutralizeCsvFormulasLocally("=SUM(1,2)\nhello, world\n+100\n\"Quoted\" text");
  assert.equal(r.cellCount,4);
  assert.equal(r.neutralized,2);
  assert.equal(r.csv,"\"'=SUM(1,2)\"\r\n\"hello, world\"\r\n\"'+100\"\r\n\"\"\"Quoted\"\" text\"\r\n");
  assert.equal(r.filesWritten,false);
  assert.equal(r.requestsSent,0);
  const other=neutralizeCsvFormulasLocally(" -1\n\t@SUM(A1)\nhello\n\uFEFF=1+1");
  assert.equal(other.neutralized,3);
  assert.equal(other.cellCount,4);
  assert.match(other.csv,/^"' -1"/);
});
test("CSV neutralization preserves harmless text and enforces bounded single-column input",()=>{
  const clean=neutralizeCsvFormulasLocally("safe\ntext");
  assert.equal(clean.neutralized,0);
  assert.equal(clean.csv,"\"safe\"\r\n\"text\"\r\n");
  for(const input of [
    "x\n".repeat(31),
    "x".repeat(4097),
    "x\nfoo\rbar",
    "\0invalid",
    "x".repeat(1025),
  ])assert.throws(()=>neutralizeCsvFormulasLocally(input));
});
test("all five interactive Labs sections are actually wired, responsive and browser-only",async()=>{
  const [page,ui,engine,practice]=await Promise.all([
    source("src/pages/EternyxLabs.tsx"),
    source("src/components/labs/BrowserCryptoDataDefense.tsx"),
    source("src/lib/eternyxLabsCryptoDefense.mjs"),
    source("src/lib/eternyxLabsPractice.mjs"),
  ]);
  assert.match(page,/BrowserCryptoDataDefense selected=\{selected\}/);
  assert.match(page,/40 working exercises/);
  assert.match(page,/Search 40 workstations/);
  for(const id of ["pbkdf2","aesgcm","totp","origins","csvsafe"])
    assert.ok(ui.includes('selected==="'+id+'"'),id);
  assert.match(ui,/role="alert"/);
  assert.match(ui,/aria-live="polite"/);
  assert.match(ui,/type="password"/);
  assert.match(ui,/sequence.current/);
  assert.match(ui,/getRandomValues|derivePbkdf2Locally|demonstrateAesGcmLocally/);
  assert.match(practice,/gradePracticeAnswerAsync/);
  for(const text of [ui,engine])
    assert.doesNotMatch(text,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|createServer|WebSocket|Math\.random/);
  assert.equal((page.match(/sandbox="allow-scripts"/g)||[]).length,3);
});
