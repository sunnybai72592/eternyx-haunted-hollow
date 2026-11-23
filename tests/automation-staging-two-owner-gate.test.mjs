import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {validateTwoOwnerGate,checkTwoOwnerEvidence}
  from "../scripts/automation-staging-two-owner-gate.mjs";
import {validateConfiguration,runAcceptance}
  from "../scripts/automation-staging-acceptance.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const STAGE="abcdefghijklmnopqrst";
const PROD="wcncuarekaofmfurbtbh";
const consent="I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN";
const env=(extra={})=>({
  ETERNYX_AUTOMATION_STAGING_REF:STAGE,
  ETERNYX_AUTOMATION_PRODUCTION_REF:PROD,
  ETERNYX_AUTOMATION_TWO_OWNER_MODE:"INSPECT_ONLY",
  ETERNYX_AUTOMATION_TWO_OWNER_REVIEW:"STAGING_TEST_ACCOUNTS_REVIEWED",
  ETERNYX_AUTOMATION_TWO_OWNER_WRITE_CONSENT:"NOT_APPROVED",
  ...extra,
});
const jwtA="eyJhbGciOiJIUzI1NiJ9.AAA.abcdef0123456789";
const jwtB="eyJhbGciOiJIUzI1NiJ9.BBB.abcdef0123456789";
const config=()=>({
  ETERNYX_STAGING_PROJECT_REF:STAGE,
  ETERNYX_PRODUCTION_PROJECT_REF:PROD,
  ETERNYX_STAGING_ENVIRONMENT_CLASS:"isolated-test-project",
  ETERNYX_STAGING_PUBLISHABLE_KEY:"sb_publishable_OFFLINE_ONLY",
  ETERNYX_STAGING_OWNER_A_JWT:jwtA,
  ETERNYX_STAGING_OWNER_B_JWT:jwtB,
});
const inspectReceipt=()=>({
  mode:"inspect",result:"staging_read_only_verified",
  independentAccounts:2,ownerIsolationBetweenListedRecords:true,
  stagingManualRunVerified:false,mutationsPerformed:0,cleanupVerified:false,
  productionReady:false,releaseAuthorized:false,externalIntegrationTriggered:false,
});
const writeReceipt=()=>({
  mode:"execute",result:"isolated_staging_manual_flow_verified",
  independentAccounts:2,ownerIsolationBetweenListedRecords:true,
  stagingManualRunVerified:true,idempotentReplayVerified:true,
  foreignOwnerDenied:true,persistedPrivateHistoryVerified:true,
  temporaryWorkflowCleanupVerified:true,mutationsPerformed:3,
  productionReady:false,releaseAuthorized:false,externalIntegrationTriggered:false,
});

