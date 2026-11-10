import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { isTrustedServiceRequest } from "../_shared/service-auth.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!isTrustedServiceRequest(req)) return reply({ error: "Forbidden" }, 403);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return reply({ error: "Auto-submission is not configured" }, 500);

    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: attempts, error } = await db.from("user_attempts")
      .select("id, start_time, test_id").eq("status", "in_progress")
      .order("start_time", { ascending: true }).limit(200);
    if (error) throw new Error("Unable to load in-progress attempts");

    const now = Date.now();
    const expired: string[] = [];
    for (const attempt of attempts ?? []) {
      if (!attempt.start_time || !attempt.test_id) continue;
      const { data: test, error: testError } = await db.from("tests")
        .select("duration_minutes").eq("id", attempt.test_id).maybeSingle();
      if (testError) throw new Error("Unable to load test duration");
      const duration = Number(test?.duration_minutes);
      if (!test || !Number.isFinite(duration) || duration <= 0) continue;
      const deadline = new Date(attempt.start_time).getTime() + duration * 60_000;
      if (!Number.isFinite(deadline) || now <= deadline) continue;

      // Compare-and-set avoids overwriting a concurrent user submission.
      const { data: updated, error: updateError } = await db.from("user_attempts")
        .update({ status: "auto_submitted", end_time: new Date(now).toISOString() })
        .eq("id", attempt.id).eq("status", "in_progress").select("id").maybeSingle();
      if (updateError) throw new Error("Unable to auto-submit expired attempt");
      if (updated) expired.push(updated.id);
    }

    let graded = 0;
    for (const attemptId of expired) {
      const response = await fetch(`${url}/functions/v1/grade-test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      if (response.ok) graded++;
      else console.error("Grading request failed for an auto-submitted attempt");
    }

    return reply({ success: true, checkedCount: attempts?.length ?? 0, autoSubmittedCount: expired.length, gradedCount: graded });
  } catch (error) {
    console.error("Exam auto-submission failed:", error);
    return reply({ error: "Exam auto-submission failed" }, 500);
  }
});
