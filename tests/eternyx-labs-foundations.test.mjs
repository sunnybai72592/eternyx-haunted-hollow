import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  calculateIpv4Subnet,simulateUnixUmask,lintCspPolicy,
  evaluateCorsHeaderExample,reviewSetCookieExample,
} from "../src/lib/eternyxLabsFoundations.mjs";
import {labCatalog} from "../src/lib/eternyxLabs.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("five new foundation workstations appear in a distinct twenty-tool Labs catalog",()=>{
  const ids=labCatalog.map(x=>x.id);
  assert.equal(ids.length,20);
  assert.equal(new Set(ids).size,20);
  assert.deepEqual(ids.slice(10,15),["subnet","chmod","csp","cors","cookie"]);
  assert.deepEqual(ids.slice(-5),["dns","http","securitytxt","events","tokens"]);
});

test("IPv4 CIDR calculator computes standard network boundaries and masks",()=>{
  const r=calculateIpv4Subnet("192.168.10.42/24");
  assert.deepEqual([
    r.network,r.broadcast,r.mask,r.wildcard,r.first,r.last,
    r.addressCount,r.usableCount,r.networkRequests,
  ],["192.168.10.0","192.168.10.255","255.255.255.0",
    "0.0.0.255","192.168.10.1","192.168.10.254",256,254,0]);
  const mid=calculateIpv4Subnet("10.128.1.29/20");
  assert.equal(mid.network,"10.128.0.0");
  assert.equal(mid.broadcast,"10.128.15.255");
  assert.equal(mid.usableCount,4094);
});
test("IPv4 /0, /31 and /32 are handled without overflow or fake host reservation",()=>{
  const zero=calculateIpv4Subnet("0.0.0.0/0");
  assert.equal(zero.network,"0.0.0.0");
  assert.equal(zero.broadcast,"255.255.255.255");
  assert.equal(zero.addressCount,4294967296);
  assert.equal(zero.usableCount,4294967294);
  const pair=calculateIpv4Subnet("198.51.100.10/31");
  assert.equal(pair.first,"198.51.100.10");
  assert.equal(pair.last,"198.51.100.11");
  assert.equal(pair.usableCount,2);
  const host=calculateIpv4Subnet("203.0.113.9/32");
  assert.equal(host.first,"203.0.113.9");
  assert.equal(host.broadcast,"203.0.113.9");
  assert.equal(host.usableCount,1);
});
test("IPv4 input rejects shorthand, invalid octets and unbounded strings",()=>{
  for(const input of [
    "1.2.3/24","256.2.2.2/24","01.2.3.4/24","-1.2.3.4/24",
    "1.2.3.4/-1","1.2.3.4/33","1.2.3.4","1.2.3.4/1/1",
    "not an IP/24","1.2.3.4/"+"0".repeat(80),
  ])assert.throws(()=>calculateIpv4Subnet(input));
});
test("UNIX umask exactly removes requested bits and reports symbolic permissions",()=>{
  const r=simulateUnixUmask("0777","0027");
  assert.deepEqual([r.requested,r.umask,r.resultingMode,r.owner,r.group,r.other],
    ["777","027","750","rwx","r-x","---"]);
  const file=simulateUnixUmask("0666","0022");
  assert.equal(file.resultingMode,"644");
  assert.equal(file.owner,"rw-");
  assert.equal(file.group,"r--");
  assert.equal(file.other,"r--");
  assert.equal(simulateUnixUmask("0400","0777").resultingMode,"000");
  assert.match(file.caveat,/does not change existing files/);
});
test("UNIX permission simulator rejects special mode bits and malformed octal input",()=>{
  for(const args of [
    ["4755","022"],["999","022"],["rwx","022"],["0755","0008"],
    ["75","022"],["7555","022"],["0755","00222"],
  ])assert.throws(()=>simulateUnixUmask(...args));
});
test("CSP linter warns about unsafe script policies, missing protections and duplicates",()=>{
  const r=lintCspPolicy("default-src 'self'; script-src 'unsafe-inline' 'unsafe-eval' * http:; script-src 'self'");
  assert.equal(r.directiveCount,2);
  assert.ok(r.warnings.some(x=>x.includes("Repeated script-src")));
  assert.ok(r.warnings.some(x=>x.includes("unsafe-inline")));
  assert.ok(r.warnings.some(x=>x.includes("unsafe-eval")));
  assert.ok(r.warnings.some(x=>x.includes("wildcard")));
  assert.ok(r.warnings.some(x=>x.includes("HTTP")));
  assert.equal(r.securityCertified,false);
  const hardened=lintCspPolicy(
    "default-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self'"
  );
  assert.equal(hardened.warningCount,0);
});
test("CSP linter refuses invalid directives or oversized input",()=>{
  assert.throws(()=>lintCspPolicy(""));
  assert.throws(()=>lintCspPolicy("!bad 'none'"));
  assert.throws(()=>lintCspPolicy("a".repeat(4097)));
});
const origins={requestOrigin:"https://app.example.org",resourceOrigin:"https://api.example.org"};
const cors=x=>evaluateCorsHeaderExample({...origins,headers:"Access-Control-Allow-Origin: https://app.example.org",...x});
test("CORS response simulator demonstrates exact origins, credentials and wildcard",()=>{
  assert.equal(cors({credentials:false}).readAllowed,true);
  assert.equal(cors({credentials:true}).readAllowed,false);
  assert.equal(cors({credentials:true,headers:
    "Access-Control-Allow-Origin: https://app.example.org\nAccess-Control-Allow-Credentials: true"}).readAllowed,true);
  assert.equal(cors({credentials:false,headers:"Access-Control-Allow-Origin: *"}).readAllowed,true);
  assert.equal(cors({credentials:true,headers:
    "Access-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true"}).readAllowed,false);
  assert.equal(cors({headers:"Access-Control-Allow-Origin: https://wrong.example.org"}).readAllowed,false);
  assert.equal(cors({headers:"Access-Control-Allow-Origin: https://app.example.org\nAccess-Control-Allow-Origin: *"}).readAllowed,false);
  const same=cors({resourceOrigin:"https://app.example.org",headers:""});
  assert.equal(same.readAllowed,true);
  assert.equal(same.preflightVerified,false);
  assert.equal(same.authorizationVerified,false);
  assert.equal(same.networkRequests,0);
});
test("CORS response simulation rejects invalid origin, credentials, headers and injection",()=>{
  for(const args of [
    {requestOrigin:"https://app.example.org/path"},
    {resourceOrigin:"file:///etc/passwd"},
    {requestOrigin:"https://user:pw@app.example.org"},
    {requestOrigin:"https://app.example.org\nHost: victim"},
    {headers:"No colon header"},
    {headers:"A: b".repeat(2000)},
    {credentials:"true"},
  ])assert.throws(()=>cors(args));
});
test("cookie clinic warns on unsafe SameSite and special-prefix combinations",()=>{
  const safe=reviewSetCookieExample(
    "Set-Cookie: __Host-training=sensitive-synthetic-value; Path=/; Secure; HttpOnly; SameSite=Lax"
  );
  assert.equal(safe.cookieName,"__Host-training");
  assert.equal(safe.secure,true);
  assert.equal(safe.httpOnly,true);
  assert.equal(safe.rootPath,true);
  assert.equal(safe.domainSpecified,false);
  assert.equal(safe.warningCount,0);
  assert.equal(safe.cookieValueShown,false);
  assert.equal(safe.liveCookieSet,false);
  assert.ok(!JSON.stringify(safe).includes("sensitive-synthetic-value"));
  const risky=reviewSetCookieExample(
    "Set-Cookie: __Host-training=private; Domain=example.org; SameSite=None"
  );
  assert.ok(risky.warnings.some(x=>x.includes("SameSite=None")));
  assert.ok(risky.warnings.some(x=>x.includes("__Host-")));
  assert.ok(risky.warnings.some(x=>x.includes("Secure")));
});
test("cookie clinic enforces single bounded header and reports unknown attributes without values",()=>{
  for(const input of [
    "Set-Cookie: missing","Set-Cookie: ok=value\nSet-Cookie: second=test",
    "Set-Cookie: bad name=value","Set-Cookie: a=x; invalid attribute",
    "a="+"x".repeat(4096),
  ])assert.throws(()=>reviewSetCookieExample(input));
  const r=reviewSetCookieExample("name=demo; Secure; Secure; SameSite=Weird");
  assert.ok(r.warnings.some(x=>x.includes("Repeated secure")));
  assert.ok(r.warnings.some(x=>x.includes("Unrecognized SameSite")));
  assert.equal(r.cookieValueShown,false);
});
test("all five working controls appear in Labs without secret uploads or public backend features",async()=>{
  const [page,ui,engine]=await Promise.all([
    read("src/pages/EternyxLabs.tsx"),
    read("src/components/labs/BrowserSecurityFoundations.tsx"),
    read("src/lib/eternyxLabsFoundations.mjs"),
  ]);
  assert.match(page,/BrowserSecurityFoundations selected=\{selected\}/);
  assert.match(page,/Search 15 workstations/);
  for(const id of ["subnet","chmod","csp","cors","cookie"])
    assert.ok(ui.includes('selected==="'+id+'"'));
  assert.match(ui,/role="alert"/);
  assert.match(ui,/aria-live="polite"/);
  assert.match(ui,/preflightVerified/);
  assert.match(ui,/cookieValueShown/);
  assert.doesNotMatch(engine,/fetch\(|XMLHttpRequest|localStorage|supabase|createServer/);
  assert.doesNotMatch(ui,/fetch\(|XMLHttpRequest|localStorage|supabase/);
  assert.equal((page.match(/sandbox="allow-scripts"/g)||[]).length,3);
});
