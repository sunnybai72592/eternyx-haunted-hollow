import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import {
  CLOUD_INPUT_LIMIT, CLOUD_OUTPUT_LIMIT, parseAutomationControlRequest,
} from "../_shared/automation-control-contract.mjs";
import { runLocalWorkflow } from "../../../src/lib/automationWorkflow.mjs";
import { createTemplateCards, fingerprintPreview } from "../_shared/automation-template-catalog.mjs";
import { issueWebhookCredential } from "../_shared/automation-webhook-crypto.mjs";
import { decryptScheduledText, SCHEDULE_INPUT_BYTES } from "../_shared/automation-schedule-crypto.mjs";

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Vary": "Authorization",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders });
type RpcResult = { ok?: boolean; reason?: string; [key: string]: unknown };
const rpcStatus: Record<string, number> = {
  invalid_request: 400, invalid_steps: 400, workflow_limit: 429,
  daily_run_limit: 429, not_found: 404, not_found_or_paused: 404,
  stale_workflow: 409, idempotency_conflict: 409,
  trigger_limit: 429, already_exists: 409, trigger_revoked: 404,
  pending_limit: 429, daily_approval_limit: 429, not_pending: 409,
  expired: 410, trigger_run_limit: 429, trigger_submission_limit: 429,
  preview_limit: 429, template_copy_deleted: 409, unknown_template:404,
  policy_daily_limit:429,policy_input_limit:413,policy_output_limit:413,
  policy_webhook_disabled:403,policy_schedule_disabled:403,
  workflow_paused:409,no_enabled_webhook:409,schedule_not_ready:409,invalid_policy:400,
};

