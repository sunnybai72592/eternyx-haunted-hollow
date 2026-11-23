# ETERNYX Services Phase 26 — Fail-closed staging authentication lifecycle

## Status

This change introduces **no new SQL migration**, makes no changes to Service business records and does not run the protected staging acceptance automatically.

On November 23, 2026, the linked production Eternyx Supabase project metadata still said `ACTIVE_HEALTHY`, but both `SELECT 1 AS connected` and migration-history reads failed with **connection timeout**. **SQL access is not restored.** There is still no independently verified proof that Services Phase 13 or Phase 14 database objects have been applied.

A merged PR and passing source-only CI do not prove backend deployment or real-account safety.

## Changes

1. The three dedicated staging sign-ins now use `Promise.allSettled` instead of fail-fast `Promise.all`. If one authentication fails, all other sign-in attempts finish before session cleanup begins; this avoids a late-arriving sign-in escaping cleanup.
2. The staging runner attempts local sign-out for each of the three authenticated staging accounts on **both success and failure**.
3. Sign-out uses `{ scope: 'local' }` expressly. Supabase's default global sign-out would terminate sessions on other devices. Only the current staging session is targeted; no other staging account or anonymous client is signed out.
4. A failed sign-out attempt does not skip attempts for remaining actors; no raw Auth or SDK exception is printed.
5. The final `STAGING SERVICE DATA-API ACCEPTANCE: PASSED` is produced **only** after all relevant staging assertions and all three sign-outs succeed.
6. If a feature/security assertion fails and cleanup also fails, the original gate failure is preserved. The run never claims production readiness.
7. Regression tests exercise success cleanup, mid-run privacy failure cleanup, a rejected concurrent sign-in, returned Auth cleanup failures, throwing sign-out calls and error priority.
8. The operator's staging instructions continue to require dedicated accounts, protected secrets, valid existing persisted fixtures, independent SQL catalog audit and source-controlled reviewed migrations.

### Auth security boundaries

- This check signs in using only operator-provided **dedicated test identities** in a separate nonproduction project.
- `signOut({ scope: 'local' })` targets the test's current session; it must not terminate other sessions.
- Supabase access-token JWTs may remain valid until expiry even after sign-out. Do not represent cleanup as immediate invalidation of every issued access token.
- Auth sign-in and sign-out are session lifecycle operations; the test still does not create, edit, delete, export, fulfill or charge any Service record.
- The script emits no credentials, email addresses, tokens, request IDs, or raw response bodies to CI logs.
- If cleanup fails, inspect Auth availability separately and use the correct operator procedure for test-account session management. Do not use a `service_role` key as a workaround.

## Remaining release blockers

1. Restore responsive SQL connectivity in the correct Supabase project; diagnose database connection/resource pressure using verified metrics, logs and Supabase support as necessary.
2. Reconcile actual managed migration history, historical version collisions, and catalog state. If any reviewed SQL is truly missing, apply **Phase 13 before Phase 14** only after separate explicit operator approval. Never run blanket `db push`, edit migration history or disable RLS to get green.
3. Complete the independent SELECT-only catalog audit at `docs/sql/eternyx/services-phase20-readonly-schema-check.sql`, reviewing expected objects, RLS, invoker flags, grants, functions, policies and enabled triggers.
4. Configure the separate protected `services-staging` GitHub environment with real customer A, customer B and administrator accounts plus saved test workflow fixtures.
5. Dispatch the manual `READ_ONLY_STAGING_ACCEPTANCE` gate; require all checks and local sign-outs to succeed, then complete signed-in desktop/mobile validation and owner review.

**Services is not production-ready until these real-account staging, database-state and catalog checks succeed.**

## Official Supabase guidance

- [Sign out and scopes](https://supabase.com/docs/guides/auth/signout)
- [Database connection management](https://supabase.com/docs/guides/database/connection-management)
- [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
