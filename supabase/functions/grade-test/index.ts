import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { attemptId } = await req.json();

    if (!attemptId) {
      return new Response(
        JSON.stringify({ error: "Missing attemptId" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the attempt
    const { data: attempt, error: attemptError } = await supabase
      .from("user_attempts")
      .select("*")
      .eq("id", attemptId)
      .single();

    if (attemptError || !attempt) {
      throw new Error("Attempt not found");
    }

    // Fetch all user answers for this attempt
    const { data: userAnswers, error: answersError } = await supabase
      .from("user_answers")
      .select("*, questions(*), options(*)")
      .eq("attempt_id", attemptId);

    if (answersError) {
      throw new Error("Failed to fetch user answers");
    }

    // Grade the test
    let totalScore = 0;
    let maxScore = 0;

    if (userAnswers && userAnswers.length > 0) {
      for (const answer of userAnswers) {
        const question = answer.questions;
        maxScore += question.points || 0;

        // Determine if answer is correct
        let isCorrect = false;
        let pointsAwarded = 0;

        if (question.question_type === "multiple_choice") {
          // Check if selected option is correct
          if (answer.selected_option_id) {
            const { data: option } = await supabase
              .from("options")
              .select("is_correct")
              .eq("id", answer.selected_option_id)
              .single();

            isCorrect = option?.is_correct || false;
            pointsAwarded = isCorrect ? (question.points || 0) : 0;
          }
        } else if (question.question_type === "true_false") {
          // Similar logic for true/false
          if (answer.selected_option_id) {
            const { data: option } = await supabase
              .from("options")
              .select("is_correct")
              .eq("id", answer.selected_option_id)
              .single();

            isCorrect = option?.is_correct || false;
            pointsAwarded = isCorrect ? (question.points || 0) : 0;
          }
        } else if (question.question_type === "short_answer") {
          // Short answers need manual grading, so we don't auto-grade
          // Set is_correct to null to indicate pending manual review
          isCorrect = null;
          pointsAwarded = 0;
        }

        // Update the user answer with grading results
        await supabase
          .from("user_answers")
          .update({
            is_correct: isCorrect,
            points_awarded: pointsAwarded,
          })
          .eq("id", answer.id);

        if (isCorrect !== null) {
          totalScore += pointsAwarded;
        }
      }
    }

    // Update the attempt with final score
    const { error: updateError } = await supabase
      .from("user_attempts")
      .update({
        score: totalScore,
        max_score: maxScore,
        status: "submitted",
        end_time: new Date().toISOString(),
      })
      .eq("id", attemptId);

    if (updateError) {
      throw new Error("Failed to update attempt with score");
    }

    return new Response(
      JSON.stringify({
        success: true,
        score: totalScore,
        maxScore: maxScore,
        percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
