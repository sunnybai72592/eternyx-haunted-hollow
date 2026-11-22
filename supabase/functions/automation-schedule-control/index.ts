import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import { parseScheduleControlRequest } from "../_shared/automation-schedule-contract.mjs";
import {
  encryptScheduledText, decryptScheduledText, SCHEDULE_INPUT_BYTES, SCHEDULE_OUTPUT_BYTES,
} from "../_shared/automation-schedule-crypto.mjs";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const allowedError: Record<string, number> = {
  invalid_request: 400, schedule_limit: 429, already_exists: 409, not_found: 404,
};
function safeError(reason: unknown) {
  switch (reason) {
    case "schedule_limit": return "Only three saved schedules per account are allowed.";
    case "already_exists": return "This workflow already has a schedule. Edit that schedule instead.";
    case "not_found": return "This schedule or workflow could not be found.";
    default: return "Scheduled workflow action was rejected.";
  }
}
function resultReply(data: Record<string, unknown> | null) {
  if (data?.ok === true) return reply(data);
  const code = typeof data?.reason === "string" ? data.reason : "unavailable";
  return reply({ error: safeError(code), code }, allowedError[code] ?? 503);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 6500) return reply({ error: "Schedule request is too large" }, 413);
    body = JSON.parse(raw);
  } catch { return reply({ error: "Invalid request JSON" }, 400); }
  const request = parseScheduleControlRequest(body);
  if (!request.ok) return reply({ error: "Invalid or unsupported schedule request", code: request.reason }, 400);

  // Verified user token is the ONLY caller identity. Browser never reads encrypted data directly.
  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase || user.is_anonymous) return reply({ error: "Sign in to access schedules" }, 401);

  try {
    const master = Deno.env.get("AUTOMATION_SCHEDULE_ENCRYPTION_KEY") ?? "";
    const keyConfigured = /^[a-f0-9]{64}$/i.test(master);
    if (request.action === "list") {
      const [{ data, error }, status] = await Promise.all([
        supabase.from("automation_schedules")
          .select("id,workflow_id,interval_minutes,enabled,revision,next_run_at,last_run_at,last_status,attempt_count,created_at")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
        supabase.from("automation_scheduler_config")
          .select("enabled").eq("singleton_id", 1).maybeSingle(),
      ]);
      if (error || status.error) throw error ?? status.error;
      return reply({ schedules: data ?? [], source: "authenticated_server",
        schedulerEnabled: status.data?.enabled === true,
        encryptionConfigured: keyConfigured,
        scheduledOutputRetentionDays: 7,
      });
    }
    if (request.action === "save") {
      if (!keyConfigured) return reply({ error: "Schedule encryption is not configured" }, 503);
      let encrypted;
      try { encrypted = await encryptScheduledText(master, request.input, SCHEDULE_INPUT_BYTES); }
      catch { return reply({ error: "Scheduled input must be 2,000 UTF-8 bytes or fewer" }, 413); }
      const { data, error } = await supabase.rpc("automation_save_schedule", {
        p_user_id: user.id, p_workflow_id: request.workflowId,
        p_interval_minutes: request.intervalMinutes,
        p_schedule_id: request.scheduleId,
        p_ciphertext: encrypted.ciphertext,p_nonce:encrypted.nonce,
      });
      if (error) throw error;
      return resultReply(data);
    }
    if (request.action === "toggle") {
      const { data, error } = await supabase.rpc("automation_toggle_schedule", {
        p_user_id: user.id,p_schedule_id: request.scheduleId,p_enabled: request.enabled,
      });
      if (error) throw error;
      return resultReply(data);
    }
    if (request.action === "delete") {
      const { data, error } = await supabase.rpc("automation_delete_schedule", {
        p_user_id: user.id,p_schedule_id: request.scheduleId,
      });
      if (error) throw error;
      return resultReply(data);
    }
    if (request.action === "output") {
      if (!keyConfigured) return reply({ error: "Schedule outputs cannot be decrypted" }, 503);
      const { data, error } = await supabase.from("automation_schedule_outputs")
        .select("run_id,output_ciphertext,output_nonce,created_at,expires_at")
        .eq("run_id", request.runId).eq("user_id", user.id)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (error) throw error;
      if (!data) return reply({ error: "No owned, unexpired scheduled output exists for this run" }, 404);
      const plain = await decryptScheduledText(master,data.output_ciphertext,data.output_nonce,SCHEDULE_OUTPUT_BYTES);
      return reply({ runId:data.run_id,output:plain,createdAt:data.created_at,
        expiresAt:data.expires_at,source:"authenticated_server" });
    }
    return reply({ error: "Unsupported schedule action" }, 400);
  } catch (error) {
    console.error("Automation schedule controller unavailable", {
      code: typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code) : "unavailable",
    });
    return reply({ error: "Schedule service is unavailable; check deployment and secrets" }, 503);
  }
});
