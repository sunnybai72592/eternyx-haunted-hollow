// Disposable HTTP + REAL PostgreSQL 17 integration of production Docker dispatch.
// docker exec is used exclusively for the isolated PostgreSQL fixture, not a lab.
import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {execFileSync} from "node:child_process";
import {generateKeyPairSync,randomBytes,sign,webcrypto} from "node:crypto";
import {createDockerDispatchHandler} from "../supabase/functions/_shared/docker-dispatch-handler.mjs";
import {agentActionMessage} from "../supabase/functions/_shared/docker-command-contract.mjs";
import {verifyPinnedDockerLabPermit} from "../src/lib/dockerLabPermitGuard.mjs";
import {validateDockerReceiptAcknowledgement} from "../src/lib/dockerLabReceiptGuard.mjs";

const OWNER="11111111-1111-4111-8111-111111111111";
const WORKSPACE="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT="aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const TARGET="a".repeat(64);
const PG="eternyx-docker-postgres-http-ci";
const rpcFields={
 docker_command_consume_nonce:["p_agent_id","p_nonce_hash","p_signed_at"],
 docker_command_claim:["p_agent_id"],
 docker_command_authorize:["p_agent_id","p_claim_id"],
 docker_command_finish:["p_agent_id","p_claim_id","p_outcome"]
};
const literal=x=>x===null?"NULL":"'"+String(x).replaceAll("'","''")+"'";
function sql(statement,service=false){
 if(typeof statement!=="string"||statement.length>4096)throw Error("Invalid synthetic SQL.");
 return execFileSync("docker",["exec","-i",PG,"psql","-X","-q","-t","-A",
  "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],{
   input:(service?"SET ROLE service_role;\n":"")+statement,
   encoding:"utf8",timeout:15000,maxBuffer:65536}).trim();
}
const scalar=s=>sql(s);
const json=(s,service=false)=>{const r=sql(s,service);return r?JSON.parse(r):null;};
function rpc(name,values){
 const fields=rpcFields[name];
 if(!fields||Object.keys(values).sort().join(",")!==fields.slice().sort().join(","))
  throw Error("Unrecognized test SQL RPC or arguments.");
 return json("SELECT public."+name+"("+fields.map(k=>literal(values[k])).join(",")+")::text;",true);
}
function signed(kind,key,{claimId=null,outcome=null,nonce=null,signedAt=null}={}){
 const data={kind,agentId:AGENT,signedAt:signedAt||new Date().toISOString(),
  nonce:nonce||randomBytes(32).toString("base64url"),
  claimId:kind==="claim"?null:claimId,
  outcome:kind==="receipt"?outcome:null,signature:"A".repeat(86)};
 data.signature=sign(null,Buffer.from(agentActionMessage(data)),key).toString("base64url");
 return data;
}
test("actual signed HTTP → actual Postgres claim, permit, receipt, incident and revocation",{
 skip:process.env.ETERNYX_DOCKER_HTTP_POSTGRES_CI!=="1"?"Disposable PostgreSQL fixture exists only in the dedicated isolated CI job":false
},async t=>{
 const agent=generateKeyPairSync("ed25519"),serverKey=generateKeyPairSync("ed25519");
 const signer=await webcrypto.subtle.importKey("pkcs8",
  serverKey.privateKey.export({type:"pkcs8",format:"der"}),
  {name:"Ed25519"},false,["sign"]);
 const publicKey=agent.publicKey.export({type:"spki",format:"der"}).subarray(12).toString("base64url");
 assert.equal(publicKey.length,43);
 sql("INSERT INTO public.docker_identity_workspaces(id,owner_id,name) VALUES("+
  [WORKSPACE,OWNER,"Isolated HTTP CI"].map(literal).join(",")+");");
 sql("INSERT INTO public.docker_agent_registrations"+
  "(id,owner_id,workspace_id,display_name,public_key,status,key_verified_at) VALUES("+
  [AGENT,OWNER,WORKSPACE,"Isolated agent",publicKey,"key_verified"].map(literal).join(",")+",now());");
 sql("INSERT INTO public.docker_agent_reports"+
  "(agent_id,owner_id,last_signed_at,last_received_at,last_nonce_hash,engine_available,engine_version,container_count) VALUES("+
  [AGENT,OWNER].map(literal).join(",")+",now(),now(),"+literal("f".repeat(64))+
  ",true,'25.0',1);");
 const policy=json("SELECT public.docker_set_control_policy("+literal(OWNER)+",true,5)::text;",true);
 assert.equal(policy.ok,true);
 const plan=operation=>json("SELECT public.docker_create_control_request("+
  [OWNER,AGENT].map(literal).join(",")+",gen_random_uuid(),"+literal(operation)+","+
  literal(TARGET)+")::text;",true);
 const approve=id=>json("SELECT public.docker_decide_control_request("+
  [OWNER,id,"approve"].map(literal).join(",")+")::text;",true);
 const first=plan("stop");
 assert.equal(first.ok,true,JSON.stringify(first));
 assert.equal(approve(first.request_id).state,"approved");
 const state={enabled:false,nonceCalls:0,backendDown:false};
 const handler=createDockerDispatchHandler({
  isEnabled:()=>state.enabled,crypt:webcrypto,
  makeContext:async()=>{
   if(state.backendDown)throw Error("Synthetic DB unavailable");
   return {signer,
    loadAgent:async id=>json("SELECT row_to_json(t)::text FROM ("+
      "SELECT id,status,revoked_at,public_key FROM public.docker_agent_registrations WHERE id="+
       literal(id)+") t;"),
    rpc:async(name,values)=>{
     if(name==="docker_command_consume_nonce")state.nonceCalls++;
     return rpc(name,values);
    }};
  }
 });
 const http=createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const c of req)chunks.push(c);
   const response=await handler(new Request("http://127.0.0.1/",{
    method:req.method,headers:req.headers,
    ...(req.method==="POST"?{body:Buffer.concat(chunks)}:{})
   }));
   res.writeHead(response.status,Object.fromEntries(response.headers));
   res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end();}
 });
 http.listen(0,"127.0.0.1");await once(http,"listening");
 const url="http://127.0.0.1:"+http.address().port+"/";
 const post=async(data,headers={})=>{
  const response=await fetch(url,{method:"POST",
   headers:{"content-type":"application/json",...headers},body:JSON.stringify(data)});
  return {status:response.status,json:await response.json()};
 };
 try{
  await t.test("disabled gate blocks signed HTTP without SQL writes",async()=>{
   assert.equal((await post(signed("claim",agent.privateKey))).status,503);
   assert.equal(state.nonceCalls,0);
  });
  state.enabled=true;
  await t.test("invalid signature, Origin and old timestamp never consume nonce",async()=>{
   const original=signed("claim",agent.privateKey);
   assert.equal((await post({...original,signature:"A".repeat(86)})).status,403);
   assert.equal((await post(original,{Origin:"https://invalid.example"})).status,403);
   assert.equal((await post(signed("claim",agent.privateKey,
    {signedAt:new Date(Date.now()-60000).toISOString()}))).status,409);
   assert.equal(state.nonceCalls,0);
  });
  let claim;
  await t.test("signed claim inserts real row and rejects nonce replay",async()=>{
   const action=signed("claim",agent.privateKey);
   const accepted=await post(action);
   assert.equal(accepted.status,200,JSON.stringify(accepted.json));
   assert.equal(accepted.json.job.requestId,first.request_id);
   claim=accepted.json.job.claimId;
   assert.equal((await post(action)).status,409);
   assert.equal(Number(scalar("SELECT count(*) FROM public.docker_command_nonces WHERE agent_id="+literal(AGENT)+";")),1);
   assert.equal(Number(scalar("SELECT count(*) FROM public.docker_command_claims WHERE id="+literal(claim)+";")),1);
  });
  await t.test("DB authorization emits real Ed25519 server permit and is one-time",async()=>{
   const result=await post(signed("authorize",agent.privateKey,{claimId:claim}));
   assert.equal(result.status,200,JSON.stringify(result.json));
   const verified=verifyPinnedDockerLabPermit(result.json,{
    agentId:AGENT,claimId:claim,requestId:first.request_id,
    operation:"stop",containerId:TARGET},serverKey.publicKey,Date.now());
   assert.equal(verified.claimId,claim);
   assert.equal((await post(signed("authorize",agent.privateKey,{claimId:claim}))).status,409);
   assert.equal(scalar("SELECT (authorized_at IS NOT NULL)::text FROM public.docker_command_claims"+
    " WHERE id="+literal(claim)+";"),"true");
  });
  await t.test("signed receipt is persisted, idempotent and refuses contradictions",async()=>{
   const result=await post(signed("receipt",agent.privateKey,{claimId:claim,outcome:"completed"}));
   assert.equal(result.status,200);
   assert.equal(validateDockerReceiptAcknowledgement(result.json,claim,"completed").alreadyRecorded,false);
   const replay=await post(signed("receipt",agent.privateKey,{claimId:claim,outcome:"completed"}));
   assert.equal(replay.status,200);
   assert.equal(validateDockerReceiptAcknowledgement(replay.json,claim,"completed").alreadyRecorded,true);
   assert.equal((await post(signed("receipt",agent.privateKey,{claimId:claim,outcome:"failed"}))).status,409);
   assert.equal(scalar("SELECT state FROM public.docker_command_claims WHERE id="+literal(claim)+";"),
    "reported_completed");
  });
  await t.test("a failed signed receipt creates a real incident; hold blocks claims",async()=>{
   const second=plan("restart");assert.equal(second.ok,true);
   assert.equal(approve(second.request_id).state,"approved");
   const receiptClaim=(await post(signed("claim",agent.privateKey))).json.job.claimId;
   assert.equal((await post(signed("authorize",agent.privateKey,{claimId:receiptClaim}))).status,200);
   assert.equal((await post(signed("receipt",agent.privateKey,
    {claimId:receiptClaim,outcome:"failed"}))).status,200);
   const note="Synthetic operator reviewed an isolated database-backed incident.";
   const incident=json("SELECT public.docker_lab_open_incident("+
    [OWNER,receiptClaim,note].map(literal).join(",")+")::text;",true);
   assert.equal(incident.reason,"reported_failed");
   const escalated=json("SELECT public.docker_lab_escalate_incident("+
    [OWNER,incident.incident_id,note].map(literal).join(",")+")::text;",true);
   assert.equal(escalated.incident_hold,true);
   const blocked=await post(signed("claim",agent.privateKey));
   assert.equal(blocked.status,409);
   assert.equal(blocked.json.code,"not_ready");
   const denied=json("SELECT public.docker_set_control_policy("+literal(OWNER)+",true,5)::text;",true);
   assert.equal(denied.reason,"incident_hold");
   const released=json("SELECT public.docker_lab_release_incident_hold("+
    [OWNER,incident.incident_id,note].map(literal).join(",")+")::text;",true);
   assert.equal(released.ok,true);
   assert.equal(scalar("SELECT enabled::text FROM public.docker_control_policies WHERE owner_id="+literal(OWNER)+";"),"false");
  });
  await t.test("revoked agent rejected before nonce and backend outage fails closed",async()=>{
   sql("UPDATE public.docker_agent_registrations SET status='revoked',revoked_at=now() WHERE id="+literal(AGENT)+";");
   const previous=state.nonceCalls;
   assert.equal((await post(signed("claim",agent.privateKey))).status,403);
   assert.equal(state.nonceCalls,previous);
   state.backendDown=true;
   const result=await post(signed("claim",agent.privateKey));
   assert.equal(result.status,503);
   assert.equal(JSON.stringify(result.json).includes("Synthetic"),false);
  });
 }finally{
  http.closeAllConnections();
  await new Promise((resolve,reject)=>http.close(err=>err?reject(err):resolve()));
 }
});
