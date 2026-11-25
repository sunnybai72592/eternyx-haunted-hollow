// Explicitly approved, staging-only signed webhook acceptance with two real owners.
// Uses only a publishable key, account JWTs and a newly issued ephemeral signing key.
import {randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {freshStageSignIn} from "./automation-staging-fresh-auth.mjs";
import {createTransport,validateConfiguration,runAcceptance} from "./automation-staging-acceptance.mjs";
import {signWebhookRequest} from "../supabase/functions/_shared/automation-webhook-crypto.mjs";
import {getWorkflowPreset,runLocalWorkflow} from "../src/lib/automationWorkflow.mjs";
const STAGE="mhodwvypfbxafamkrgsk",PROD="wcncuarekaofmfurbtbh";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INPUT="  Bravo \nBravo\n Alpha ";
const STEPS=getWorkflowPreset("sort"),EXPECTED=runLocalWorkflow(INPUT,STEPS);
const fail=code=>{throw Error("automation_signed_stage_"+code);};
const ok=(data,code)=>{if(data?.ok!==true)fail(code);return data;};
export function validateSignedConsent(env){
 if(env.ETERNYX_AUTOMATION_STAGING_REF!==STAGE||env.ETERNYX_AUTOMATION_PRODUCTION_REF!==PROD||
 env.ETERNYX_AUTOMATION_TWO_OWNER_MODE!=="ONE_TEMPORARY_WORKFLOW"||
 env.ETERNYX_AUTOMATION_TWO_OWNER_REVIEW!=="STAGING_TEST_ACCOUNTS_REVIEWED"||
 env.ETERNYX_AUTOMATION_TWO_OWNER_WRITE_CONSENT!=="I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN"||
 env.ETERNYX_AUTOMATION_SIGNED_CONSENT!=="I_APPROVE_ONE_STAGING_SIGNED_WEBHOOK")fail("consent");
}
async function bounded(response){
 if(!response.body?.getReader)fail("response");
 const reader=response.body.getReader(),parts=[];let count=0;
 try{for(;;){const x=await reader.read();if(x.done)break;if(!(x.value instanceof Uint8Array))fail("response");count+=x.value.length;if(count>120000)fail("response_limit");parts.push(x.value);}}
 finally{await reader.cancel().catch(()=>undefined);}
 try{const data=JSON.parse(Buffer.concat(parts).toString("utf8"));if(!data||typeof data!=="object"||Array.isArray(data))fail("response");return data;}catch{fail("response");}
}
export async function signedDelivery({triggerId,key,requestId,input,timestamp,fetcher=fetch,wrongSignature=false}){
 if(!UUID.test(triggerId)||!UUID.test(requestId)||typeof key!=="string"||!/^[a-f0-9]{64}$/.test(key)||! /^\d{10}$/.test(timestamp))fail("envelope");
 const body=JSON.stringify({triggerId,input});
 let signature=await signWebhookRequest(key,timestamp,requestId,body);
 if(wrongSignature)signature=(signature[0]==="0"?"1":"0")+signature.slice(1);
 let response;
 try{response=await fetcher("https://"+STAGE+".supabase.co/functions/v1/automation-webhook",{
 method:"POST",redirect:"error",credentials:"omit",cache:"no-store",signal:AbortSignal.timeout(12000),
 headers:{"Content-Type":"application/json",Accept:"application/json","x-eternyx-timestamp":timestamp,"x-eternyx-request-id":requestId,"x-eternyx-signature":"sha256="+signature},body});}
 catch{fail("network");}
 if(!Number.isInteger(response?.status)||response.headers?.get("location")!==null)fail("response");
 return {status:response.status,data:await bounded(response)};
}
export async function runSignedAcceptance(env,{fetcher=fetch,uuid=randomUUID,now=()=>Math.floor(Date.now()/1000)}={}){
 validateSignedConsent(env);
 const session=await freshStageSignIn(env,fetcher,{now:now()});
 if(session.stagingRef!==STAGE)fail("target");
 const config=validateConfiguration({ETERNYX_STAGING_PROJECT_REF:STAGE,ETERNYX_PRODUCTION_PROJECT_REF:PROD,
 ETERNYX_STAGING_ENVIRONMENT_CLASS:"isolated-test-project",ETERNYX_STAGING_PUBLISHABLE_KEY:session.publicKey,
 ETERNYX_STAGING_OWNER_A_JWT:session.jwtA,ETERNYX_STAGING_OWNER_B_JWT:session.jwtB},"inspect",false);
 await runAcceptance(config,{fetcher});
 const transport=createTransport(config,fetcher),a=body=>transport.action(session.jwtA,body),b=body=>transport.action(session.jwtB,body);
 const list=async action=>{const result=await action({action:"list"});if(result.source!=="authenticated_server"||!Array.isArray(result.workflows))fail("list");return result.workflows;};
 const hooks=async action=>{const result=await action({action:"webhooks"});if(result.source!=="authenticated_server"||!Array.isArray(result.triggers))fail("webhooks");return result.triggers;};
 const history=async action=>{const result=await action({action:"history"});if(result.source!=="authenticated_server"||result.rawInputsStored!==false||result.rawOutputsStored!==false||!Array.isArray(result.runs))fail("history");return result.runs;};
 const [beforeA,beforeB,hooksA,hooksB]=await Promise.all([list(a),list(b),hooks(a),hooks(b)]);
 if(beforeA.length||beforeB.length||hooksA.length||hooksB.length)fail("dedicated_empty_workflows_required");
 const name="ETERNYX signed acceptance "+uuid();
 let workflowId,triggerId,key,runId,error,saveAttempted=false,cleanup=false;
 try{
  saveAttempted=true;
  const saved=ok(await a({action:"save",name,steps:STEPS}),"save");
  if(!UUID.test(saved.workflow_id))fail("save_identity");workflowId=saved.workflow_id;
  if(!(await list(a)).some(w=>w.id===workflowId&&w.name===name)||(await list(b)).some(w=>w.id===workflowId))fail("owner_isolation");
  ok(await a({action:"setWorkflowPolicy",workflowId,maxInputCharacters:64,maxOutputCharacters:64,dailyRunLimit:2,allowWebhook:true,allowSchedule:false}),"policy");
  const policy=await a({action:"workflowPolicy",workflowId});
  if(policy.webhookSecretConfigured!==true||policy.scheduleSecretConfigured!==true||policy.approvalSecretConfigured!==true||policy.schedulerConfigEnabled!==false)fail("configuration");
  const created=ok(await a({action:"createWebhook",workflowId}),"create_webhook");
  if(!UUID.test(created.triggerId)||created.workflowId!==workflowId||created.enabled!==false||! /^[a-f0-9]{64}$/.test(created.signingKey))fail("trigger_identity");
  triggerId=created.triggerId;key=created.signingKey;
  await transport.expectDenied(session.jwtB,{action:"toggleWebhook",triggerId,enabled:true});
  if((await hooks(b)).some(h=>h.id===triggerId))fail("foreign_trigger_visible");
  ok(await a({action:"toggleWebhook",triggerId,enabled:true}),"enable");
  const deliver=(requestId,input=INPUT,wrongSignature=false)=>signedDelivery({triggerId,key,requestId,input,timestamp:String(now()),fetcher,wrongSignature});
  if((await deliver(uuid(),INPUT,true)).status!==401)fail("bad_signature_not_denied");
  const requestId=uuid(),first=await deliver(requestId);
  if(first.status!==200||first.data.source!=="authenticated_webhook"||first.data.replayed!==false||first.data.output!==EXPECTED.output||first.data.outputLines!==EXPECTED.outputLines||!UUID.test(first.data.runId))fail("signed_result");
  runId=first.data.runId;
  const replay=await deliver(requestId);
  if(replay.status!==200||replay.data.replayed!==true||replay.data.runId!==runId||replay.data.output!==EXPECTED.output)fail("replay");
  const conflict=await deliver(requestId,"different input");
  if(conflict.status!==409||conflict.data.code!=="idempotency_conflict")fail("conflict");
  const oversized=await deliver(uuid(),"x".repeat(65));
  if(oversized.status!==413||oversized.data.code!=="policy_input_limit")fail("input_policy");
  const [owned,foreign]=await Promise.all([history(a),history(b)]);
  if(owned.filter(r=>r.id===runId&&r.workflow_id===workflowId&&r.trigger_type==="webhook"&&r.status==="completed").length!==1||
     owned.filter(r=>r.workflow_id===workflowId).length!==1||foreign.some(r=>r.id===runId||r.workflow_id===workflowId))fail("durable_private_history");
  ok(await a({action:"toggleWebhook",triggerId,enabled:false}),"disable");
  if((await deliver(uuid())).status!==401)fail("revoked_trigger");
 }catch(e){error=e;}
 // Discover only the uniquely named newly created workflow if save response was lost.
 if(saveAttempted&&!workflowId){
  try{const candidates=(await list(a)).filter(w=>w.name===name&&UUID.test(w.id));if(candidates.length===1)workflowId=candidates[0].id;else if(candidates.length>1)fail("ambiguous_cleanup");}
  catch{error=Error("automation_signed_stage_cleanup_unavailable");}
 }
 if(workflowId){
  try{
   // Deleting this one owned workflow cascades its webhook and policy, even after an ambiguous create response.
   ok(await a({action:"delete",workflowId}),"delete");
   if((await list(a)).some(w=>w.id===workflowId)||(await hooks(a)).some(h=>h.workflow_id===workflowId))fail("cleanup");
   cleanup=true;
  }catch{error=Error("automation_signed_stage_cleanup_failed");}
 }
 key=undefined;
 if(error)throw error;
 if(!cleanup||!runId)fail("incomplete");
 const retained=await history(a);
 if(retained.filter(r=>r.id===runId&&r.workflow_id===null&&r.trigger_type==="webhook").length!==1)fail("retained_history");
 return {schema:"eternyx-signed-stage-acceptance-v1",stagingRef:STAGE,independentAccounts:2,signedResultVerified:true,
 wrongSignatureDenied:true,idempotentReplayVerified:true,conflictingReplayDenied:true,oversizePolicyDenied:true,
 foreignOwnerDenied:true,privateHistoryVerified:true,disabledTriggerDenied:true,temporaryWorkflowAndTriggerRemoved:true,
 retainedMetadataVerified:true,webhookEncryptionRuntimeVerified:true,schedulerActivated:false,externalProvidersCalled:false,
 workerExecutionVerified:false,productionReady:false,releaseAuthorized:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runSignedAcceptance(process.env).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{
  console.error(typeof e?.message==="string"&&/^(automation_signed_stage_|automation_stage_fresh_auth_|automation_two_owner_gate_|staging_)[a-z0-9_]+$/.test(e.message)?e.message:"automation_signed_stage_unavailable");process.exitCode=1;
 });
}
