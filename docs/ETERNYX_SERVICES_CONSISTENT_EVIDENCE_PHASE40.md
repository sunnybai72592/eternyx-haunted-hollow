# ETERNYX Services Phase 40 — consistent, independently checked staging evidence

**No new migration, no remote SQL writes, no new Supabase project, no production deployment.**

## Corrected release-readiness gaps

Phases 35–39 established a protected manual staging workflow that checks operator approval, real PostgreSQL catalog state, a dedicated auditor's rights, privileged routine exposure, and 64 separate Services schema-security assertions. Two evidence loopholes and one concurrency concern remained:

1. Existing managed-history reconciliation checked that each of the **13 named Services migrations** appeared, but did not establish that their **actual managed migration versions** increased in the dependency sequence. A journal migration recorded before its amendment prerequisite could be mislabeled “complete” because all the tables happened to exist.
2. The existing 64-check verdict parser used JavaScript numeric coercion; the strings `"64"` and `"0"` were accepted as though they were genuine numeric PostgreSQL query output.
3. Four SELECTs occurred within a READ ONLY transaction but, at PostgreSQL's usual READ COMMITTED isolation, each could see a different committed database state. Concurrent administrative deployments could create a mixed-time history/catalog view.

## Phase 40 fixes shipped together

- Run the same existing protected live staging SQL in **one READ ONLY transaction under REPEATABLE READ isolation**. The auditor connection remains read-only, and all database metadata/history queries see the same repeatable snapshot (aside from intentionally volatile wall-clock functions). No additional network connection is made.
- Require four **exact** JSON result objects with known field sets. Extra or missing identity, history, schema, or verdict keys block the gate rather than letting a partially altered SQL query pass.
- Require all six live object-presence observations to be actual booleans.
- Require the 64-check catalog result to contain precisely `catalog_checks_passed: true`, the **number** `checks_evaluated: 64`, the **number** `checks_failed: 0`, and an actual **empty array** of failing IDs. Strings, nulls, booleans in numeric positions, and unexpected fields fail.
- Validate the recorded managed history for duplicate version/name entries, valid timestamp-like 14-character version strings, bounded size, and exact required source migration names. Ignore unrelated cross-pillar entries rather than treating them as absent Services migrations.
- For the **13 source-ordered Services migration names**, enforce that their **actual managed migration versions are strictly increasing**. This independently verifies the required **Phase 13 before Phase 14** ordering and also checks all preceding Services dependencies. It does not use collided source filename timestamps as deployment proof.
- Keep prior fail-closed role, SQL source, RLS, catalog and missing-phase checks intact; retain fixed non-sensitive failure codes and no raw history/credentials/rows in GitHub logs.
- Add targeted Node negative-control tests for reversed Phase 13/14, an earlier dependency out of order, duplicated or invalid versions, fake numeric strings, incomplete/extra JSON keys, and source-name/managed-version confusion. Wire them into the existing networkless disposable PostgreSQL 17 CI.

## Evidence boundaries and staging blocker

This checks **chronological names and recorded versions**, not exact historic migration SQL content or the truth of a human-managed migration record. REPEATABLE READ supplies a consistent snapshot within a transaction; it does not prevent an operator from deploying afterward, prove row-level permissions for actual customers, or attest that a real approved staging project exists. The registered project identity still needs separate administrative verification.

The connected account has so far exposed only the existing production-linked ETERNYX Supabase project. Its observed managed history includes the earlier 11 named Services migrations, not Phase 13/14. Production remains untouched. A separate approved staging environment, controlled migration and collision reconciliation (**Phase 13 before Phase 14**), dedicated least-privilege auditor credentials, genuine application accounts and **real-account staging** A/B/admin/anonymous acceptance remain required.

Services is **not production-ready** simply because Phase 40 offline CI passes. Do not redirect the protected manual workflow to production or treat operator-supplied JSON as independent evidence.
