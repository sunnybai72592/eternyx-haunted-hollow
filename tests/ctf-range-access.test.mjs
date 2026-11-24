import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import {
  authorizedAccessExpiry, generateAccessToken, hashAccessToken,
  parseAccessRequest, parseProxyVerification, validAccessToken, validTokenHash, validUserJwt,
} from "../supabase/functions/_shared/ctf-range-access-contract.mjs";
import { RangeAccessVerifier, startLocalIngress, STAGING_VERIFIER_URL } from "../infrastructure/cyber-range/ingress/server.mjs";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const a = "123e4567-e89b-42d3-a456-426614174001";
const b = "223e4567-e89b-42d3-a456-426614174001";
const gatewaySecret = "a".repeat(64);
const learnerJwt = "A".repeat(32) + "." + "B".repeat(32) + "." + "C".repeat(32);

test("access contracts reject forged owners, arbitrary targets, and unknown actions", () => {
  assert.deepEqual(parseAccessRequest({ action: "issue", sessionId: a }),
    { action: "issue", sessionId: a });
  for (const value of [
    null, [], "issue", { action: "issue" },
    { action: "issue", sessionId: "x" },
    { action: "issue", sessionId: a, userId: b },
    { action: "issue", sessionId: a, target: "http://127.0.0.1:9999" },
    { action: "issue", sessionId: a, score: 99 },
    { action: "status" },
  ]) assert.equal(parseAccessRequest(value), null, JSON.stringify(value));

  const token = "rx_" + "a".repeat(64);
  assert.deepEqual(parseProxyVerification({ action: "check", sessionId: a, accessToken: token }),
    { action: "check", sessionId: a, accessToken: token });
  for (const value of [
    { action: "check", sessionId: a, accessToken: "invalid" },
    { action: "check", sessionId: "wrong", accessToken: token },
    { action: "check", sessionId: a, accessToken: token, user_id: b },
    { action: "check", sessionId: a, accessToken: token, url: "https://evil.invalid" },
    { action: "issue", sessionId: a, accessToken: token },
  ]) assert.equal(parseProxyVerification(value), null);
});

test("256-bit random bearer grants are never stored as raw token hashes", async () => {
  const x = generateAccessToken(), y = generateAccessToken();
  assert.equal(validUserJwt(learnerJwt), true);
  assert.equal(validUserJwt("not-a-token"), false);
  assert.equal(validAccessToken(x), true);
  assert.equal(validAccessToken(y), true);
  assert.notEqual(x, y);
  assert.match(x, /^rx_[0-9a-f]{64}$/);
  const hx = await hashAccessToken(x), hy = await hashAccessToken(y);
  assert.equal(validTokenHash(hx), true);
  assert.notEqual(hx, hy);
  assert.notEqual(hx, x);
  assert.equal(await hashAccessToken(x), hx);
  await assert.rejects(hashAccessToken("not-a-token"), /Invalid cyber range access token/);
});

test("grant expiry refuses expired, malformed or overly long tokens", () => {
  const now = new Date("2026-11-22T18:30:00.000Z");
  assert.equal(authorizedAccessExpiry("2026-11-22T18:30:59.000Z", now), true);
  assert.equal(authorizedAccessExpiry("2026-11-22T18:30:00.000Z", now), false);
  assert.equal(authorizedAccessExpiry("2026-11-22T18:31:01.000Z", now), false);
  assert.equal(authorizedAccessExpiry("never", now), false);
  assert.equal(authorizedAccessExpiry(null, now), false);
});

function listen(server) {
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", fail);
      ok(server.address().port);
    });
  });
}
function shut(server) {
  return new Promise((ok, fail) => server.close((err) => err ? fail(err) : ok()));
}

test("local ingress verifies every HTTP request, cannot cross sessions and never forwards user token", async (t) => {
  const upstream = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      authorization: req.headers.authorization,
      forwardedUserJwt: req.headers["x-eternyx-auth-jwt"] ?? null,
      path: req.url,
      role: req.headers["x-lab-role"] ?? null,
      body: "training-only",
    }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => shut(upstream));
  const allowed = generateAccessToken(), stolen = generateAccessToken();
  const seen = [];
  let live = true;
  const verifier = {
    async check(sessionId, accessToken, userJwt) {
      seen.push([sessionId, accessToken, userJwt]);
      return live && sessionId === a && accessToken === allowed && userJwt === learnerJwt;
    },
  };
  const ingress = await startLocalIngress({
    sessionId: a, gatewayPort: upstreamPort,
    gatewayToken: gatewaySecret, verifier,
  });
  t.after(() => ingress.close());
  const root = "http://127.0.0.1:" + ingress.port;

  assert.equal((await fetch(root + "/api/tickets?ticket=102")).status, 401);
  assert.equal((await fetch(root + "/api/tickets?ticket=102", {
    headers: { authorization: "Bearer " + stolen, "x-eternyx-auth-jwt": learnerJwt },
  })).status, 403);
  const ok = await fetch(root + "/api/tickets?ticket=102", {
    headers: { authorization: "Bearer " + allowed, "x-eternyx-auth-jwt": learnerJwt, "x-lab-role": "admin" },
  });
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.authorization, "Bearer " + gatewaySecret);
  assert.equal(data.role, "admin");
  assert.equal(data.forwardedUserJwt, null);
  assert.equal(data.path, "/api/tickets?ticket=102");
  assert.notEqual(data.authorization, "Bearer " + allowed);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.equal(ok.headers.get("access-control-allow-origin"), null);
  assert.deepEqual(seen, [[a, stolen, learnerJwt], [a, allowed, learnerJwt]]);

  live = false;
  const revoked = await fetch(root + "/api/tickets?ticket=102", {
    headers: { authorization: "Bearer " + allowed, "x-eternyx-auth-jwt": learnerJwt },
  });
  assert.equal(revoked.status, 403);
  assert.equal(seen.length, 3);

  assert.equal((await fetch(root + "/https://outside.invalid", {
    headers: { authorization: "Bearer " + allowed },
  })).status, 404);
  assert.equal((await fetch(root + "/api/unknown", {
    headers: { authorization: "Bearer " + allowed },
  })).status, 404);
});

