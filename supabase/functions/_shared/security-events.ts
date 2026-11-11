import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { getSupabaseSecretKey } from "./supabase.ts";

type SecurityFunction = "eternyx-ai-chat" | "process-document";
type AuthorizationReason =
  | "request_user_id_mismatch"
  | "conversation_document_mismatch"
  | "document_storage_reference_mismatch";

/**
 * Record only authorization violations from callers whose access token has
 * already been verified. Anonymous/invalid-token requests are deliberately
 * not written here, preventing this endpoint from becoming an unauthenticated
 * event-flooding vector.
 *
 * The event payload is assembled from a strict allowlist; request bodies,
 * tokens, document contents, storage paths, and IP headers are never stored.
 */
export async function recordAuthorizationEvent(input: {
  functionName: SecurityFunction;
  reason: AuthorizationReason;
  actorUserId: string;
  severity?: "medium" | "high";
}): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    if (!url) return;

    const supabase = createClient(url, getSupabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.from("threat_monitoring_events").insert({
      event_type: "edge_authorization_rejected",
      severity: input.severity ?? "medium",
      event_data: {
        function: input.functionName,
        reason: input.reason,
        actor_user_id: input.actorUserId,
      },
      detected_at: new Date().toISOString(),
    });

    if (error) {
      // Keep diagnostics minimal; never log the event payload or credentials.
      console.warn("Security event could not be persisted", { code: error.code ?? null });
    }
  } catch {
    // Monitoring must never break the protected request's normal response.
    console.warn("Security event persistence is unavailable");
  }
}
