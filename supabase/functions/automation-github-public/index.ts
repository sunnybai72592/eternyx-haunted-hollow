import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import {
  parseGitHubIntegrationRequest,fetchGitHubPublicRepo,
} from "../_shared/automation-github-public.mjs";

const headers={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Cache-Control":"no-store",
  "Vary":"Authorization",
  "Content-Type":"application/json; charset=utf-8",
};
const reply=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers});
async function readBounded(req:Request) {
  const advertised=Number(req.headers.get("content-length")??0);
  if (advertised>2000) throw Error("too_large");
  if (!req.body) throw Error("invalid_json");
  const reader=req.body.getReader();
  const parts:Uint8Array[]=[];
  let total=0;
  try {
    while (true) {
      const {value,done}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>2000)throw Error("too_large");
      parts.push(value);
    }
  } catch(e) {await reader.cancel().catch(()=>undefined);throw e;}
  const full=new Uint8Array(total);
  let offset=0;
  for(const p of parts){full.set(p,offset);offset+=p.byteLength;}
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(full));
}
function failure(code:unknown) {
  const reason=typeof code==="string"?code:"unavailable";
  const statuses:Record<string,number>={
    disabled:409,invalid_request:400,invalid_policy:400,invalid_repository:400,
    daily_limit:429,request_in_flight:429,idempotency_conflict:409,
  };
  const messages:Record<string,string>={
    disabled:"Enable the read-only GitHub integration in your account before making requests.",
    daily_limit:"Your GitHub public-read request budget for the last 24 hours is exhausted.",
    request_in_flight:"A GitHub inspection is already running on this account.",
    idempotency_conflict:"This request key was previously used for a different repository.",
  };
  return reply({error:messages[reason]??"GitHub inspection request could not be accepted",code:reason},
    statuses[reason]??503);
}
serve(async (req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return reply({error:"Method not allowed"},405);
  let body:unknown;
  try{body=await readBounded(req);}catch{return reply({error:"Invalid or oversized request body"},400);}
  const request=parseGitHubIntegrationRequest(body);
  if(!request.ok)return reply({error:"Invalid GitHub provider request",code:request.reason},400);

  const {user,supabase}=await authenticateUser(req);
  if(!user || !supabase || user.is_anonymous)return reply({error:"Sign in required"},401);
  try{
    if(request.action==="configure"){
      const {data,error}=await supabase.rpc("automation_set_github_read_policy",{
        p_user_id:user.id,p_enabled:request.enabled,p_daily_limit:request.dailyLimit,
      });
      if(error)throw error;
      if(data?.ok!==true)return failure(data?.reason);
      return reply({source:"authenticated_server",policy:data});
    }

    if(request.action==="status" || request.action==="history"){
      // Pruning is owner-scoped. Results older than 24h are cleared and
      // privacy-safe metadata older than 7d is deleted on owner access.
      const {data:pruned,error:pruneError}=await supabase.rpc(
        "automation_prune_github_reads",{p_user_id:user.id});
      if(pruneError || pruned?.ok!==true)throw pruneError??Error("prune_failed");
      const [{data:policy,error:policyError},{count,error:countError}]=await Promise.all([
        supabase.from("automation_provider_policies").select("enabled,daily_limit")
          .eq("user_id",user.id).maybeSingle(),
        supabase.from("automation_provider_calls").select("id",{count:"exact",head:true})
          .eq("user_id",user.id)
          .gt("created_at",new Date(Date.now()-24*60*60*1000).toISOString()),
      ]);
      if(policyError||countError)throw policyError??countError;
      const base={
        provider:"github_public",scope:"public_repository_metadata_read",
        enabled:policy?.enabled===true,
        dailyLimit:policy?.daily_limit??5,
        usedLast24h:count??0,
        limitWindow:"rolling_24_hours",
        outboundMethod:"GET",
        externalWritesAllowed:false,
        providerCredentialsConfigured:false,
        providerCostGuarantee:false,
        source:"authenticated_server",
      };
      if(request.action==="status")return reply(base);
      const {data:calls,error:historyError}=await supabase.from("automation_provider_calls")
        .select("id,repo_owner,repo_name,state,http_status,error_code,result,created_at,completed_at")
        .eq("user_id",user.id).order("created_at",{ascending:false}).limit(20);
      if(historyError)throw historyError;
      return reply({...base,history:calls??[],resultsRetainedHours:24,auditRetainedDays:7});
    }

    if(request.action==="inspect"){
      const {data:reserved,error:reserveError}=await supabase.rpc("automation_reserve_github_read",{
        p_user_id:user.id,p_repo_owner:request.owner,p_repo_name:request.repo,
        p_request_key:request.requestKey,
      });
      if(reserveError)throw reserveError;
      if(reserved?.ok!==true)return failure(reserved?.reason);
      if(reserved.replayed===true){
        const {data:existing,error:readError}=await supabase.from("automation_provider_calls")
          .select("id,state,http_status,error_code,result,created_at")
          .eq("id",reserved.call_id).eq("user_id",user.id).maybeSingle();
        if(readError)throw readError;
        if(!existing)return reply({error:"Inspection receipt not found"},404);
        return reply({source:"authenticated_server",replayed:true,executedAgain:false,
          callId:existing.id,state:existing.state,result:existing.result,
          errorCode:existing.error_code,createdAt:existing.created_at},existing.state==="reserved"?202:200);
      }
      const provider=await fetchGitHubPublicRepo(request.owner,request.repo);
      const {data:finished,error:finishError}=await supabase.rpc("automation_finish_github_read",{
        p_user_id:user.id,p_call_id:reserved.call_id,p_succeeded:provider.ok,
        p_status:provider.httpStatus,p_result:provider.ok?provider.result:null,
        p_error:provider.ok?null:provider.errorCode,
      });
      if(finishError || finished?.ok!==true)throw finishError??Error("finish_failed");
      return reply({
        source:"authenticated_server",replayed:false,executedAgain:true,
        callId:reserved.call_id,state:provider.ok?"succeeded":"failed",
        ...(provider.ok?{result:provider.result}:{errorCode:provider.errorCode}),
      },provider.ok?200:provider.httpStatus===404?404:provider.errorCode==="provider_rate_limited"?429:502);
    }
    return reply({error:"Unsupported provider action"},400);
  }catch(error){
    console.error("Automation GitHub provider unavailable",{
      code:typeof error==="object"&&error!==null&&"code"in error
        ?String((error as {code?:unknown}).code):"service_error",
    });
    return reply({error:"Provider service temporarily unavailable; check deployment"},503);
  }
});
