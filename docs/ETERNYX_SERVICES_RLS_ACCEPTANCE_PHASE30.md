# ETERNYX Services Phase 30 — four-actor SQL row-isolation acceptance

**No new migration, production SQL, deployed database write, secret, remote fixture, or customer data.** This phase extends PR #604's successfully replayed, offline PostgreSQL 17 pipeline.

## Why this matters

The previous replay demonstrated that the thirteen Services SQL files could execute and create RLS, views, policies and triggers. That alone is insufficient: a policy can exist but return the wrong rows, and a security-invoker view can still expose sensitive data through an underlying relationship.

Phase 30 executes actual PostgreSQL statements under the real `authenticated` and `anon` SQL roles after applying the Services chain in a **disposable Docker container launched with `--network none`**. This is a SQL/RLS functional regression test, not a live Supabase Auth or PostgREST acceptance test.

## Connected improvements

1. Seed three entirely synthetic actors (customer A, customer B and administrator) in the local dummy `auth.users` table, never real user accounts.
2. Seed two owned request rows and their actual server-generated request-created activity events.
3. Seed two amendments with their real server-side author/burst checks; administer a real review transition to verify server-stamped reviewer ID and time.
4. Seed one admin-only triage note and ensure it never appears in a participant-readable journal, including for the administrator.
5. Simulate customer A using `SET LOCAL ROLE authenticated` and its own JWT-subject-like claim. Require exactly its own request, activity, amendment, queue and three journal events; zero unrelated/admin rows.
6. Simulate customer B independently, proving exactly its own request/activity/amendment/two journal events and zero A data or admin-only queue rows.
7. Exercise rejected mutations: A cannot insert into B's request; neither A nor B may perform an administrative review; real RLS must prohibit cross-account writes.
8. Simulate an administrator and require actual authorized access to both requests, both amendments, the admin queue, the private triage row and all five participant journal events.
9. Confirm the existing trigger rejects moving even an admin-controlled request directly into unapproved `in_progress` delivery.
10. Simulate the `anon` SQL role and require explicit PostgreSQL permission errors for private request/journal selects.
11. Wrap synthetic data and all assertions in **one transaction rollback**, with no persistence even in the disposable DB. Existing Docker cleanup remains in force.
12. Add six source and workflow regression tests, preserve read-only GitHub permissions and require the new SQL acceptance to execute after migration compilation and catalog checks.

## Scope and limitations

These tests exercise actual PostgreSQL RLS/policies/SQL privileges and trigger code with synthetic roles and a minimal locally defined `auth.uid()` / `public.is_admin()` bootstrap. They **do not emulate the complete Supabase Auth platform**, JWT verification, REST policies or browser session behavior. A green SQL test does not prove real-account row ownership, production deployment, staging correctness or operational readiness.

The connected Supabase database sometimes responded to harmless `SELECT 1` on November 23, 2026, but other requests timed out. In the successful read-only catalog audit, the Phase 13 amendment table and two queue views and Phase 14 journal view were absent. No attempt is made in this PR to deploy missing SQL because Services shares migration timestamps with other ETERNYX pillars.

## Independent release gates

Before any production launch: restore consistently healthy SQL access; independently reconcile actual managed migration history, version collisions, and catalog state; review missing schema in the intended environment; conduct an explicitly approved collision-aware **staging** deployment of only truly missing reviewed changes in dependency order (**Phase 13 before Phase 14**); rerun the Phase 27 read-only catalog audit; and require protected **real-account staging** customer A/B/admin/anonymous acceptance plus desktop/mobile browser flows.

Services is **not production-ready** until all those separate gates pass. A merged PR or passing disposable SQL RLS test does not authorize deployment, billing, fulfillment, or a customer-facing claim of service delivery.
