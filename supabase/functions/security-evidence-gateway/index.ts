import { createEvidenceHandler } from "./handler.mjs";
Deno.serve(createEvidenceHandler({
  url: Deno.env.get("SUPABASE_URL") ?? "",
  publicKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  enabled: Deno.env.get("SECURITY_EVIDENCE_GATEWAY_ENABLED") === "true",
}));