test("ingress rejects remote Origin and fails closed if the trusted verifier fails", async (t) => {
  const upstream = createServer((req, res) => { res.end("never-called"); });
  const upstreamPort = await listen(upstream);
  t.after(() => shut(upstream));
  let calls = 0;
  const ingress = await startLocalIngress({
    sessionId: a, gatewayPort: upstreamPort, gatewayToken: gatewaySecret,
    verifier: { async check() { calls++; throw new Error("backend down"); } },
  });
  t.after(() => ingress.close());
  const root = "http://127.0.0.1:" + ingress.port;
  const token = generateAccessToken();

  assert.equal((await fetch(root + "/api/verify", {
    method: "POST", headers: {
      authorization: "Bearer " + token,
      "x-eternyx-auth-jwt": learnerJwt,
      origin: "https://attacker.invalid",
    }, body: "{}",
  })).status, 403);
  assert.equal(calls, 0);
  assert.equal((await fetch(root + "/api/verify", {
    method: "POST", headers: {
      authorization: "Bearer " + token,
      "x-eternyx-auth-jwt": learnerJwt,
      origin: root,
      "content-type": "application/json",
    }, body: "{}",
  })).status, 503);
  assert.equal(calls, 1);
});

test("local ingress refuses arbitrary host ports, missing credentials and unsafe lifetimes", async () => {
  const base = { sessionId: a, gatewayPort: 8765, gatewayToken: gatewaySecret,
    verifier: { async check() { return true; } } };
  await assert.rejects(startLocalIngress({ ...base, gatewayPort: 80 }), /Invalid local ingress/);
  await assert.rejects(startLocalIngress({ ...base, gatewayToken: "invalid" }), /Invalid local ingress/);
  await assert.rejects(startLocalIngress({ ...base, sessionId: "not-a-uuid" }), /Invalid local ingress/);
  await assert.rejects(startLocalIngress({ ...base, lifetimeSeconds: 9999 }), /Invalid local ingress/);
  assert.throws(() => new RangeAccessVerifier(
    "http://example.invalid/functions/v1/ctf-range-access-check", "k".repeat(64)), /exact HTTPS/);
  assert.throws(() => new RangeAccessVerifier(
    "https://example.invalid/functions/v1/ctf-range-access-check?target=http://evil", "k".repeat(64)), /exact HTTPS/);
});

