import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import { encryptScheduledText, decryptScheduledText } from "../_shared/automation-schedule-crypto.mjs";
import {
  parseGitHubIssueAction,issueFingerprint,verifyIssueConnection,
  createApprovedGitHubIssue,ISSUE_PAYLOAD_BYTES,
} from "../_shared/automation-github-issues.mjs";

const HEADERS={
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Authorization",
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
async function readBody(req:Request){
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type")??""))throw Error("content_type");
  const indicated=Number(req.headers.get("content-length")??"0");
  if(!Number.isFinite(indicated)||indicated>4500)throw Error("oversized");
  if(!req.body)throw Error("empty");
  const reader=req.body.getReader(),parts:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const {value,done}=await reader.read();if(done)break;
      total+=value.byteLength;if(total>4500)throw Error("oversized");
      parts.push(value);
    }
  }catch(e){await reader.cancel().catch(()=>undefined);throw e;}
  const all=new Uint8Array(total);let at=0;
  for(const part of parts){all.set(part,at);at+=part.byteLength;}
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(all));
}
function failure(reason:unknown){
  const code=typeof reason==="string"?reason:"unavailable";
  const status:Record<string,number>={
    invalid_request:400,disabled:409,not_connected:404,
    draft_limit:429,pending_limit:429,write_limit:429,issue_in_flight:429,
    not_pending:409,idempotency_conflict:409,connection_changed:409,
    not_found:404,expired:410,version_exhausted:409,
  };
  return reply({error:"GitHub issue action could not proceed; check its status and permissions.",
    code},status[code]??503);
}
function decodeDraft(text:string){
  const value=JSON.parse(text);
  if(!value||typeof value!=="object"||Array.isArray(value)||
     Object.keys(value).some(key=>key!=="title"&&key!=="body")||
     typeof value.title!=="string"||typeof value.body!=="string"||
     value.title.length<1||value.title.length>120||value.body.length>1000){
    throw Error("invalid_encrypted_draft");
  }
  return {title:value.title,body:value.body};
}
serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:HEADERS});
  if(req.method!=="POST")return reply({error:"Method not allowed"},405);
  let body:unknown;
  try{body=await readBody(req);}catch{return reply({error:"Invalid or oversized JSON request"},400);}
  const action=parseGitHubIssueAction(body);
  if(!action.ok)return reply({error:"Invalid GitHub issue action",code:action.reason},400);
  const {user,supabase}=await authenticateUser(req);
  if(!user||!supabase||user.is_anonymous)return reply({error:"Sign in required"},401);

  const master=Deno.env.get("AUTOMATION_GITHUB_WRITE_ENCRYPTION_KEY")??"";
  if(!/^[a-f0-9]{64}$/i.test(master)){
    return reply({error:"GitHub Issue connector is not configured; writing is disabled"},503);
  }
  try{
    if(action.action==="connect"){
      // Verify the token actually reaches this exact repository, before storing
      // it. Read access/has_issues does NOT guarantee Issues:write permission;
      // GitHub independently enforces write permission at the final POST.
      const check=await verifyIssueConnection(action.token,action.owner,action.repo);
      if(!check.ok){
        return reply({error:"GitHub could not verify this repository with that fine-grained token.",
          code:check.reason},check.reason==="credential_denied"?403:422);
      }
      const encrypted=await encryptScheduledText(master,action.token,320);
      const {data,error}=await supabase.rpc("automation_connect_github_issues",{
        p_user_id:user.id,p_owner:action.owner,p_repo:action.repo,
        p_login:check.login,p_ciphertext:encrypted.ciphertext,
        p_nonce:encrypted.nonce,
      });
      if(error)throw error;
      if(data?.ok!==true)return failure(data?.reason);
      return reply({source:"authenticated_server",connected:true,enabled:false,
        repoOwner:data.owner,repoName:data.repo,verifiedLogin:data.login,
        connectionVersion:data.version,scope:"github_issue_create",
        issueWritePermissionTested:false,
        note:"Repository access was verified. Actual Issues:write permission is enforced by GitHub when you approve a draft."});
    }
    if(action.action==="toggle"){
      const {data,error}=await supabase.rpc("automation_toggle_github_issues",{
        p_user_id:user.id,p_enabled:action.enabled,
      });
      if(error)throw error;
      if(data?.ok!==true)return failure(data?.reason);
      return reply({source:"authenticated_server",enabled:data.enabled,
        connectionVersion:data.version});
    }
    if(action.action==="disconnect"){
      const {data,error}=await supabase.rpc("automation_disconnect_github_issues",{
        p_user_id:user.id,
      });
      if(error)throw error;
      if(data?.ok!==true)return failure(data?.reason);
      return reply({source:"authenticated_server",disconnected:true});
    }
    if(action.action==="status"||action.action==="list"){
      const {data:clean,error:pruneError}=await supabase.rpc("automation_housekeep_github_issues",{
        p_user_id:user.id,
      });
      if(pruneError||clean?.ok!==true)throw pruneError??Error("cleanup_failed");
      const {data:connection,error:readError}=await supabase.from("automation_github_issue_connections")
        .select("repo_owner,repo_name,github_login,version,enabled,scope,verified_at")
        .eq("user_id",user.id).maybeSingle();
      if(readError)throw readError;
      const {count,error:quotaError}=await supabase.from("automation_github_issue_drafts")
        .select("id",{count:"exact",head:true}).eq("user_id",user.id)
        .in("status",["submitting","succeeded","failed","uncertain"])
        .gt("decided_at",new Date(Date.now()-24*60*60*1000).toISOString());
      if(quotaError)throw quotaError;
      const safe={
        source:"authenticated_server",connected:!!connection,
        enabled:connection?.enabled===true,
        connection:connection?{
          owner:connection.repo_owner,repo:connection.repo_name,
          verifiedLogin:connection.github_login,version:connection.version,
          verifiedAt:connection.verified_at,scope:connection.scope,
        }:null,
        writeAttempts24h:count??0,writeLimit24h:3,openDraftLimit:3,
        draftLimit24h:10,permissionProvedByRead:false,
        externalIssueWritesPossible:true,resultsMayBeUncertain:true,
      };
      if(action.action==="status")return reply(safe);
      const {data:drafts,error:draftError}=await supabase.from("automation_github_issue_drafts")
        .select("id,repo_owner,repo_name,status,connection_version,created_at,expires_at,decided_at,issue_number,issue_url,error_code")
        .eq("user_id",user.id).order("created_at",{ascending:false}).limit(20);
      if(draftError)throw draftError;
      return reply({...safe,drafts:drafts??[],source:"authenticated_server"});
    }
    if(action.action==="prepare"){
      const {data:connection,error:readError}=await supabase.from("automation_github_issue_connections")
        .select("repo_owner,repo_name,version,enabled")
        .eq("user_id",user.id).maybeSingle();
      if(readError)throw readError;
      if(!connection||!connection.enabled)return failure("disabled");
      const payload=JSON.stringify({title:action.title,body:action.body});
      const encrypted=await encryptScheduledText(master,payload,ISSUE_PAYLOAD_BYTES);
      const fp=await issueFingerprint(user.id,connection.repo_owner,
        connection.repo_name,connection.version,action.title,action.body);
      const {data,error}=await supabase.rpc("automation_prepare_github_issue",{
        p_user_id:user.id,p_request_key:action.requestKey,p_fingerprint:fp,
        p_ciphertext:encrypted.ciphertext,p_nonce:encrypted.nonce,
      });
      if(error)throw error;
      if(data?.ok!==true)return failure(data?.reason);
      return reply({source:"authenticated_server",draftId:data.draft_id,
        status:data.status,expiresAt:data.expires_at,replayed:data.replayed,
        executed:false,repoOwner:connection.repo_owner,repoName:connection.repo_name},201);
    }
    if(action.action==="reject"){
      const {data,error}=await supabase.rpc("automation_reject_github_issue",{
        p_user_id:user.id,p_draft_id:action.draftId,
      });
      if(error)throw error;
      if(data?.ok!==true)return failure(data?.reason);
      return reply({source:"authenticated_server",draftId:action.draftId,
        status:data.status,executed:false});
    }
    if(action.action==="preview"||action.action==="approve"){
      const {data:draft,error:draftError}=await supabase.from("automation_github_issue_drafts")
        .select("id,user_id,repo_owner,repo_name,connection_version,status,expires_at,payload_ciphertext,payload_nonce")
        .eq("id",action.draftId).eq("user_id",user.id).maybeSingle();
      if(draftError)throw draftError;
      if(!draft||draft.status!=="pending"||Date.parse(draft.expires_at)<=Date.now()){
        return reply({error:"GitHub issue draft is no longer pending",code:"not_pending"},409);
      }
      const decrypted=await decryptScheduledText(master,draft.payload_ciphertext,
        draft.payload_nonce,ISSUE_PAYLOAD_BYTES);
      const issue=decodeDraft(decrypted);
      if(action.action==="preview"){
        return reply({source:"authenticated_owner_preview",draftId:draft.id,
          owner:draft.repo_owner,repo:draft.repo_name,title:issue.title,
          body:issue.body,expiresAt:draft.expires_at,
          executed:false,scope:"github_issue_create"});
      }

      const {data:connection,error:connectionError}=await supabase.from("automation_github_issue_connections")
        .select("repo_owner,repo_name,version,enabled,credential_ciphertext,credential_nonce")
        .eq("user_id",user.id).maybeSingle();
      if(connectionError)throw connectionError;
      if(!connection||connection.enabled!==true||
         connection.version!==draft.connection_version||
         connection.repo_owner.toLowerCase()!==draft.repo_owner.toLowerCase()||
         connection.repo_name.toLowerCase()!==draft.repo_name.toLowerCase()){
        return failure("connection_changed");
      }
      // Unseal the PAT before claiming (so a bad key cannot consume a write).
      const token=await decryptScheduledText(master,connection.credential_ciphertext,
        connection.credential_nonce,320);
      const {data:claimed,error:claimError}=await supabase.rpc("automation_claim_github_issue",{
        p_user_id:user.id,p_draft_id:draft.id,
        p_connection_version:connection.version,
      });
      if(claimError)throw claimError;
      if(claimed?.ok!==true)return failure(claimed?.reason);
      // This POST may have effects even if the network response is lost. NEVER
      // retry the same draft automatically, including error paths or timeouts.
      const posted=await createApprovedGitHubIssue(token,claimed.owner,claimed.repo,
        issue.title,issue.body);
      const {data:finished,error:finishError}=await supabase.rpc("automation_finish_github_issue",{
        p_user_id:user.id,p_draft_id:draft.id,p_state:posted.state,
        p_issue_number:posted.state==="succeeded"?posted.number:null,
        p_issue_url:posted.state==="succeeded"?posted.url:null,
        p_error_code:posted.state==="succeeded"?null:posted.code,
      });
      if(finishError||finished?.ok!==true){
        // Do not retry: the remote write may already have succeeded.
        return reply({source:"authenticated_server",draftId:draft.id,
          status:"uncertain",retryAllowed:false,
          error:"GitHub write outcome may be unconfirmed. Inspect your repository manually."},503);
      }
      return reply({source:"authenticated_server",draftId:draft.id,
        status:posted.state,retryAllowed:false,
        ...(posted.state==="succeeded"
          ?{issueNumber:posted.number,issueUrl:posted.url}
          :{errorCode:posted.code}),
        message:posted.state==="uncertain"
          ?"The issue may have been created. Check GitHub before creating a new draft."
          :posted.state==="failed"?"GitHub rejected the write; no automatic retry.":undefined
      },posted.state==="succeeded"?201:posted.state==="uncertain"?202:422);
    }
    return reply({error:"Unsupported GitHub issue action"},400);
  }catch(error){
    console.error("Approved GitHub issues backend error",{
      code:typeof error==="object"&&error!==null&&"code"in error
        ?String((error as {code?:unknown}).code):"unavailable",
    });
    return reply({error:"GitHub issues integration unavailable. Verify deployment, encryption secret, or refresh status."},503);
  }
});
