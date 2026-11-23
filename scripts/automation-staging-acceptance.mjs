#!/usr/bin/env node
/**
 * Opt-in, bounded Automation v1 acceptance against a separately configured
 * Supabase staging project. No production calls, deployments, webhooks,
 * worker ticks, schedules, credentials in logs or automatic retries.
 */
import {randomUUID} from "node:crypto";
import {ETERNYX_PRODUCTION_REF} from "./automation-staging-db-readonly.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {getWorkflowPreset,runLocalWorkflow} from "../src/lib/automationWorkflow.mjs";
import {parseAutomationControlRequest,UUID_RE} from "../supabase/functions/_shared/automation-control-contract.mjs";

const PROJECT_REF=/^[a-z]{20}$/;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const TEST_INPUT="  Bravo \nBravo\n Alpha ";
const TEST_STEPS=getWorkflowPreset("sort");
const EXPECTED=runLocalWorkflow(TEST_INPUT,TEST_STEPS);
const WRITE_CONSENT="I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN";
const LIMIT=120000;
function fail(code){throw Error("staging_"+code);}
function correctUuid(value){return typeof value==="string"&&UUID_RE.test(value);}
function get(value,name){
  if(typeof value!=="string"||!value.trim())fail(name+"_missing");
  return value.trim();
}
export function validateConfiguration(env,mode,confirmed){
  if(!["inspect","execute"].includes(mode))fail("mode_invalid");
  const staging=get(env.ETERNYX_STAGING_PROJECT_REF,"staging_ref");
  const production=get(env.ETERNYX_PRODUCTION_PROJECT_REF,"production_ref");
  if(!PROJECT_REF.test(staging)||!PROJECT_REF.test(production)||
     production!==ETERNYX_PRODUCTION_REF||staging===ETERNYX_PRODUCTION_REF||
     staging===production){
    fail("project_boundary");
  }
  if(env.ETERNYX_STAGING_ENVIRONMENT_CLASS!=="isolated-test-project")fail("not_isolated");
  const key=get(env.ETERNYX_STAGING_PUBLISHABLE_KEY,"publishable_key");
  if(!key.startsWith("sb_publishable_")||key.length>250)fail("unsafe_api_key");
  const jwtA=get(env.ETERNYX_STAGING_OWNER_A_JWT,"owner_a");
  const jwtB=get(env.ETERNYX_STAGING_OWNER_B_JWT,"owner_b");
  if(!JWT.test(jwtA)||!JWT.test(jwtB)||jwtA===jwtB)fail("owner_credentials");
  if(mode==="execute"&&(!confirmed||env.ETERNYX_STAGING_EXECUTION_CONSENT!==WRITE_CONSENT)){
    fail("explicit_write_consent_required");
  }
  return {ref:staging,key,jwtA,jwtB,mode,
    functionsUrl:"https://"+staging+".supabase.co/functions/v1/automation-control",
    authUrl:"https://"+staging+".supabase.co/auth/v1/user"};
}
function safeList(data){
  if(!data||typeof data!=="object"||Array.isArray(data)||
     data.source!=="authenticated_server"||!Array.isArray(data.workflows)||
     data.workflows.length>20)fail("workflow_list_unverified");
  const ids=new Set();
  for(const w of data.workflows){
    if(!w||!correctUuid(w.id)||typeof w.name!=="string"||
      !Number.isSafeInteger(w.revision)||w.revision<1||
      typeof w.active!=="boolean"||w.trigger_kind!=="manual"||ids.has(w.id)){
      fail("workflow_record_invalid");
    }
    ids.add(w.id);
  }
  return data.workflows;
}
function safeHistory(data){
  if(!data||typeof data!=="object"||Array.isArray(data)||
     data.source!=="authenticated_server"||
     data.rawInputsStored!==false||data.rawOutputsStored!==false||
     !Array.isArray(data.runs)||data.runs.length>20)fail("run_history_unverified");
  const ids=new Set();
  for(const row of data.runs){
    if(!row||!correctUuid(row.id)||ids.has(row.id)||row.status!=="completed"||
       !Array.isArray(row.trace)||row.trace.length>12||
       !Number.isSafeInteger(row.output_lines)||row.output_lines<0||
       !(row.workflow_id===null||correctUuid(row.workflow_id))||typeof row.created_at!=="string"||
       !Number.isFinite(Date.parse(row.created_at))||
       ["input","output","raw_input","raw_output","input_ciphertext","output_ciphertext"].some(k=>k in row)||
       row.trace.some(t=>!t||typeof t!=="object"||
         ["input","output","raw_input","raw_output"].some(k=>k in t))){
      fail("history_record_invalid");
    }
    ids.add(row.id);
  }
  return data.runs;
}
export function assertAccountBoundaries(a,b){
  const aWork=new Set(a.workflows.map(x=>x.id));
  const aRuns=new Set(a.runs.map(x=>x.id));
  if(b.workflows.some(x=>aWork.has(x.id))||b.runs.some(x=>aRuns.has(x.id))){
    fail("owner_isolation");
  }
}
async function parseBounded(res){
  const hint=res.headers?.get?.("content-length");
  if(hint!==null && hint!==undefined){
    if(!/^\d+$/.test(hint)||!Number.isSafeInteger(Number(hint)))fail("invalid_response");
    if(Number(hint)>LIMIT)fail("response_too_large");
  }
  if(!res.body||typeof res.body.getReader!=="function")fail("invalid_response");
  const reader=res.body.getReader();
  const chunks=[];
  let total=0;
  try{
    for(;;){
      const item=await reader.read();
      if(item.done)break;
      if(!(item.value instanceof Uint8Array))fail("invalid_response");
      total+=item.value.byteLength;
      if(total>LIMIT)fail("response_too_large");
      chunks.push(item.value);
    }
  }catch(e){
    if(e instanceof Error && /^staging_[a-z_]+$/.test(e.message))throw e;
    fail("invalid_response");
  }finally{
    await reader.cancel().catch(()=>undefined);
  }
  try{
    const bytes=new Uint8Array(total);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const result=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
    if(!result||typeof result!=="object"||Array.isArray(result))fail("invalid_response");
    return result;
  }catch{fail("invalid_response");}
}
export function createTransport(config,fetcher=fetch){
  async function send(url,method,jwt,body){
    const headers={apikey:config.key,Authorization:"Bearer "+jwt,Accept:"application/json"};
    if(method==="POST")headers["Content-Type"]="application/json";
    let res;
    try{
      res=await fetcher(url,{method,headers,redirect:"error",
        cache:"no-store",signal:AbortSignal.timeout(12000),
        ...(body?{body:JSON.stringify(body)}:{})});
    }catch{fail("transport_unavailable");}
    if(!res||!Number.isInteger(res.status))fail("transport_invalid");
    return res;
  }
  async function identity(jwt){
    const res=await send(config.authUrl,"GET",jwt);
    if(res.status!==200)fail("authentication_failed");
    const raw=await parseBounded(res);
    if(!correctUuid(raw.id)||raw.is_anonymous!==false)fail("identity_unverified");
    return raw.id;
  }
  async function action(jwt,body){
    if(!parseAutomationControlRequest(body).ok)fail("client_contract_invalid");
    const res=await send(config.functionsUrl,"POST",jwt,body);
    if(res.status!==200)fail("action_http_"+res.status);
    return parseBounded(res);
  }
  async function expectDenied(jwt,body){
    if(!parseAutomationControlRequest(body).ok)fail("client_contract_invalid");
    const res=await send(config.functionsUrl,"POST",jwt,body);
    if(res.status!==404)fail("cross_account_run_not_denied");
    // Deliberately never display or forward private error bodies.
  }
  return {identity,action,expectDenied};
}
export async function runAcceptance(config,{fetcher=fetch,uuid=randomUUID}={}){
  const transport=createTransport(config,fetcher);
  // Authenticate two distinct nonanonymous, owner-scoped test accounts BEFORE writes.
  const [userA,userB]=await Promise.all([
    transport.identity(config.jwtA),transport.identity(config.jwtB),
  ]);
  if(userA===userB)fail("same_owner");
  async function snapshot(jwt){
    const [w,h]=await Promise.all([
      transport.action(jwt,{action:"list"}),
      transport.action(jwt,{action:"history"}),
    ]);
    return {workflows:safeList(w),runs:safeHistory(h)};
  }
  const [beforeA,beforeB]=await Promise.all([snapshot(config.jwtA),snapshot(config.jwtB)]);
  assertAccountBoundaries(beforeA,beforeB);
  if(config.mode==="inspect"){
    return {mode:"inspect",result:"staging_read_only_verified",
      independentAccounts:2,ownerIsolationBetweenListedRecords:true,
      stagingManualRunVerified:false,mutationsPerformed:0,cleanupVerified:false,
      productionReady:false,releaseAuthorized:false,externalIntegrationTriggered:false};
  }
  const identifier=uuid();
  if(!correctUuid(identifier))fail("invalid_generated_uuid");
  const name="ETERNYX staging acceptance "+identifier.slice(0,8);
  let createdId=null;
  let saveAttempted=false;
  let error=null;
  let runId=null;
  let cleanupVerified=false;
  try{
    saveAttempted=true;
    const saved=await transport.action(config.jwtA,{action:"save",name,steps:TEST_STEPS});
    if(saved.ok!==true||!correctUuid(saved.workflow_id))fail("save_not_confirmed");
    createdId=saved.workflow_id;
    const afterSave=await snapshot(config.jwtA);
    if(afterSave.workflows.filter(x=>x.id===createdId&&x.name===name&&x.active===true).length!==1||
       beforeA.workflows.some(x=>x.id===createdId))fail("save_not_visible");
    const bList=safeList(await transport.action(config.jwtB,{action:"list"}));
    if(bList.some(x=>x.id===createdId))fail("foreign_workflow_visible");
    const runKey=uuid();
    if(!correctUuid(runKey)||runKey===identifier)fail("invalid_generated_uuid");
    const req={action:"run",workflowId:createdId,input:TEST_INPUT,requestKey:runKey};
    const first=await transport.action(config.jwtA,req);
    if(first.source!=="authenticated_server"||first.executedManually!==true||
       first.replayed!==false||!correctUuid(first.runId)||
       first.output!==EXPECTED.output||first.outputLines!==EXPECTED.outputLines||
       !Array.isArray(first.trace)||first.trace.length!==TEST_STEPS.length){
      fail("manual_run_unverified");
    }
    runId=first.runId;
    const again=await transport.action(config.jwtA,req);
    if(again.source!=="authenticated_server"||again.executedManually!==true||
       again.replayed!==true||again.runId!==runId||again.output!==EXPECTED.output){
      fail("idempotent_replay_unverified");
    }
    await transport.expectDenied(config.jwtB,req);
    const [finalA,finalB]=await Promise.all([snapshot(config.jwtA),snapshot(config.jwtB)]);
    assertAccountBoundaries(finalA,finalB);
    if(finalA.runs.filter(x=>x.id===runId&&x.workflow_id===createdId&&
      x.output_lines===EXPECTED.outputLines&&
      x.trigger_type==="manual").length!==1||
       finalB.runs.some(x=>x.id===runId||x.workflow_id===createdId)){
      fail("persisted_history_unverified");
    }
    // The final report never stores or prints IDs, JWTs, raw inputs or outputs.
  }catch(e){
    error=e;
    // A server can commit "save" even when the HTTP response is lost.
    // Discover only the newly created, *exactly named* owner-A workflow.
    // Never delete an ambiguous match or a preexisting workflow.
    if(saveAttempted&&!createdId){
      try{
        const visible=safeList(await transport.action(config.jwtA,{action:"list"}));
        const before=new Set(beforeA.workflows.map(w=>w.id));
        const candidates=visible.filter(w=>w.name===name&&!before.has(w.id));
        if(candidates.length===1)createdId=candidates[0].id;
        if(candidates.length>1)error=Error("staging_ambiguous_created_workflow");
      }catch{
        error=Error("staging_ambiguous_save_cleanup_unavailable");
      }
    }
  }
  if(createdId){
    try{
      const deleted=await transport.action(config.jwtA,{action:"delete",workflowId:createdId});
      if(deleted.ok!==true)fail("cleanup_unconfirmed");
      const after=safeList(await transport.action(config.jwtA,{action:"list"}));
      if(after.some(x=>x.id===createdId))fail("cleanup_unconfirmed");
      cleanupVerified=true;
    }catch{error=Error("staging_cleanup_failed");}
  }
  if(error)throw error;
  if(!runId||!cleanupVerified)fail("acceptance_incomplete");
  return {mode:"execute",result:"isolated_staging_manual_flow_verified",
    independentAccounts:2,ownerIsolationBetweenListedRecords:true,
    stagingManualRunVerified:true,idempotentReplayVerified:true,
    foreignOwnerDenied:true,persistedPrivateHistoryVerified:true,
    temporaryWorkflowCleanupVerified:true,mutationsPerformed:3,
    productionReady:false,releaseAuthorized:false,externalIntegrationTriggered:false};
}
function parseArgs(args){
  if(args.length!==1&&!(args.length===2&&args.includes("--confirm-isolated-staging"))){
    fail("arguments_invalid");
  }
  const execute=args.includes("--execute");
  const inspect=args.includes("--inspect");
  if(execute===inspect)fail("arguments_invalid");
  const confirmed=args.includes("--confirm-isolated-staging");
  if(inspect&&confirmed)fail("arguments_invalid");
  return {mode:execute?"execute":"inspect",confirmed};
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  (async()=>{
    const {mode,confirmed}=parseArgs(process.argv.slice(2));
    const config=validateConfiguration(process.env,mode,confirmed);
    const report=await runAcceptance(config);
    process.stdout.write(JSON.stringify(report,null,2)+"\n");
  })().catch(e=>{
    const code=e instanceof Error&&/^staging_[a-z0-9_]+$/.test(e.message)
      ?e.message:"staging_validation_unavailable";
    process.stderr.write("Automation staging acceptance blocked: "+code+"\n");
    process.exitCode=1;
  });
}
