import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {runSignedAcceptance,validateSignedConsent} from "../scripts/automation-staging-signed-acceptance.mjs";
import {verifyWebhookRequest} from "../supabase/functions/_shared/automation-webhook-crypto.mjs";
import {getWorkflowPreset,runLocalWorkflow} from "../src/lib/automationWorkflow.mjs";
const STAGE="mhodwvypfbxafamkrgsk",PROD="wcncuarekaofmfurbtbh",now=1800000000;
const uidA=randomUUID(),uidB=randomUUID(),wid=randomUUID(),tid=randomUUID(),rid=randomUUID();
const key="a7".repeat(32),password="SYNTHETIC_PASSWORD_ONLY_123";
const env={ETERNYX_AUTOMATION_STAGING_REF:STAGE,ETERNYX_AUTOMATION_PRODUCTION_REF:PROD,
 ETERNYX_AUTOMATION_TWO_OWNER_MODE:"ONE_TEMPORARY_WORKFLOW",ETERNYX_AUTOMATION_TWO_OWNER_REVIEW:"STAGING_TEST_ACCOUNTS_REVIEWED",
 ETERNYX_AUTOMATION_TWO_OWNER_WRITE_CONSENT:"I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN",ETERNYX_AUTOMATION_SIGNED_CONSENT:"I_APPROVE_ONE_STAGING_SIGNED_WEBHOOK",
 ETERNYX_AUTOMATION_STAGING_PUBLISHABLE_KEY:"sb_publishable_OFFLINE_TEST_ONLY_12345",
 ETERNYX_AUTOMATION_STAGING_OWNER_A_EMAIL:"a@fixture.invalid",ETERNYX_AUTOMATION_STAGING_OWNER_B_EMAIL:"b@fixture.invalid",
 ETERNYX_AUTOMATION_STAGING_OWNER_A_PASSWORD:password,ETERNYX_AUTOMATION_STAGING_OWNER_B_PASSWORD:password+"B"};
const encode=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
const jwt=id=>encode({alg:"HS256"})+"."+encode({iss:"https://"+STAGE+".supabase.co/auth/v1",sub:id,aud:"authenticated",role:"authenticated",iat:now-1,exp:now+3600})+".synthetic";
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
function fixture({failResult=false}={}){
 let workflow=null,trigger=false,enabled=false,record=null,firstRequest=null,firstInput=null,deletes=0;
 const fetcher=async(url,options)=>{
  const u=new URL(url);assert.equal(u.hostname,STAGE+".supabase.co");assert.equal(options.redirect,"error");
  const payload=options.body?JSON.parse(options.body):null;
  if(u.pathname==="/auth/v1/token"){
   const id=payload.email===env.ETERNYX_AUTOMATION_STAGING_OWNER_A_EMAIL?uidA:uidB;
   return json({token_type:"bearer",access_token:jwt(id),expires_in:3600,user:{id,email:payload.email,is_anonymous:false}});
  }
  if(u.pathname==="/functions/v1/automation-webhook"){
   assert.equal(options.headers.Authorization,undefined);
   assert.equal(options.headers.apikey,undefined);
   const timestamp=options.headers["x-eternyx-timestamp"],requestId=options.headers["x-eternyx-request-id"];
   if(!enabled||!await verifyWebhookRequest(Buffer.from(key,"hex"),timestamp,requestId,options.body,options.headers["x-eternyx-signature"]))return json({error:"denied"},401);
   if(payload.input.length>64)return json({code:"policy_input_limit"},413);
   if(firstRequest===requestId&&payload.input!==firstInput)return json({code:"idempotency_conflict"},409);
   const replayed=record!==null;
   firstRequest=requestId;firstInput=payload.input;
   record={id:rid,workflow_id:wid,trigger_type:"webhook",status:"completed",output_lines:2,trace:[],created_at:new Date(now*1000).toISOString()};
   const result=runLocalWorkflow(payload.input,getWorkflowPreset("sort"));
   return json({source:"authenticated_webhook",runId:rid,replayed,output:failResult?"unexpected":result.output,outputLines:result.outputLines});
  }
  const owner=options.headers.Authorization==="Bearer "+jwt(uidA)?"A":options.headers.Authorization==="Bearer "+jwt(uidB)?"B":"unknown";
  assert.notEqual(owner,"unknown");
  if(u.pathname==="/auth/v1/user")return json({id:owner==="A"?uidA:uidB,is_anonymous:false});
  assert.equal(u.pathname,"/functions/v1/automation-control");
  const action=payload.action;
  if(action==="list")return json({source:"authenticated_server",workflows:owner==="A"&&workflow?[workflow]:[]});
  if(action==="history")return json({source:"authenticated_server",rawInputsStored:false,rawOutputsStored:false,runs:owner==="A"&&record?[record]:[]});
  if(action==="webhooks")return json({source:"authenticated_server",triggers:owner==="A"&&trigger?[{id:tid,workflow_id:wid,enabled}]:[]});
  if(owner==="B")return json({error:"not found"},404);
  if(action==="save"){workflow={id:wid,name:payload.name,revision:1,active:true,trigger_kind:"manual"};return json({ok:true,workflow_id:wid});}
  if(action==="setWorkflowPolicy")return json({ok:true});
  if(action==="workflowPolicy")return json({webhookSecretConfigured:true,scheduleSecretConfigured:true,approvalSecretConfigured:true,schedulerConfigEnabled:false});
  if(action==="createWebhook"){trigger=true;return json({ok:true,triggerId:tid,workflowId:wid,enabled:false,signingKey:key});}
  if(action==="toggleWebhook"){enabled=payload.enabled;return json({ok:true});}
  if(action==="delete"){deletes++;workflow=null;trigger=false;enabled=false;if(record)record.workflow_id=null;return json({ok:true});}
  throw Error("unexpected test action");
 };
 return {fetcher,state:()=>({workflow,trigger,enabled,deletes})};
}
test("exact staging and distinct explicit write approvals are required before any network",async()=>{
 for(const change of [{ETERNYX_AUTOMATION_STAGING_REF:PROD},{ETERNYX_AUTOMATION_SIGNED_CONSENT:"NOT_APPROVED"},{ETERNYX_AUTOMATION_TWO_OWNER_WRITE_CONSENT:"NOT_APPROVED"}]){
  assert.throws(()=>validateSignedConsent({...env,...change}),/automation_signed_stage_consent/);
  let calls=0;await assert.rejects(runSignedAcceptance({...env,...change},{fetcher:async()=>{calls++;throw Error("not allowed");}}),/automation_signed_stage_consent/);assert.equal(calls,0);
 }
});
test("synthetic transport exercises actual HMAC signing, result, replay, isolation, quota and cleanup",async()=>{
 const f=fixture();const r=await runSignedAcceptance(env,{fetcher:f.fetcher,now:()=>now});
 assert.equal(r.signedResultVerified,true);assert.equal(r.conflictingReplayDenied,true);assert.equal(r.retainedMetadataVerified,true);assert.equal(r.workerExecutionVerified,false);
 assert.deepEqual(f.state(),{workflow:null,trigger:false,enabled:false,deletes:1});
 for(const secret of [key,password,uidA,uidB,wid,tid,rid,jwt(uidA)])assert.ok(!JSON.stringify(r).includes(secret));
});
test("incorrect result fails closed and removes the owned workflow and trigger",async()=>{
 const f=fixture({failResult:true});
 await assert.rejects(runSignedAcceptance(env,{fetcher:f.fetcher,now:()=>now}),/automation_signed_stage_signed_result/);
 assert.deepEqual(f.state(),{workflow:null,trigger:false,enabled:false,deletes:1});
});
