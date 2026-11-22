// Public-key authenticated push-only telemetry: no browser sessions or
// remote Docker operations. Deploy with verify_jwt=false; signature is mandatory.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { getSupabaseSecretKey } from "../_shared/supabase.ts";
import {
  parseDockerHeartbeat, dockerHeartbeatMessage, canonicalBase64url,
} from "../_shared/docker-heartbeat-contract.mjs";

const headers = {
  "Cache-Control":"no-store",
  "Content-Type":"application/json; charset=utf-8",
  "X-Content-Type-Options":"nosniff",
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const digest=async(value:string)=>{
  const bytes=new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))]
    .map(n=>n.toString(16).padStart(2,"0")).join("");
};
serve(async(req:Request)=>{
  if(req.method!=="POST")return reply({error:"Method not allowed"},405);
  // This endpoint is for non-browser, owner-controlled CLI agents only.
  if(req.headers.get("Origin"))return reply({error:"Browser origins not accepted"},403);
  const length=Number(req.headers.get("Content-Length") || "0");
  if(!Number.isFinite(length)||length>2048)return reply({error:"Request too large"},413);
  let report;
  try{
    const raw=await req.text();
    if(raw.length>2048)return reply({error:"Request too large"},413);
    report=parseDockerHeartbeat(JSON.parse(raw));
  }catch{return reply({error:"Malformed JSON"},400);}
  if(!report)return reply({error:"Invalid signed heartbeat payload"},400);
  if(Math.abs(Date.now()-Date.parse(report.signedAt))>90000)
    return reply({error:"Report timestamp outside accepted window"},409);
  try{
    const url=Deno.env.get("SUPABASE_URL") || "";
    if(!url)throw new Error("Supabase URL missing");
    const db=createClient(url,getSupabaseSecretKey(),
      {auth:{persistSession:false,autoRefreshToken:false}});
    const {data:identity,error}=await db.from("docker_agent_registrations")
      .select("id,public_key,status,revoked_at").eq("id",report.agentId).maybeSingle();
    if(error)throw error;
    if(!identity || identity.status!=="key_verified" || identity.revoked_at!==null)
      return reply({error:"Agent identity unavailable"},403);
    const publicKey=await crypto.subtle.importKey(
      "raw",canonicalBase64url(identity.public_key,32),
      {name:"Ed25519"},false,["verify"]);
    const valid=await crypto.subtle.verify(
      {name:"Ed25519"},publicKey,canonicalBase64url(report.signature,64),
      new TextEncoder().encode(dockerHeartbeatMessage(report)));
    if(!valid)return reply({error:"Signature rejected"},403);
    const hash=await digest(report.nonce);
    // SQL rechecks status, account-bound key revocation, clock, monotonic
    // timestamp and frequency under a row lock (also handles concurrent submits).
    const {data,error:saveError}=await db.rpc("docker_accept_signed_report",{
      p_agent_id:report.agentId,
      p_signed_at:report.signedAt,
      p_nonce_hash:hash,
      p_engine_available:report.engineAvailable,
      p_engine_version:report.engineVersion,
      p_container_count:report.containerCount,
    });
    if(saveError)throw saveError;
    if(data?.ok!==true){
      const reason=typeof data?.reason==="string"?data.reason:"report_rejected";
      return reply({error:"Report not accepted",code:reason},reason==="rate_limited"?429:409);
    }
    return reply({
      accepted:true,agentId:report.agentId,receivedAt:data.received_at,
      mode:"signed-push-only",remoteExecutionEnabled:false,
    },202);
  }catch{
    // Never reveal secret keys, database internals or private agent metadata.
    return reply({error:"Signed report service unavailable"},503);
  }
});
