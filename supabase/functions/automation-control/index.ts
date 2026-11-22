import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import {
  CLOUD_INPUT_LIMIT, CLOUD_OUTPUT_LIMIT, parseAutomationControlRequest,
} from "../_shared/automation-control-contract.mjs";
import { runLocalWorkflow } from "../../../src/lib/automationWorkflow.mjs";
import { issueWebhookCredential } from "../_shared/automation-webhook-crypto.mjs";

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
};

function failureReason(reason: unknown): string {
  switch (reason) {
    case "workflow_limit": return "This account has reached the 20 saved workflow limit.";
    case "daily_run_limit": return "This account has reached the 30 cloud runs per 24 hours limit.";
    case "stale_workflow": return "The saved workflow changed; reload it and try again.";
    case "idempotency_conflict": return "This request key was already used with different content.";
    case "not_found_or_paused": return "The workflow was not found, is not yours, or is paused.";
    case "not_found": return "The workflow could not be found.";
    case "trigger_limit": return "This account has reached the five webhook trigger limit.";
    case "already_exists": return "This workflow already has a webhook; rotate its signing secret instead.";
    case "trigger_revoked": return "This trigger was revoked or rotated.";
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
    if (request.action === "list") {
      const { data, error } = await supabase.from("automation_workflows")
        .select("id,name,steps,revision,active,trigger_kind,created_at,updated_at")
        .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20);
      if (error) throw error;
      return reply({ workflows: data ?? [], source: "authenticated_server", schedulingEnabled: false,
        webhooksConfigured: /^[0-9a-f]{64}$/i.test(Deno.env.get("AUTOMATION_WEBHOOK_ENCRYPTION_KEY") ?? "") });
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
        .select("id,workflow_id,enabled,created_at,rotated_at,last_used_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return reply({ triggers: data ?? [], source: "authenticated_server",
        webhooksConfigured: /^[0-9a-f]{64}$/i.test(Deno.env.get("AUTOMATION_WEBHOOK_ENCRYPTION_KEY") ?? "") });
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
