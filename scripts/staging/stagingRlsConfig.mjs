/**
 * Strict configuration gate for intentionally destructive, staging-only RLS tests.
 * This module does not contact Supabase or import secrets into the frontend.
 */
export const STAGING_RLS_APPROVAL = "I_APPROVE_STAGING_FIXTURE_WRITES";
const REF = /^[a-z0-9]{20}$/;
const DEDICATED_ACCOUNT = /^(?:rls-|[a-z0-9._-]+\+rls-)[^@]*@[a-z0-9.-]+\.[a-z]{2,}$/i;

function requireSafe(ok, reason) {
  if (!ok) throw new Error("Staging RLS test refused: " + reason);
}
function parsePublicKey(key) {
  requireSafe(typeof key === "string" && key.length > 16 && key.length < 2500,
    "missing or invalid publishable key");
  requireSafe(!key.startsWith("sb_secret_") && !key.toLowerCase().includes("service_role"),
    "secret/service role key prohibited");
  if (key.startsWith("sb_publishable_")) return key;
  // Legacy Supabase anon JWTs must be decoded for role verification before use.
  const parts = key.split(".");
  requireSafe(parts.length === 3 && parts.every(Boolean), "expected publishable or anon key");
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    requireSafe(false, "invalid anonymous JWT");
  }
  requireSafe(payload && payload.role === "anon", "only an anonymous client key is permitted");
  return key;
}
export function validateStagingRlsConfig(env) {
  requireSafe(env && typeof env === "object", "missing environment");
  requireSafe(env.ETERNYX_RLS_STAGING_APPROVAL === STAGING_RLS_APPROVAL,
    "explicit owner approval is required");
  const ref = env.ETERNYX_RLS_STAGING_REF;
  const productionRef = env.ETERNYX_RLS_PRODUCTION_REF;
  requireSafe(typeof ref === "string" && REF.test(ref) &&
    typeof productionRef === "string" && REF.test(productionRef) &&
    ref !== productionRef, "valid distinct staging and production refs required");
  const url = env.ETERNYX_RLS_STAGING_URL;
  requireSafe(url === "https://" + ref + ".supabase.co",
    "only the exact HTTPS staging Supabase host is allowed");
  const key = parsePublicKey(env.ETERNYX_RLS_STAGING_PUBLISHABLE_KEY);
  const accounts = [
    { email: env.ETERNYX_RLS_TEST_A_EMAIL, password: env.ETERNYX_RLS_TEST_A_PASSWORD },
    { email: env.ETERNYX_RLS_TEST_B_EMAIL, password: env.ETERNYX_RLS_TEST_B_PASSWORD },
  ];
  requireSafe(accounts.every(a => typeof a.email === "string" &&
    DEDICATED_ACCOUNT.test(a.email) && typeof a.password === "string" &&
    a.password.length >= 12), "two dedicated rls-* staging accounts are required");
  requireSafe(accounts[0].email.toLowerCase() !== accounts[1].email.toLowerCase(),
    "test accounts must be distinct");
  return Object.freeze({ url, projectRef: ref, publishableKey: key, accounts });
}

export const ISOLATION_SCENARIOS = Object.freeze([
  Object.freeze({
    table: "conversation_sessions", owner: "user_id", canUpdate: true,
    makeFixture: (userId, marker) => ({
      user_id: userId, title: "ETERNYX-RLS-" + marker,
    }),
    changedField: "title",
  }),
  Object.freeze({
    table: "chat_history", owner: "user_id", canUpdate: false,
    makeFixture: (userId, marker) => ({
      user_id: userId, role: "user", content: "ETERNYX-RLS-" + marker,
    }),
    changedField: null,
  }),
  Object.freeze({
    table: "pentest_engagements", owner: "owner_id", canUpdate: true,
    makeFixture: (userId, marker) => ({
      owner_id: userId, engagement_name: "ETERNYX-RLS-" + marker,
      status: "draft", authorization_attested: false,
      scope_targets: [],
    }),
    changedField: "engagement_name",
  }),
]);