function failureReason(reason: unknown): string {
  switch (reason) {
    case "workflow_limit": return "This account has reached the 20 saved workflow limit.";
    case "daily_run_limit": return "This account has reached the 30 cloud runs per 24 hours limit.";
    case "policy_daily_limit": return "This workflow has reached its owner-defined daily execution limit.";
    case "policy_input_limit": return "The input exceeds this workflow's execution policy.";
    case "policy_output_limit": return "The output exceeds this workflow's execution policy.";
    case "policy_webhook_disabled": return "The owner disabled webhook execution for this workflow.";
    case "policy_schedule_disabled": return "The owner disabled scheduled execution for this workflow.";
    case "workflow_paused": return "This workflow is paused.";
    case "no_enabled_webhook": return "No enabled webhook exists for this workflow.";
    case "schedule_not_ready": return "There is no enabled schedule, or the scheduler is globally disabled.";
    case "stale_workflow": return "The saved workflow changed; reload it and try again.";
    case "idempotency_conflict": return "This request key was already used with different content.";
    case "not_found_or_paused": return "The workflow was not found, is not yours, or is paused.";
    case "not_found": return "The workflow could not be found.";
    case "trigger_limit": return "This account has reached the five webhook trigger limit.";
    case "already_exists": return "This workflow already has a webhook; rotate its signing secret instead.";
    case "trigger_revoked": return "This trigger was revoked or rotated.";
    case "pending_limit": return "Maximum 10 open approvals per account. Review or reject pending events.";
    case "daily_approval_limit": return "Maximum 40 signed approval submissions per account per day.";
    case "not_pending": return "This request has already been decided or expired.";
    case "expired": return "This approval request expired after 24 hours.";
    case "trigger_run_limit": return "This webhook reached its owner-defined execution cap for the last 24 hours.";
    case "trigger_submission_limit": return "This webhook reached its owner-defined intake cap for the last 24 hours.";
    default: return "The workflow action was not accepted.";
  }
}
function rpcResponse(data: RpcResult | null, code: string) {
  if (!data || data.ok !== true) {
    const reason = typeof data?.reason === "string" ? data.reason : code;
    return reply({ error: failureReason(reason), code: reason }, rpcStatus[reason] ?? 503);
  }
  return reply(data);
}
async function fingerprint(userId: string, workflowId: string, revision: number, input: string) {
  const bytes = new TextEncoder().encode(JSON.stringify([userId, workflowId, revision, input]));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 18000) return reply({ error: "Request is too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid request JSON" }, 400);
  }
  const request = parseAutomationControlRequest(body);
  if (!request.ok) return reply({ error: "Unsupported or invalid Automation request", code: request.reason }, 400);

  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase || user.is_anonymous) return reply({ error: "Sign in to manage Automation workflows" }, 401);

  try {
    if (request.action === "workflowPolicy") {
      const {data,error}=await supabase.rpc("automation_workflow_policy_status",{
        p_user_id:user.id,p_workflow_id:request.workflowId,
      });
      if(error)throw error;
      if(data?.ok!==true)return rpcResponse(data,"policy_read_failed");
      const webhookSecretConfigured=/^[0-9a-f]{64}$/i.test(
        Deno.env.get("AUTOMATION_WEBHOOK_ENCRYPTION_KEY")??"");
      const scheduleSecretConfigured=/^[0-9a-f]{64}$/i.test(
        Deno.env.get("AUTOMATION_SCHEDULE_ENCRYPTION_KEY")??"");
      const approvalSecretConfigured=/^[0-9a-f]{64}$/i.test(
        Deno.env.get("AUTOMATION_APPROVAL_ENCRYPTION_KEY")??"");
      return reply({...data,source:"authenticated_server",
        webhookSecretConfigured,scheduleSecretConfigured,
        approvalSecretConfigured,
        webhookSettingsReady:data.webhookPolicyReady===true &&
          webhookSecretConfigured &&
          (data.approvalRequiredWebhooks===0||approvalSecretConfigured),
        scheduleSettingsReady:data.schedulePolicyReady===true&&
          scheduleSecretConfigured,
        liveDeliveryVerified:false,
        note:"Policy configuration and database state only. This does not confirm external delivery or a running scheduler."});
    }
    if (request.action === "setWorkflowPolicy") {
      const {data,error}=await supabase.rpc("automation_set_workflow_policy",{
        p_user_id:user.id,p_workflow_id:request.workflowId,
        p_max_input:request.maxInputCharacters,
        p_max_output:request.maxOutputCharacters,
        p_daily_limit:request.dailyRunLimit,
        p_allow_webhook:request.allowWebhook,
        p_allow_schedule:request.allowSchedule,
      });
      if(error)throw error;
      return rpcResponse(data,"policy_update_failed");
    }
    if (request.action === "workflowPreflight") {
      const {data,error}=await supabase.rpc("automation_workflow_preflight",{
        p_user_id:user.id,p_workflow_id:request.workflowId,
        p_channel:request.channel,
        p_input_characters:request.inputCharacters,
        p_output_characters:request.outputCharacters,
      });
      if(error)throw error;
      if(data?.ok!==true)return rpcResponse(data,"preflight_failed");
      return reply({...data,source:"authenticated_server",executed:false,
        externalActionTriggered:false,
        note:"This is a policy snapshot, not a reservation or guarantee of future availability."});
    }
    if (request.action === "list") {
      const { data, error } = await supabase.from("automation_workflows")
        .select("id,name,steps,revision,active,trigger_kind,created_at,updated_at")
        .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20);
      if (error) throw error;
      return reply({ workflows: data ?? [], source: "authenticated_server", schedulingEnabled: false,
        webhooksConfigured: /^[0-9a-f]{64}$/i.test(Deno.env.get("AUTOMATION_WEBHOOK_ENCRYPTION_KEY") ?? ""),
        approvalConfigured: /^[0-9a-f]{64}$/i.test(Deno.env.get("AUTOMATION_APPROVAL_ENCRYPTION_KEY") ?? "") });
    }
    if (request.action === "templates") {
      const { data:pruned, error:pruneError } = await supabase.rpc(
        "automation_prune_template_metadata",{p_user_id:user.id});
      if (pruneError || pruned?.ok!==true) throw pruneError ?? Error("template_cleanup_failed");
      const [{data:rows,error:catalogError},{data:usage,error:usageError}] = await Promise.all([
        supabase.from("automation_template_catalog")
          .select("id,version,name,category,description,sample_input,steps")
          .order("name",{ascending:true}).limit(16),
        supabase.rpc("automation_preview_usage",{p_user_id:user.id}),
      ]);
      if (catalogError || usageError) throw catalogError ?? usageError;
      if (usage?.ok!==true) throw Error("preview_usage_unavailable");
      return reply({source:"authenticated_server",templates:createTemplateCards(rows??[]),
        previewUsage:usage, automaticExecution:false, externalWritesEnabled:false});
    }
    if (request.action === "installTemplate") {
      const {data,error}=await supabase.rpc("automation_instantiate_template",{
        p_user_id:user.id,p_template_id:request.templateId,p_request_key:request.requestKey,
      });
      if(error)throw error;
      return rpcResponse(data,"template_install_failed");
    }
    if (request.action === "previewWorkflow") {
      const auditKey = Deno.env.get("AUTOMATION_PREVIEW_AUDIT_KEY") ?? "";
      if(!/^[0-9a-f]{64}$/i.test(auditKey)) {
        return reply({error:"Private workflow preview audit key is not configured"},503);
      }
      const {data:workflow,error:readError}=await supabase.from("automation_workflows")
        .select("id,revision,steps,active,trigger_kind")
        .eq("id",request.workflowId).eq("user_id",user.id).maybeSingle();
      if(readError)throw readError;
      if(!workflow||workflow.active!==true||workflow.trigger_kind!=="manual") {
        return reply({error:"Saved workflow is paused, unavailable or not owned"},404);
      }
      let result;
      try{result=runLocalWorkflow(request.input,workflow.steps);}
      catch{return reply({error:"Preview input or saved workflow failed safety validation"},400);}
      const encoder=new TextEncoder();
      const inputBytes=encoder.encode(request.input).byteLength;
      const outputBytes=encoder.encode(result.output).byteLength;
      if(inputBytes>2000||outputBytes>10000)return reply({
        error:"Private preview supports 2,000 input bytes and 10,000 output bytes"},413);
      const {data:receipt,error:recordError}=await supabase.rpc(
        "automation_record_workflow_preview",{
          p_user_id:user.id,p_workflow_id:workflow.id,p_revision:workflow.revision,
          p_request_key:request.requestKey,
          p_fingerprint:await fingerprintPreview(auditKey,user.id,workflow.id,
            workflow.revision,request.input),
          p_input_bytes:inputBytes,p_output_bytes:outputBytes,
          p_output_lines:result.outputLines,
        });
      if(recordError)throw recordError;
      if(receipt?.ok!==true)return rpcResponse(receipt,"preview_failed");
      return reply({source:"authenticated_preview",workflowId:workflow.id,
        revision:workflow.revision,output:result.output,outputLines:result.outputLines,
        trace:result.trace,previewedAt:receipt.created_at,
        replayed:receipt.replayed,executed:false,cloudRunRecorded:false,
        externalActionTriggered:false,rawOutputStored:false});
    }
    if (request.action === "history") {
      const { data, error } = await supabase.from("automation_runs")
        .select("id,workflow_id,workflow_revision,status,trigger_type,webhook_trigger_id,schedule_id,input_lines,output_lines,input_characters,output_characters,trace,created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return reply({ runs: data ?? [], source: "authenticated_server", rawInputsStored: false, rawOutputsStored: false });
    }
    if (request.action === "webhooks") {
      const { data, error } = await supabase.from("automation_webhook_triggers")
        .select("id,workflow_id,enabled,approval_required,allowed_scope,daily_execution_limit,daily_submission_limit,created_at,rotated_at,last_used_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      const { data:usage, error:usageError } = await supabase.rpc("automation_webhook_usage", {
        p_user_id:user.id,
      });
      if (usageError) throw usageError;
      return reply({ triggers: data ?? [], usage:usage ?? [], source: "authenticated_server",
        webhooksConfigured: /^[0-9a-f]{64}$/i.test(Deno.env.get("AUTOMATION_WEBHOOK_ENCRYPTION_KEY") ?? "") });
    }
    if (request.action === "setWebhookLimits") {
      const { data, error } = await supabase.rpc("automation_set_webhook_limits", {
        p_user_id:user.id,p_trigger_id:request.triggerId,
        p_executions:request.dailyExecutions,p_submissions:request.dailySubmissions,
      });
      if (error) throw error;
      return rpcResponse(data, "limits_failed");
    }
    if (request.action === "setWebhookApproval") {
      if (request.required === true &&
          !/^[0-9a-f]{64}$/i.test(Deno.env.get("AUTOMATION_APPROVAL_ENCRYPTION_KEY") ?? "")) {
        return reply({ error: "Approval encryption must be configured on the backend first" }, 503);
      }
      const { data, error } = await supabase.rpc("automation_set_webhook_approval", {
        p_user_id: user.id, p_trigger_id: request.triggerId, p_required: request.required,
      });
      if (error) throw error;
      return rpcResponse(data, "approval_policy_failed");
    }
    if (request.action === "approvalInbox") {
      const { data:cleaned,error:cleanupError } = await supabase.rpc("automation_housekeep_approval_inbox", {
        p_user_id:user.id,
      });
      if (cleanupError || cleaned?.ok !== true) throw cleanupError ?? new Error("cleanup_failed");
      const { data, error } = await supabase.from("automation_approval_requests")
        .select("id,trigger_id,workflow_id,workflow_revision,input_bytes,status,created_at,expires_at,decided_at,run_id")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return reply({ approvals: data ?? [], source: "authenticated_server",
        plaintextStored: false, pendingLimit: 10, intakeDailyLimit: 40 });
    }
    if (request.action === "clearResolvedApprovals") {
      const { data,error } = await supabase.rpc("automation_clear_resolved_approvals", {
        p_user_id:user.id,
      });
      if (error) throw error;
      return rpcResponse(data,"clear_failed");
    }
    if (request.action === "rejectWebhook") {
      const { data, error } = await supabase.rpc("automation_reject_webhook_approval", {
        p_user_id: user.id, p_approval_id: request.approvalId,
      });
      if (error) throw error;
      return rpcResponse(data, "rejection_failed");
    }
    if (request.action === "previewApproval" || request.action === "approveWebhook") {
      const master = Deno.env.get("AUTOMATION_APPROVAL_ENCRYPTION_KEY") ?? "";
      if (!/^[0-9a-f]{64}$/i.test(master)) {
        return reply({ error: "Approval decrypt key is not configured" }, 503);
      }
      const { data: approval, error: approvalError } = await supabase.from("automation_approval_requests")
        .select("id,user_id,workflow_id,workflow_revision,status,expires_at,input_ciphertext,input_nonce,input_bytes")
        .eq("id", request.approvalId).eq("user_id", user.id).maybeSingle();
      if (approvalError) throw approvalError;
      if (!approval || approval.status !== "pending" ||
          Date.parse(approval.expires_at) <= Date.now()) {
        return reply({ error: "This approval is not pending or has expired" }, 404);
      }
      const input = await decryptScheduledText(
        master, approval.input_ciphertext, approval.input_nonce, SCHEDULE_INPUT_BYTES,
      );
      if (new TextEncoder().encode(input).byteLength !== approval.input_bytes) {
        return reply({ error: "Encrypted request metadata does not match" }, 503);
      }
      if (request.action === "previewApproval") {
        // The verified owner can inspect the actual text before authorizing a run.
        return reply({ approvalId: approval.id, input, expiresAt: approval.expires_at,
          workflowId: approval.workflow_id, source: "authenticated_owner_preview",
          executed: false });
      }
      const { data: workflow, error: workflowError } = await supabase.from("automation_workflows")
        .select("id,user_id,steps,revision,active,trigger_kind")
        .eq("id", approval.workflow_id).eq("user_id", user.id).maybeSingle();
      if (workflowError) throw workflowError;
      if (!workflow || workflow.active !== true || workflow.trigger_kind !== "manual" ||
          workflow.revision !== approval.workflow_revision) {
        return reply({ error: "Saved workflow changed or was paused; this request cannot execute" }, 409);
      }
      let result;
      try { result = runLocalWorkflow(input, workflow.steps); }
      catch { return reply({ error: "Saved workflow cannot safely process this approval" }, 400); }
      if (result.output.length > CLOUD_OUTPUT_LIMIT) {
        return reply({ error: "Approved result exceeds the 30,000-character cloud limit" }, 413);
      }
      const trace = result.trace.map((step: {
        id: string; kind: string; beforeLines: number; afterLines: number;
        beforeChars: number; afterChars: number; changed: boolean;
      }) => ({
        id:step.id,kind:step.kind,beforeLines:step.beforeLines,afterLines:step.afterLines,
        beforeChars:step.beforeChars,afterChars:step.afterChars,changed:step.changed,
      }));
      const { data: recorded, error: recordError } = await supabase.rpc("automation_approve_webhook_execution", {
        p_user_id:user.id,p_approval_id:approval.id,p_workflow_revision:workflow.revision,
        p_input_lines:input.length ? input.split(/\r\n|\n|\r/).length : 0,
        p_output_lines:result.outputLines,p_input_characters:input.length,
        p_output_characters:result.output.length,p_trace:trace,
      });
      if (recordError) throw recordError;
      if (!recorded || recorded.ok !== true) return rpcResponse(recorded, "approval_failed");
      return reply({
        approvalId:approval.id,runId:recorded.run_id,createdAt:recorded.created_at,
        status:"approved",output:result.output,outputLines:result.outputLines,
        trace:result.trace,source:"authenticated_owner_approval",executed:true,
      });
    }
    if (request.action === "createWebhook" || request.action === "rotateWebhook") {
      const master = Deno.env.get("AUTOMATION_WEBHOOK_ENCRYPTION_KEY") ?? "";
      if (!/^[0-9a-f]{64}$/i.test(master)) {
        return reply({ error: "Webhook encryption secret is not configured; triggers are disabled." }, 503);
      }
      let workflowId = request.workflowId;
      if (request.action === "rotateWebhook") {
        const { data: existing, error } = await supabase.from("automation_webhook_triggers")
          .select("workflow_id").eq("id", request.triggerId).eq("user_id", user.id).maybeSingle();
        if (error) throw error;
        if (!existing) return reply({ error: "Webhook not found" }, 404);
        workflowId = existing.workflow_id;
      }
      const created = await issueWebhookCredential(master);
      const { data, error } = await supabase.rpc("automation_register_webhook", {
        p_user_id: user.id, p_workflow_id: workflowId,
        p_ciphertext: created.credential_ciphertext, p_iv: created.credential_iv,
        p_rotate: request.action === "rotateWebhook",
      });
      if (error) throw error;
      if (!data || data.ok !== true) return rpcResponse(data, "webhook_failed");
      return reply({ ok: true, triggerId: data.trigger_id, workflowId,
        enabled: false, signingKey: created.secret,
        message: "Save this signing key now. It cannot be retrieved later; rotation disables the trigger until you explicitly enable it." });
    }
    if (request.action === "toggleWebhook") {
      const { data, error } = await supabase.rpc("automation_set_webhook_enabled", {
        p_user_id: user.id, p_trigger_id: request.triggerId, p_enabled: request.enabled,
      });
      if (error) throw error;
      return rpcResponse(data, "webhook_toggle_failed");
    }
    if (request.action === "deleteWebhook") {
      const { data, error } = await supabase.rpc("automation_delete_webhook", {
        p_user_id: user.id, p_trigger_id: request.triggerId,
      });
      if (error) throw error;
      return rpcResponse(data, "webhook_delete_failed");
    }
    if (request.action === "save") {
      const { data, error } = await supabase.rpc("automation_save_workflow", {
        p_user_id: user.id, p_name: request.name, p_steps: request.steps, p_workflow_id: request.workflowId,
      });
      if (error) throw error;
      return rpcResponse(data, "save_failed");
    }
    if (request.action === "toggle") {
      const { data, error } = await supabase.rpc("automation_toggle_workflow", {
        p_user_id: user.id, p_workflow_id: request.workflowId, p_active: request.active,
      });
      if (error) throw error;
      return rpcResponse(data, "toggle_failed");
    }
    if (request.action === "delete") {
      const { data, error } = await supabase.rpc("automation_delete_workflow", {
        p_user_id: user.id, p_workflow_id: request.workflowId,
      });
      if (error) throw error;
      return rpcResponse(data, "delete_failed");
    }
    if (request.action === "run") {
      // Server fetches the current owner-scoped definition; the browser sends
      // neither executable steps nor forged execution result/trace.
      const { data: workflow, error: readError } = await supabase.from("automation_workflows")
        .select("id,steps,revision,active,trigger_kind").eq("id", request.workflowId)
        .eq("user_id", user.id).maybeSingle();
      if (readError) throw readError;
      if (!workflow || workflow.active !== true || workflow.trigger_kind !== "manual") {
        return reply({ error: "Workflow is not available for manual execution" }, 404);
      }
      if (request.input.length > CLOUD_INPUT_LIMIT) return reply({ error: "Input too large" }, 413);
      const {data:check,error:checkError}=await supabase.rpc("automation_workflow_preflight",{
        p_user_id:user.id,p_workflow_id:workflow.id,p_channel:"manual",
        p_input_characters:request.input.length,p_output_characters:null,
      });
      if(checkError)throw checkError;
      if(check?.ok!==true)return rpcResponse(check,"policy_unavailable");
      if(check.allowed!==true)return rpcResponse({ok:false,reason:check.reason},"policy_denied");
      let result;
      try { result = runLocalWorkflow(request.input, workflow.steps); }
      catch { return reply({ error: "The saved workflow or its input exceeds safety limits" }, 400); }
      if (result.output.length > CLOUD_OUTPUT_LIMIT) {
        return reply({ error: "Cloud output exceeds the 30,000 character limit" }, 413);
      }
      const summaryTrace = result.trace.map((item: {
        id: string; kind: string; beforeLines: number; afterLines: number;
        beforeChars: number; afterChars: number; changed: boolean;
      }) => ({
        id: item.id, kind: item.kind, beforeLines: item.beforeLines,
        afterLines: item.afterLines, beforeChars: item.beforeChars,
        afterChars: item.afterChars, changed: item.changed,
      }));
      const { data, error } = await supabase.rpc("automation_record_run", {
        p_user_id: user.id,
        p_workflow_id: workflow.id,
        p_revision: workflow.revision,
        p_request_key: request.requestKey,
        p_fingerprint: await fingerprint(user.id, workflow.id, workflow.revision, request.input),
        p_input_lines: request.input.length ? request.input.split(/\r\n|\n|\r/).length : 0,
        p_output_lines: result.outputLines,
        p_input_characters: request.input.length,
        p_output_characters: result.output.length,
        p_trace: summaryTrace,
      });
      if (error) throw error;
      if (!data || data.ok !== true) return rpcResponse(data, "run_failed");
      // Only the immediate response contains raw output; history stores metadata.
      return reply({
        runId: data.run_id, createdAt: data.created_at, replayed: data.already_recorded === true,
        output: result.output, outputLines: result.outputLines, trace: result.trace,
        source: "authenticated_server", executedManually: true,
      });
    }
    return reply({ error: "Unsupported Automation action" }, 400);
  } catch (error) {
    console.error("Automation controller unavailable", {
      action: request.action,
      code: typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code) : "unavailable",
    });
    return reply({ error: "Automation server is unavailable; check migration and function deployment." }, 503);
  }
});
