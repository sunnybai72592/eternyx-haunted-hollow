import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {webcrypto,generateKeyPairSync,randomBytes,sign,verify} from "node:crypto";
import {createDockerDispatchHandler}
  from "../supabase/functions/_shared/docker-dispatch-handler.mjs";
import {agentActionMessage,labPermitMessage}
  from "../supabase/functions/_shared/docker-command-contract.mjs";
import {verifyPinnedDockerLabPermit} from "../src/lib/dockerLabPermitGuard.mjs";
import {validateDockerReceiptAcknowledgement} from "../src/lib/dockerLabReceiptGuard.mjs";
const AGENT="33333333-3333-4333-8333-333333333333";
const CLAIM="44444444-4444-4444-8444-444444444444";
const REQUEST="55555555-5555-4555-8555-555555555555";
const CONTAINER="a".repeat(64);
const NOW=Date.parse("2026-11-23T00:00:10.000Z");
const at=millis=>new Date(millis).toISOString();
const key64=key=>Buffer.from(key.export({format:"der",type:"spki"})).subarray(12).toString("base64url");
function signed(kind,privateKey,{claimId=CLAIM,outcome="completed",signedAt=at(NOW),
 nonce=randomBytes(32).toString("base64url")}={}){
 const raw={kind,agentId:AGENT,signedAt,nonce,claimId:kind==="claim"?null:claimId,
  outcome:kind==="receipt"?outcome:null,signature:"A".repeat(86)};
 raw.signature=sign(null,Buffer.from(agentActionMessage(raw)),privateKey).toString("base64url");
 return raw;
}
async function fixture(){
 const agentKeys=generateKeyPairSync("ed25519"),serverKeys=generateKeyPairSync("ed25519");
 const signer=await webcrypto.subtle.importKey("pkcs8",
  serverKeys.privateKey.export({format:"der",type:"pkcs8"}),{name:"Ed25519"},false,["sign"]);
 const agent={id:AGENT,status:"key_verified",revoked_at:null,public_key:key64(agentKeys.publicKey)};
 const state={enabled:false,agent,used:new Set(),claimUsed:false,authorized:false,
  finished:null,rpcCalls:[],dbFault:null,brokenPermit:false,signerEnabled:true};
 const rpc=async(name,args)=>{
  state.rpcCalls.push({name,args});
  if(state.dbFault)throw Error("Synthetic backend unavailable.");
  if(name==="docker_command_consume_nonce"){
    if(state.used.has(args.p_nonce_hash))return {ok:false,reason:"replayed"};
    state.used.add(args.p_nonce_hash);
    return {ok:true};
  }
  if(name==="docker_command_claim"){
    if(state.claimUsed)return {ok:true,job:null};
    state.claimUsed=true;
    return {ok:true,job:{agentId:AGENT,claimId:CLAIM,requestId:REQUEST,
      operation:"stop",containerId:CONTAINER,expiresAt:at(NOW+15000)}};
  }
  if(name==="docker_command_authorize"){
    if(args.p_claim_id!==CLAIM||state.authorized)return {ok:false,reason:"claim_unavailable"};
    state.authorized=true;
    return {ok:true,agentId:AGENT,claimId:CLAIM,requestId:REQUEST,
      operation:state.brokenPermit?"exec":"stop",containerId:CONTAINER,
      issuedAt:at(NOW-1000),expiresAt:at(NOW+14000)};
  }
  if(name==="docker_command_finish"){
    if(!state.authorized||args.p_claim_id!==CLAIM)return {ok:false,reason:"claim_unavailable"};
    if(state.finished&&state.finished!==args.p_outcome)return {ok:false,reason:"claim_unavailable"};
    const reused=state.finished!==null;
    state.finished=args.p_outcome;
    return {ok:true,state:"reported_"+state.finished,reused};
  }
  throw Error("Unexpected mocked RPC "+name);
 };
 const handler=createDockerDispatchHandler({
  isEnabled:()=>state.enabled,now:()=>NOW,crypt:webcrypto,
  makeContext:async()=>({
   signer:state.signerEnabled?signer:null,
   loadAgent:async(id)=>id===AGENT?state.agent:null,
   rpc,
  }),
 });
 const http=createServer(async(req,res)=>{
  try{
   const chunks=[];let size=0;
   for await(const chunk of req){
    size+=chunk.length;if(size>8192){res.writeHead(413);res.end();return;}
    chunks.push(chunk);
   }
   const body=Buffer.concat(chunks);
   const response=await handler(new Request("http://127.0.0.1/",{
    method:req.method,headers:req.headers,...(req.method==="POST"?{body}:{}),
   }));
   res.writeHead(response.status,Object.fromEntries(response.headers));
   res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end();}
 });
 http.listen(0,"127.0.0.1");
 await once(http,"listening");
 const port=http.address().port;
 async function post(payload,{headers={},method="POST"}={}){
  const response=await fetch("http://127.0.0.1:"+port+"/",{
    method,headers:{"content-type":"application/json",...headers},
    ...(["POST","PUT"].includes(method)?{body:typeof payload==="string"?payload:JSON.stringify(payload)}:{}),
  });
  return {status:response.status,headers:response.headers,
   json:await response.json().catch(()=>null)};
 }
 async function close(){
  http.closeAllConnections();
  await new Promise((resolve,reject)=>http.close(err=>err?reject(err):resolve()));
 }
 return {post,close,state,agentKeys,serverKeys};
}
test("real loopback HTTP signed claim → server-signed permit → agent receipt → idempotent receipt",async()=>{
 const f=await fixture();
 try{
  f.state.enabled=true;
  const claim=await f.post(signed("claim",f.agentKeys.privateKey));
  assert.equal(claim.status,200);
  assert.equal(claim.json.job.claimId,CLAIM);
  const authorized=await f.post(signed("authorize",f.agentKeys.privateKey));
  assert.equal(authorized.status,200);
  const p=authorized.json.permit;
  assert.deepEqual(verifyPinnedDockerLabPermit(authorized.json,{
   agentId:AGENT,claimId:CLAIM,requestId:REQUEST,containerId:CONTAINER,operation:"stop"
  },f.serverKeys.publicKey,NOW),p);
  assert.equal(verify(null,Buffer.from(labPermitMessage(p)),f.serverKeys.publicKey,
    Buffer.from(authorized.json.signature,"base64url")),true);
  const receipt=await f.post(signed("receipt",f.agentKeys.privateKey));
  assert.equal(receipt.status,200);
  assert.equal(validateDockerReceiptAcknowledgement(receipt.json,CLAIM,"completed").alreadyRecorded,false);
  const again=await f.post(signed("receipt",f.agentKeys.privateKey));
  assert.equal(again.status,200);
  assert.equal(validateDockerReceiptAcknowledgement(again.json,CLAIM,"completed").alreadyRecorded,true);
  assert.equal((await f.post(signed("receipt",f.agentKeys.privateKey,{outcome:"failed"}))).status,409);
  assert.equal((await f.post(signed("claim",f.agentKeys.privateKey))).json.job,null);
  assert.equal(f.state.finished,"completed");
 }finally{await f.close();}
});
test("invalid signing key never consumes nonce; valid retry with same signed action succeeds",async()=>{
 const f=await fixture();
 try{
  f.state.enabled=true;
  const raw=signed("claim",f.agentKeys.privateKey);
  const wrong={...raw,signature:sign(null,Buffer.from(agentActionMessage(raw)),
    generateKeyPairSync("ed25519").privateKey).toString("base64url")};
  assert.equal((await f.post(wrong)).status,403);
  assert.equal(f.state.used.size,0);
  assert.equal((await f.post(raw)).status,200);
  assert.equal(f.state.used.size,1);
  const replay=await f.post(raw);
  assert.equal(replay.status,409);
  assert.equal(replay.json.code,"replayed");
 }finally{await f.close();}
});
test("disabled gate, blocked browser origin and disallowed HTTP methods avoid DB use",async()=>{
 const f=await fixture();
 try{
  const raw=signed("claim",f.agentKeys.privateKey);
  assert.equal((await f.post(raw)).status,503);
  f.state.enabled=true;
  assert.equal((await f.post(raw,{headers:{Origin:"https://untrusted.example"}})).status,403);
  assert.equal((await f.post(null,{method:"GET"})).status,405);
  assert.equal(f.state.rpcCalls.length,0);
 }finally{await f.close();}
});
test("expired and future-dated signed actions fail before any DB RPC",async()=>{
 const f=await fixture();
 try{
  f.state.enabled=true;
  for(const timestamp of [NOW-45001,NOW+30001]){
   const result=await f.post(signed("claim",f.agentKeys.privateKey,{signedAt:at(timestamp)}));
   assert.equal(result.status,409);
  }
  assert.equal(f.state.rpcCalls.length,0);
 }finally{await f.close();}
});
test("revoked or pending agents cannot claim or authorize, even with valid Ed25519 signatures",async()=>{
 const f=await fixture();
 try{
  f.state.enabled=true;
  for(const value of [{...f.state.agent,status:"pending"},
    {...f.state.agent,status:"revoked",revoked_at:at(NOW)},
    {...f.state.agent,public_key:key64(generateKeyPairSync("ed25519").publicKey)}]){
   f.state.agent=value;
   assert.equal((await f.post(signed("claim",f.agentKeys.privateKey))).status,403);
  }
  assert.equal(f.state.used.size,0);
 }finally{await f.close();}
});
test("malformed, noncanonical, oversized or injected HTTP payload cannot mutate nonce or claim state",async()=>{
 const f=await fixture();
 try{
  f.state.enabled=true;
  const sample=signed("claim",f.agentKeys.privateKey);
  for(const body of ["{not json",JSON.stringify({...sample,cmd:"exec"}),
    JSON.stringify({...sample,signature:sample.signature+"="}),
    " ".repeat(2200)]){
   const result=await f.post(body);
   assert.ok([400,413].includes(result.status),JSON.stringify(result));
  }
  assert.equal(f.state.rpcCalls.length,0);
 }finally{await f.close();}
});
test("unavailable server signing secret or database yields 503 with no accidental claims",async()=>{
 const f=await fixture();
 try{
  f.state.enabled=true;
  f.state.signerEnabled=false;
  assert.equal((await f.post(signed("claim",f.agentKeys.privateKey))).status,503);
  assert.equal(f.state.rpcCalls.length,0);
  f.state.signerEnabled=true;
  f.state.dbFault=true;
  const failure=await f.post(signed("claim",f.agentKeys.privateKey));
  assert.equal(failure.status,503);
  assert.equal(JSON.stringify(failure.json).includes("Synthetic"),false);
 }finally{await f.close();}
});
test("malformed database permit never produces a signed server authorization",async()=>{
 const f=await fixture();
 try{
  f.state.enabled=true;
  f.state.brokenPermit=true;
  assert.equal((await f.post(signed("claim",f.agentKeys.privateKey))).status,200);
  const response=await f.post(signed("authorize",f.agentKeys.privateKey));
  assert.equal(response.status,503);
  assert.equal(response.json.error,"Docker dispatch unavailable");
 }finally{await f.close();}
});
test("a real signed nonce is consumed only once when requests arrive concurrently",async()=>{
 const f=await fixture();
 try{
  f.state.enabled=true;
  const raw=signed("claim",f.agentKeys.privateKey);
  const attempts=await Promise.all([f.post(raw),f.post(raw),f.post(raw)]);
  assert.deepEqual(attempts.map(x=>x.status).sort((a,b)=>a-b),[200,409,409]);
  assert.equal(f.state.used.size,1);
 }finally{await f.close();}
});
test("response never advertises independently verified execution or caching",async()=>{
 const f=await fixture();
 try{
  f.state.enabled=true;
  await f.post(signed("claim",f.agentKeys.privateKey));
  await f.post(signed("authorize",f.agentKeys.privateKey));
  const received=await f.post(signed("receipt",f.agentKeys.privateKey));
  assert.equal(received.headers.get("cache-control"),"no-store");
  assert.equal(received.headers.get("x-content-type-options"),"nosniff");
  assert.equal(received.json.verification,"agent_signature_only");
  assert.equal(received.json.independentExecutionAudit,false);
 }finally{await f.close();}
});
