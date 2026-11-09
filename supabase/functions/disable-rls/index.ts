import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// This endpoint previously invoked a privileged SECURITY DEFINER RPC that
// disabled row-level security. It is intentionally retired. Do not restore
// privileged database administration through a public Edge Function.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "This administrative endpoint has been permanently disabled.",
      code: "ENDPOINT_RETIRED",
    }),
    { status: 410, headers: corsHeaders },
  );
});
