// Ed25519-authenticated, fail-closed Docker lab dispatch.
// Production and isolated tests use the SAME request handler. No Docker API.
import {serve} from "https://deno.land/std@0.190.0/http/server.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {getSupabaseSecretKey} from "../_shared/supabase.ts";
import {createDockerDispatchHandler} from "../_shared/docker-dispatch-handler.mjs";
async function serverSigningKey(){
  const encoded=Deno.env.get("DOCKER_LAB_SERVER_PRIVATE_KEY_PKCS8_B64")||"";
  if(!/^[A-Za-z0-9+/]{64}$/.test(encoded))throw Error("Missing server signing key.");
  const bytes=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));
  if(bytes.length!==48)throw Error("Invalid server key.");
  return crypto.subtle.importKey("pkcs8",bytes,{name:"Ed25519"},false,["sign"]);
}
const handler=createDockerDispatchHandler({
  isEnabled:()=>Deno.env.get("DOCKER_REMOTE_LAB_ENABLED")==="true",
  makeContext:async()=>{
    // Edge secret never reaches a browser or the test harness.
    const signer=await serverSigningKey();
    const url=Deno.env.get("SUPABASE_URL")||"";
    if(!url)throw Error("Missing backend configuration");
    const db=createClient(url,getSupabaseSecretKey(),
      {auth:{persistSession:false,autoRefreshToken:false}});
    return {
      signer,
      loadAgent:async(agentId)=>{
        const {data,error}=await db.from("docker_agent_registrations")
          .select("id,status,revoked_at,public_key").eq("id",agentId).maybeSingle();
        if(error)throw error;
        return data;
      },
      rpc:async(name,args)=>{
        const {data,error}=await db.rpc(name,args);
        if(error)throw error;
        return data;
      },
    };
  },
});
serve(handler);
