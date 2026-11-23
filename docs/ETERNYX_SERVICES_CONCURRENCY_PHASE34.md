# ETERNYX Services Phase 34 — real concurrent amendment admission in PostgreSQL 17

**No new migration, no external API, no paid infrastructure, no staging or production database mutation.** This extends the existing isolated Services CI, preserving all earlier source guards, 13 ordered migrations, catalog assertions, four-actor SQL RLS, Phase 32 audit mutations and Phase 33 single-session write-abuse tests.

## Why this matters

A single-transaction test cannot demonstrate the actual safety of admission controls under concurrent customer clicks and network retries. Phase 13's insert guard takes a per-request/per-author PostgreSQL advisory transaction lock to serialize duplicate detection and a four-per-ten-minute burst budget. Phase 34 now forces simultaneous **four independent SQL sessions**, using the real reviewed migration's trigger, to prove those controls hold under contention.

## Actual checked scenarios

1. Seed two *synthetic* customers with two requests in disposable PG17; customer A starts with exactly three distinct recent amendments, customer B with zero.
2. A separate database session takes exclusive session-level advisory locks for both exact per-owner/request keys used by Phase 13. It holds both locks while client sessions queue.
3. Launch **four simultaneous real PostgreSQL clients** under authenticated role, with their own JWT-subject-like claims (two clients for A, two for B).
4. Query the PostgreSQL lock catalog; require **four ungranted advisory locks at once**, not a merely asynchronous test harness.
5. After releasing the held keys, require exactly one of A's distinct submissions to succeed, while the other must fail with SQLSTATE P0001 and the genuine ten-minute burst rejection message. A now has exactly four rows, never five.
6. Independently require exactly one of B's case/whitespace-varied duplicate submissions to succeed, with the other rejected by the genuine duplicate error, and exactly one B row persisted.
7. Reject accidental success of both writers, failure of both writers, an unrelated SQL error or a missing lock waiter. The script checks winner/loser process exit statuses separately.
8. Recheck underlying persisted amendments: exactly one A contender and one normalized B submission, not two.
9. Require actual Phase 14 journal event counts to match committed accepted amendments (A four, B one), never aborted writes.
10. Explicitly delete all test-only requests and synthetic Auth users and assert no synthetic request, amendment, activity or Auth row remains.
11. Before starting, validate actual Docker inspection values: image must be postgres:17-alpine, network mode must be none and no host ports may be published. The safety check fails closed before any SQL is executed.
12. Source regression tests cover stage allowlisting, exact advisory lock keys, real role boundaries, four waiter requirement, trigger error identity and cleanup, plus workflow integration.

The SQL generator only prints allowlisted, hardcoded synthetic SQL. It has no database connector or network call. The separate Bash CI harness uses docker exec exclusively against the already verified disposable PostgreSQL container, cleans local scratch logs and relies on the outer CI workflow's forced Docker removal on failure.

**Never run this suite on a live Supabase project, even on staging.** Synthetic fixture IDs are not real accounts; no real Supabase Auth or Data API is simulated. This test shows actual PostgreSQL locking/serialization in a controlled environment, not network-scale capacity or an overall performance guarantee.

## Independent Services launch requirements

The last connected project inspection listed only the production-linked Eternyx Supabase project; SQL management connectivity had repeatedly timed out, and successful earlier read-only catalog inspection found Phase 13/14 objects absent. No change in that status is claimed by this PR.

To ship Services safely: establish a separate budget-approved nonproduction Supabase project; independently reconcile actual managed migrations and eleven historical timestamp collisions; deploy reviewed missing staging schema in strict order (**Phase 13 before Phase 14**) only with approval; pass the 64-check live read-only catalog verdict; pass protected **real-account staging** customer A/B/admin/anonymous tests with persisted fixtures; verify desktop/mobile journeys; and obtain operator release sign-off.

Services is **not production-ready** based solely on isolated green CI or a merged PR.
