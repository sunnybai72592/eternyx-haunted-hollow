import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,createHmac,createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {labCatalog} from "../src/lib/eternyxLabs.mjs";
import {
  createPkcePairLocally,derivePkceChallengeLocally,
  signHmacLocally,verifyHmacLocally,
  checkCidrMembershipLocally,inspectHstsLocally,inspectDmarcLocally,
} from "../src/lib/eternyxLabsIdentity.mjs";

test("forty unique functional Labs workstations include five new identity and defense utilities",()=>{
  const ids=labCatalog.map(x=>x.id);
  assert.equal(ids.length,40);
  assert.equal(new Set(ids).size,40);
  assert.equal(new Set(labCatalog.map(x=>x.title)).size,40);
  assert.deepEqual(ids.slice(25,30),["pkce","hmac","cidrcheck","hsts","dmarc"]);
  assert.deepEqual(ids.slice(30,35),["pbkdf2","aesgcm","totp","origins","csvsafe"]);
});
test("PKCE S256 exactly matches the known RFC 7636 challenge vector",async()=>{
  const verifier="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const result=await derivePkceChallengeLocally(verifier,webcrypto);
  assert.equal(result.challenge,"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert.equal(result.method,"S256");
  assert.equal(result.verifierLength,43);
  assert.equal(result.sent,false);
  assert.equal(result.stored,false);
  const comparison=createHash("sha256").update(verifier,"ascii").digest("base64url");
  assert.equal(comparison,result.challenge);
});
test("PKCE verifier generation uses 32 real Web Crypto random bytes, never Math.random",async()=>{
  let invoked=0;
  const api={
    getRandomValues(output){invoked++;output.fill(0x5a);return output;},
    subtle:webcrypto.subtle,
  };
  const result=await createPkcePairLocally(api);
  assert.equal(invoked,1);
  assert.equal(result.verifier.length,43);
  assert.match(result.verifier,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(result.challenge,
    (await derivePkceChallengeLocally(result.verifier,webcrypto)).challenge);
  assert.equal(result.randomBytes,32);
  assert.equal(result.stored,false);
  assert.equal(result.sent,false);
  const actual=await createPkcePairLocally(webcrypto);
  assert.notEqual(actual.verifier,result.verifier);
  assert.equal(actual.verifier.length,43);
});
test("PKCE refuses short, invalid, overly long or insecure requests",async()=>{
  for(const verifier of [
    "", "abc", "x".repeat(129), "x".repeat(42),
    "a".repeat(42)+"=", "a".repeat(42)+" ", "é".repeat(43),
    "a".repeat(44)+"\n",
  ])await assert.rejects(derivePkceChallengeLocally(verifier,webcrypto));
  await assert.rejects(derivePkceChallengeLocally("a".repeat(43),{}),/Web Crypto/);
  await assert.rejects(createPkcePairLocally({subtle:webcrypto.subtle}),/Secure random/);
});
test("HMAC-SHA256 real signing and verification match independent Node crypto",async()=>{
  const key="key",message="The quick brown fox jumps over the lazy dog";
  const expected=createHmac("sha256",key).update(message).digest("hex");
  const result=await signHmacLocally(message,key,webcrypto);
  assert.equal(result.signatureHex,expected);
  assert.equal(result.algorithm,"HMAC-SHA256");
  assert.equal(result.keyDisplayed,false);
  assert.equal(result.authenticatedIdentity,false);
  assert.equal(result.requestsSent,0);
  assert.equal((await verifyHmacLocally(message,key,expected,webcrypto)).verified,true);
  assert.equal((await verifyHmacLocally(message+"!",key,expected,webcrypto)).verified,false);
  assert.equal((await verifyHmacLocally(message,"other",expected,webcrypto)).verified,false);
});
test("HMAC validation refuses malformed signatures and unavailable key APIs",async()=>{
  for(const signature of ["abc","x".repeat(64),"a".repeat(63),"a".repeat(65)])
    await assert.rejects(verifyHmacLocally("message","demo",signature,webcrypto));
  await assert.rejects(signHmacLocally("test","",webcrypto),/training key/);
  await assert.rejects(signHmacLocally("x".repeat(4097),"demo",webcrypto),/bounded/);
  await assert.rejects(signHmacLocally("demo","training",{}),/Web Crypto/);
  await assert.rejects(verifyHmacLocally("message","demo","a".repeat(64),{}),/Web Crypto/);
});
test("IPv4 CIDR membership includes mathematical end address, not live host reachability",()=>{
  const yes=checkCidrMembershipLocally("192.168.10.42/24","192.168.10.255");
  assert.equal(yes.family,"IPv4");
  assert.equal(yes.network,"192.168.10.0");
  assert.equal(yes.rangeEnd,"192.168.10.255");
  assert.equal(yes.contained,true);
  assert.equal(yes.probesSent,0);
  assert.equal(yes.aclEnforced,false);
  assert.equal(checkCidrMembershipLocally("192.168.10.0/24","192.168.11.1").contained,false);
  assert.equal(checkCidrMembershipLocally("0.0.0.0/0","255.255.255.255").contained,true);
  assert.equal(checkCidrMembershipLocally("203.0.113.44/32","203.0.113.44").contained,true);
  assert.equal(checkCidrMembershipLocally("203.0.113.44/32","203.0.113.45").contained,false);
});
test("IPv6 CIDR membership compares precise 128-bit values and normalized variants",()=>{
  const result=checkCidrMembershipLocally("2001:db8:abcd::/48","2001:0DB8:ABCD:0002::1234");
  assert.equal(result.family,"IPv6");
  assert.equal(result.network,"2001:db8:abcd::");
  assert.equal(result.prefix,48);
  assert.equal(result.contained,true);
  assert.equal(result.address,"2001:db8:abcd:2::1234");
  assert.equal(result.aclEnforced,false);
  assert.equal(checkCidrMembershipLocally("2001:db8:abcd::/48","2001:db8:abce::1").contained,false);
  assert.equal(checkCidrMembershipLocally("::/0","ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff").contained,true);
  assert.equal(checkCidrMembershipLocally("::1/128","::2").contained,false);
});
test("CIDR checker rejects cross-family inputs and ambiguous addresses",()=>{
  for(const [cidr,ip] of [
    ["192.168.10.0/24","2001:db8::1"],
    ["2001:db8::/64","192.0.2.1"],
    ["192.168.01.0/24","192.168.1.1"],
    ["192.168.1.0/33","192.168.1.1"],
    ["192.168.1.0/24","256.0.0.1"],
    ["2001:db8:::1/64","2001:db8::2"],
    ["not an ip","1.2.3.4"],
    ["192.0.2.0/24","192.0.2.1\nHost: evil"],
  ])assert.throws(()=>checkCidrMembershipLocally(cidr,ip));
});
test("HSTS policy parser reports valid max-age and honest preload uncertainty",()=>{
  const good=inspectHstsLocally("Strict-Transport-Security: max-age=31536000; includeSubDomains; preload");
  assert.equal(good.maxAgeSeconds,31536000);
  assert.equal(good.includeSubDomains,true);
  assert.equal(good.preloadRequested,true);
  assert.equal(good.warningCount,0);
  assert.equal(good.remoteHostChecked,false);
  assert.equal(good.preloadStatusVerified,false);
  const disabled=inspectHstsLocally("max-age=0");
  assert.ok(disabled.warnings.some(w=>w.includes("deletion")));
  const weak=inspectHstsLocally("max-age=300; preload");
  assert.ok(weak.warnings.some(w=>w.includes("One-year")));
  assert.ok(weak.warnings.some(w=>w.includes("includeSubDomains")));
  assert.ok(weak.warnings.some(w=>w.includes("preload requires")));
  const duplicate=inspectHstsLocally("max-age=31536000; max-age=31536000; includeSubDomains");
  assert.ok(duplicate.warnings.some(w=>w.includes("Duplicate")));
});
test("HSTS malformed headers and control characters fail closed",()=>{
  for(const value of [
    "", "max-age=-1","includeSubDomains","max-age=not-a-number",
    "max-age=86400\nset-cookie: x",
    "max-age=86400; includeSubDomains=1",
    "max-age=86400; preload=yes",
    "max-age=11111111111",
    "x".repeat(1025),
  ])assert.throws(()=>inspectHstsLocally(value));
});
test("DMARC parser reports enforcement and alignment without echoing report addresses",()=>{
  const good=inspectDmarcLocally(
    "v=DMARC1; p=reject; sp=quarantine; rua=mailto:private-security@example.test; adkim=s; aspf=r"
  );
  assert.equal(good.policy,"reject");
  assert.equal(good.subdomainPolicy,"quarantine");
  assert.equal(good.percentage,100);
  assert.equal(good.dkimAlignment,"s");
  assert.equal(good.spfAlignment,"r");
  assert.equal(good.aggregateReportCount,1);
  assert.equal(good.warningCount,0);
  assert.equal(good.reportAddressesExposed,false);
  assert.equal(good.emailAuthenticated,false);
  assert.equal(good.dnsQueriesSent,0);
  assert.ok(!JSON.stringify(good).includes("private-security@example.test"));
  const monitoring=inspectDmarcLocally("v=DMARC1; p=none; pct=25");
  assert.ok(monitoring.warnings.some(x=>x.includes("monitoring-only")));
  assert.ok(monitoring.warnings.some(x=>x.includes("partial rollout")));
  assert.ok(monitoring.warnings.some(x=>x.includes("aggregate rua")));
  const sub=inspectDmarcLocally("v=DMARC1; p=reject; sp=none; rua=mailto:x@example.test");
  assert.ok(sub.warnings.some(x=>x.includes("subdomain policy")));
});
test("DMARC refuses unknown enforcement levels, invalid percentages, report URIs and duplicates",()=>{
  for(const input of [
    "", "p=reject","v=DMARC1; p=allow","v=DMARC1; p=reject; pct=101",
    "v=DMARC1; p=reject; pct=-1",
    "v=DMARC1; p=reject; sp=weak","v=DMARC1; p=reject; adkim=invalid",
    "v=DMARC1; p=reject; p=none",
    "v=DMARC1; p=reject; rua=ftp://example.test",
    "v=DMARC1; p=reject\nset-cookie: x",
    "x".repeat(2049),
  ])assert.throws(()=>inspectDmarcLocally(input));
});
test("all five new workstations are wired to responsive UI with no host or storage access",async()=>{
  const [page,ui,engine]=await Promise.all([
    readFile(new URL("../src/pages/EternyxLabs.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/components/labs/BrowserIdentityDefense.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/lib/eternyxLabsIdentity.mjs",import.meta.url),"utf8"),
  ]);
  assert.match(page,/BrowserIdentityDefense selected=\{selected\}/);
  assert.match(page,/40 working exercises/);
  assert.match(page,/Search 40 workstations/);
  for(const id of ["pkce","hmac","cidrcheck","hsts","dmarc"])
    assert.ok(ui.includes('selected==="'+id+'"'),id);
  assert.match(ui,/role="alert"/);
  assert.match(ui,/aria-live="polite"/);
  assert.match(ui,/autocomplete|autoComplete="off"/);
  assert.match(engine,/cryptoApi\.subtle\.sign/);
  assert.match(engine,/cryptoApi\.subtle\.verify/);
  assert.match(engine,/cryptoApi\.subtle\.digest/);
  assert.doesNotMatch(engine,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|createServer|WebSocket|Math\.random/);
  assert.doesNotMatch(ui,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase/);
  assert.equal((page.match(/sandbox="allow-scripts"/g)||[]).length,3);
});
