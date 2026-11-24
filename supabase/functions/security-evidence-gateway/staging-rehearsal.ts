// Staging-only rehearsal entrypoint; never deploy this file to production.
import { createEvidenceHandler } from "./handler.mjs";
const url = Deno.env.get("SUPABASE_URL") ?? "";
const ids = (Deno.env.get("SECURITY_EVIDENCE_STAGING_OWNERS") ?? "").split(",").map(value => value.trim());
const allowedOwners = new Set(ids);
const enabled = url === "https://mhodwvypfbxafamkrgsk.supabase.co" &&
  Deno.env.get("SECURITY_EVIDENCE_STAGING_REHEARSAL") === "I_APPROVE_TWO_DISPOSABLE_STAGING_OWNERS" &&
  ids.length === 2 && allowedOwners.size === 2 &&
  ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
Deno.serve(createEvidenceHandler({
  url, enabled, allowedOwners,
  publicKey: enabled ? Deno.env.get("SUPABASE_ANON_KEY") ?? "" : "",
  serviceKey: enabled ? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" : "",
}));
