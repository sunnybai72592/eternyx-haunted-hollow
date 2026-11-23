import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  NEGATIVE_CASES,inspectNegativeTarget,runNegativeHttp,
} from "../scripts/automation-staging-negative-http.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const STAGE="abcdefghijklmnopqrst";
const PROD="wcncuarekaofmfurbtbh";
const env=(other={})=>({
  ETERNYX_AUTOMATION_STAGING_REF:STAGE,
  ETERNYX_AUTOMATION_PRODUCTION_REF:PROD,
  ETERNYX_AUTOMATION_NEGATIVE_HTTP_CONSENT:"I_APPROVE_STAGING_NEGATIVE_HTTP",
  ...other,
});
const statuses={
  "POST:/functions/v1/automation-control":401,
  "GET:/functions/v1/automation-webhook":405,
  "POST:/functions/v1/automation-webhook":400,
  "GET:/functions/v1/automation-scheduler-worker":405,
  "POST:/functions/v1/automation-scheduler-worker":401,
};
const fakeResponse=status=>new Response(JSON.stringify({error:"Synthetic denial"}),{
  status,headers:{"content-type":"application/json"},
});
test("all five requested probes are credentialless and none is a valid webhook, worker tick, or workflow write",()=>{
  assert.equal(NEGATIVE_CASES.length,5);
  assert.deepEqual(NEGATIVE_CASES.map(x=>x.slug),[
    "automation-control","automation-webhook","automation-webhook",
    "automation-scheduler-worker","automation-scheduler-worker",
  ]);
  const unique=new Set(NEGATIVE_CASES.map(x=>x.id));
  assert.equal(unique.size,5);
  for(const check of NEGATIVE_CASES){
    assert.ok(["GET","POST"].includes(check.method));
    assert.ok(check.expected.length>0);
    assert.ok(check.expected.every(n=>[400,401,403,405].includes(n)));
    if(check.body!==null){
      const decoded=JSON.parse(check.body);
      assert.equal(typeof decoded,"object");
      assert.equal(Object.hasOwn(decoded,"user_id"),false);
      assert.notEqual(decoded.action,"tick");
      assert.notEqual(decoded.action,"run");
      assert.notEqual(decoded.action,"save");
      assert.notEqual(decoded.action,"register");
      assert.notEqual(decoded.action,"approve");
      assert.ok(check.body.length<128);
    }
  }
});
test("known production ref, forged product ref, invalid hostname input and absent approval are rejected before network",async()=>{
  const bads=[
    {ETERNYX_AUTOMATION_STAGING_REF:PROD},
    {ETERNYX_AUTOMATION_PRODUCTION_REF:STAGE},
    {ETERNYX_AUTOMATION_STAGING_REF:"not-a-valid-project"},
    {ETERNYX_AUTOMATION_STAGING_REF:"https://"+STAGE+".supabase.co"},
    {ETERNYX_AUTOMATION_STAGING_REF:"localhost"},
    {ETERNYX_AUTOMATION_STAGING_REF:""},
    {ETERNYX_AUTOMATION_NEGATIVE_HTTP_CONSENT:"NOT_APPROVED"},
  ];
  for(const bad of bads){
    let called=0;
    await assert.rejects(runNegativeHttp(env(bad),async()=>{
      called++;return fakeResponse(401);
    }),/automation_negative_http_staging_approval_required/);
    assert.equal(called,0);
  }
  const target=inspectNegativeTarget(env());
  assert.equal(target.baseUrl,"https://"+STAGE+".supabase.co/functions/v1/");
  assert.equal(target.productionExcluded,true);
});
test("live local HTTP server exercises all five negative-only actual requests without credentials or writes",async()=>{
  const hits=[];
  const server=createServer(async(req,res)=>{
    let raw="";
    for await(const c of req)raw+=c.toString("utf8");
    hits.push({method:req.method,url:req.url,headers:req.headers,raw});
    const status=statuses[req.method+":"+req.url]??500;
    res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
    res.end(JSON.stringify({error:"Expected local denial"}));
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");
  try{
    const port=server.address().port;
    const report=await runNegativeHttp(env(),(url,options)=>{
      const parsed=new URL(url);
      assert.equal(parsed.origin,"https://"+STAGE+".supabase.co");
      assert.ok(parsed.pathname.startsWith("/functions/v1/automation-"));
      assert.equal(options.redirect,"error");
      assert.equal(options.cache,"no-store");
      assert.equal(options.credentials,"omit");
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted,false);
      assert.deepEqual(Object.keys(options.headers).sort(),
        (options.body===undefined?["Accept"]:["Accept","Content-Type"]).sort());
      return fetch("http://127.0.0.1:"+port+parsed.pathname,options);
    });
    assert.equal(hits.length,5);
    assert.equal(report.checks.length,5);
    assert.equal(report.allFiveSecurityDenialsPassed,true);
    assert.equal(report.credentiallessRequestsOnly,true);
    assert.equal(report.schedulerTickAttempted,false);
    assert.equal(report.webhookSignedExecutionAttempted,false);
    assert.equal(report.workflowWritesAttempted,false);
    assert.equal(report.liveAuthorizedWorkflowsVerified,false);
    assert.equal(report.productionProjectChanged,false);
    for(const hit of hits){
      assert.equal(hit.headers.authorization,undefined);
      assert.equal(hit.headers.apikey,undefined);
      assert.equal(hit.headers["x-eternyx-scheduler-key"],undefined);
      assert.equal(hit.headers["x-eternyx-signature"],undefined);
      assert.equal(hit.headers.cookie,undefined);
      assert.ok(hit.raw.length<128);
      assert.ok(!hit.raw.includes('"tick"'));
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test("webhook runtime disabled with HTTP 503 is a hard failure, not a passing denial",async()=>{
  let n=0;
  await assert.rejects(runNegativeHttp(env(),async()=>fakeResponse(
    [401,405,503][n++]
  )),/automation_negative_http_unexpected_status_unsigned_webhook_envelope/);
  assert.equal(n,3);
});
test("unexpected success, redirect, malformed responses and leak-size body all fail closed",async()=>{
  for(const status of [200,201,204,301,302,307,429,500,502,503]){
    const fetcher=async()=>new Response(status===204?null:"Unexpected",{
      status,headers:status>=300&&status<400?{location:"https://example.invalid"}:{},
    });
    await assert.rejects(runNegativeHttp(env(),fetcher),/automation_negative_http_/);
  }
  await assert.rejects(runNegativeHttp(env(),async()=>new Response(
    new Uint8Array(2049),{status:401},
  )),/automation_negative_http_response_too_large/);
  await assert.rejects(runNegativeHttp(env(),async()=>({status:401,headers:null})),
    /automation_negative_http_untrusted_response/);
});
test("network or TLS failure is sanitized and never retried",async()=>{
  let calls=0;
  await assert.rejects(runNegativeHttp(env(),async()=>{
    calls++;throw Error("SECRET=very-private-connection-header");
  }),/automation_negative_http_connection_or_tls_failed/);
  assert.equal(calls,1);
});
test("responses must appear in fixed order with exact statuses and no invented readiness",async()=>{
  let n=0;
  const response=await runNegativeHttp(env(),async(url,options)=>{
    assert.equal(url,"https://"+STAGE+".supabase.co/functions/v1/"+NEGATIVE_CASES[n].slug);
    assert.equal(options.method,NEGATIVE_CASES[n].method);
    return fakeResponse([403,405,400,405,401][n++]);
  });
  assert.equal(n,5);
  assert.deepEqual(response.checks.map(x=>x.id),NEGATIVE_CASES.map(x=>x.id));
  assert.deepEqual(response.checks.map(x=>x.status),[403,405,400,405,401]);
  assert.equal(response.productionReady,false);
  assert.equal(response.releaseAuthorized,false);
  assert.equal(response.secretsVerified,false);
  const json=JSON.stringify(response);
  assert.doesNotMatch(json,/Bearer |password|apikey|cookie|private_key|x-eternyx-signature/i);
});
test("manual staging workflow is protected, main-only, project-inventory verified and deploys nothing",async()=>{
  const workflow=await readFile(path.join(root,
    ".github/workflows/automation-staging-negative-http.yml"),"utf8");
  for(const mark of [
    "workflow_dispatch:","environment: automation-staging",
    "github.ref == 'refs/heads/main'","I_APPROVE_STAGING_NEGATIVE_HTTP",
    "inspectStageProject","fetchStageManagement","verifyDeployedCore",
    "scripts/automation-staging-negative-http.mjs --run-negative-only",
    "secrets.ETERNYX_AUTOMATION_STAGING_MANAGEMENT_TOKEN",
  ])assert.ok(workflow.includes(mark),mark);
  assert.doesNotMatch(workflow,/^\s+(pull_request|push|schedule):/m);
  assert.doesNotMatch(workflow,/supabase functions deploy|supabase db push|secrets set|migration repair/);
  const released=await readFile(path.join(root,
    ".github/workflows/automation-staging-core-release.yml"),"utf8");
  assert.match(released,/scripts\/automation-staging-negative-http\.mjs --run-negative-only/);
  assert.match(released,/I_APPROVE_STAGING_NEGATIVE_HTTP/);
  assert.match(released,/verifyDeployedCore/);
});
