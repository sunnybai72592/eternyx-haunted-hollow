// Signed-in owner-only Docker operation REVIEW. Does not contact Docker.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import { parseDockerControlRequest, effectiveDockerControlState } from "../_shared/docker-control-contract.mjs";
import { reconcileDockerClaim, dockerDispatchOverview } from "../_shared/docker-dispatch-observability.mjs";
const headers={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Cache-Control":"no-store",
  "Content-Type":"application/json; charset=utf-8",
};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const reasonStatus:Record<string,number>={
  invalid_request:400,not_found:404,expired:410,idempotency_conflict:409,
  already_decided:409,policy_disabled:403,agent_unavailable:409,
  open_limit:429,daily_limit:429,
};
const reasonMessage:Record<string,string>={
  invalid_request:"Invalid Docker control request",
  not_found:"Operation request not found or not owned by your account",
  expired:"Operation request expired",
  idempotency_conflict:"This request key already belongs to another operation",
  already_decided:"Operation request is no longer pending",
  policy_disabled:"Explicit Docker operation review policy is disabled",
  agent_unavailable:"Agent has no recent verified-key signed Docker report",
  open_limit:"Three unexpired operation requests are already open",
  daily_limit:"Daily operation request limit reached",
};
serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return reply({error:"Method not allowed"},405);
  let parsed;
  try{
    const raw=await req.text();
    if(raw.length>1800)return reply({error:"Request too large"},413);
    parsed=parseDockerControlRequest(JSON.parse(raw));
  }catch{return reply({error:"Invalid JSON body"},400);}
  if(!parsed)return reply({error:"Invalid Docker control action"},400);
  const {user,supabase}=await authenticateUser(req);
  if(!user||!supabase||user.is_anonymous)return reply({error:"Sign in to review Docker operations"},401);
  const owner=user.id;
  try{
    if(parsed.action==="list"){
      const [policy,requests,events,agents,dispatch]=await Promise.all([
        supabase.from("docker_control_policies").select("enabled,daily_limit,updated_at").eq("owner_id",owner).maybeSingle(),
        supabase.from("docker_control_requests").select("id,agent_id,operation,container_id,state,requested_at,expires_at,approved_at,resolved_at").eq("owner_id",owner).order("requested_at",{ascending:false}).limit(30),
        supabase.from("docker_control_events").select("request_id,event_kind,occurred_at").eq("owner_id",owner).order("id",{ascending:false}).limit(40),
        supabase.from("docker_agent_registrations").select("id,display_name,status").eq("owner_id",owner).eq("status","key_verified").limit(10),
        supabase.from("docker_command_claims").select("request_id,id,state,claimed_at,authorized_at,reported_at").eq("owner_id",owner).order("claimed_at",{ascending:false}).limit(30),
      ]);
      if(policy.error||requests.error||events.error||agents.error||dispatch.error)throw new Error("Database read unavailable");
      const observedAt=new Date().toISOString();
      const claimsByRequest=new Map((dispatch.data??[]).map((x:Record<string,unknown>)=>[x.request_id,x]));
      const ownedRequests=(requests.data??[]).map((r:Record<string,unknown>)=>{
        const claim=claimsByRequest.get(r.id);
        return {...r,effective_state:effectiveDockerControlState(r),
          execution_status:claim?claim.state:"not_dispatched",
          dispatch_claimed_at:claim?.claimed_at??null,
          dispatch_reported_at:claim?.reported_at??null,
          reconciliation:reconcileDockerClaim(claim,Date.parse(observedAt))};
      });
      return reply({
        policy:policy.data??{enabled:false,daily_limit:5},
        requests:ownedRequests,
        dispatchOverview:dockerDispatchOverview(ownedRequests),
        observedAt,
        events:events.data??[],agents:agents.data??[],
        remoteExecutionEnabled:false,labDispatchConfigurable:true,source:"authenticated_server",
      });
    }
    let data,error;
    if(parsed.action==="policy"){
      ({data,error}=await supabase.rpc("docker_set_control_policy",{
        p_owner_id:owner,p_enabled:parsed.enabled,p_daily_limit:parsed.dailyLimit,
      }));
    }else if(parsed.action==="request"){
      ({data,error}=await supabase.rpc("docker_create_control_request",{
        p_owner_id:owner,p_agent_id:parsed.agentId,
        p_request_key:parsed.requestKey,p_operation:parsed.operation,
        p_container_id:parsed.containerId,
      }));
    }else if(parsed.action==="decide"){
      ({data,error}=await supabase.rpc("docker_decide_control_request",{
        p_owner_id:owner,p_request_id:parsed.requestId,p_decision:parsed.decision,
      }));
    }else return reply({error:"Unsupported action"},400);
    if(error)throw new Error("Database mutation unavailable");
    if(data?.ok!==true){
      const reason=typeof data?.reason==="string"?data.reason:"unavailable";
      return reply({error:reasonMessage[reason]??"Docker control action unavailable",code:reason},reasonStatus[reason]??503);
    }
    return reply({...data,remoteExecutionEnabled:false,executionStatus:"not_executed"},parsed.action==="request"?201:200);
  }catch{
    return reply({error:"Docker control service unavailable"},503);
  }
});
