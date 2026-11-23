import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { getSupabaseSecretKey } from "../_shared/supabase.ts";
import { runLocalWorkflow } from "../../../src/lib/automationWorkflow.mjs";
import {
  decryptScheduledText,encryptScheduledText,
  scheduledRunFingerprint,validSchedulerWorkerKey,
  SCHEDULE_INPUT_BYTES,SCHEDULE_OUTPUT_BYTES,
} from "../_shared/automation-schedule-crypto.mjs";

// Server-to-server ONLY. No browser JWT, user body identity, arbitrary command,
// untrusted URL, external action, scheduler toggle or cron registration.
const headers = {
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
};
const reply = (data: unknown,status=200) =>
  new Response(JSON.stringify(data),{status,headers});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ScheduleClaim = {
  ok: true;
  schedule_id: string; user_id: string; workflow_id: string;
  revision: number; lease_token: string;request_key: string;
  ciphertext: string;nonce: string;
};
function validClaim(v: unknown): v is ScheduleClaim {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const a = v as Record<string,unknown>;
  return a.ok===true &&
    ["schedule_id","user_id","workflow_id","lease_token","request_key"].every(k=>typeof a[k]==="string" && UUID.test(a[k] as string)) &&
    typeof a.revision==="number" && Number.isInteger(a.revision) && a.revision>0 &&
    typeof a.ciphertext==="string" &&
    a.ciphertext.length>=32 && a.ciphertext.length<=2*(SCHEDULE_INPUT_BYTES+16) &&
    a.ciphertext.length%2===0 && /^[0-9a-f]+$/i.test(a.ciphertext) &&
    typeof a.nonce==="string" && /^[0-9a-f]{24}$/i.test(a.nonce);
}

