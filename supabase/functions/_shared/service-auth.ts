/**
 * Restrict privileged exam-processing Edge Functions to the project's
 * server-side default secret API key. The key must be sent in the apikey
 * header, never as a Bearer token.
 */
export function isTrustedServiceRequest(req: Request): boolean {
  const rawKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!rawKeys) return false;

  try {
    const keys = JSON.parse(rawKeys) as Record<string, unknown>;
    const secretKey = keys.default;
    const suppliedKey = req.headers.get("apikey") ?? "";

    return typeof secretKey === "string" &&
      secretKey.length > 0 &&
      suppliedKey.length > 0 &&
      suppliedKey === secretKey;
  } catch {
    return false;
  }
}
