import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  inspectDnsZoneLocally,inspectHttpRequestLocally,inspectSecurityTxtLocally,
  correlateSecurityEventsLocally,generateLocalRandomToken,
} from "../src/lib/eternyxLabsOperations.mjs";
import {labCatalog} from "../src/lib/eternyxLabs.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("twenty real workstations include all five defensive operations tools",()=>{
  const ids=labCatalog.map(x=>x.id);
  assert.equal(ids.length,20);
  assert.equal(new Set(ids).size,20);
  assert.deepEqual(ids.slice(-5),["dns","http","securitytxt","events","tokens"]);
});
test("DNS record clinic counts all supported record types without resolving a host",()=>{
  const r=inspectDnsZoneLocally([
    "example.test. 300 IN A 192.0.2.4",
    "alias.example.test. 300 IN CNAME example.test.",
    "example.test. 300 IN MX 10 mail.example.test.",
    "_dmarc.example.test. 300 IN TXT \"v=DMARC1; p=none\"",
  ].join("\n"));
  assert.equal(r.recordCount,4);
  assert.deepEqual(r.counts,{A:1,CNAME:1,MX:1,TXT:1});
  assert.equal(r.distinctOwners,3);
  assert.equal(r.warnings.length,0);
  assert.equal(r.queriesSent,0);
  assert.equal(r.recordsPublished,false);
});
test("DNS CNAME owner clashes produce a warning, not a false clean result",()=>{
  const r=inspectDnsZoneLocally(
    "same.example.test. 300 IN CNAME other.example.test.\n"+
    "same.example.test. 300 IN A 203.0.113.5"
  );
  assert.equal(r.warnings.length,1);
  assert.match(r.warnings[0],/CNAME/);
});
test("DNS invalid zone records and excessive inputs fail closed",()=>{
  for(const input of [
    "name 0 IN A 256.1.2.3",
    "name 0 IN A 192.168.01.2",
    "name 90000 IN A 192.0.2.3",
    "name 30 IN MX mail.example.org.",
    "name 30 IN MX 65536 mail.example.org.",
    "name 30 IN CNAME no..name",
    "name 30 IN TXT unquoted",
    "name 30 IN TXT \"unterminated",
    "invalid record",
    "",
    "name 30 IN A 192.0.2.3\n".repeat(61),
    "name 30 IN A 192.0.2.3".repeat(1000),
  ])assert.throws(()=>inspectDnsZoneLocally(input),undefined,input.slice(0,30));
});
test("HTTP framing accurately counts body bytes without transmitting a request",()=>{
  const r=inspectHttpRequestLocally(
    "POST /training HTTP/1.1\nHost: example.test\nContent-Length: 2\n\n{}"
  );
  assert.deepEqual([r.method,r.version,r.headerCount,r.bodyBytes,r.warnings.length],
    ["POST","HTTP/1.1",2,2,0]);
  assert.equal(r.requestsSent,0);
  assert.equal(r.sensitiveValuesExposed,false);
});
test("HTTP framing flags ambiguous transfer lengths, missing Host and concealed secrets",()=>{
  const r=inspectHttpRequestLocally(
    "POST /items?token=hidden HTTP/1.1\n"+
    "Content-Length: 5\nTransfer-Encoding: chunked\n"+
    "Authorization: Bearer fake-private-token\n\nabcde"
  );
  assert.ok(r.warnings.some(x=>x.includes("Transfer-Encoding and Content-Length")));
  assert.ok(r.warnings.some(x=>x.includes("Host")));
  assert.ok(r.warnings.some(x=>x.includes("credential-bearing")));
  assert.equal(r.targetHasQuery,true);
  assert.ok(!JSON.stringify(r).includes("fake-private-token"));
  assert.ok(!JSON.stringify(r).includes("token=hidden"));
  const mismatch=inspectHttpRequestLocally("POST / HTTP/1.1\nHost: x.test\nContent-Length: 3\n\n{}");
  assert.ok(mismatch.warnings.some(x=>x.includes("does not match")));
  const duplicate=inspectHttpRequestLocally(
    "POST / HTTP/1.1\nHost: x.test\nContent-Length: 1\nContent-Length: 2\n\n{}"
  );
  assert.ok(duplicate.warnings.some(x=>x.includes("Repeated")));
});
test("HTTP request parser rejects unsafe methods, header injection and incomplete framing",()=>{
  for(const input of [
    "CONNECT host:443 HTTP/1.1\nHost: example.test\n\n",
    "GET http://evil.example.org HTTP/1.1\nHost: example.test\n\n",
    "GET / HTTP/2.0\nHost: example.test\n\n",
    "GET / HTTP/1.1\n Folded: forbidden\n\n",
    "GET / HTTP/1.1\nbad name: x\n\n",
    "GET / HTTP/1.1\nHost x\n\n",
    "GET / HTTP/1.1\nHost: x",
    "a".repeat(8193),
  ])assert.throws(()=>inspectHttpRequestLocally(input));
});
test("security.txt checker detects structural contact and future expiry with no requests",()=>{
  const now=new Date("2026-11-23T00:00:00Z");
  const r=inspectSecurityTxtLocally(
    "Contact: mailto:security@example.test\n"+
    "Expires: 2030-01-01T00:00:00Z\n"+
    "Canonical: https://example.test/.well-known/security.txt",now);
  assert.deepEqual(r.fields,["canonical","contact","expires"]);
  assert.equal(r.contactCount,1);
  assert.equal(r.expiresAt,"2030-01-01T00:00:00.000Z");
  assert.equal(r.warningCount,0);
  assert.equal(r.requestsSent,0);
  assert.equal(r.contactsExposed,false);
  assert.ok(!JSON.stringify(r).includes("security@example.test"));
});
test("security.txt expiration, missing fields and malformed contacts are flagged",()=>{
  const now=new Date("2026-11-23T00:00:00Z");
  const expired=inspectSecurityTxtLocally(
    "Contact: mailto:security@example.test\nExpires: 2020-01-01T00:00:00Z",now);
  assert.ok(expired.warnings.some(x=>x.includes("expired")));
  const missing=inspectSecurityTxtLocally("Policy: https://example.test/security",now);
  assert.ok(missing.warnings.some(x=>x.includes("Contact")));
  assert.ok(missing.warnings.some(x=>x.includes("Expires")));
  const bad=inspectSecurityTxtLocally("Contact: ftp://example.test\nExpires: not-date",now);
  assert.ok(bad.warnings.some(x=>x.includes("Invalid Contact")));
  assert.ok(bad.warnings.some(x=>x.includes("timestamp")));
  assert.throws(()=>inspectSecurityTxtLocally("Malformed line",now));
  assert.throws(()=>inspectSecurityTxtLocally("Contact: mailto:x@y",new Date("invalid")));
});
test("incident timeline correlates ordered timestamps and counts synthetic events",()=>{
  const r=correlateSecurityEventsLocally([
    "2026-11-23T10:04:00Z|WARN|login-failed",
    "2026-11-23T10:00:00Z|WARN|login-failed",
    "2026-11-23T10:08:00Z|INFO|login-success",
    "2026-11-23T10:03:00Z|ERROR|login-failed",
  ].join("\n"));
  assert.equal(r.eventCount,4);
  assert.equal(r.levels.WARN,2);
  assert.equal(r.levels.ERROR,1);
  assert.equal(r.eventCounts["login-failed"],3);
  assert.equal(r.firstAt,"2026-11-23T10:00:00.000Z");
  assert.equal(r.lastAt,"2026-11-23T10:08:00.000Z");
  assert.equal(r.threeFailureWindows,1);
  assert.equal(r.repeatedFailuresObserved,true);
  assert.equal(r.logsUploaded,false);
  assert.equal(r.identityAttributed,false);
});
test("incident events cannot include arbitrary identifiers or excessive content",()=>{
  for(const input of [
    "",
    "2026-11-23T10:00:00Z|WARN|user=secret",
    "2026-11-23T10:00:00Z|BAD|login-failed",
    "2026-11-23 10:00:00|WARN|login-failed",
    "2026-11-23T10:00:00Z|WARN|login-failed|alice",
    "2026-11-23T10:00:00Z|WARN|login-failed\n".repeat(53),
    "x".repeat(8193),
  ])assert.throws(()=>correlateSecurityEventsLocally(input));
});
test("token generator uses real cryptographic API rather than Math.random",()=>{
  let called=0;
  const controlled={
    getRandomValues(array){called++;array.fill(0xab);return array;},
  };
  const hex=generateLocalRandomToken({bytes:16,cryptoApi:controlled});
  assert.equal(called,1);
  assert.equal(hex.token,"ab".repeat(16));
  assert.equal(hex.randomBits,128);
  assert.equal(hex.storageUsed,false);
  assert.equal(hex.requestsSent,0);
  const b64=generateLocalRandomToken({bytes:24,format:"base64url",cryptoApi:controlled});
  assert.match(b64.token,/^[A-Za-z0-9_-]+$/);
  assert.equal(b64.token.length,32);
  assert.equal(b64.randomBits,192);
  assert.notEqual(b64.token,hex.token);
  const real=generateLocalRandomToken({bytes:32,cryptoApi:globalThis.crypto});
  assert.equal(real.token.length,64);
  assert.match(real.token,/^[0-9a-f]{64}$/);
});
test("token generation rejects insecure fallback, unknown formats and byte sizes",()=>{
  for(const args of [
    {bytes:8},{bytes:64},{bytes:16,format:"raw"},
    {bytes:16,cryptoApi:{}},{bytes:24,cryptoApi:null},
  ])assert.throws(()=>generateLocalRandomToken(args));
});
test("offline engines and React workstations are integrated with explicit safety caveats",async()=>{
  const [engine,ui,page]=await Promise.all([
    read("src/lib/eternyxLabsOperations.mjs"),
    read("src/components/labs/BrowserDefensiveOperations.tsx"),
    read("src/pages/EternyxLabs.tsx"),
  ]);
  assert.match(page,/BrowserDefensiveOperations selected=\{selected\}/);
  assert.match(page,/20 working exercises/);
  assert.match(page,/Search 20 workstations/);
  for(const id of ["dns","http","securitytxt","events","tokens"])
    assert.ok(ui.includes('selected==="'+id+'"'),id);
  assert.match(ui,/role="alert"/);
  assert.match(ui,/aria-live="polite"/);
  assert.match(ui,/Requests sent/);
  assert.match(ui,/Generated|Generate fresh random token/);
  assert.doesNotMatch(engine,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|createServer|Math\.random/);
  assert.doesNotMatch(ui,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase/);
  assert.equal((page.match(/sandbox="allow-scripts"/g)||[]).length,3);
});
