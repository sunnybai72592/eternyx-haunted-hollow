# Integrated release phase 2 — 2026-11-25

**HOLD.** PR #821 merged. Independent read-only observation now confirms 75 staging migration records, 91 public tables with RLS enabled, 2 confirmed nonanonymous Auth accounts, no admin records or instructor grants, no Workspace teams, Automation workflows, pentest engagements or service requests. Production catalog query succeeded: 63 public tables, zero without RLS, zero Workspace tables. Full production migration history still timed out; do not infer parity.

## Workspace provenance reconciliation (read-only)
All 14 source bodies at merge f9cfe7aa1e7b7092536ebbc04855b18167a7b3c0 were compared directly with the corresponding staging migration ledger statements. Each had one stored statement and an exact text match; none used the original source timestamp. The following records are observed staging mappings, not canonical production versions:

| Source version | Staging version | Git blob SHA |
|---|---|---|
| 20261123050000 | 20261125150110 | 4cbe6bd339bb2efda8d79e792e0986852f2b4a15 |
| 20261123180000 | 20261125150117 | 2f0eea335fb328b254707cdfe104cad1d98d8ecd |
| 20261124010000 | 20261125150121 | 7f3dff555afee4893b3909cc4b030bfd5d2eba83 |
| 20261124030000 | 20261125150126 | 32de9728e8e002578657cb499585d3b206201727 |
| 20261124050000 | 20261125150131 | 0c6c220cbd183188bb14c12c7603a38597af81a1 |
| 20261124070000 | 20261125150136 | 199b1db94f5d86490d1af8486d8096363e5eb36a |
| 20261124090000 | 20261125150140 | 269f7ec001debd078f0bbb035b3e195e32c63c47 |
| 20261124110000 | 20261125150143 | 8d8484df43c03b4db5468416f1effe1a708cffca |
| 20261124130000 | 20261125150146 | 925a6497d3f68afee79f5375cf2d82f1c63c4de3 |
| 20261124150000 | 20261125150149 | 2957862eca25d105ae9fee185eb07795079c476d |
| 20261124170000 | 20261125150157 | 0f0d3d803fdff35f7b517cbae1c1de303a97733f |
| 20261124190000 | 20261125150201 | 96110d80dd4577c7405a98fdf651ff3161f1cc92 |
| 20261124210000 | 20261125150208 | 6955c95eeb709857d3850e7f8bf3e523cb6b6021 |
| 20261124230000 | 20261125150211 | ce4d7d15ea69b2abf438789cddc1f0de1fdbc714 |

18 Workspace tables have RLS and no direct anon SELECT, 46 workspace-prefixed functions, private 5 MiB bucket, three named Storage policies and team events in Realtime. Do not replay or repair timestamps just to satisfy original-version gate. Independent runtime/catalog checks remain required. Related pillar work: #823, #826, #830 (Workspace), #828 (Cybersecurity), #834 (Automation), #831 (Education), #832 (Services), #835 (AI Arsenal). Check their current state and actual acceptance receipts; merge alone is not proof.

## Integrated evidence checker
Run locally on a sanitized JSON manifest, never containing tokens, credentials or fixture IDs:
`node scripts/eternyx-integrated-evidence-check.mjs manifest.json <exact-candidate-commit-sha>`

Root keys: schemaVersion (1), candidate (40 lowercase hex SHA), stagingRef (exact staging ref), evidence (array). Each row has gate (from REQUIRED in script), status (PASS), candidate, stagingRef, runId (decimal string), artifactSha256 (64 lowercase hex), observedAt and reviewedAt (canonical UTC ISO with milliseconds), operator and reviewer (distinct GitHub-style handles). Missing, duplicated, failed, wrong-project, stale (>7 days), self-reviewed or malformed evidence blocks. The freshness window is a conservative release convention, not a substitute for drift checks. All 18 gates required for full Universe scope. A zero exit means structurally READY_FOR_INDEPENDENT_REVIEW only. It never authorizes production. The checker cannot verify artifact existence, digest contents, run ownership, reviewer identity or true independence: a human reviewer must retrieve original artifacts and verify those separately, and independently approve exact release and rollback plan. Do not connect this script's exit code alone to deployment. Never fabricate PASS rows.

No database mutations, new accounts, paid resources or production deployment performed in this integrated phase.
