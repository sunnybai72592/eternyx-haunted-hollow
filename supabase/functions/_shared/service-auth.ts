/**
 * Restrict privileged exam-processing Edge Functions to the configured
 * server-side service-role JWT. Never expose this key to browser clients.
 */
export function isTrustedServiceRequest(req: Request): boolean {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) return false;

  const authorization = req.headers.get("authorization") ?? "";
  return authorization === `Bearer ${serviceRoleKey}`;
}
