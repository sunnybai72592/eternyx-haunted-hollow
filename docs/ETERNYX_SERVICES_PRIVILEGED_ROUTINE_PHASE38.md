# ETERNYX Services Phase 38 — privileged routine attack-surface gate

**No new migration. No customer-data reads. No cloud deployment, real-account login, external SQL write or production change.**

## Why this is necessary

Phase 37 checks actual effective SQL permissions of the staging auditor. Those checks do **not** detect permission to invoke a project-authored `SECURITY DEFINER` function, which can run as its privileged owner even when its caller has no direct INSERT/UPDATE privileges. A database role named "read-only" is not automatically harmless if it can execute privileged code.

Phase 38 adds **three additional strictly read-only PostgreSQL catalog checks** to the *same* Phase 36 protected staging audit transaction, before the A/B/admin/anonymous application acceptance can sign in.

1. **No executable volatile SECURITY DEFINER functions in `public` or `eternyx_private`.** The audit checks actual EXECUTE plus schema USAGE, using `pg_proc` metadata rather than blindly counting existing functions. PostgreSQL trigger and event-trigger return types are excluded from the callable function test, since those cannot be invoked directly with a normal SELECT.
2. **Private helper schema is not usable by the auditor.** No effective `USAGE` on `eternyx_private`—even a helper with minimal grants should remain out of an independent SQL auditor's reach.
3. **No executable SECURITY DEFINER procedures in the project schemas.** Procedural entry points are separately tested even if their implementation or volatility classification changes.

Each verdict must be the literal boolean `true` and there must be exactly three expected fields. Missing, partial, false, null and extra/unexpected data fail closed. The protected workflow cannot override a failed result using an operator-supplied attestation.

## Genuine PostgreSQL regression tests

After the prior Services, RLS, concurrency and Phase 37 tests finish, the existing **network-isolated disposable PostgreSQL 17 container** creates a synthetic auditor and exercises the exact catalog query against:

- a clean auditor and a `SECURITY DEFINER` routine it cannot execute;
- an intentionally granted EXECUTE on a volatile definer function, which must trigger a denial;
- revocation of function EXECUTE, which must restore the clean result;
- EXECUTE on a newly created privileged procedure, which must be detected;
- temporary USAGE on the private helper schema, which must be detected;
- final cleanup of all synthetic roles, grants, functions and procedures followed by a clean verdict.

All SQL writes are against the disposable, `--network none` PostgreSQL CI container only. The actual protected staging workflow reads catalog metadata and never runs the attack scripts.

## Deliberate safety boundaries

This is an **exposure check, not a formal audit of SECURITY DEFINER source code or a proof that all functions are harmless**. It does not inspect or execute the source bodies, `prosrc`, or extensions. Nonvolatile functions, trusted system schemas and indirect privilege paths still require dedicated review. Another actor can modify grants after a point-in-time verification. A check passing does not establish that the actual staged migration SQL matches a checked-in historical source file under duplicate migration versions.

The gate is intentionally restrictive. If it reports an existing callable volatile privileged function, the DBA must investigate what grants, schema access and caller roles are appropriate, and use a separate reviewed staging-only remediation. Never blindly revoke application access from a live database to silence this check.

Our connected account still shows only the production-linked Eternyx Supabase project; Phase 13 and 14 are not listed in its managed history and their four checked database objects are absent. **Do not run staging tests against production.** First arrange an approved **separate nonproduction staging project**, reconcile the eleven historical migration timestamp collisions, deploy approved missing schema in correct order (**Phase 13 before Phase 14**), and configure real-account staging users and protected auditor credentials.

The Services pillar is **not production-ready** based on local SQL regression CI or this new metadata check. The 64 catalog checks, managed migration evidence, protected real-account staging acceptance, and operator release signoff remain mandatory.
