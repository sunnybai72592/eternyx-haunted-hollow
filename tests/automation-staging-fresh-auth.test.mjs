import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "node:http";
import {once} from "node:events";
import {validateFreshCredentials,checkFreshSession,freshStageSignIn,runFreshTwoOwnerAcceptance}
  from "../scripts/automation-staging-fresh-auth.mjs";
import {getWorkflowPreset,runLocalWorkflow} from "../src/lib/automationWorkflow.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const stage="abcdefghijklmnopqrst",prod="wcncuarekaofmfurbtbh",now=1800000000;
const alice="alice@stage-only.invalid",bob="bob@stage-only.invalid";
const secretA="TEST-STAGING-ONLY-PASSWORD-ALICE-12345";
const secretB="TEST-STAGING-ONLY-PASSWORD-BOB-67890";
const uidA="11111111-1111-4111-8111-111111111111";
const uidB="22222222-2222-4222-8222-222222222222";
const workflowId="33333333-3333-4333-8333-333333333333";
const runId="44444444-4444-4444-8444-444444444444";
const identifier="55555555-5555-4555-8555-555555555555";
const requestKey="66666666-6666-4666-8666-666666666666";
const env=(o={})=>({
  ETERNYX_AUTOMATION_STAGING_REF:stage,
  ETERNYX_AUTOMATION_PRODUCTION_REF:prod,
  ETERNYX_AUTOMATION_TWO_OWNER_MODE:"INSPECT_ONLY",
  ETERNYX_AUTOMATION_TWO_OWNER_REVIEW:"STAGING_TEST_ACCOUNTS_REVIEWED",
  ETERNYX_AUTOMATION_TWO_OWNER_WRITE_CONSENT:"NOT_APPROVED",
  ETERNYX_AUTOMATION_STAGING_PUBLISHABLE_KEY:"sb_publishable_OFFLINE_AUTH_FIXTURE",
  ETERNYX_AUTOMATION_STAGING_OWNER_A_EMAIL:alice,
  ETERNYX_AUTOMATION_STAGING_OWNER_A_PASSWORD:secretA,
  ETERNYX_AUTOMATION_STAGING_OWNER_B_EMAIL:bob,
  ETERNYX_AUTOMATION_STAGING_OWNER_B_PASSWORD:secretB,
  ...o,
});
const signed=(sub,claims={})=>{
  const encode=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
  return [
    encode({alg:"HS256",typ:"JWT"}),
    encode({iss:"https://"+stage+".supabase.co/auth/v1",aud:"authenticated",
      role:"authenticated",sub,iat:now-1,exp:now+3600,...claims}),
    "fixture-signature-NEVER_TRUSTED",
  ].join(".");
};
const sessions=(o={})=>[
  {token_type:"bearer",access_token:signed(uidA),expires_in:3600,
    user:{id:uidA,email:alice,is_anonymous:false},...o},
  {token_type:"bearer",access_token:signed(uidB),expires_in:3600,
    user:{id:uidB,email:bob,is_anonymous:false}},
];
const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{"content-type":"application/json"},
});
test("fresh credential preflight is staging-bound, separately authorized, and never returns passwords in sanitized reports",()=>{
  const result=validateFreshCredentials(env());
  assert.equal(result.gate.mode,"inspect");
  assert.equal(result.gate.productionTargetDenied,true);
  assert.equal(result.users.length,2);
  assert.equal(result.users[0].email,alice);
  assert.equal(result.users[1].email,bob);
  assert.equal(result.gate.projectVerifiedByThisCheck,false);
});
test("project-ref spoofing and unsafe/duplicate account configuration fail before network",async()=>{
  const cases=[
    {ETERNYX_AUTOMATION_STAGING_REF:prod},
    {ETERNYX_AUTOMATION_PRODUCTION_REF:stage},
    {ETERNYX_AUTOMATION_STAGING_REF:prod,ETERNYX_AUTOMATION_PRODUCTION_REF:stage},
    {ETERNYX_AUTOMATION_STAGING_PUBLISHABLE_KEY:"sb_secret_FORBIDDEN"},
    {ETERNYX_AUTOMATION_STAGING_OWNER_A_EMAIL:bob},
    {ETERNYX_AUTOMATION_STAGING_OWNER_A_EMAIL:"a"},
    {ETERNYX_AUTOMATION_STAGING_OWNER_A_PASSWORD:"short"},
    {ETERNYX_AUTOMATION_STAGING_OWNER_B_PASSWORD:"line\nbreak"},
    {ETERNYX_AUTOMATION_TWO_OWNER_REVIEW:"NOT_REVIEWED"},
    {ETERNYX_AUTOMATION_TWO_OWNER_MODE:"ONE_TEMPORARY_WORKFLOW"},
  ];
  for(const change of cases){
    let calls=0;
    await assert.rejects(freshStageSignIn(env(change),async()=>{
      calls++;return json(sessions()[0]);
    },{now}));
    assert.equal(calls,0);
  }
});
test("fresh sessions must have exact Supabase issuer, distinct authenticated sub, valid expiry and anonymous=false",()=>{
  const [one]=sessions();
  assert.equal(checkFreshSession(one,stage,alice,now).uid,uidA);
  const bads=[
    {...one,expires_in:59},
    {...one,access_token:signed(uidA,{iss:"https://"+prod+".supabase.co/auth/v1"})},
    {...one,access_token:signed(uidA,{aud:"anon"})},
    {...one,access_token:signed(uidA,{role:"service_role"})},
    {...one,access_token:signed(uidA,{exp:now-1})},
    {...one,access_token:signed(uidA,{iat:now+500})},
    {...one,access_token:signed(uidB)},
    {...one,access_token:"not-a-JWT"},
    {...one,token_type:"cookie"},
    {...one,user:{id:uidA,email:alice,is_anonymous:true}},
    {...one,user:{id:uidA,email:bob,is_anonymous:false}},
  ];
  for(const bad of bads)
    assert.throws(()=>checkFreshSession(bad,stage,alice,now));
});
test("fresh Auth performs exactly two password POSTs, no refresh-token calls and uses only bound staging URL",async()=>{
  let n=0;
  const calls=[];
  const result=await freshStageSignIn(env(),async(url,options)=>{
    calls.push({url,options});
    assert.equal(url,"https://"+stage+".supabase.co/auth/v1/token?grant_type=password");
    assert.equal(options.method,"POST");
    assert.equal(options.redirect,"error");
    assert.equal(options.credentials,"omit");
    assert.equal(options.cache,"no-store");
    assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(Object.keys(options.headers).sort(),
      ["apikey","Accept","Content-Type"].sort());
    const body=JSON.parse(options.body);
    assert.equal(body.email,n===0?alice:bob);
    assert.equal(body.password,n===0?secretA:secretB);
    return json(sessions()[n++]);
  },{now});
  assert.equal(n,2);
  assert.equal(result.stagingRef,stage);
  assert.notEqual(result.jwtA,result.jwtB);
  assert.equal(calls.every(x=>!x.url.includes("refresh_token")),true);
});
test("duplicate distinct-email accounts mapped to the same Auth UID are rejected",async()=>{
  let i=0;
  const duplicated=sessions();
  duplicated[1]={...duplicated[1],access_token:duplicated[0].access_token,
    user:{id:uidA,email:bob,is_anonymous:false}};
  await assert.rejects(freshStageSignIn(env(),async()=>json(duplicated[i++]),{now}),
    /automation_stage_fresh_auth_duplicate_staging_identity/);
  assert.equal(i,2);
});
test("Auth endpoint errors, redirects and malformed/oversized streaming JSON cannot leak into errors",async()=>{
  for(const response of [
    ()=>json({error:"wrong password, SECRET=NEVER_PRINT"},401),
    ()=>new Response(null,{status:302,headers:{location:"https://evil.invalid"}}),
    ()=>json({access_token:"bad"},200),
    ()=>new Response(new Uint8Array(65537),{status:200}),
    ()=>new Response("invalid JSON",{status:200}),
    ()=>new Response(new Uint8Array([0xff,0xfe]),{status:200}),
  ]){
    let calls=0;
    await assert.rejects(freshStageSignIn(env(),async()=>{
      calls++;return response();
    },{now}),error=>{
      assert.doesNotMatch(error.message,/NEVER_PRINT|evil\.invalid|wrong password/);
      return /^automation_stage_fresh_auth_[a-z_]+$/.test(error.message);
    });
    assert.equal(calls,1);
  }
});
test("actual local HTTP exercises password sign-ins + Auth /user + private read-only workflow lists",async()=>{
  const hits=[];
  const accounts=sessions();
  const server=createServer(async(req,res)=>{
    let body="";
    for await(const chunk of req)body+=chunk.toString("utf8");
    hits.push({url:req.url,method:req.method,
      auth:req.headers.authorization,apikey:req.headers.apikey,body});
    const respond=(data,status=200)=>{
      res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
      res.end(JSON.stringify(data));
    };
    if(req.url==="/auth/v1/token?grant_type=password"&&req.method==="POST"){
      const b=JSON.parse(body);
      if(b.email===alice&&b.password===secretA)return respond(accounts[0]);
      if(b.email===bob&&b.password===secretB)return respond(accounts[1]);
      return respond({error:"bad credentials"},401);
    }
    const who=req.headers.authorization==="Bearer "+accounts[0].access_token?0:
      req.headers.authorization==="Bearer "+accounts[1].access_token?1:-1;
    if(who<0)return respond({error:"unauthorized"},401);
    if(req.url==="/auth/v1/user"&&req.method==="GET")
      return respond({id:who===0?uidA:uidB,is_anonymous:false});
    if(req.url==="/functions/v1/automation-control"&&req.method==="POST"){
      const input=JSON.parse(body);
      if(input.action==="list")return respond({source:"authenticated_server",workflows:[]});
      if(input.action==="history")return respond({
        source:"authenticated_server",rawInputsStored:false,rawOutputsStored:false,runs:[],
      });
      return respond({error:"local inspect forbids writes"},403);
    }
    return respond({error:"unrecognized"},404);
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");
  try{
    const port=server.address().port;
    const report=await runFreshTwoOwnerAcceptance(env(),{
      now,fetcher:(url,options)=>{
        const u=new URL(url);
        assert.equal(u.host,stage+".supabase.co");
        assert.ok(["/auth/v1/token","/auth/v1/user","/functions/v1/automation-control"].includes(u.pathname));
        return fetch("http://127.0.0.1:"+port+u.pathname+u.search,options);
      },
    });
    assert.equal(hits.length,8);
    assert.equal(hits.filter(h=>h.url.includes("grant_type=password")).length,2);
    assert.equal(hits.filter(h=>h.url==="/auth/v1/user").length,2);
    assert.equal(hits.filter(h=>h.url==="/functions/v1/automation-control").length,4);
    assert.equal(report.mode,"inspect");
    assert.equal(report.initialInspectionPassed,true);
    assert.equal(report.authMethod,"fresh_staging_password_signin");
    assert.equal(report.freshSessions,2);
    assert.equal(report.authSessionsCreated,true);
    assert.equal(report.tokenValuesPersisted,false);
    assert.equal(report.productionReady,false);
    assert.equal(report.manualWorkflowVerified,false);
    assert.ok(hits.filter(h=>h.url.includes("grant_type=password"))
      .every(h=>h.auth===undefined&&h.apikey==="sb_publishable_OFFLINE_AUTH_FIXTURE"));
    assert.ok(hits.filter(h=>h.url.includes("automation-control"))
      .every(h=>["list","history"].includes(JSON.parse(h.body).action)));
    const reportText=JSON.stringify(report);
    for(const secret of [secretA,secretB,alice,bob,accounts[0].access_token,accounts[1].access_token])
      assert.ok(!reportText.includes(secret),"secrets or identities must not appear in acceptance report");
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test("protected workflow uses fresh password secrets ONLY after Management project proof and writes no token files",async()=>{
  const w=await readFile(path.join(root,".github/workflows/automation-staging-two-owner-http.yml"),"utf8");
  for(const token of [
    "workflow_dispatch:","environment: automation-staging",
    "github.ref == 'refs/heads/main'",
    "inspectStageProject","verifyDeployedCore",
    "secrets.ETERNYX_AUTOMATION_STAGING_OWNER_A_EMAIL",
    "secrets.ETERNYX_AUTOMATION_STAGING_OWNER_A_PASSWORD",
    "secrets.ETERNYX_AUTOMATION_STAGING_OWNER_B_EMAIL",
    "secrets.ETERNYX_AUTOMATION_STAGING_OWNER_B_PASSWORD",
    "automation-staging-fresh-auth.mjs","--inspect","--execute",
    "fresh_staging_password_signin","initialInspectionPassed",
    "automation-two-owner-verified.json",
  ])assert.ok(w.includes(token),"missing: "+token);
  assert.doesNotMatch(w,/secrets\.ETERNYX_AUTOMATION_STAGING_OWNER_[AB]_JWT|supabase auth signUp|supabase secrets set/);
  assert.doesNotMatch(w,/^\s+(?:push|pull_request|schedule):/m);
  const firstPassword=w.indexOf("secrets.ETERNYX_AUTOMATION_STAGING_OWNER_A_PASSWORD");
  const stageProof=w.indexOf("Independently verify the exact separate staging project");
  assert.ok(firstPassword>stageProof);
  assert.match(w,/inputs\.run_mode == 'ONE_TEMPORARY_WORKFLOW' && inputs\.write_approval == 'I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN'/);
});

test("approved one-workflow mode reuses only two fresh sign-ins across inspect, execute, replay, isolation and cleanup",async()=>{
  let logins=0,saved=false,deleted=false,completed=false,runs=0,denied=0;
  const accountSessions=sessions();
  const calls=[];
  const expected=runLocalWorkflow("  Bravo \nBravo\n Alpha ",getWorkflowPreset("sort"));
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;
    const identity=options.headers.Authorization;
    calls.push(path);
    if(path==="/auth/v1/token"){
      const account=JSON.parse(options.body);
      const index=account.email===alice?0:account.email===bob?1:-1;
      if(index<0)throw Error("Unexpected synthetic login");
      logins++;return json(accountSessions[index]);
    }
    const owner=identity==="Bearer "+accountSessions[0].access_token?"a":
      identity==="Bearer "+accountSessions[1].access_token?"b":"invalid";
    assert.notEqual(owner,"invalid");
    if(path==="/auth/v1/user")
      return json({id:owner==="a"?uidA:uidB,is_anonymous:false});
    assert.equal(path,"/functions/v1/automation-control");
    const body=JSON.parse(options.body);
    if(body.action==="list")return json({
      source:"authenticated_server",
      workflows:saved&&!deleted&&owner==="a"?[{
        id:workflowId,name:"ETERNYX staging acceptance "+identifier.slice(0,8),
        revision:1,active:true,trigger_kind:"manual",
      }]:[],
    });
    if(body.action==="history")return json({
      source:"authenticated_server",rawInputsStored:false,
      rawOutputsStored:false,runs:completed&&owner==="a"?[{
        id:runId,workflow_id:workflowId,status:"completed",
        trigger_type:"manual",output_lines:expected.outputLines,
        created_at:"2026-11-23T15:30:00Z",
        trace:Array.from({length:4},(_,i)=>({id:"s"+i,kind:"trim"})),
      }]:[],
    });
    if(body.action==="save"){
      assert.equal(owner,"a");assert.equal(saved,false);
      saved=true;return json({ok:true,workflow_id:workflowId});
    }
    if(body.action==="run"){
      assert.equal(body.workflowId,workflowId);
      assert.equal(body.requestKey,requestKey);
      if(owner==="b"){denied++;return json({error:"not found"},404);}
      runs++;completed=true;
      return json({
        source:"authenticated_server",executedManually:true,
        replayed:runs>1,runId,output:expected.output,
        outputLines:expected.outputLines,
        trace:Array.from({length:4},(_,i)=>({id:"s"+i})),
      });
    }
    if(body.action==="delete"){
      assert.equal(owner,"a");
      assert.equal(body.workflowId,workflowId);
      deleted=true;return json({ok:true,workflow_id:workflowId});
    }
    throw Error("Unexpected control action: "+body.action);
  };
  let id=0;
  const report=await runFreshTwoOwnerAcceptance(env({
    ETERNYX_AUTOMATION_TWO_OWNER_MODE:"ONE_TEMPORARY_WORKFLOW",
    ETERNYX_AUTOMATION_TWO_OWNER_WRITE_CONSENT:"I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN",
  }),{now,fetcher,uuid:()=>[identifier,requestKey][id++]});
  assert.equal(logins,2);
  assert.equal(saved,true);assert.equal(deleted,true);
  assert.equal(runs,2);assert.equal(denied,1);
  assert.equal(report.mode,"execute");
  assert.equal(report.initialInspectionPassed,true);
  assert.equal(report.manualWorkflowVerified,true);
  assert.equal(report.isolationVerified,true);
  assert.equal(report.singleWorkflowDeleted,true);
  assert.equal(report.persistedHistoryMayRemain,true);
  assert.equal(report.releaseAuthorized,false);
  assert.equal(report.productionReady,false);
  assert.equal(calls.filter(x=>x==="/auth/v1/token").length,2);
  assert.ok(calls.every(x=>[
    "/auth/v1/token","/auth/v1/user","/functions/v1/automation-control",
  ].includes(x)));
});