test("default consent means inspect only and never an implicit staging mutation",()=>{
  const gate=validateTwoOwnerGate(env());
  assert.equal(gate.mode,"inspect");
  assert.equal(gate.productionTargetDenied,true);
  assert.equal(gate.writesAuthorizedByExplicitApproval,false);
  assert.equal(gate.projectVerifiedByThisCheck,false);
  assert.equal(gate.executed,false);
  assert.equal(gate.productionReady,false);
  assert.equal(checkTwoOwnerEvidence(inspectReceipt(),"inspect").manualWorkflowVerified,false);
});
test("one temporary workflow requires separate write consent and preserves retained history warning",()=>{
  assert.throws(()=>validateTwoOwnerGate(env({ETERNYX_AUTOMATION_TWO_OWNER_MODE:"ONE_TEMPORARY_WORKFLOW"})),
    /automation_two_owner_gate_explicit_staging_write_approval_missing/);
  const gate=validateTwoOwnerGate(env({
    ETERNYX_AUTOMATION_TWO_OWNER_MODE:"ONE_TEMPORARY_WORKFLOW",
    ETERNYX_AUTOMATION_TWO_OWNER_WRITE_CONSENT:consent,
  }));
  assert.equal(gate.writesAuthorizedByExplicitApproval,true);
  assert.equal(gate.persistedRunHistoryMayRemainAfterWorkflowDeletion,true);
  const result=checkTwoOwnerEvidence(writeReceipt(),"execute");
  assert.equal(result.singleWorkflowDeleted,true);
  assert.equal(result.persistedHistoryMayRemain,true);
  assert.equal(result.productionReady,false);
});
test("known production cannot pass even if declared production ref is spoofed",()=>{
  const hostile=[
    {ETERNYX_AUTOMATION_STAGING_REF:PROD},
    {ETERNYX_AUTOMATION_STAGING_REF:PROD,ETERNYX_AUTOMATION_PRODUCTION_REF:"zzzzzzzzzzzzzzzzzzzz"},
    {ETERNYX_AUTOMATION_PRODUCTION_REF:STAGE},
    {ETERNYX_AUTOMATION_STAGING_REF:"localhost"},
    {ETERNYX_AUTOMATION_STAGING_REF:"https://"+STAGE+".supabase.co"},
    {ETERNYX_AUTOMATION_STAGING_REF:""},
    {ETERNYX_AUTOMATION_TWO_OWNER_MODE:"SCHEDULE_TICK"},
    {ETERNYX_AUTOMATION_TWO_OWNER_REVIEW:"NOT_REVIEWED"},
    {ETERNYX_AUTOMATION_TWO_OWNER_WRITE_CONSENT:consent},
  ];
  for(const attempt of hostile)assert.throws(()=>validateTwoOwnerGate(env(attempt)));
});
test("negative evidence from missing cleanup, owner isolation or authenticated identities fails closed",()=>{
  for(const change of [
    {independentAccounts:1},{ownerIsolationBetweenListedRecords:false},
    {stagingManualRunVerified:true},{mutationsPerformed:1},
    {cleanupVerified:true},{productionReady:true},{releaseAuthorized:true},
    {externalIntegrationTriggered:true},{mode:"execute"},
  ])assert.throws(()=>checkTwoOwnerEvidence({...inspectReceipt(),...change},"inspect"));
  for(const change of [
    {stagingManualRunVerified:false},{idempotentReplayVerified:false},
    {foreignOwnerDenied:false},{persistedPrivateHistoryVerified:false},
    {temporaryWorkflowCleanupVerified:false},{mutationsPerformed:4},
    {productionReady:true},{releaseAuthorized:true},
  ])assert.throws(()=>checkTwoOwnerEvidence({...writeReceipt(),...change},"execute"));
  assert.throws(()=>checkTwoOwnerEvidence(inspectReceipt(),"execute"));
  assert.throws(()=>checkTwoOwnerEvidence(writeReceipt(),"inspect"));
});
test("actual local HTTP verifies both JWT identities and private list/history without ANY workflow writes",async()=>{
  const hits=[],idA="11111111-1111-4111-8111-111111111111";
  const idB="22222222-2222-4222-8222-222222222222";
  const server=createServer(async(req,res)=>{
    let body="";
    for await(const chunk of req)body+=chunk.toString("utf8");
    const token=req.headers.authorization?.slice("Bearer ".length);
    const owner=token===jwtA?"A":token===jwtB?"B":"invalid";
    hits.push({path:req.url,method:req.method,owner,body});
    const send=(result,status=200)=>{
      res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
      res.end(JSON.stringify(result));
    };
    if(owner==="invalid")return send({error:"not allowed"},401);
    if(req.url==="/auth/v1/user"&&req.method==="GET")
      return send({id:owner==="A"?idA:idB,is_anonymous:false});
    if(req.url!=="/functions/v1/automation-control"||req.method!=="POST")
      return send({error:"unexpected request"},405);
    let input={};
    try{input=JSON.parse(body);}catch{return send({error:"bad JSON"},400);}
    if(input.action==="list")return send({source:"authenticated_server",workflows:[]});
    if(input.action==="history")return send({
      source:"authenticated_server",rawInputsStored:false,
      rawOutputsStored:false,runs:[],
    });
    return send({error:"WRITE FORBIDDEN IN INSPECT FIXTURE"},403);
  });
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  try{
    const port=server.address().port;
    const result=await runAcceptance(validateConfiguration(config(),"inspect",false),{
      fetcher:(url,options)=>{
        const parsed=new URL(url);
        assert.equal(parsed.host,STAGE+".supabase.co");
        assert.ok(parsed.pathname==="/auth/v1/user"||
          parsed.pathname==="/functions/v1/automation-control");
        assert.equal(options.redirect,"error");
        assert.equal(options.cache,"no-store");
        assert.ok(!Object.hasOwn(options.headers,"service_role"));
        return fetch("http://127.0.0.1:"+port+parsed.pathname,options);
      },
    });
    assert.equal(hits.length,6);
    assert.deepEqual(hits.filter(x=>x.owner==="A").map(x=>x.path).sort(),[
      "/auth/v1/user","/functions/v1/automation-control",
      "/functions/v1/automation-control",
    ].sort());
    assert.equal(hits.filter(x=>x.owner==="B").length,3);
    assert.equal(hits.filter(x=>x.body!=="").length,4);
    assert.ok(hits.filter(x=>x.body!=="").every(x=>["list","history"].includes(JSON.parse(x.body).action)));
    assert.equal(result.mutationsPerformed,0);
    assert.equal(result.independentAccounts,2);
    assert.equal(result.ownerIsolationBetweenListedRecords,true);
    assert.equal(checkTwoOwnerEvidence(result,"inspect").manualWorkflowVerified,false);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test("manual workflow must verify exact healthy stage project and core functions BEFORE reading owner JWT secrets",async()=>{
  const w=await readFile(path.join(ROOT,".github/workflows/automation-staging-two-owner-http.yml"),"utf8");
  for(const marker of [
    "workflow_dispatch:","environment: automation-staging","github.ref == 'refs/heads/main'",
    "INSPECT_ONLY","ONE_TEMPORARY_WORKFLOW","STAGING_TEST_ACCOUNTS_REVIEWED",
    "I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN",
    "validateTwoOwnerGate","inspectStageProject","verifyDeployedCore",
    "automation-staging-fresh-auth.mjs", "mode=\"--inspect\"", "mode=\"--execute\"",
    "checkTwoOwnerEvidence","automation-two-owner-verified.json",
    "secrets.ETERNYX_AUTOMATION_STAGING_OWNER_A_EMAIL",
    "secrets.ETERNYX_AUTOMATION_STAGING_OWNER_A_PASSWORD",
    "secrets.ETERNYX_AUTOMATION_STAGING_OWNER_B_EMAIL",
    "secrets.ETERNYX_AUTOMATION_STAGING_OWNER_B_PASSWORD",
    "vars.ETERNYX_AUTOMATION_STAGING_PUBLISHABLE_KEY",
    "secrets.ETERNYX_AUTOMATION_STAGING_MANAGEMENT_TOKEN",
  ])assert.ok(w.includes(marker),marker);
  assert.doesNotMatch(w,/^\s+(?:push|pull_request|schedule):/m);
  assert.doesNotMatch(w,/supabase db push|functions deploy|migration repair|supabase secrets set/);
  const guardIndex=w.indexOf("Independently verify the exact separate staging project");
  const firstSecretIndex=w.indexOf("secrets.ETERNYX_AUTOMATION_STAGING_OWNER_A_PASSWORD");
  assert.ok(firstSecretIndex>guardIndex,"staging identity proof must run before owner JWTs enter a step");
  assert.match(w,/inputs\.run_mode == 'ONE_TEMPORARY_WORKFLOW' && inputs\.write_approval == 'I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN'/);
  assert.doesNotMatch(w,/secrets\.ETERNYX_AUTOMATION_STAGING_OWNER_[AB]_JWT/);
  assert.match(w,/authMethod,"fresh_staging_password_signin"/);
  assert.match(w,/freshSessions,2/);
  assert.doesNotMatch(w,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_PASSWORD/);
});
