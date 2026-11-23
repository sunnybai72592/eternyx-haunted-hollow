# ETERNYX Automation Phase 3Q — Verified isolated staging handoff

**Scope:** operator-run staging migration reconciliation; no production writes, no automatic deployment or scheduled execution.

## 1. Independently verified resources (2026-11-23)

| Field | Verified value |
| --- | --- |
| Supabase organization | `xnhopzufalyhswuwvqmo` (`sunnybai72592's Org`, Free) |
| Production project (never target) | `wcncuarekaofmfurbtbh` |
| Isolated staging project | `mhodwvypfbxafamkrgsk` (`Eternyx Staging`) |
| Region | `us-east-1` |
| Staging status | `ACTIVE_HEALTHY` |
| Staging PostgreSQL | 17.12 |
| Staging migrations | **0** |
| Staging public tables / functions | **0 / 0** |
| Staging Edge Functions | **0** |
| Provider quote at creation | **$0/month**; subject to plan eligibility and future limits |

These values were checked through authenticated Supabase project, migration, Edge Function, and read-only SQL interfaces. The live project ID is not a secret. Do not place connection passwords, management tokens, service-role keys or CTF secrets in repository files, Actions outputs, issue comments, or logs.

**Important:** A healthy empty staging database is not a verified backend. No four-function deployment has occurred.

## 2. GitHub repository migration blockers

The `main` contents listing at the time of this handoff contained **111** `supabase/migrations/*.sql` files, with **11** duplicate timestamp groups (25 colliding files and 14 excess version claims). In particular:

- `20261115060000`: two AI SQL migrations.
- `20261123030000`: Automation GitHub approvals / Docker enrollment.
- `20261123040000`: Automation workflow tracking / Docker agent reports / Services amendments.
- `20261123050000`: Automation template gallery / Docker operation review / Services journal / Workspace tasks.
- `20261123070000` through `20261123130000`: seven more Automation/Docker collisions.

This is a snapshot, **not** authorization to arbitrarily rename tracked historical migrations. The production journal has **28** applied entries, ending at `20261122213215`, and must not be altered or replayed casually.

The existing `scripts/automation-fresh-staging-mirror.mjs` constructs a *local-only* version-unique mirror and records file fingerprints. Its output is labeled `DO_NOT_DEPLOY`, and does **not** prove that all SQL dependencies or migration ordering work. It must not be pointed at production or interpreted as an approved remote push.

## 3. Five mandatory release gates

1. **Fixed target identity.** Bind `ETERNYX_AUTOMATION_STAGING_REF=mhodwvypfbxafamkrgsk` and the matching staging database host only in the protected GitHub `automation-staging` environment; deny any run that resolves to production `wcncuarekaofmfurbtbh`. Independently compare project organization and health before any write.
2. **Repeatable migration inventory.** From a freshly checked-out main commit, record SHA-256 of every migration byte sequence; enumerate duplicate versions and resolve them only in a reviewed isolated-mirror plan. Check SQL dependency order against actual PostgreSQL 17, including Automation, Docker, Workspace, Services, and verified CTF.
3. **Fresh staging-only migration rehearsal and recovery.** Verify empty staging migration journal and public catalog first. Execute *only* the review-approved, version-unique sequence against `mhodwvypfbxafamkrgsk`. Stop on any SQL failure; do not mark partially applied migrations successful or auto-repair journal entries. Preserve a sanitized result containing applied versions, hashes, and errors. Define a staging reset/rebuild plan before writes.
4. **Full four-function RPC/RLS gate.** Run `node scripts/eternyx-backend-rpc-surface.mjs --source` and its source-derived read-only SQL against the real staging DB. Verify every literal RPC exists and every referenced owner table is a physical table with RLS enabled; run the preexisting CTF catalog gate and migration journal gate. Missing RPC, disabled RLS or source drift **blocks** release.
5. **Manual-only reviewed deployment.** Use `.github/workflows/automation-staging-core-release.yml` only after the environment is protected and stage-specific secrets, CA certificate, CTF flag secret and rollback readiness have been reviewed by the operator. Deploy only `automation-control`, `automation-webhook`, `automation-scheduler-worker`, and `ctf-verified`. Verify expected JWT policies, negative auth, and two-account owner isolation before any approved webhook or schedule event tests. Never use production credentials.

## 4. Completion evidence checklist

- [x] Separate, healthy staging project exists in the original organization.
- [x] Existing production project has not been migrated as part of this setup.
- [x] Empty staging migration, function and public SQL catalog baselines recorded.
- [x] Source collision count captured.
- [ ] Approved unique-version migration plan with dependency order and hashes.
- [ ] PostgreSQL 17 full integration rehearsal passes from a clean database.
- [ ] Stage-only SQL migrations applied and journal reconciled with verified hashes.
- [ ] Every backend RPC/table/RLS catalog check passes in actual staging.
- [ ] Protected GitHub environment variables and secrets configured and reviewed.
- [ ] Four functions deployed to **staging only** and inventory/JWT checked.
- [ ] Negative-auth and authenticated two-user tests pass.
- [ ] Event activation separately reviewed; production deployment separately authorized.

**No release claim:** This document records a real infrastructure milestone and the next required gates. It is not evidence that Automation or CTF cloud execution is currently operational.
