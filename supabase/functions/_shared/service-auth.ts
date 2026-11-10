/**
 * Restrict privileged exam-processing Edge Functions to the configured
 * server-side service-role JWT. Never expose this key to browser clients.
 */
export function isTrustedServiceRequest(req: Request): boolean {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("authorization") ?? "";
  const matches = Boolean(serviceRoleKey) &&
    authorization === `Bearer ${serviceRoleKey}`;

  // TEMPORARY SAFE DIAGNOSTIC: log booleans only, never credential values.
  console.warn("[service-auth diagnostic]", {
    runtimeSecretConfigured: Boolean(serviceRoleKey),
    authorizationHeaderPresent: authorization.length > 0,
    authorizationMatchesRuntimeSecret: matches,
    runtimeSecretLooksLikeJwt: serviceRoleKey?.startsWith("eyJ") ?? false,
  });

  return matches;
}
