# LABS Phase 16 — composed bootstrap rehearsal

A healthy isolated Supabase project is not an installed LABS backend. A read-only
staging inventory found zero Edge Functions, zero Auth users and no LABS CTF or
range relations. No live writes were made. This PR prepares a reproducible,
networkless PostgreSQL 17 replay of the five existing LABS migrations.

The manifest hashes the exact migration sources and five Edge entrypoints,
rejects missing/new LABS migration names and version collisions, and checks the
source JWT configuration. These hashes are **not** proof of deployed code or of
all transitive imports.

The workflow installs the checked-in migrations in chronological order. It runs
verified CTF owner/RLS and attempt-window SQL checks, then the existing session,
access-grant, fenced-worker and spend-ledger SQL smoke checks at the appropriate
migration boundary. Each synthetic fixture test runs in a transaction that rolls
back before the next migration. Final catalog checks require eight RLS tables,
service-only invoker RPCs, revoked unfenced RPCs, empty fixture tables, and zero
provider/hosted-spend budgets. No VM, container target, real account or cloud
reservation is created; the only container is the disposable CI database.

## Release blockers (not silently waived)

- Direct authenticated SELECT on the sessions table currently includes internal
  provider_instance_ref and worker_fence_id fields for the row owner. The final
  check reports this risk explicitly. Before rollout, use a reviewed forward
  migration to narrow the read surface and validate both account-scoped REST and
  service-role operations. Do not rewrite previously applied migration history.
- Actual isolated staging migration history and database grants must be checked
  separately before applying any source SQL.
- The verified CTF flag secret and two dedicated staging Auth accounts must be
  provisioned securely, not committed or printed.
- The five Edge Functions must be deployed and their actual status/JWT policies
  verified. Phase 15 live acceptance must then run against staging.
- Provider and spend policies must remain disabled; no hosted ingress, external
  VM isolation, or paid compute is authorized by this workflow.

No live staging or production changes are performed by this PR. A green offline
rehearsal is not release approval.

Run source checks: node scripts/labs-bootstrap-manifest.mjs
Run focused tests: node --test tests/eternyx-labs-bootstrap.test.mjs
Run the composed rehearsal via GitHub Actions (CI-only).
