# ETERNYX Services Phase 44 — seedless staging administrator foundation candidate

## Live baseline

Read-only staging metadata rechecked: the Auth schema and service_role exist; public.admin_users and public.is_admin() are absent. Staging history lists the three earlier pentest/security migrations and no Services migrations. This PR provides a concrete prerequisite candidate; **no remote migration was applied**.

## Exact candidate

`scripts/sql/services-staging-trusted-admin-foundation-candidate.sql` lives outside `supabase/migrations` so a normal migration push cannot deploy it automatically. It creates the minimal protected assignment table with a UUID primary key referencing auth.users and ON DELETE CASCADE, enables RLS, revokes all client and service_role table permissions, and installs the caller-bound, STABLE SECURITY DEFINER boolean helper with an explicitly empty search_path. It revokes inherited default function grants, then grants execute only to the reviewed anon/authenticated/service_role roles, matching the existing shared API contract. The helper never exposes assignment rows. There are **zero admin assignments**, no hardcoded Auth identities, and no dependency on editable profile roles or unrelated role tables.

Both CREATE statements intentionally fail if their objects exist; there is no CREATE OR REPLACE, no DROP, and no IF NOT EXISTS to hide drift. Apply transactionally only after independently checking that both objects are absent. An occupied or partially established foundation requires separate review; never overwrite another pillar's administrator authority.

## Actual offline rehearsal

The existing isolated PostgreSQL17 workflow additionally creates a second database in the same network-disabled container. Synthetic Supabase roles and Auth primitives model permissive default ACLs, including a BYPASSRLS service_role. CI applies the exact candidate, requires all 12 Phase 43 catalog checks, executes real synthetic caller and ACL tests (ordinary and anonymous callers denied admin status, self-assignment denied, service-role table writes denied, approved synthetic caller recognized, deleted Auth user cascades), and verifies an attempted repeat application is refused. All fixtures roll back. Then the complete 13 source-defined Services migrations are replayed against this exact foundation and the existing catalog and A/B/admin/anonymous SQL role acceptance suite runs. These are disposable SQL tests, not actual Supabase Auth tokens or live staging acceptance.

## Deployment decision

Require explicit staging-only approval before applying the reviewed candidate to the separate registered Eternyx Staging project. Recheck the project identity, existing migration history, absent objects, ownership and role grants immediately beforehand. Use the staging migration interface, a transaction, a unique managed migration version, and the exact reviewed SQL. Do not copy the historic production admin seed IDs. Do not run the old full admin migration or wholesale db push. Once the candidate is applied, confirm Phase 43, zero initial assignments, and all client ACLs. Approve a dedicated staging admin identity independently before creating any assignment; never derive authority from client-controlled profile metadata. Preserve existing security migrations and reconcile all 13 source files and managed versions in reviewed order, with **Phase 13 before Phase 14**. Run the full catalog and real staging A/B/admin/anonymous acceptance afterward.

No project, account, assignment, billing resource, or production data has been changed. Merging this PR approves source review, not remote deployment. The new candidate supplies only the minimum shared Services prerequisite; it does not bootstrap every ETERNYX pillar or establish production readiness.
