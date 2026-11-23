# ETERNYX Services Phase 25 — real journal-source evidence and admin queue isolation

**Status: implementation only; not production deployment authorization.** This release introduces **no new migration**, changes no Supabase schema, performs no production DB write, and does not create fictitious service records.

## Verified environment and unresolved blocker

On November 23, 2026, the connected Eternyx project `wcncuarekaofmfurbtbh` still reported `ACTIVE_HEALTHY` while both read-only `SELECT 1 AS connected` and the remote managed migration-history request returned **connection timeout**. Remote connectivity is **not restored** by this PR. The cause remains unverified and there is no evidence that Phases 13–14 have been applied.

Historical SQL version collisions across several pillars also block any blind `db push`. The approved recovery sequence remains: restore supported SQL access, reconcile actual migration history and catalog, review the contents of each migration, then apply only verified missing work **Phase 13 before Phase 14**. No manual mutation of the history table, pool adjustment, RLS disablement, or production restart is authorized by this PR.

## Eight practical safety improvements

1. **Customer A and B cannot see the admin-only amendment queue.** Both authenticated owners now probe their own request against that queue. A real zero-row 200/206 or an explicit `42501` 401/403 denial is conclusive negative evidence; a failed query or malformed response is not.
2. **Source-level journal lineage.** Require exact event keys formed from *existing fetched staging source record IDs* instead of accepting any nonempty journal.
3. **Prove the actual activity source** appears in the owner's unified journal.
4. **Prove the actual scope-review and scope-response source events** appear in the journal with matching event kinds.
5. **Prove the actual clarification question/answer source events** appear in the journal with matching event kinds.
6. **Prove the actual Phase 13 brief amendment source event** appears in the Phase 14 journal with matching event kind.
7. **Explicitly probe forbidden internal/triage journal streams** under a real customer request with a separately verified saved admin triage fixture.
8. **Dynamic regression tests** fail on admin queue leakage, missing journal event lineage, false empty-success responses, and journal internal-stream leakage. Queries select only bounded event metadata, not customer descriptions or private narratives.

These checks deliberately use *real existing* A/B/admin staging fixtures supplied by the operator. No backend event is fabricated, no source row is inserted, and no service outcome is implied. The journal is an audit of participant-visible history, **not an order, SLA, payment, authorization, read receipt, or service delivery guarantee**.

## Operator requirements before calling Services live-ready

- [ ] Review Supabase Dashboard database resource and connection metrics. Establish successful `SELECT 1` independently.
- [ ] Reconcile production and staging migration history/collisions and real schema catalog; verify Phase 13 before Phase 14 where missing.
- [ ] Execute the independent catalog check from `docs/sql/eternyx/services-phase20-readonly-schema-check.sql` after DB access is restored.
- [ ] Use a **different** reviewed Supabase staging project with three distinct authenticated fixture accounts and an anonymous client.
- [ ] Configure the protected GitHub `services-staging` environment per `docs/ETERNYX_SERVICES_RELEASE_GATE_PHASE20.md`; manually dispatch the `READ_ONLY_STAGING_ACCEPTANCE` workflow.
- [ ] Require all real-account staging checks to pass including cross-owner, admin-only, journal source provenance, anonymous and internal stream boundaries.
- [ ] Validate signed-in desktop/mobile workflows, and independently inspect migration grants, RLS, policies and trigger enablement.
- [ ] Obtain owner/operator sign-off, separately, before any production schema change or release.

**Passing offline PR tests does not establish successful remote Supabase connectivity, database recovery, correct deployed migrations, or real-account staging acceptance.**
