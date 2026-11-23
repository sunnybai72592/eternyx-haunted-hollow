import test from "node:test";
import assert from "node:assert/strict";
import {createHash,webcrypto} from "node:crypto";
import {readFile} from "node:fs/promises";
import {
  calculateIpv6SubnetLocally,inspectCachePolicyLocally,
  inspectSpfRecordLocally,simulateTokenBucketLocally,generateSriLocally,
} from "../src/lib/eternyxLabsAdvanced.mjs";
import {labCatalog} from "../src/lib/eternyxLabs.mjs";

const view=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("twenty-five unique workstations include five genuinely interactive advanced diagnostics",()=>{
  const ids=labCatalog.map(x=>x.id);
  assert.equal(ids.length,25);
  assert.equal(new Set(ids).size,25);
  assert.deepEqual(ids.slice(-5),["ipv6","cache","spf","ratelimit","sri"]);
});
test("IPv6 CIDR computes exact unsigned 128-bit network boundaries and huge counts",()=>{
  const result=calculateIpv6SubnetLocally("2001:db8:abcd:2::1234/64");
  assert.equal(result.address,"2001:db8:abcd:2::1234");
  assert.equal(result.network,"2001:db8:abcd:2::");
  assert.equal(result.last,"2001:db8:abcd:2:ffff:ffff:ffff:ffff");
  assert.equal(result.addressCount,"18446744073709551616");
  assert.equal(result.requestsSent,0);
  assert.match(result.caveat,/does not use IPv4-style broadcast/);
});
test("IPv6 zero/full prefixes and :: compression return correct exact endpoints",()=>{
  const any=calculateIpv6SubnetLocally("::1/0");
  assert.equal(any.network,"::");
  assert.equal(any.last,"ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff");
  assert.equal(any.addressCount,(1n<<128n).toString());
  const host=calculateIpv6SubnetLocally("2001:0db8::1/128");
  assert.equal(host.network,"2001:db8::1");
  assert.equal(host.last,"2001:db8::1");
  assert.equal(host.addressCount,"1");
  assert.equal(calculateIpv6SubnetLocally("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff/128").last,
    "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff");
  assert.equal(calculateIpv6SubnetLocally("::/64").last,"::ffff:ffff:ffff:ffff");
});
test("IPv6 rejects truncated groups, malformed compression and IPv4 ambiguity",()=>{
  for(const input of [
    "2001:db8::1","2001:db8::1/129","2001:db8::1/-1",
    "2001:db8:::1/64","2001:db8::1::1/64",
    "2001:db8:0:0:0:0:1/64","2001:db8:0:0:0:0:0:0:1/64",
    "::ffff:192.0.2.1/96","[::1]/128","2001:db8:z::1/64",
    "::1/064","::1/128/1","x".repeat(100),
  ])assert.throws(()=>calculateIpv6SubnetLocally(input),undefined,input);
});

