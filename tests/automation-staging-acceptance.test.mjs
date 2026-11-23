import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {getWorkflowPreset,runLocalWorkflow} from "../src/lib/automationWorkflow.mjs";
import {
  validateConfiguration,createTransport,runAcceptance,
  assertAccountBoundaries,
} from "../scripts/automation-staging-acceptance.mjs";

const stagingRef="abcdefghijklmnopqrst";
const productionRef="wcncuarekaofmfurbtbh";
const jwt=n=>"eyJhbGciOiJIUzI1NiJ9."+n+".abcdef0123456789";
const uidA="11111111-1111-4111-8111-111111111111";
const uidB="22222222-2222-4222-8222-222222222222";
const workflowId="33333333-3333-4333-8333-333333333333";
const runId="44444444-4444-4444-8444-444444444444";
const uniqueId="55555555-5555-4555-8555-555555555555";
const requestKey="66666666-6666-4666-8666-666666666666";
const env={
  ETERNYX_STAGING_PROJECT_REF:stagingRef,
  ETERNYX_PRODUCTION_PROJECT_REF:productionRef,
  ETERNYX_STAGING_ENVIRONMENT_CLASS:"isolated-test-project",
  ETERNYX_STAGING_PUBLISHABLE_KEY:"sb_publishable_TESTONLY_NOT_A_SECRET",
  ETERNYX_STAGING_OWNER_A_JWT:jwt("AAA"),
  ETERNYX_STAGING_OWNER_B_JWT:jwt("BBB"),
};
const consent="I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN";
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
function makeBackend({wrongOwner=false,failRun=false,leakOutput=false,failSaveResponse=false,ambiguousSave=false}={}){
  const calls=[];
  let saved=false,deleted=false,completed=false;
  let runCalls=0,denied=0;
  const fetcher=async(url,options)=>{
    const owner=options.headers.Authorization==="Bearer "+env.ETERNYX_STAGING_OWNER_A_JWT?"a":"b";
    const expectedBase="https://"+stagingRef+".supabase.co";
    assert.ok(url.startsWith(expectedBase+"/"),"must use exact staging project");
    assert.equal(options.redirect,"error");
    assert.equal(options.cache,"no-store");
    assert.ok(!("service_role" in options.headers));
    assert.ok(options.headers.apikey.startsWith("sb_publishable_"));
    if(url.endsWith("/auth/v1/user")){
      assert.equal(options.method,"GET");
      calls.push(owner+":identity");
      return json({id:owner==="a"?uidA:uidB,is_anonymous:false});
    }
    assert.equal(url,expectedBase+"/functions/v1/automation-control");
    assert.equal(options.method,"POST");
    const body=JSON.parse(options.body);
    calls.push(owner+":"+body.action);
    if(body.action==="list")return json({source:"authenticated_server",workflows:
      saved&&!deleted&&owner==="a"?[{
        id:workflowId,name:"ETERNYX staging acceptance "+uniqueId.slice(0,8),
        revision:1,active:true,trigger_kind:"manual",
      },...(ambiguousSave?[{
        id:"77777777-7777-4777-8777-777777777777",
        name:"ETERNYX staging acceptance "+uniqueId.slice(0,8),
        revision:1,active:true,trigger_kind:"manual",
      }]:[])]:[]});
    if(body.action==="history")return json({
      source:"authenticated_server",rawInputsStored:false,rawOutputsStored:false,
      runs:completed&&owner==="a"?[{
        id:runId,workflow_id:workflowId,status:"completed",
        trigger_type:"manual",output_lines:2,
        created_at:"2026-11-23T15:30:00Z",
        trace:[{id:"p1",kind:"trim"},{id:"p2",kind:"remove_blanks"}],
        ...(leakOutput?{output:"should-not-be-in-history"}:{}),
      }]:[],
    });
    if(body.action==="save"){
      assert.equal(owner,"a");
      assert.ok(body.name.startsWith("ETERNYX staging acceptance "));
      assert.equal(body.steps.length,4);
      assert.equal(saved,false);
      saved=true;
      if(failSaveResponse)throw Error("Simulated connection lost after server committed a save");
      return json({ok:true,workflow_id:workflowId});
    }
    if(body.action==="run"){
      assert.equal(body.workflowId,workflowId);
      assert.equal(body.requestKey,requestKey);
      assert.equal(body.input,"  Bravo \nBravo\n Alpha ");
      if(owner==="b"){
        denied++;
        return wrongOwner?json({source:"authenticated_server",runId,output:"leaked"}):
          json({error:"not found"},404);
      }
      runCalls++;
      if(failRun)return json({error:"runtime unavailable"},503);
      completed=true;
      return json({
        source:"authenticated_server",executedManually:true,
        replayed:runCalls>1,runId,
        output:runLocalWorkflow(body.input,getWorkflowPreset("sort")).output,
        outputLines:2,trace:Array.from({length:4},(_,i)=>({id:"p"+(i+1)})),
      });
    }
    if(body.action==="delete"){
      assert.equal(owner,"a");
      assert.equal(body.workflowId,workflowId);
      deleted=true;return json({ok:true,workflow_id:workflowId});
    }
    throw Error("unexpected endpoint "+body.action);
  };
  return {calls,fetcher,state:()=>({saved,deleted,completed,runCalls,denied})};
}
const uuid=(()=>{let count=0;return ()=>[uniqueId,requestKey][count++]??"invalid"})();

