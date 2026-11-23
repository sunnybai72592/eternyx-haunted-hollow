import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import { verifiedDockerOwnerId } from "../_shared/docker-owner-guard.mjs";
import { parseDockerEnrollmentRequest, makeEnrollmentMessage, decodeBase64url } from "../_shared/docker-enrollment-contract.mjs";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const hex=async (bytes:Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(v=>v.toString(16).padStart(2,"0")).join("");
const dbFailure=(error:any)=>{ console.error("Docker enrollment database unavailable", {code:error?.code ?? null});return reply({error:"Docker enrollment unavailable"},503); };
const rejection=(data:any)=>reply({error:"Docker enrollment action rejected",code:typeof data?.reason==="string"?data.reason:"unavailable"},data?.reason==="agent_limit"||data?.reason==="workspace_limit"||data?.reason==="daily_limit"?429:409);
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

serve(async (req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return reply({error:"Method not allowed"},405);
  let request;
  try{
    const body=await req.text();
    if(body.length>2500)return reply({error:"Request too large"},413);
    request=parseDockerEnrollmentRequest(JSON.parse(body));
  }catch{return reply({error:"Invalid JSON"},400);}
  if(!request)return reply({error:"Invalid Docker enrollment request"},400);
  const {user,supabase}=await authenticateUser(req);
  const verifiedOwner=verifiedDockerOwnerId(user,supabase);
  if(!user||!supabase||user.is_anonymous||!verifiedOwner)return reply({error:"Sign in to manage Docker identity"},401);
  const owner=verifiedOwner;
  try{
    if(request.action==="list"){
      const [a,b,c]=await Promise.all([
        supabase.from("docker_identity_workspaces").select("id,name,created_at").eq("owner_id",owner).order("created_at",{ascending:false}).limit(3),
        supabase.from("docker_agent_registrations").select("id,workspace_id,display_name,status,created_at,key_verified_at,revoked_at").eq("owner_id",owner).order("created_at",{ascending:false}).limit(25),
        supabase.from("docker_agent_reports")
          .select("agent_id,last_signed_at,last_received_at,engine_available,engine_version,container_count,accepted_count")
          .eq("owner_id",owner).limit(25),
      ]);
      if(a.error||b.error||c.error)return dbFailure(a.error||b.error||c.error);
      return reply({workspaces:a.data??[],agents:b.data??[],reports:c.data??[],remoteConnectivityEnabled:false,
        note:"Key verification proves private-key possession, not server ownership or live Docker reachability."});
    }
    if(request.action==="create_workspace"){
      const {data,error}=await supabase.rpc("docker_identity_create_workspace",{p_user_id:owner,p_name:request.name});
      if(error)return dbFailure(error);
      if(data?.ok!==true)return rejection(data);
      return reply({workspaceId:data.workspace_id},201);
    }
    if(request.action==="begin"){
      const key=decodeBase64url(request.publicKey,32);
      // Validate that the imported public key really is an Ed25519 key.
      await crypto.subtle.importKey("raw",key,{name:"Ed25519"},false,["verify"]);
      const nonce=base64url(crypto.getRandomValues(new Uint8Array(32)));
      const nonceHash=await hex(new TextEncoder().encode(nonce));
      const {data,error}=await supabase.rpc("docker_identity_begin_enrollment",{
        p_user_id:owner,p_workspace_id:request.workspaceId,p_name:request.name,
        p_public_key:request.publicKey,p_nonce_hash:nonceHash,
      });
      if(error){
        if(error.code==="23505")return reply({error:"Public key has already been registered"},409);
        return dbFailure(error);
      }
      if(data?.ok!==true)return rejection(data);
      const expiresAt=new Date(data.expires_at).toISOString();
      const message=makeEnrollmentMessage({userId:owner,workspaceId:request.workspaceId,
        agentId:data.agent_id,nonce,expiresAt});
      return reply({agentId:data.agent_id,nonce,expiresAt,message,serverOnline:false},201);
    }
    if(request.action==="verify"){
      const {data:record,error}=await supabase.from("docker_agent_registrations")
        .select("id,owner_id,workspace_id,public_key,status,nonce_sha256,challenge_expires_at")
        .eq("id",request.agentId).eq("owner_id",owner).maybeSingle();
      if(error)return dbFailure(error);
      if(!record || record.status!=="pending" || !record.challenge_expires_at ||
        Date.parse(record.challenge_expires_at)<=Date.now())return reply({error:"Pending challenge is missing or expired"},409);
      const nonceHash=await hex(new TextEncoder().encode(request.nonce));
      if(nonceHash!==record.nonce_sha256)return reply({error:"Challenge mismatch"},403);
      const message=makeEnrollmentMessage({userId:owner,workspaceId:record.workspace_id,
        agentId:record.id,nonce:request.nonce,expiresAt:record.challenge_expires_at});
      const pub=await crypto.subtle.importKey("raw",decodeBase64url(record.public_key,32),{name:"Ed25519"},false,["verify"]);
      const ok=await crypto.subtle.verify({name:"Ed25519"},pub,decodeBase64url(request.signature,64),new TextEncoder().encode(message));
      if(!ok)return reply({error:"Signature verification failed"},403);
      // Atomic consume: pending, owner, nonce hash AND expiry are re-checked in SQL.
      const {data,error:finishError}=await supabase.rpc("docker_identity_finish_enrollment",
        {p_user_id:owner,p_agent_id:record.id,p_nonce_hash:nonceHash});
      if(finishError)return dbFailure(finishError);
      if(data?.ok!==true)return rejection(data);
      return reply({agentId:record.id,status:"key_verified",serverOnline:false});
    }
    if(request.action==="revoke"){
      const {data,error}=await supabase.rpc("docker_identity_revoke_enrollment",
        {p_user_id:owner,p_agent_id:request.agentId});
      if(error)return dbFailure(error);
      if(data?.ok!==true)return rejection(data);
      return reply({agentId:request.agentId,status:"revoked",remoteKeyRevoked:false});
    }
    return reply({error:"Unsupported operation"},400);
  }catch{
    return reply({error:"Docker enrollment request failed"},503);
  }
});
