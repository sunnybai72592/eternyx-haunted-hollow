# ETERNYX Services Phase 33 — real SQL write-abuse acceptance

**No new migration.** No Supabase SQL, customer data, remote Auth, production database mutations, schema deployments, payments or paid resources. Tests run exclusively in the existing disposable PostgreSQL 17 Docker CI replay under network isolation.

## Fifteen real-SQL abuse checks

1. Genuine owner amendment insert succeeds with server-default pending state.
2. Duplicate normalized amendment summary/details rejected by actual trigger and expected SQLSTATE/message.
3. Customer A cannot spoof customer B as author.
4. Customer A cannot insert a brief amendment for customer B's request.
5. Customer A cannot forge server timestamp.
6. Customer A cannot rewrite authored summary after insertion.
7. Customer A cannot delete an amendment.
8. Customer A cannot review their own amendment.
9. Four unique same-owner/same-request writes succeed; the fifth hits the server-side 10-minute burst guard and creates no row.
10. Owner B can still create an amendment and cannot see A's journal or amendments despite A's rate limit.
11. Verified synthetic admin can mark pending as reviewed and trigger stamps actual reviewer/time.
12. Repeating the same review does not change timestamp; reopening a reviewed amendment is denied.
13. Admin cannot edit customer's original details; actual participant journal retains precisely four A submission events and one review event.
14. Anonymous SQL role is denied direct amendment reads.
15. All synthetic identity/request/amendment data is removed by **transaction rollback**, checked by a post-rollback SQL assertion.

## Safeguards

Failed writes are asserted by real SQLSTATE, expected trigger messages and a denial flag checked *after* the exception block, rather than accepting arbitrary errors. Source fixtures are created as a disposable superuser; all permission assertions execute under the actual authenticated/anon PostgreSQL roles with synthetic JWT-subject context. Tests validate persisted event lineage, not fabricated UI states.

The synthetic auth.uid() and is_admin() bootstrap does not replicate complete managed Supabase Auth. This isolated test proves actual PostgreSQL policy, grant and trigger behavior on reviewed source—not live Supabase Auth or Data API security.

CI runs full Services Phase 1–14 migrations, Phase 29 schema checks, Phase 30 four-actor RLS, Phase 32 catalog-mutation failures, and then Phase 33 real writes. Network-isolated Docker has no published ports or external project credentials.

**Never run the Phase 33 synthetic fixture SQL on a shared, staging or production database.**

## Remaining release blockers

As of November 23, 2026, only the production-linked Eternyx Supabase project was visible to the connected account, SQL management calls were intermittent, and the most recent successful catalog query found Phase 13/14 objects absent.

Before release: obtain a separate nonproduction staging environment, restore stable SQL access, reconcile live managed migration history with the 11 historical collision versions, review any missing changes, apply only approved missing staging schema in order (**Phase 13 before Phase 14**), validate the 64-check live catalog audit, run protected **real-account staging** customer A/B/admin/anon tests, verify mobile/desktop behavior and obtain operator sign-off. This PR does not perform those steps.

Services is **not production-ready** until real environment deployment and real-account acceptance independently pass.