test("cache policy detects dangerous sensitive/public caching and stores no response",()=>{
  const risky=inspectCachePolicyLocally("public, max-age=86400",{sensitive:true});
  assert.equal(risky.publicCachingRequested,true);
  assert.equal(risky.noStore,false);
  assert.equal(risky.maxAgeSeconds,86400);
  assert.ok(risky.warnings.some(x=>x.includes("Sensitive response")));
  assert.ok(risky.warnings.some(x=>x.includes("shared-cache")));
  assert.equal(risky.responseFetched,false);
  assert.equal(risky.cacheBehaviorVerified,false);
  const protectedPolicy=inspectCachePolicyLocally("private, no-store",{sensitive:true});
  assert.equal(protectedPolicy.warningCount,0);
  assert.equal(protectedPolicy.noStore,true);
  const conflict=inspectCachePolicyLocally("Cache-Control: public, private, max-age=60, max-age=120, no-store");
  assert.ok(conflict.warnings.some(x=>x.includes("Duplicate max-age")));
  assert.ok(conflict.warnings.some(x=>x.includes("Conflicting public and private")));
  assert.ok(conflict.warnings.some(x=>x.includes("no-store conflicts")));
});
test("cache inspection refuses raw multi-line input, malformed dates and oversized values",()=>{
  for(const value of [
    "","private\nset-cookie: confidential",
    "max-age=-1","max-age=99999999999","max-age=1;foo",
    "Cache-Control: max-age=","public,,max-age=1","@"+"a".repeat(3000),
  ])assert.throws(()=>inspectCachePolicyLocally(value),undefined,value.slice(0,50));
  assert.throws(()=>inspectCachePolicyLocally("public",{sensitive:"yes"}));
});
test("SPF linter identifies limited syntax, DNS terms and insecure +all",()=>{
  const good=inspectSpfRecordLocally("v=spf1 ip4:192.0.2.0/24 include:_spf.example.test -all");
  assert.deepEqual(good.mechanismNames,["ip4","include","all"]);
  assert.equal(good.lookupProducingTerms,1);
  assert.equal(good.allMechanisms,1);
  assert.equal(good.warningCount,0);
  assert.equal(good.dnsQueriesSent,0);
  assert.equal(good.senderAuthorized,false);
  const open=inspectSpfRecordLocally("v=spf1 +all");
  assert.ok(open.warnings.some(x=>x.includes("authorizes all")));
  const noTermination=inspectSpfRecordLocally("v=spf1 ip4:192.0.2.1");
  assert.ok(noTermination.warnings.some(x=>x.includes("No all or redirect")));
  const ptr=inspectSpfRecordLocally("v=spf1 ptr -all");
  assert.ok(ptr.warnings.some(x=>x.includes("ptr is discouraged")));
});
test("SPF parser counts ten-lookup warnings and refuses unsupported or malformed mechanisms",()=>{
  const overloaded=inspectSpfRecordLocally(
    "v=spf1 "+Array.from({length:11},(_,i)=>"include:spf"+i+".example.test").join(" ")+" -all");
  assert.equal(overloaded.lookupProducingTerms,11);
  assert.ok(overloaded.warnings.some(x=>x.includes("ten lookups")));
  for(const value of [
    "v=spf2 -all","v=spf1 include", "v=spf1 ip4","v=spf1 ip4:1.2.3.4/99",
    "v=spf1 -all; echo secret", "v=spf1 unknown:example.test", "x".repeat(2200),
  ])assert.throws(()=>inspectSpfRecordLocally(value),undefined,value.slice(0,70));
});
test("token bucket grants exactly available tokens and refills using monotonic integer seconds",()=>{
  const run=simulateTokenBucketLocally({capacity:3,refillPerSecond:1,timestamps:"0,0,0,0,1,2,3"});
  assert.equal(run.requests,7);
  assert.equal(run.allowed,6);
  assert.equal(run.denied,1);
  assert.deepEqual(run.records.map(x=>x.allowed),[true,true,true,false,true,true,true]);
  assert.equal(run.finalTokens,0);
  assert.equal(run.requestsSent,0);
  assert.equal(run.serverRateLimitEnforced,false);
  const refill=simulateTokenBucketLocally({capacity:2,refillPerSecond:2,timestamps:"0,0,0,100"});
  assert.deepEqual(refill.records.map(x=>x.allowed),[true,true,false,true]);
  assert.equal(refill.finalTokens,1);
});
test("token bucket rejects negative, unsorted, fractional, oversized or forged requests",()=>{
  for(const overrides of [
    {capacity:0},{capacity:101},{refillPerSecond:0},{refillPerSecond:21},
    {capacity:2.5},{timestamps:"0,2,1"},{timestamps:"0,1.5"},
    {timestamps:"-1,0"},{timestamps:"0,3601"},{timestamps:"0,,2"},
    {timestamps:"x"},{timestamps:Array(61).fill("0").join(",")},
    {timestamps:"2".repeat(513)},
  ])assert.throws(()=>simulateTokenBucketLocally(overrides));
});
test("SRI hashes exactly the provided UTF-8 bytes using real Web Crypto SHA-256/384/512",async()=>{
  const value="hello 🌍";
  for(const algorithm of ["sha256","sha384","sha512"]){
    const result=await generateSriLocally(value,{algorithm,cryptoApi:webcrypto});
    const expected=algorithm+"-"+createHash(algorithm).update(value,"utf8").digest("base64");
    assert.equal(result.integrity,expected);
    assert.equal(result.algorithm,algorithm);
    assert.equal(result.byteCount,new TextEncoder().encode(value).length);
    assert.equal(result.requestsSent,0);
    assert.equal(result.resourceFetched,false);
  }
  const changed=await generateSriLocally("hello 🌎",{cryptoApi:webcrypto});
  assert.notEqual(changed.integrity,(await generateSriLocally(value,{cryptoApi:webcrypto})).integrity);
});
test("SRI requires browser cryptographic digest and does not fall back to fake hash",async()=>{
  await assert.rejects(generateSriLocally("abc",{algorithm:"md5",cryptoApi:webcrypto}),/supported/);
  await assert.rejects(generateSriLocally("abc",{cryptoApi:{}}),/Web Crypto/);
  await assert.rejects(generateSriLocally("a".repeat(4097),{cryptoApi:webcrypto}),/limit/);
});
test("React integration keeps new tools real, accessible and network/storage independent",async()=>{
  const [page,ui,engine]=await Promise.all([
    view("src/pages/EternyxLabs.tsx"),
    view("src/components/labs/BrowserAdvancedDiagnostics.tsx"),
    view("src/lib/eternyxLabsAdvanced.mjs"),
  ]);
  assert.match(page,/BrowserAdvancedDiagnostics selected=\{selected\}/);
  assert.match(page,/25 working exercises/);
  assert.match(page,/Search 25 workstations/);
  for(const tool of ["ipv6","cache","spf","ratelimit","sri"])
    assert.ok(ui.includes('selected==="'+tool+'"'));
  assert.match(ui,/role="alert"/);
  assert.match(ui,/aria-live="polite"/);
  assert.match(ui,/getRandomValues|generateSriLocally/);
  assert.doesNotMatch(engine,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|createServer|WebSocket|supabase/);
  assert.doesNotMatch(ui,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase/);
  assert.equal((page.match(/sandbox="allow-scripts"/g)||[]).length,3);
  assert.doesNotMatch(page,/allow-same-origin|allow-top-navigation|allow-popups|allow-forms/);
});