serve(async (req: Request) => {
  if (req.method!=="POST") return reply({error:"Method not allowed"},405);
  const supplied=req.headers.get("x-eternyx-scheduler-key");
  const expected=Deno.env.get("AUTOMATION_SCHEDULER_WORKER_KEY");
  if (!validSchedulerWorkerKey(supplied,expected)) return reply({error:"Unauthorized worker"},401);
  let action: unknown;
  try {
    const declaredLength=req.headers.get("content-length");
    // Reject malformed/negative length hints; streaming still enforces
    // the same byte limit for chunked bodies with no Content-Length.
    if (declaredLength!==null &&
        (!/^\d{1,3}$/.test(declaredLength) || Number(declaredLength)>80)) {
      return reply({error:"Request too large"},413);
    }
    if (!req.body) return reply({error:"Missing worker request"},400);
    const reader=req.body.getReader();
    const chunks: Uint8Array[]=[];
    let length=0;
    try {
      while (true) {
        const chunk=await reader.read();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) throw Error("invalid_chunk");
        length+=chunk.value.byteLength;
        if (length>80) return reply({error:"Request too large"},413);
        chunks.push(chunk.value);
      }
    } finally {
      // Always release the request reader, including malformed or aborted streams.
      await reader.cancel().catch(()=>undefined);
    }
    const data=new Uint8Array(length);
    let offset=0;
    for (const chunk of chunks) { data.set(chunk,offset);offset+=chunk.byteLength; }
    action=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(data));
  } catch { return reply({error:"Invalid worker request"},400); }
  if (!action || typeof action!=="object" || Array.isArray(action) ||
      Object.keys(action).length!==1 || (action as {action?:unknown}).action!=="tick") {
    return reply({error:"Unsupported worker request"},400);
  }

  const master=Deno.env.get("AUTOMATION_SCHEDULE_ENCRYPTION_KEY") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(master)) return reply({error:"Schedule encryption not configured"},503);
  const url=Deno.env.get("SUPABASE_URL");
  if (!url) return reply({error:"Scheduler database unavailable"},503);
  const db=createClient(url,getSupabaseSecretKey(),{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  let processed=0;
  let failed=0;
  let deferred=0;
  let leaseRecoveryUnconfirmed=0;
  let retentionCleanupFailed=false;
  let disabled=false;
  // Two claims maximum in one invocation, and at most two concurrent leases
  // across all worker instances (enforced again in the SQL claim transaction).
  for (let i=0;i<2;i++) {
    let claim: unknown;
    try {
      const response=await db.rpc("automation_claim_due_schedule");
      if (response.error) throw response.error;
      claim=response.data;
    } catch {
      return reply({error:"Schedule claim service unavailable",processed,failed,deferred,
        leaseRecoveryUnconfirmed},503);
    }
    if (typeof claim==="object" && claim!==null && "ok" in claim &&
        (claim as {ok?:boolean}).ok===false) {
      const reason=(claim as {reason?:string}).reason;
      if (reason==="disabled") disabled=true;
      if (reason==="disabled" || reason==="empty" || reason==="capacity_full") break;
      return reply({error:"Unexpected schedule claim result",processed,failed,deferred,
        leaseRecoveryUnconfirmed},503);
    }
    if (!validClaim(claim)) return reply({error:"Invalid schedule claim",processed,failed,deferred,
      leaseRecoveryUnconfirmed},503);

    try {
      const {data:workflow,error:wError}=await db.from("automation_workflows")
        .select("id,user_id,steps,revision,active,trigger_kind")
        .eq("id",claim.workflow_id).eq("user_id",claim.user_id).maybeSingle();
      if (wError) throw wError;
      if (!workflow || workflow.id!==claim.workflow_id ||
          workflow.user_id!==claim.user_id ||
          !Number.isSafeInteger(workflow.revision) || workflow.revision<1 ||
          !Array.isArray(workflow.steps) ||
          workflow.active!==true || workflow.trigger_kind!=="manual") {
        throw new Error("saved_workflow_unavailable");
      }
      const input=await decryptScheduledText(master,claim.ciphertext,claim.nonce,SCHEDULE_INPUT_BYTES);
      const {data:policy,error:policyError}=await db.rpc("automation_workflow_preflight",{
        p_user_id:claim.user_id,p_workflow_id:workflow.id,
        p_channel:"scheduled",p_input_characters:input.length,
        p_output_characters:null,
      });
      if(policyError||policy?.ok!==true)throw Error("schedule_policy_unavailable");
      if(policy.allowed!==true){
        // A quota-limited task remains eligible for a future tick; an explicitly
        // blocked channel is a failure that the owner must resolve.
        if(policy.reason==="policy_daily_limit"){
          const {data:deferReceipt,error:deferError}=await db.rpc(
            "automation_defer_scheduled_run",{
              p_schedule_id:claim.schedule_id,p_lease_token:claim.lease_token,
              p_schedule_revision:claim.revision,
            });
          if(deferError||deferReceipt?.ok!==true)throw Error("policy_deferral_failed");
          deferred++;
          continue;
        }
        throw Error("schedule_policy_denied");
      }
      const result=runLocalWorkflow(input,workflow.steps);
      const encryptedOutput=await encryptScheduledText(master,result.output,SCHEDULE_OUTPUT_BYTES);
      const trace=result.trace.map((step: {
        id:string;kind:string;beforeLines:number;afterLines:number;
        beforeChars:number;afterChars:number;changed:boolean;
      })=>({
        id:step.id,kind:step.kind,beforeLines:step.beforeLines,
        afterLines:step.afterLines,beforeChars:step.beforeChars,
        afterChars:step.afterChars,changed:step.changed,
      }));
      const fingerprint=await scheduledRunFingerprint(
        claim.user_id,claim.schedule_id,claim.workflow_id,workflow.revision,input,
      );
      const {data:completion,error:completeError}=await db.rpc("automation_complete_scheduled_run",{
        p_schedule_id:claim.schedule_id,p_lease_token:claim.lease_token,
        p_schedule_revision:claim.revision,p_workflow_revision:workflow.revision,
        p_fingerprint:fingerprint,
        p_input_lines:input ? input.split(/\r\n|\n|\r/).length : 0,
        p_output_lines:result.outputLines,
        p_input_characters:input.length,p_output_characters:result.output.length,
        p_trace:trace,p_output_ciphertext:encryptedOutput.ciphertext,
        p_output_nonce:encryptedOutput.nonce,
      });
      if (!completeError && completion?.reason==="daily_run_limit") {
        const {data:postponed,error:deferError}=await db.rpc("automation_defer_scheduled_run",{
          p_schedule_id:claim.schedule_id,p_lease_token:claim.lease_token,
          p_schedule_revision:claim.revision,
        });
        if (deferError || postponed?.ok!==true) throw new Error("quota_deferral_failed");
        deferred++;
        continue;
      }
      if (completeError || completion?.ok!==true) {
        throw new Error("scheduled_completion_rejected");
      }
      processed++;
    } catch {
      failed++;
      // The RPC may return {error} or {ok:false} without throwing.
      // Never imply the lease was released unless PostgreSQL acknowledged it.
      let recoveryConfirmed=false;
      try {
        const {data:failureReceipt,error:failureError}=await db.rpc(
          "automation_fail_scheduled_run",{
            p_schedule_id:claim.schedule_id,p_lease_token:claim.lease_token,
            p_schedule_revision:claim.revision,
          });
        // A resolved RPC can carry {ok:false}, or a syntactically valid
        // but untrustworthy receipt. The SQL contract returns attempts 1..3
        // and retrying=(attempts<3) only after releasing the exact lease.
        recoveryConfirmed=!failureError && failureReceipt?.ok===true &&
          Number.isSafeInteger(failureReceipt.attempts) &&
          failureReceipt.attempts>=1 && failureReceipt.attempts<=3 &&
          typeof failureReceipt.retrying==="boolean" &&
          failureReceipt.retrying===(failureReceipt.attempts<3);
      } catch {
        // Do not log schedule IDs, tokens, plaintext or other sensitive data.
      }
      if(!recoveryConfirmed) {
        leaseRecoveryUnconfirmed++;
        // The lease may still exist, may have expired or may have been
        // reclaimed by another worker. Never claim another task while
        // its predecessor's recovery outcome is ambiguous.
        return reply({error:"Schedule lease recovery unconfirmed",
          processed,failed,deferred,leaseRecoveryUnconfirmed},503);
      }
    }
  }
  try {
    // Prune aged ciphertext on every authenticated tick; no plaintext retained.
    // The SQL function returns an integer deletion count, not {ok:true}.
    const {data:pruned,error:pruneError}=await db.rpc("automation_prune_schedule_outputs");
    if(pruneError || !Number.isSafeInteger(pruned) || pruned<0)
      retentionCleanupFailed=true;
  } catch {
    // Cleanup is best-effort, but a failed database RPC is not silent success.
    retentionCleanupFailed=true;
  }
  return reply({processed,failed,deferred,leaseRecoveryUnconfirmed,
    retentionCleanupFailed,schedulerEnabled:!disabled,
    source:"trusted_scheduler_worker"});
});
