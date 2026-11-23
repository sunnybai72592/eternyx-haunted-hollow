import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {readFile} from "node:fs/promises";
import {
  MAX_LAB_TEXT_BYTES, encodeTextLocally, decodeTextLocally,
  inspectUrlLocally, inspectJwtStructureLocally,
  redactTrainingLogLocally, hashTextLocally, sampleTrainingJwt,
} from "../src/lib/eternyxLabsUtilities.mjs";
import {labCatalog} from "../src/lib/eternyxLabs.mjs";

test("thirty distinct Labs workstations include the original browser security utilities",()=>{
  assert.deepEqual(labCatalog.map(x=>x.id),[
    "web","xss","headers","sql","access","codec","urls","jwt","redact","sha",
    "subnet","chmod","csp","cors","cookie",
    "dns","http","securitytxt","events","tokens",
    "ipv6","cache","spf","ratelimit","sri",
    "pkce","hmac","cidrcheck","hsts","dmarc",
  ]);
  assert.equal(new Set(labCatalog.map(x=>x.id)).size,30);
  assert.equal(new Set(labCatalog.map(x=>x.title)).size,30);
});

test("UTF-8 encodes Unicode to both reversible Base64 and hex without upload",()=>{
  const input="Hello 🌍\nمرحبا";
  const out=encodeTextLocally(input);
  assert.equal(out.utf8RoundTrip,input);
  assert.equal(out.byteCount,new TextEncoder().encode(input).length);
  assert.equal(decodeTextLocally(out.base64,"base64").text,input);
  assert.equal(decodeTextLocally(out.hex,"hex").text,input);
  assert.equal(encodeTextLocally("").byteCount,0);
});

test("reject malformed Base64, hex, non-UTF8 bytes and oversized inputs",()=>{
  for(const value of ["!", "abcde", "Zg===", "Zh==", "Zg=a"]){
    assert.throws(()=>decodeTextLocally(value,"base64"),/Base64/);
  }
  for(const value of ["a", "xy", "000", "12 xx"]){
    assert.throws(()=>decodeTextLocally(value,"hex"),/Hex/);
  }
  assert.throws(()=>decodeTextLocally("//8=","base64"),/UTF-8/);
  assert.throws(()=>decodeTextLocally("ff","hex"),/UTF-8/);
  assert.throws(()=>decodeTextLocally("aa","binary"),/Only UTF-8/);
  assert.throws(()=>encodeTextLocally("🌍".repeat(1025)),/limit/);
  assert.throws(()=>decodeTextLocally("eA==".repeat(2500),"base64"));
  assert.equal(MAX_LAB_TEXT_BYTES,4096);
});

test("URL inspection never sends network requests and hides credentials and query values",()=>{
  const input="https://user:secret@example.org:8443/a/b?token=private-value&x=ok&x=more#fragment";
  const out=inspectUrlLocally(input);
  assert.equal(out.scheme,"https");
  assert.equal(out.host,"example.org");
  assert.equal(out.port,"8443");
  assert.equal(out.pathSegments,2);
  assert.equal(out.queryParameters,3);
  assert.deepEqual(out.queryKeys,["token","x"]);
  assert.equal(out.fragmentPresent,true);
  assert.equal(out.embeddedCredentials,true);
  assert.equal(out.requestsSent,0);
  assert.ok(out.warnings.some(w=>w.includes("embedded credentials")));
  assert.ok(out.warnings.some(w=>w.includes("sensitive-looking")));
  const display=JSON.stringify(out);
  for(const secret of ["private-value","user:secret","x=ok","more#fragment"]){
    assert.ok(!display.includes(secret),"Unexpected secret in URL output");
  }
});

test("URL parser rejects dangerous and malformed schemes and bounds inputs",()=>{
  for(const value of [
    "javascript:alert(1)","data:text/html,test","file:///etc/passwd",
    "example.com","ftp://example.org/a","https://a.test\nHost: b.test",
  ]){
    assert.throws(()=>inspectUrlLocally(value));
  }
  assert.throws(()=>inspectUrlLocally("https://example.org/"+"a".repeat(3000)),/limit/);
  const plain=inspectUrlLocally("http://example.org/");
  assert.ok(plain.warnings.some(x=>x.includes("Plain HTTP")));
  assert.equal(plain.requestsSent,0);
});

