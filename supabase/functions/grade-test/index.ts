import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { getSupabaseSecretKey } from "../_shared/supabase.ts";
import { isTrustedServiceRequest } from "../_shared/service-auth.ts";
import { buildTrustedGradingPlan } from "../_shared/cbt-grading.mjs";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  // Only scheduled trusted workers can invoke the grading service.
  if (!isTrustedServiceRequest(req)) return reply({ error: "Forbidden" }, 403);

  try {
    const body = await req.json();
    const attemptId = body?.attemptId;
    if (typeof attemptId !== "string" || !UUID_PATTERN.test(attemptId)) {
      return reply({ error: "A valid attemptId is required" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const key = getSupabaseSecretKey();
    if (!url) return reply({ error: "Exam grading is not configured" }, 500);

    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: attempt, error: attemptError } = await db.from("user_attempts")
      .select("id,test_id,status").eq("id", attemptId).maybeSingle();
    if (attemptError) throw new Error("Unable to load attempt");
    if (!attempt) return reply({ error: "Attempt not found" }, 404);
    if (!["auto_submitted", "submitted"].includes(attempt.status ?? "")) {
      return reply({ error: "Attempt must be submitted before grading" }, 409);
    }

    // Fetch ALL questions to include unanswered ones in the maximum score.
    const [questionResult, answerResult] = await Promise.all([
      db.from("questions").select("id,question_type,points")
        .eq("test_id", attempt.test_id),
      db.from("user_answers")
        .select("id,question_id,selected_option_id,short_answer_text")
        .eq("attempt_id", attemptId),
    ]);
    if (questionResult.error) throw new Error("Unable to load assessment questions");
    if (answerResult.error) throw new Error("Unable to load submitted answers");
    if (!questionResult.data?.length) {
      return reply({ error: "This assessment has no questions to grade" }, 409);
    }

    // Query only selected option IDs from the trusted service client;
    // never return correctness flags to a student/browser response.
    const optionIds = [...new Set((answerResult.data ?? [])
      .map((answer) => answer.selected_option_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0))];
    let selectedOptions: Array<{ id: string; question_id: string; is_correct: boolean | null }> = [];
    if (optionIds.length) {
      if (optionIds.length > 500) throw new Error("Too many selected options");
      const { data, error } = await db.from("options")
        .select("id,question_id,is_correct").in("id", optionIds);
      if (error) throw new Error("Unable to load trusted grading key");
      selectedOptions = data ?? [];
    }

    const plan = buildTrustedGradingPlan(
      questionResult.data, answerResult.data ?? [], selectedOptions,
    );

    // Writes can be retried because the plan is deterministic. This is NOT
    // an atomic SQL transaction: a staging-verified RPC is still required
    // before this can be considered an exam-grade transaction.
    for (const update of plan.updates) {
      const { data, error } = await db.from("user_answers")
        .update({ is_correct: update.is_correct, points_awarded: update.points_awarded })
        .eq("id", update.id).eq("attempt_id", attemptId).select("id").maybeSingle();
      if (error || !data) throw new Error("Unable to persist a graded answer");
    }

    // Preserve the submitted/auto_submitted status and original end_time.
    // Do not manufacture a numerical score while written answers need review.
    const { data: saved, error: saveError } = await db.from("user_attempts")
      .update({ score: plan.score, max_score: plan.maxScore })
      .eq("id", attemptId).in("status", ["submitted", "auto_submitted"])
      .select("id").maybeSingle();
    if (saveError || !saved) throw new Error("Unable to persist final assessment score");

    return reply({
      success: true,
      score: plan.score,
      maxScore: plan.maxScore,
      percentage: plan.percentage,
      gradingPending: plan.gradingPending,
      pendingManualReview: plan.pendingManualReview,
      questionCount: plan.questionCount,
    });
  } catch (error) {
    console.error("Exam grading failed:", error);
    return reply({ error: "Exam grading failed" }, 500);
  }
});
