/**
 * Returns the default Supabase secret API key injected into Edge Functions.
 * Secret keys are server-only and must never be returned to a client.
 */
export function getSupabaseSecretKey(): string {
  const rawKeys = Deno.env.get("SUPABASE_SECRET_KEYS");

  if (!rawKeys) {
    throw new Error("SUPABASE_SECRET_KEYS is not available in this Edge Function environment");
  }

  let keys: Record<string, string>;
  try {
    keys = JSON.parse(rawKeys) as Record<string, string>;
  } catch {
    throw new Error("SUPABASE_SECRET_KEYS is not valid JSON");
  }

  const secretKey = keys.default;
  if (!secretKey || typeof secretKey !== "string") {
    throw new Error('SUPABASE_SECRET_KEYS does not contain the expected "default" key');
  }

  return secretKey;
}
