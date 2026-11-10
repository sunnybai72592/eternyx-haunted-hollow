/**
 * Restrict privileged exam-processing Edge Functions to the project's
 * server-side default secret API key. The key must be sent in the apikey
 * header, never as a Bearer token.
 */
export function isTrustedServiceRequest(req: Request): boolean {
  const rawKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const suppliedKey = req.headers.get("apikey") ?? "";

  let secretKey: unknown;
  let jsonValid = false;

  if (rawKeys) {
    try {
      const keys = JSON.parse(rawKeys) as Record<string, unknown>;
      secretKey = keys.default;
      jsonValid = true;
    } catch {
      // Diagnostic below records only safe metadata, never secret contents.
    }
  }

  const matches = typeof secretKey === "string" &&
    secretKey.length > 0 &&
    suppliedKey.length > 0 &&
    suppliedKey === secretKey;

  if (!matches) {
    console.warn("[service-auth diagnostic]", {
      runtimeSecretKeysConfigured: Boolean(rawKeys),
      runtimeSecretKeysJsonValid: jsonValid,
      runtimeDefaultKeyPresent: typeof secretKey === "string" && secretKey.length > 0,
      runtimeDefaultKeyLooksLikeSecretApiKey:
        typeof secretKey === "string" && secretKey.startsWith("sb_secret_"),
      runtimeDefaultKeyLength:
        typeof secretKey === "string" ? secretKey.length : 0,
      requestApiKeyHeaderPresent: suppliedKey.length > 0,
      requestApiKeyLooksLikeSecretApiKey: suppliedKey.startsWith("sb_secret_"),
      requestApiKeyLength: suppliedKey.length,
      keysMatch: matches,
    });
  }

  return matches;
}