test("Edge functions are separately gated, authenticate identity and never expose target URLs", async () => {
  const issuer = await read("supabase/functions/ctf-range-access/index.ts");
  const checker = await read("supabase/functions/ctf-range-access-check/index.ts");
  const config = await read("supabase/config.toml");
  const ui = await read("src/pages/EternyxRangeSessions.tsx");
  const ingressRunner = await read("scripts/cyber-range-ingress.mjs");
  const pkg = JSON.parse(await read("package.json"));
  assert.match(issuer, /CTF_RANGE_ACCESS_ISSUANCE_ENABLED/);
  assert.match(issuer, /CTF_RANGE_INGRESS_REVIEWED/);
  assert.match(issuer, /authenticateUser\(req\)/);
  assert.match(issuer, /user\.id/);
  assert.match(issuer, /ctf_range_issue_access_grant/);
  assert.match(issuer, /hostedTargetUrl: null/);
  assert.match(checker, /CTF_RANGE_PROXY_VALIDATION_ENABLED/);
  assert.match(checker, /CTF_RANGE_PROXY_TOKEN/);
  assert.match(checker, /verifyWorkerToken\(supplied, secret\)/);
  assert.match(checker, /ctf_range_check_access_grant/);
  assert.match(checker, /auth\.getUser\(userJwt\)/);
  assert.match(checker, /p_user_id: user\.id/);
  assert.match(config, /\[functions\.ctf-range-access\]\s*verify_jwt\s*=\s*true/);
  assert.match(config, /\[functions\.ctf-range-access-check\]\s*verify_jwt\s*=\s*false/);
  assert.match(ui, /No target URL issued yet/);
  assert.match(ingressRunner, /RANGE_INGRESS_OPERATOR_ACK/);
  assert.equal(pkg.scripts["range:ingress"], "node scripts/cyber-range-ingress.mjs");
  assert.doesNotMatch(checker, /"Access-Control-Allow-Origin"/);
  assert.doesNotMatch(issuer, /console\.log\(accessToken|localStorage|service_role/i);
});

test("Postgres access grant storage is private, short-lived, rate-limited and revocable", async () => {
  const sql = await read("supabase/migrations/20261122190000_ctf_range_access_grants.sql");
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.ctf_range_access_grants FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.ctf_range_issue_access_grant\(uuid,uuid,text\) TO service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.ctf_range_check_access_grant\(uuid,uuid,text\) TO service_role/);
  assert.match(sql, /v_session\.status <> 'running'/);
  assert.match(sql, /g\.user_id = p_user_id/);
  assert.match(sql, /id = p_session_id AND user_id = p_user_id/);
  assert.match(sql, /v_recent >= 4/);
  assert.match(sql, /v_active >= 2/);
  assert.match(sql, /LEAST\(v_now \+ interval '60 seconds', v_session\.expires_at\)/);
  assert.match(sql, /NEW\.status IS DISTINCT FROM 'running'/);
  assert.match(sql, /CREATE TRIGGER ctf_range_revoke_access_on_status_change/);
  assert.doesNotMatch(sql, /GRANT SELECT ON public\.ctf_range_access_grants TO authenticated|SECURITY DEFINER/);
});

test("verifier credentials are pinned to staging, responses bounded and exact",async()=>{
  const secret="k".repeat(64),token=generateAccessToken();
  for(const url of [
    "https://wcncuarekaofmfurbtbh.supabase.co/functions/v1/ctf-range-access-check",
    "https://example.invalid/functions/v1/ctf-range-access-check",
    STAGING_VERIFIER_URL+"?x=1",
  ])assert.throws(()=>new RangeAccessVerifier(url,secret),/exact/);
  const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store",...headers}});
  let calls=0;
  const good=new RangeAccessVerifier(STAGING_VERIFIER_URL,secret,async(url,opts)=>{
    calls++;assert.equal(url,STAGING_VERIFIER_URL);assert.equal(opts.redirect,"error");
    assert.equal(opts.credentials,"omit");assert.equal(opts.cache,"no-store");
    return json({authorized:true});
  });
  assert.equal(await good.check(a,token,learnerJwt),true);
  await assert.rejects(good.check("invalid",token,learnerJwt));
  await assert.rejects(good.check(a,"invalid",learnerJwt));
  assert.equal(calls,1);
  const denied=new RangeAccessVerifier(STAGING_VERIFIER_URL,secret,async()=>json({authorized:false},403));
  assert.equal(await denied.check(a,token,learnerJwt),false);
  for(const response of [
    ()=>json({authorized:true,extra:"unexpected"}),
    ()=>json({authorized:"true"}),
    ()=>json({authorized:true},201),
    ()=>json({authorized:true},200,{"cache-control":"public"}),
    ()=>json({authorized:true},200,{"location":"https://example.invalid"}),
    ()=>json({authorized:true},200,{"content-type":"text/html"}),
    ()=>new Response("x".repeat(2048),{headers:{"content-type":"application/json","cache-control":"no-store"}}),
  ]){
    const v=new RangeAccessVerifier(STAGING_VERIFIER_URL,secret,async()=>response());
    await assert.rejects(v.check(a,token,learnerJwt));
  }
});
test("local ingress refuses redirects and bounded streaming overflow, then shuts down",async(t)=>{
  const upstream=createServer((req,res)=>{
    if(req.url.includes("redirect")){res.writeHead(302,{Location:"https://example.invalid"});res.end();return;}
    if(req.url.includes("large")){res.writeHead(200,{"Content-Type":"text/plain"});res.write("x".repeat(20000));res.end("y".repeat(20000));return;}
    res.end("ok");
  });
  const p=await listen(upstream);t.after(()=>shut(upstream));
  const ingress=await startLocalIngress({sessionId:a,gatewayPort:p,gatewayToken:gatewaySecret,verifier:{async check(){return true;}}});
  t.after(()=>ingress.close());
  const root="http://127.0.0.1:"+ingress.port,headers={authorization:"Bearer "+generateAccessToken(),"x-eternyx-auth-jwt":learnerJwt};
  assert.equal((await fetch(root+"/api/tickets?redirect=1",{headers,redirect:"manual"})).status,502);
  assert.equal((await fetch(root+"/api/tickets?large=1",{headers})).status,502);
  assert.equal((await fetch(root+"/api/tickets",{headers})).status,200);
  await ingress.close();await ingress.close();
  await assert.rejects(fetch(root+"/api/tickets",{headers}));
});