test("both read and execute modes reject missing or production project, privileged keys and absent consent",()=>{
  assert.throws(()=>validateConfiguration({}, "inspect",false),/staging_ref_missing/);
  assert.throws(()=>validateConfiguration({...env,ETERNYX_STAGING_PROJECT_REF:productionRef},"inspect",false),/staging_project_boundary/);
  assert.throws(()=>validateConfiguration({...env,ETERNYX_STAGING_PUBLISHABLE_KEY:"sb_secret_unsafe"},"inspect",false),/staging_unsafe_api_key/);
  assert.throws(()=>validateConfiguration({...env,ETERNYX_STAGING_ENVIRONMENT_CLASS:"production"},"inspect",false),/staging_not_isolated/);
  assert.throws(()=>validateConfiguration({...env,ETERNYX_STAGING_OWNER_B_JWT:env.ETERNYX_STAGING_OWNER_A_JWT},"inspect",false),/staging_owner_credentials/);
  assert.throws(()=>validateConfiguration(env,"execute",false),/staging_explicit_write_consent_required/);
  assert.throws(()=>validateConfiguration({...env,ETERNYX_STAGING_EXECUTION_CONSENT:"yes"},"execute",true),/staging_explicit_write_consent_required/);
  const yes=validateConfiguration({...env,ETERNYX_STAGING_EXECUTION_CONSENT:consent},"execute",true);
  assert.equal(yes.mode,"execute");
  assert.equal(yes.functionsUrl,"https://"+stagingRef+".supabase.co/functions/v1/automation-control");
});
test("default inspect mode only reads identities, workflows and history for two owners",async()=>{
  const backend=makeBackend();
  const config=validateConfiguration(env,"inspect",false);
  const result=await runAcceptance(config,{fetcher:backend.fetcher});
  assert.equal(result.stagingManualRunVerified,false);
  assert.equal(result.mutationsPerformed,0);
  assert.equal(result.productionReady,false);
  assert.equal(result.releaseAuthorized,false);
  assert.equal(result.independentAccounts,2);
  assert.deepEqual(backend.calls.filter(x=>/(save|run|delete|webhook|schedule)/.test(x)),[]);
});
test("explicit isolated staging uses exactly one new workflow, one persisted run, replay, cross-owner denial, and deletes its workflow",async()=>{
  const backend=makeBackend();
  const config=validateConfiguration({...env,ETERNYX_STAGING_EXECUTION_CONSENT:consent},"execute",true);
  let i=0;
  const result=await runAcceptance(config,{fetcher:backend.fetcher,uuid:()=>[uniqueId,requestKey][i++]});
  assert.equal(result.result,"isolated_staging_manual_flow_verified");
  assert.equal(result.stagingManualRunVerified,true);
  assert.equal(result.idempotentReplayVerified,true);
  assert.equal(result.foreignOwnerDenied,true);
  assert.equal(result.temporaryWorkflowCleanupVerified,true);
  assert.equal(result.productionReady,false);
  assert.equal(result.externalIntegrationTriggered,false);
  assert.deepEqual(backend.state(),{saved:true,deleted:true,completed:true,runCalls:2,denied:1});
  assert.equal(backend.calls.filter(x=>x==="a:save").length,1);
  assert.equal(backend.calls.filter(x=>x==="a:delete").length,1);
  assert.equal(backend.calls.filter(x=>x==="b:run").length,1);
  assert.doesNotMatch(JSON.stringify(result),/Bearer|sb_publishable_|auth\/v1|input|output|workflowId|runId|userId/i);
});
test("failure of staging run still attempts cleanup; no false success",async()=>{
  const backend=makeBackend({failRun:true});
  const config=validateConfiguration({...env,ETERNYX_STAGING_EXECUTION_CONSENT:consent},"execute",true);
  let i=0;
  await assert.rejects(runAcceptance(config,{fetcher:backend.fetcher,
    uuid:()=>[uniqueId,requestKey][i++]}),/staging_action_http_503/);
  assert.equal(backend.state().deleted,true);
});
test("cross-owner access returning 200 blocks acceptance and still cleans up",async()=>{
  const backend=makeBackend({wrongOwner:true});
  const config=validateConfiguration({...env,ETERNYX_STAGING_EXECUTION_CONSENT:consent},"execute",true);
  let i=0;
  await assert.rejects(runAcceptance(config,{fetcher:backend.fetcher,
    uuid:()=>[uniqueId,requestKey][i++]}),/staging_cross_account_run_not_denied/);
  assert.equal(backend.state().deleted,true);
});
test("history containing raw output blocks acceptance and still cleans up",async()=>{
  const backend=makeBackend({leakOutput:true});
  const config=validateConfiguration({...env,ETERNYX_STAGING_EXECUTION_CONSENT:consent},"execute",true);
  let i=0;
  await assert.rejects(runAcceptance(config,{fetcher:backend.fetcher,
    uuid:()=>[uniqueId,requestKey][i++]}),/staging_history_record_invalid/);
  assert.equal(backend.state().deleted,true);
});
test("reject history overlap and never construct arbitrary hosts or send worker/webhook commands",async()=>{
  assert.throws(()=>assertAccountBoundaries({
    workflows:[{id:workflowId}],runs:[],
  },{workflows:[{id:workflowId}],runs:[]}),/staging_owner_isolation/);
  const src=await readFile(new URL("../scripts/automation-staging-acceptance.mjs",import.meta.url),"utf8");
  assert.match(src,/runAcceptance\(/);
  assert.match(src,/--confirm-isolated-staging/);
  assert.match(src,/staging_cleanup_failed/);
  assert.doesNotMatch(src,/functions\/v1\/automation-webhook|functions\/v1\/automation-scheduler-worker|\/rest\/v1\//);
});
test("invalid HTTP responses block without returning untrusted errors or secrets",async()=>{
  const config=validateConfiguration(env,"inspect",false);
  const transport=createTransport(config,async()=>new Response("some-private-token", {status:502}));
  await assert.rejects(transport.identity(env.ETERNYX_STAGING_OWNER_A_JWT),/staging_authentication_failed/);
});

test("an ambiguously committed save is rediscovered only by exact owner-owned new name and cleaned up",async()=>{
  const backend=makeBackend({failSaveResponse:true});
  const config=validateConfiguration({...env,ETERNYX_STAGING_EXECUTION_CONSENT:consent},"execute",true);
  await assert.rejects(runAcceptance(config,{
    fetcher:backend.fetcher,uuid:()=>uniqueId,
  }),/staging_transport_unavailable/);
  const after=backend.state();
  assert.equal(after.saved,true);
  assert.equal(after.deleted,true);
  assert.equal(after.runCalls,0);
  assert.equal(backend.calls.filter(x=>x==="a:delete").length,1);
});
test("multiple newly created matching workflows trigger manual intervention, never unsafe deletion",async()=>{
  const backend=makeBackend({failSaveResponse:true,ambiguousSave:true});
  const config=validateConfiguration({...env,ETERNYX_STAGING_EXECUTION_CONSENT:consent},"execute",true);
  await assert.rejects(runAcceptance(config,{
    fetcher:backend.fetcher,uuid:()=>uniqueId,
  }),/staging_ambiguous_created_workflow/);
  assert.equal(backend.state().deleted,false);
  assert.equal(backend.calls.filter(x=>x==="a:delete").length,0);
});
test("staging hard-denies known production even if caller attempts to falsify the declared production project",()=>{
  for(const change of [
    {ETERNYX_PRODUCTION_PROJECT_REF:"abcdefghijklmnopqrst"},
    {ETERNYX_PRODUCTION_PROJECT_REF:"bbbbbbbbbbbbbbbbbbbb"},
    {ETERNYX_PRODUCTION_PROJECT_REF:productionRef,
      ETERNYX_STAGING_PROJECT_REF:productionRef},
  ])assert.throws(()=>validateConfiguration({...env,...change},"inspect",false),
    /staging_project_boundary/);
});
test("untrusted oversized streamed HTTP body and malformed Content-Length are rejected before JSON decoding",async()=>{
  const config=validateConfiguration(env,"inspect",false);
  const big=ReadableStream.from
    ?ReadableStream.from([new Uint8Array(120001)]):
      new ReadableStream({start(controller){controller.enqueue(new Uint8Array(120001));controller.close();}});
  const transport=createTransport(config,async()=>new Response(big,{
    status:200,headers:{"content-type":"application/json"},
  }));
  await assert.rejects(transport.identity(env.ETERNYX_STAGING_OWNER_A_JWT),/staging_response_too_large/);
  const invalid=createTransport(config,async()=>new Response('{"id":"ignored"}',{
    status:200,headers:{"content-length":"NaN","content-type":"application/json"},
  }));
  await assert.rejects(invalid.identity(env.ETERNYX_STAGING_OWNER_A_JWT),/staging_invalid_response/);
  const rejected=createTransport(config,async()=>new Response(new Uint8Array([0xff,0xfe]),{
    status:200,headers:{"content-type":"application/json"},
  }));
  await assert.rejects(rejected.identity(env.ETERNYX_STAGING_OWNER_A_JWT),/staging_invalid_response/);
});
