# ETERNYX Services Phase 43 — trusted-admin prerequisites before the staging rollout

**No staging SQL was applied.** This is a source-only PR backed by *read-only live staging metadata inspection*. The connected staging project exists, is healthy and is separate from the known production project. As of 24 November 2026, the connected staging database had **zero of the 13 Services migration names, none of the six Services schema markers**, and only three earlier security/pentest migration records. Staging Auth primitives are present, but `public.admin_users` and `public.is_admin()` are **absent**.

## Concrete dependency we uncovered

The reviewed Services schema references `public.is_admin()` in customer and administrator RLS. Phase 3 also references `public.admin_users`. Starting to deploy the Services migrations into a staging database without a correctly provisioned trusted administrator foundation risks failures and silently incorrect authorization logic.

The repository contains `supabase/migrations/20261109231500_trusted_admin_authorization.sql`, which establishes an authorization source in `public.admin_users` and replaces `public.is_admin()` with a security-definer function with an explicitly empty `search_path`. **That migration also inserts two specific production admin user IDs**, and depends on other non-Services schema objects including profiles and user_roles. **Never copy or run that historical migration unchanged in staging.** Do not insert the production admin user IDs into the new staging system. An independent, reviewed staging-specific foundation must assign only authorized *staging* identities.

## Twelve catalog facts — no account rows accessed

The new `scripts/services-phase43-trusted-admin-foundation.mjs` checks exactly **12 catalog facts** in one `READ ONLY`, `REPEATABLE READ` transaction with the already protected, low-privilege staging auditor:

1. `auth.users` exists as a table.
2. `auth.uid()` is defined.
3. `public.admin_users` exists as a table.
4. `public.admin_users` has RLS enabled.
5. Browser roles `anon` and `authenticated` do **not** have direct `SELECT` on the assignment table.
6. The zero-argument `public.is_admin()` function exists.
7. The helper uses `SECURITY DEFINER` and is not an invoker helper.
8. The helper is `STABLE` for catalog purposes.
9. Its `search_path` is explicitly empty, reducing object-name resolution attacks.
10. Its catalog function body references `public.admin_users` and `auth.uid()`, without looking up user-editable `public.profiles` roles.
11. Authenticated clients can execute the reviewed admin-check helper used in the actual RLS policies.
12. The helper is not callable through the implicit PostgreSQL `PUBLIC` execute privilege.

The script performs **no** `SELECT FROM public.admin_users`, does not invoke the function, does not read a row of a business or user table, does not seed or change accounts, and never prints Auth IDs or project references. It rejects malformed/extra/untyped catalog evidence. The default report prints `blocked_trusted_admin_foundation_missing` plus a list of **only the fixed catalog check names** until all prerequisites are present. Passing this metadata check merely makes staging *eligible for a separately reviewed rollout*. It **does not authenticate the function semantics**, authorize a deployment, certify RLS or prove real users can access only their own rows.

The existing manually approved **Services read-only staging inventory** workflow runs this report after the project identity check and the Phase 42 migration inventory. It uses the existing `READ_ONLY_STAGING_INVENTORY` acknowledgement, protected GitHub Environment and auditor secret; this does not change the stricter `READ_ONLY_STAGING_ACCEPTANCE` permission required for real accounts. An optional `--assert-ready` mode returns a nonzero exit when the foundation isn't ready, for a future separately approved staging deploy gate.

## Safe manual rollout sequence for a reviewed staging-only change

- Keep production untouched. Recheck the official Management API identity and current staging history. Verify the three existing pentest/security migrations and their dependencies; do not overwrite, rename or silently repair them.
- Independently review and establish only the *required* trusted admin foundation in staging. Use a newly reviewed staging-only migration, with strict direct table grants/RLS and the trusted `is_admin` contract. **Do not deploy the old seeded admin migration unchanged**, and never copy production account IDs. Require separate review of any Auth accounts or administrator assignments.
- Run Phase 43 and require **12/12** catalog facts, while keeping the Phase 42 inventory separate and able to report missing Services migrations. Neither a favorable catalog state nor an empty database implies permission to run a migration.
- Reconcile all source hashes, historical filename/timestamp collisions and the staging managed migration history. Select unique, monotonic **staging-managed** migration versions; do not assume source filename timestamps are available or deployed.
- After explicit staging-only rollout approval, apply the **13 allowlisted Services SQL files in source dependency order** using separately reviewed transactional migration steps. **Phase 13 before Phase 14**. Preserve the verified existing security schema and any existing Auth IDs and customer data. Do not attempt a wholesale reset or a production rollout.
- Once the actual staging schema exists, rerun Phase 42, the full protected 64/64 safety and routine/auditor checks, and finally **real-account staging** A/B/admin/anonymous RLS testing with dedicated staging fixtures and approved credentials.

The source branch and its offline CI tests cannot attest that any staging bootstrap or migration was actually applied. **Services is not production-ready.** Future deployment requires a separate explicit authorized change and live verification.

## Testing

Phase 43 tests require every one of the 12 facts (any single failed check blocks readiness), reject strings/nulls and unexpected JSON fields, verify pure `pg_catalog` access, require fixed read-only repeatable-read `psql` command/TLS restrictions, inspect the historical trusted admin migration to detect account seeding, and confirm the source-defined Services dependency plus manual workflow order. The existing networkless disposable PostgreSQL 17 migration replay remains the functional schema regression suite; it is **not** a remote staging deployment.
