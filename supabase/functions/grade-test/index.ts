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
    const { attemptId } = await req.json();
    if (typeof attemptId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) {
      return reply({ error: "A valid attemptId is required" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return reply({ error: "Exam grading is not configured" }, 500);

    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: attempt, error: attemptError } = await db
      .from("user_attempts").select("id, test_id, status").eq("id", attemptId).maybeSingle();
    if (attemptError) throw new Error("Unable to load attempt");
    if (!attempt) return reply({ error: "Attempt not found" }, 404);
    if (!["auto_submitted", "submitted"].includes(attempt.status ?? "")) {
      return reply({ error: "Attempt must be submitted before grading" }, 409);
    }

    const { data: answers, error: answersError } = await db
      .from("user_answers")
      .select("id, question_id, selected_option_id, questions(id, test_id, question_type, points)")
      .eq("attempt_id", attemptId);
    if (answersError) throw new Error("Unable to load submitted answers");

    let score = 0;
    let maxScore = 0;
    for (const answer of answers ?? []) {
      const question = Array.isArray(answer.questions) ? answer.questions[0] : answer.questions;
      if (!question || question.test_id !== attempt.test_id) {
        throw new Error("Invalid question reference in attempt");
      }
      const points = Math.max(0, Number(question.points) || 0);
      maxScore += points;
      let correct = false;
      let awarded = 0;

      if (["multiple_choice", "true_false"].includes(question.question_type) && answer.selected_option_id) {
        const { data: option, error } = await db.from("options")
          .select("is_correct").eq("id", answer.selected_option_id)
          .eq("question_id", question.id).maybeSingle();
        if (error) throw new Error("Unable to validate selected option");
        correct = option?.is_correct === true;
        awarded = correct ? points : 0;
      }

      const { error } = await db.from("user_answers")
        .update({ is_correct: correct, points_awarded: awarded })
        .eq("id", answer.id).eq("attempt_id", attemptId);
      if (error) throw new Error("Unable to save answer grading");
      score += awarded;
    }

    const { error: saveError } = await db.from("user_attempts").update({
      score, max_score: maxScore, status: "submitted", end_time: new Date().toISOString(),
    }).eq("id", attemptId).in("status", ["auto_submitted", "submitted"]);
    if (saveError) throw new Error("Unable to save final score");

    return reply({ success: true, score, maxScore, percentage: maxScore ? score / maxScore * 100 : 0 });
  } catch (error) {
    console.error("Exam grading failed:", error);
    return reply({ error: "Exam grading failed" }, 500);
  }
});