test("JWT inspector exposes only unverified structure, never claim values",()=>{
  const out=inspectJwtStructureLocally(sampleTrainingJwt);
  assert.equal(out.algorithm,"HS256");
  assert.equal(out.type,"JWT");
  assert.deepEqual(out.claimNames,["exp","iss","scope"]);
  assert.equal(out.hasIssuer,true);
  assert.equal(out.hasAudience,false);
  assert.equal(out.expiresAt,"2030-01-01T00:00:00.000Z");
  assert.equal(out.signatureVerified,false);
  assert.equal(out.authorizationVerified,false);
  const display=JSON.stringify(out);
  assert.ok(!display.includes("training.local"));
  assert.ok(!display.includes("read"));
  assert.ok(out.warnings.some(x=>x.includes("NOT checked")));
});

test("JWT inspector refuses invalid compact structure and false signature claims",()=>{
  for(const value of ["", "a.b", "a.b.c.d", "!!!.!!!.???",
    "eyJhbGciOiJub25lIn0.e30.", "eyJhbGciOiJub25lIn0.Zm9v.YWJj"]){
    assert.throws(()=>inspectJwtStructureLocally(value));
  }
  const none=[
    btoa(JSON.stringify({alg:"none",typ:"JWT"})).replace(/=/g,""),
    btoa(JSON.stringify({iss:"fake"})).replace(/=/g,""),
    "YQ",
  ].join(".");
  const result=inspectJwtStructureLocally(none);
  assert.equal(result.signatureVerified,false);
  assert.ok(result.warnings.some(x=>x.includes("unsafe")));
});

test("local training-log redaction masks common credentials without changing unrelated lines",()=>{
  const input=[
    "Authorization: Bearer fake-secret",
    "Cookie: session=fake",
    "Set-Cookie: session=fake; Secure",
    "API_KEY=pretend-value",
    "client_secret: pretend-secret",
    "ACCESS_TOKEN=another-token",
    "password=my-password",
    "status=200",
  ].join("\n");
  const out=redactTrainingLogLocally(input);
  assert.equal(out.saved,false);
  assert.equal(out.exhaustive,false);
  assert.equal(out.replacements,7);
  assert.ok(out.redactedText.includes("status=200"));
  assert.ok(out.redactedText.includes("Authorization: Bearer [REDACTED]"));
  for(const secret of ["fake-secret","session=fake","pretend-value",
    "pretend-secret","another-token","my-password"]){
    assert.ok(!out.redactedText.includes(secret),"Unredacted training secret: "+secret);
  }
  assert.throws(()=>redactTrainingLogLocally("x".repeat(4097)),/limit/);
});

test("SHA-256 uses the real WebCrypto digest and never uploads",async()=>{
  const out=await hashTextLocally("abc",webcrypto);
  assert.equal(out.algorithm,"SHA-256");
  assert.equal(out.byteCount,3);
  assert.equal(out.hex,"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(out.uploaded,false);
  const unicode=await hashTextLocally("🌍",webcrypto);
  assert.equal(unicode.byteCount,4);
  assert.equal(unicode.hex.length,64);
  await assert.rejects(hashTextLocally("abc",{}),/secure browser context/);
  await assert.rejects(hashTextLocally("x".repeat(4097),webcrypto),/limit/);
});

test("React toolkit is wired to Labs without unsafe iframe privileges or external APIs",async()=>{
  const [page,widget,utilities]=await Promise.all([
    readFile(new URL("../src/pages/EternyxLabs.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/components/labs/BrowserSecurityToolkit.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/lib/eternyxLabsUtilities.mjs",import.meta.url),"utf8"),
  ]);
  assert.match(page,/BrowserSecurityToolkit selected=\{selected\}/);
  assert.match(page,/filteredLabs\.map/);
  assert.match(page,/labs-workstation-search/);
  for(const id of ["codec","urls","jwt","redact","sha"]){
    assert.ok(widget.includes('selected === "'+id+'"'));
  }
  assert.match(widget,/role="alert"/);
  assert.match(widget,/Signature verified: No/);
  assert.match(widget,/Network requests sent:/);
  assert.match(widget,/generation\.current/);
  assert.doesNotMatch(utilities,/fetch\(|XMLHttpRequest|localStorage|supabase|createServer/);
  assert.doesNotMatch(widget,/fetch\(|XMLHttpRequest|localStorage|supabase/);
  assert.equal((page.match(/sandbox="allow-scripts"/g)||[]).length,3);
  assert.doesNotMatch(page,/allow-same-origin|allow-top-navigation|allow-popups|allow-forms/);
});
