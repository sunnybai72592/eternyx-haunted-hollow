/**
 * ETERNYX security-posture assessment of a read-only pg_catalog snapshot.
 * Never uploads credentials or raw database records. This is metadata review,
 * not proof of end-user RLS isolation or authorization bypass.
 */
const FINANCIAL_TABLES = Object.freeze([
  "billing_subscriptions", "polar_billing_subscriptions", "polar_webhook_events",
  "stripe_webhook_events",
]);
const PRIVATE_CONTROL_TABLES = Object.freeze(["admin_users"]);
const ADMIN_HELPERS = Object.freeze(["is_admin()", "get_current_user_role()"]);
const VALID_NAME = /^[a-z_][a-z0-9_]{0,79}$/;
const VALID_SIGNATURE = /^[a-z_][a-z0-9_]{0,79}\([^)]{0,200}\)$/;

function requireShape(condition, explanation) {
  if (!condition) throw new Error("Untrusted Supabase audit metadata: " + explanation);
}
function requireBoolean(x, label) {
  requireShape(typeof x === "boolean", label);
}
export function evaluateSupabaseSecurityInventory(input) {
  requireShape(input && typeof input === "object" && !Array.isArray(input) &&
    input.schema === "public", "public schema");
  for (const key of ["tables", "functions", "policies", "views"]) {
    requireShape(Array.isArray(input[key]) && input[key].length <= 500, key);
  }
  const critical = [];
  const review = [];
  const observations = [];
  const seenTable = new Set();
  for (const table of input.tables) {
    requireShape(table && VALID_NAME.test(table.name) &&
      !seenTable.has(table.name), "unique table name");
    seenTable.add(table.name);
    for (const k of ["rls", "anon_select", "authenticated_select"]) requireBoolean(table[k], k);
    requireShape(Number.isSafeInteger(table.policy_count) && table.policy_count >= 0 &&
      table.policy_count <= 250, "policy count");
    if (!table.rls) critical.push("RLS disabled in public." + table.name);
    if (FINANCIAL_TABLES.includes(table.name) || PRIVATE_CONTROL_TABLES.includes(table.name)) {
      if (table.anon_select || table.authenticated_select) {
        critical.push("Direct SELECT grant on internal table public." + table.name);
      }
      if (table.policy_count === 0 && table.rls && !table.anon_select && !table.authenticated_select) {
        observations.push("Intentional server-only deny-by-default: public." + table.name);
      }
    }
    if (table.rls && table.policy_count === 0 &&
        (table.anon_select || table.authenticated_select)) {
      review.push("RLS enabled without policies but client grants exist: public." + table.name);
    }
  }
  for (const name of FINANCIAL_TABLES) {
    if (!seenTable.has(name)) review.push("Expected finance table not in inventory: public." + name);
  }
  const seenFunctions = new Set();
  for (const f of input.functions) {
    requireShape(f && typeof f.signature === "string" &&
      VALID_SIGNATURE.test(f.signature) && !seenFunctions.has(f.signature), "unique function signature");
    seenFunctions.add(f.signature);
    for (const k of ["security_definer", "anon_execute", "authenticated_execute", "search_path_fixed"]) {
      requireBoolean(f[k], k);
    }
    if (f.security_definer && f.anon_execute) {
      review.push("Privileged RPC callable by anon: public." + f.signature);
    }
    if (f.security_definer && f.authenticated_execute) {
      review.push("Privileged RPC callable by authenticated: public." + f.signature);
    }
    if (!f.search_path_fixed) review.push("Function search_path not pinned: public." + f.signature);
  }
  const policyUsesHelper = new Set();
  for (const policy of input.policies) {
    requireShape(policy && VALID_NAME.test(policy.table) &&
      typeof policy.name === "string" && policy.name.length <= 180 &&
      !/[<>{}]/.test(policy.name), "policy");
    requireBoolean(policy.uses_admin_helper, "uses_admin_helper");
    requireBoolean(policy.targets_public, "targets_public");
    if (policy.uses_admin_helper && policy.targets_public) {
      policyUsesHelper.add(policy.table);
    }
  }
  if (policyUsesHelper.size > 0) {
    review.push("Public-facing policies invoke admin helper functions on " +
      policyUsesHelper.size + " table(s); do NOT revoke anonymous EXECUTE until policy impact is tested.");
  }
  for (const view of input.views) {
    requireShape(view && VALID_NAME.test(view.name), "view name");
    for (const k of ["security_invoker", "anon_select", "authenticated_select"]) requireBoolean(view[k], k);
    if (!view.security_invoker && (view.anon_select || view.authenticated_select)) {
      critical.push("Client-readable view without security_invoker: public." + view.name);
    }
  }
  return Object.freeze({
    publicTables: input.tables.length,
    privilegedFunctions: input.functions.filter(f => f.security_definer).length,
    reviewedPolicies: input.policies.length,
    rlsDisabled: input.tables.filter(t => !t.rls).length,
    critical: Object.freeze(critical),
    review: Object.freeze(review),
    observations: Object.freeze(observations),
    releaseGate: critical.length ? "BLOCKED" : review.length ? "REVIEW_REQUIRED" : "METADATA_CHECKS_PASSED",
    productionCertified: false,
    tenantIsolationVerified: false,
    nextStep: "Use isolated test accounts and approved RLS checks; metadata alone cannot prove tenant isolation.",
  });
}
