import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { getSupabaseSecretKey } from "../_shared/supabase.ts";
import { runLocalWorkflow } from "../../../src/lib/automationWorkflow.mjs";
import {
  openWebhookCredential, validateWebhookEnvelope, verifyWebhookRequest,
} from "../_shared/automation-webhook-crypto.mjs";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-eternyx-timestamp,x-eternyx-request-id,x-eternyx-signature",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const MAX_BYTES = 14000;
async function readBounded(req: Request): Promise<string> {
  const hint = Number(req.headers.get("content-length") ?? "0");
  if (hint > MAX_BYTES) throw new Error("too_large");
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_BYTES) throw new Error("too_large");
      chunks.push(item.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
async function fingerprint(userId: string, workflowId: string, revision: number, triggerId: string, input: string) {
  const bytes = new TextEncoder().encode(JSON.stringify([userId, workflowId, revision, triggerId, input]));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") ?? "")) {
    return reply({ error: "Content-Type must be application/json" }, 415);
  }
  const master = Deno.env.get("AUTOMATION_WEBHOOK_ENCRYPTION_KEY") ?? "";
  if (!/^[0-9a-f]{64}$/i.test(master)) return reply({ error: "Webhook service is disabled" }, 503);

  let raw: string;
  try { raw = await readBounded(req); }
  catch { return reply({ error: "Payload exceeds allowed size or has invalid text encoding" }, 413); }
  const timestamp = req.headers.get("x-eternyx-timestamp") ?? "";
  const requestId = req.headers.get("x-eternyx-request-id") ?? "";
  const signature = req.headers.get("x-eternyx-signature") ?? "";
  const envelope = validateWebhookEnvelope(raw, timestamp, requestId);
  if (!envelope.ok || !/^sha256=[0-9a-f]{64}$/.test(signature)) {
    return reply({ error: "Invalid or expired webhook envelope" }, 400);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    if (!url) return reply({ error: "Webhook service is unavailable" }, 503);
    const client = createClient(url, getSupabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: trigger, error: triggerError } = await client.from("automation_webhook_triggers")
      .select("id,user_id,workflow_id,credential_ciphertext,credential_iv,enabled,credential_version")
      .eq("id", envelope.triggerId).maybeSingle();
    if (triggerError) throw triggerError;
    // Do not disclose whether the trigger exists or whether its signature failed.
    if (!trigger || trigger.enabled !== true) return reply({ error: "Unauthorized webhook" }, 401);

    const secretBytes = await openWebhookCredential(master, trigger.credential_iv, trigger.credential_ciphertext);
    if (!await verifyWebhookRequest(secretBytes, timestamp, requestId, raw, signature)) {
      return reply({ error: "Unauthorized webhook" }, 401);
    }
    const { data: workflow, error: workflowError } = await client.from("automation_workflows")
      .select("id,user_id,steps,revision,active,trigger_kind")
      .eq("id", trigger.workflow_id).eq("user_id", trigger.user_id).maybeSingle();
    if (workflowError) throw workflowError;
    if (!workflow || workflow.active !== true || workflow.trigger_kind !== "manual") {
      return reply({ error: "This workflow is not available" }, 404);
    }

    let result;
    try { result = runLocalWorkflow(envelope.input, workflow.steps); }
    catch { return reply({ error: "Input or workflow exceeded safe execution limits" }, 400); }
    if (result.output.length > 30000) return reply({ error: "Result exceeded webhook output limit" }, 413);

    const trace = result.trace.map((s: {
      id: string; kind: string; beforeLines: number; afterLines: number;
      beforeChars: number; afterChars: number; changed: boolean;
    }) => ({
      id: s.id, kind: s.kind, beforeLines: s.beforeLines, afterLines: s.afterLines,
      beforeChars: s.beforeChars, afterChars: s.afterChars, changed: s.changed,
    }));
    const { data: recorded, error: recordError } = await client.rpc("automation_record_webhook_run", {
      p_trigger_id: trigger.id, p_user_id: trigger.user_id,
      p_workflow_id: workflow.id, p_revision: workflow.revision,
      p_credential_version: trigger.credential_version, p_request_key: requestId,
      p_fingerprint: await fingerprint(trigger.user_id, workflow.id, workflow.revision, trigger.id, envelope.input),
      p_input_lines: envelope.input.length ? envelope.input.split(/\r\n|\n|\r/).length : 0,
      p_output_lines: result.outputLines,
      p_input_characters: envelope.input.length,
      p_output_characters: result.output.length, p_trace: trace,
    });
    if (recordError) throw recordError;
    if (!recorded || recorded.ok !== true) {
      const code = typeof recorded?.reason === "string" ? recorded.reason : "unavailable";
      const status = code === "daily_run_limit" ? 429 :
        code === "idempotency_conflict" || code === "stale_workflow" ? 409 :
        code === "trigger_revoked" || code === "not_found_or_paused" ? 404 : 400;
      return reply({ error: "Webhook run was not accepted", code }, status);
    }
    return reply({
      runId: recorded.run_id, createdAt: recorded.created_at,
      replayed: recorded.already_recorded === true,
      output: result.output, outputLines: result.outputLines,
      trace: result.trace, source: "authenticated_webhook",
    });
  } catch (error) {
    console.error("Automation webhook backend unavailable", {
      code: typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code) : "unavailable",
    });
    return reply({ error: "Webhook service is temporarily unavailable" }, 503);
  }
});
