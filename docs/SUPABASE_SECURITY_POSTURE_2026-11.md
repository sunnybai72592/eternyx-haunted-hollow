# ETERNYX — Production Supabase Security Posture

Audit date: November 20, 2026. Scope: read-only Postgres catalog and Supabase Security Advisors. No customer records, credentials, or secret values queried. No production permissions or configuration changed.

## Verified baseline

PR #260 merged; hosted run 44794176203 passed 16/16 public tool checks and 18/18 signed-out browser route checks. Frontend redirects are not proof of backend row-level authorization.

A read-only inspection of the connected Supabase project confirmed **RLS enabled for every inspected public table**. Supabase Security Advisors reported:

| Advisory | Count | Severity/interpretation |
| --- | ---: | --- |
| RLS enabled with no policies | 15 tables | INFO; often intentional deny-by-default for private tables |
| Mutable function search_path | 4 functions | WARN; review unqualified SQL before hardening |
| Extension in public schema | 2 (pg_net, vector) | WARN; requires compatibility planning |
| Anonymous EXECUTE on SECURITY DEFINER | 3 functions | WARN; review exposed privileged RPCs |
| Authenticated EXECUTE on SECURITY DEFINER | 4 functions | WARN; verify owner/admin check |
| Auth email OTP expiry over 1 hour | 1 | WARN; shorten if supported |
| Leaked password protection disabled | 1 | WARN; review and enable if eligible |
| Managed Postgres security updates | 1 | WARN; plan controlled upgrade |

Official documentation:
- https://supabase.com/docs/guides/observability/advisors?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/observability/advisors?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/platform/going-into-prod#security
- https://supabase.com/docs/guides/platform/upgrading

## Important dependencies — do not blindly revoke execution

Three database functions currently callable by anonymous users are
public.get_current_user_role(), public.handle_new_user(), and public.is_admin().

- is_admin() checks the trusted admin_users assignments based on auth.uid().
  Several administrative screens call this RPC.
- get_current_user_role() queries the caller's own role and calls is_admin().
  **Public-facing RLS policies** for blog posts, pricing plans and services
  invoke this function. Revoking anonymous EXECUTE without updating those
  policies may break intended public SELECT access.
- handle_new_user() is a signup trigger on auth.users that creates a profile.
  A trigger is not an ordinary callable SQL procedure. Review its grants and
  test signup before altering function authorization.
- admin_list_users(text,integer,integer) is callable by authenticated
  accounts but its body explicitly checks is_admin() before returning
  the user directory. Two-account testing is still required.

These are legitimate advisory findings, **not proof of an exploit**.
Changing RLS, function grants or login configuration without testing
dependencies would risk damaging working features.

## New reusable read-only security tools

1. scripts/sql/read-only-supabase-security-audit.sql — Authorized SQL Editor
   query returning only catalog metadata: RLS, table SELECT privileges,
   policy counts, function privilege and search_path flags, public-policy
   helper dependencies, and view security_invoker flags.
2. src/lib/supabaseSecurityInventory.mjs — Offline evaluator with
   three states: BLOCKED, REVIEW_REQUIRED, METADATA_CHECKS_PASSED.
3. scripts/review-supabase-security.mjs — A local report utility that reads
   an operator-supplied JSON export without connecting to Supabase.
4. tests/supabase-security-posture.test.mjs — Twelve regression tests
   covering RLS missing, private billing/admin SELECT grants, unsafe
   views, privileged RPC review, missing policies and unsafe data.

The release gate is **BLOCKED** when a public table lacks RLS, private
finance or admin tables grant direct browser SELECT, or a client-readable
view lacks security_invoker. SECURITY DEFINER and function search_path
warnings prompt review, not automatic privilege changes.

All outputs explicitly state that production certification and
two-account tenant isolation **have not been established**.

## Recommended safe operator procedure

1. Review Security Advisors in the Supabase Dashboard and record relevant
   warnings privately.
2. Run the provided read-only SQL as an authorized project operator.
   Copy its single JSON result to a private local file named
   security-audit.json; **never commit it to GitHub**.
3. Run: node scripts/review-supabase-security.mjs security-audit.json.
4. Inspect each flagged function's implementation, RPC call site, and
   RLS policy dependencies, especially get_current_user_role() used
   by anonymous-facing RLS policies.
5. In an isolated staging project, verify owner-only access with two
   separate test users and denial of admin-only RPC results to
   non-administrators. Confirm signup trigger behavior.
6. With owner approval, prepare minimal migrations for confirmed
   privileged RPC risks. Recheck production advisory status separately.
7. In separate controlled operations, reduce email OTP validity, enable
   leaked password protection if available, and schedule managed
   PostgreSQL security upgrades with backup and recovery checks.

**This PR makes no live database changes, enables no payment providers,
and does not claim real account isolation is verified.**
