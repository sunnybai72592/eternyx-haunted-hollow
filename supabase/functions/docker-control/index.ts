// Signed-in owner-only Docker operation REVIEW. Does not contact Docker.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import { verifiedDockerOwnerId } from "../_shared/docker-owner-guard.mjs";
import { parseDockerControlRequest, effectiveDockerControlState } from "../_shared/docker-control-contract.mjs";
import { reconcileDockerClaim, dockerDispatchOverview } from "../_shared/docker-dispatch-observability.mjs";
import { parseDockerIncidentAction } from "../_shared/docker-incident-contract.mjs";
import { parseDockerReleaseReviewAction } from "../_shared/docker-release-review-contract.mjs";
import { parseDockerContainmentAction, deriveDockerReadiness } from "../_shared/docker-containment-contract.mjs";
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
  open_limit:429,daily_limit:429,case_limit:429,event_limit:429,not_actionable:409,incident_hold:423,release_required:409,not_escalated:409,invalid_transition:409,
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
  daily_limit:"Daily request limit reached",
  case_limit:"Maximum investigation cases reached",
  event_limit:"Investigation history limit reached",
  not_actionable:"Only failed or delayed signed claims can open an incident",
  incident_hold:"Docker incident containment is active; approval policy cannot be re-enabled",
  release_required:"Release the escalated containment explicitly before ordinary case triage",
  not_escalated:"Only an escalated case can release containment",
  invalid_transition:"Release review transition is not permitted; reviewed or blocked records are terminal",
};
serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return reply({error:"Method not allowed"},405);
  let parsed;
  try{
    const raw=await req.text();
    if(raw.length>1800)return reply({error:"Request too large"},413);
    const body=JSON.parse(raw);
    parsed=parseDockerControlRequest(body)||parseDockerIncidentAction(body)||parseDockerContainmentAction(body)||parseDockerReleaseReviewAction(body);
  }catch{return reply({error:"Invalid JSON body"},400);}
  if(!parsed)return reply({error:"Invalid Docker control action"},400);
  const {user,supabase}=await authenticateUser(req);
  const verifiedOwner=verifiedDockerOwnerId(user,supabase);
  if(!user||!supabase||user.is_anonymous||!verifiedOwner)return reply({error:"Sign in to review Docker operations"},401);
  const owner=verifiedOwner;
  try{
    if(parsed.action==="list"){
      const [policy,requests,events,agents,dispatch,incidents,incidentEvents,reports,releaseReviews,releaseEvents]=await Promise.all([
        supabase.from("docker_control_policies").select("enabled,daily_limit,incident_hold,incident_hold_at,updated_at").eq("owner_id",owner).maybeSingle(),
        supabase.from("docker_control_requests").select("id,agent_id,operation,container_id,state,requested_at,expires_at,approved_at,resolved_at").eq("owner_id",owner).order("requested_at",{ascending:false}).limit(30),
        supabase.from("docker_control_events").select("request_id,event_kind,occurred_at").eq("owner_id",owner).order("id",{ascending:false}).limit(40),
        supabase.from("docker_agent_registrations").select("id,display_name,status").eq("owner_id",owner).eq("status","key_verified").limit(10),
        supabase.from("docker_command_claims").select("request_id,id,state,claimed_at,authorized_at,reported_at").eq("owner_id",owner).order("claimed_at",{ascending:false}).limit(30),
        supabase.from("docker_lab_incidents").select("id,claim_id,reason,status,created_at,updated_at").eq("owner_id",owner).order("created_at",{ascending:false}).limit(50),
        supabase.from("docker_lab_incident_events").select("id,incident_id,action,note,occurred_at").eq("owner_id",owner).order("id",{ascending:false}).limit(40),
        supabase.from("docker_agent_reports").select("agent_id,engine_available,last_received_at").eq("owner_id",owner).order("last_received_at",{ascending:false}).limit(25),
        supabase.from("docker_release_reviews").select("id,request_key,commit_sha,candidate_sha256,source_snapshot_sha256,manifest_sha256,staging_ref,state,created_at,updated_at,reviewed_at").eq("owner_id",owner).order("created_at",{ascending:false}).limit(30),
        supabase.from("docker_release_review_events").select("id,review_id,event_kind,note,occurred_at").eq("owner_id",owner).order("id",{ascending:false}).limit(80),
      ]);
      if(policy.error||requests.error||events.error||agents.error||dispatch.error||incidents.error||incidentEvents.error||reports.error||releaseReviews.error||releaseEvents.error)throw new Error("Database read unavailable");
      const observedAt=new Date().toISOString();
      const claimsByRequest=new Map<string,Record<string,unknown>>(
        (dispatch.data??[]).map((x:Record<string,unknown>)=>[String(x.request_id),x] as const)
      );
      const ownedRequests=(requests.data??[]).map((r:Record<string,unknown>)=>{
        const claim=claimsByRequest.get(String(r.id));
        return {...r,effective_state:effectiveDockerControlState(r),
          execution_status:claim?claim.state:"not_dispatched",
          dispatch_claim_id:claim?.id??null,
          dispatch_claimed_at:claim?.claimed_at??null,
          dispatch_reported_at:claim?.reported_at??null,
          reconciliation:reconcileDockerClaim(claim,Date.parse(observedAt))};
      });
      return reply({
        policy:policy.data??{enabled:false,daily_limit:5},
        requests:ownedRequests,
        dispatchOverview:dockerDispatchOverview(ownedRequests),
        readiness:deriveDockerReadiness({
          policy:policy.data??{enabled:false,incident_hold:false},
          agents:agents.data??[],
          reports:reports.data??[],
          incidents:incidents.data??[],
          claims:dispatch.data??[],
        },Date.parse(observedAt)),
        observedAt,
        events:events.data??[],agents:agents.data??[],
        incidents:incidents.data??[],incidentEvents:incidentEvents.data??[],
        releaseReviews:releaseReviews.data??[],releaseReviewEvents:releaseEvents.data??[],
        releaseExecutionAuthorized:false,releaseIndependentApprovalVerified:false,
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
    }else if(parsed.action==="incident_open"){
      ({data,error}=await supabase.rpc("docker_lab_open_incident",{
        p_owner_id:owner,p_claim_id:parsed.claimId,p_note:parsed.note,
      }));
    }else if(parsed.action==="incident_triage"){
      ({data,error}=await supabase.rpc("docker_lab_triage_incident",{
        p_owner_id:owner,p_incident_id:parsed.incidentId,p_status:parsed.status,p_note:parsed.note,
      }));
    }else if(parsed.action==="incident_escalate"){
      ({data,error}=await supabase.rpc("docker_lab_escalate_incident",{
        p_owner_id:owner,p_incident_id:parsed.incidentId,p_note:parsed.note,
      }));
    }else if(parsed.action==="release_submit"){
      ({data,error}=await supabase.rpc("docker_release_submit_review",{
        p_owner_id:owner,p_request_key:parsed.requestKey,
        p_commit_sha:parsed.commitSha,p_candidate_sha256:parsed.candidateSha256,
        p_source_snapshot_sha256:parsed.sourceSnapshotSha256,
        p_manifest_sha256:parsed.manifestSha256,
        p_staging_ref:parsed.stagingRef,p_note:parsed.note,
      }));
    }else if(parsed.action==="release_decide"){
      ({data,error}=await supabase.rpc("docker_release_decide_review",{
        p_owner_id:owner,p_review_id:parsed.reviewId,p_next_state:parsed.state,
        p_note:parsed.note,
      }));
    }else if(parsed.action==="incident_release_hold"){
      ({data,error}=await supabase.rpc("docker_lab_release_incident_hold",{
        p_owner_id:owner,p_incident_id:parsed.incidentId,p_note:parsed.note,
      }));
    }else return reply({error:"Unsupported action"},400);
    if(error)throw new Error("Database mutation unavailable");
    if(data?.ok!==true){
      const reason=typeof data?.reason==="string"?data.reason:"unavailable";
      return reply({error:reasonMessage[reason]??"Docker control action unavailable",code:reason},reasonStatus[reason]??503);
    }
    return reply({...data,remoteExecutionEnabled:false,executionStatus:"not_executed",releaseExecutionAuthorized:false,releaseIndependentApprovalVerified:false},parsed.action==="request"||parsed.action==="release_submit"&&!data?.reused?201:200);
  }catch{
    return reply({error:"Docker control service unavailable"},503);
  }
});
