// Ed25519-authenticated, fail-closed local lab dispatch.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { getSupabaseSecretKey } from "../_shared/supabase.ts";
import { parseAgentAction,agentActionMessage,labPermitMessage,parseLabPermit,bytesFromBase64url }
  from "../_shared/docker-command-contract.mjs";

const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff"};
const reply=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers});
const encode=(x:Uint8Array)=>btoa(String.fromCharCode(...x)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function sha(text:string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))]
    .map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function serverSigningKey(){
  const encoded=Deno.env.get("DOCKER_LAB_SERVER_PRIVATE_KEY_PKCS8_B64")||"";
  // Only operator-provisioned PKCS8 Ed25519 48-byte keys; never shipped to clients.
  if(!/^[A-Za-z0-9+/]{64}$/.test(encoded))throw new Error("No server signing key.");
  const bytes=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));
  if(bytes.length!==48)throw new Error("Invalid server key.");
  return crypto.subtle.importKey("pkcs8",bytes,{name:"Ed25519"},false,["sign"]);
}
serve(async(req:Request)=>{
  if(req.method!=="POST")return reply({error:"Method not allowed"},405);
  if(req.headers.get("Origin"))return reply({error:"Browser requests disabled"},403);
  // Explicit server gate: no dispatch/receipt on deploy alone.
  if(Deno.env.get("DOCKER_REMOTE_LAB_ENABLED")!=="true")
    return reply({error:"Docker lab dispatch disabled"},503);
  let input;
  try {
    const value=Number(req.headers.get("content-length")||"0");
    if(!Number.isFinite(value)||value>2048) return reply({error:"Request too large"},413);
    if(!req.body)return reply({error:"Request required"},400);
    const reader=req.body.getReader(); const chunks:Uint8Array[]=[];let total=0;
    while(true){
      const {done,value}=await reader.read();
      if(done)break;total+=value.byteLength;
      if(total>2048){await reader.cancel().catch(()=>undefined);return reply({error:"Request too large"},413);}
      chunks.push(value);
    }
    const bytes=new Uint8Array(total);let pos=0;
    for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.byteLength;}
    input=parseAgentAction(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)));
  }catch{return reply({error:"Malformed request"},400);}
  if(!input)return reply({error:"Invalid signed request"},400);
  if(Date.parse(input.signedAt)<Date.now()-45000 || Date.parse(input.signedAt)>Date.now()+30000)
    return reply({error:"Signed action expired"},409);
  try {
    // Fail before claiming anything if no trusted server signature can be minted.
    const signer=await serverSigningKey();
    const url=Deno.env.get("SUPABASE_URL")||"";
    if(!url)throw new Error("Missing backend configuration");
    const db=createClient(url,getSupabaseSecretKey(),
      {auth:{persistSession:false,autoRefreshToken:false}});
    const {data:agent,error}=await db.from("docker_agent_registrations")
      .select("id,status,revoked_at,public_key").eq("id",input.agentId).maybeSingle();
    if(error)throw error;
    if(!agent||agent.status!=="key_verified"||agent.revoked_at!==null)
      return reply({error:"Agent identity unavailable"},403);
    const key=await crypto.subtle.importKey("raw",bytesFromBase64url(agent.public_key,32),
      {name:"Ed25519"},false,["verify"]);
    const valid=await crypto.subtle.verify({name:"Ed25519"},key,bytesFromBase64url(input.signature,64),
      new TextEncoder().encode(agentActionMessage(input)));
    if(!valid)return reply({error:"Invalid agent signature"},403);
    const {data:consumed,error:nonceError}=await db.rpc("docker_command_consume_nonce",{
      p_agent_id:input.agentId,p_nonce_hash:await sha(input.nonce),p_signed_at:input.signedAt,
    });
    if(nonceError)throw nonceError;
    if(consumed?.ok!==true)return reply({error:"Agent request rejected",code:consumed?.reason||"denied"},409);
    if(input.kind==="claim"){
      const {data,error}=await db.rpc("docker_command_claim",{p_agent_id:input.agentId});
      if(error)throw error;
      if(data?.ok!==true)return reply({error:"No command claim allowed",code:data?.reason||"denied"},409);
      return reply({job:data.job||null,remoteLabMode:"manual-poll-only"});
    }
    if(input.kind==="authorize"){
      const {data,error}=await db.rpc("docker_command_authorize",{
        p_agent_id:input.agentId,p_claim_id:input.claimId,
      });
      if(error)throw error;
      if(data?.ok!==true)return reply({error:"Command authorization unavailable",code:data?.reason||"denied"},409);
      const permit=parseLabPermit({
        agentId:data.agentId,claimId:data.claimId,requestId:data.requestId,
        operation:data.operation,containerId:data.containerId,
        issuedAt:new Date(data.issuedAt).toISOString(),
        expiresAt:new Date(data.expiresAt).toISOString(),
      });
      if(!permit)throw new Error("Invalid permit response from database.");
      const signature=encode(new Uint8Array(await crypto.subtle.sign({name:"Ed25519"},signer,
        new TextEncoder().encode(labPermitMessage(permit)))));
      return reply({permit,signature,remoteLabMode:"signed-short-lived-permit"});
    }
    const {data,error}=await db.rpc("docker_command_finish",{
      p_agent_id:input.agentId,p_claim_id:input.claimId,p_outcome:input.outcome,
    });
    if(error)throw error;
    if(data?.ok!==true)return reply({error:"Receipt rejected",code:data?.reason||"denied"},409);
    return reply({accepted:true,claimId:input.claimId,status:data.state,
      alreadyRecorded:data.reused===true,
      verification:"agent_signature_only",independentExecutionAudit:false});
  }catch{
    return reply({error:"Docker dispatch unavailable"},503);
  }
});
