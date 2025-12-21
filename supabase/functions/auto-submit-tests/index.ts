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
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all in-progress attempts with test duration using separate queries
    const { data: attempts, error: fetchError } = await supabase
      .from("user_attempts")
      .select("id, start_time, test_id")
      .eq("status", "in_progress");

    if (fetchError) {
      throw new Error("Failed to fetch in-progress attempts: " + fetchError.message);
    }

    if (!attempts || attempts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No in-progress attempts to process" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date().getTime();
    const expiredAttempts: string[] = [];

    // Check which attempts have exceeded their time limit
    for (const attempt of attempts) {
      // Fetch the test duration for each attempt
      const { data: test } = await supabase
        .from("tests")
        .select("duration_minutes")
        .eq("id", attempt.test_id)
        .single();

      if (test) {
        const startTime = new Date(attempt.start_time).getTime();
        const durationMs = (test.duration_minutes || 0) * 60 * 1000;
        const endTime = startTime + durationMs;

        if (now > endTime) {
          expiredAttempts.push(attempt.id);
        }
      }
    }

    if (expiredAttempts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No expired attempts" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auto-submit expired attempts
    const { error: updateError } = await supabase
      .from("user_attempts")
      .update({
        status: "auto_submitted",
        end_time: new Date().toISOString(),
      })
      .in("id", expiredAttempts);

    if (updateError) {
      throw new Error("Failed to auto-submit expired attempts: " + updateError.message);
    }

    // Grade each auto-submitted test
    for (const attemptId of expiredAttempts) {
      // Call the grade-test function
      const gradeResponse = await fetch(
        `${supabaseUrl}/functions/v1/grade-test`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ attemptId }),
        }
      );

      if (!gradeResponse.ok) {
        console.error(`Failed to grade attempt ${attemptId}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        autoSubmittedCount: expiredAttempts.length,
        attemptIds: expiredAttempts,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
