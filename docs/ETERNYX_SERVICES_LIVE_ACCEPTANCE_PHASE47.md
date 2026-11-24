# Services Phase 47 — live deployment evidence and real Auth acceptance prerequisites

## Verified live staging evidence (24 November 2026)

All 14 explicitly approved staging migrations succeeded, recorded in strictly increasing managed version order from 20261124130425 through 20261124130625. The managed migration SQL statement arrays each contain exactly one reviewed source file. A read-only PostgreSQL query computed Git-framed SHA-1 checksums directly from those recorded statements: **14/14 exact matches, zero mismatches** against Phase 45's pinned manifest. This corroborates recorded SQL content, not proof of execution effects by itself. Earlier independent live catalog checks passed 64/64, all six schema markers and all twelve trusted-admin foundation checks. Ten Services tables and eleven views were created. No anonymous forbidden grants or broad authenticated table writes were observed.

Fresh read-only inventory: **0 Auth users, 0 trusted administrator assignments, 0 Services requests, no services_staging_auditor role**. Therefore real Auth acceptance cannot yet execute. No users or assignments were created during Phase 47.

## Prepared operator candidates (not automatic migrations)

- `scripts/services-phase47-recorded-sql-review.mjs --sql` emits a fixed aggregate-only recorded checksum/order query for the reviewed manifest. Run against verified staging via a privileged read-only operator, not the dedicated auditor; returns counts, mismatch step numbers and ordering, not SQL source. Hashes are integrity comparisons, not signatures.
- `scripts/sql/services-staging-acceptance-fixtures-candidate.sql` requires **three existing, independently verified dedicated staging Auth accounts**, five distinct-where-required UUID inputs, an explicit fixture approval value, and one transaction. It refuses an occupied target or any fourth Auth account; inserts one separately approved administrator assignment and two synthetic requests plus the real persisted activity, scope response, clarification, amendment, private triage and journal sources required by the existing acceptance script. It never inserts into auth.users or deletes/recycles records. The caller must independently verify project identity and that the three supplied IDs belong to the dedicated test accounts; the SQL itself cannot authenticate the project or the user IDs' purpose.
- `scripts/sql/services-staging-auditor-candidate.sql` establishes a NOLOGIN auditor with only CONNECT, schema USAGE and SELECT on history name/version columns. Independently check effective privileges, including inherited PUBLIC grants, before activating LOGIN and securely setting a unique password. Never give the auditor Auth, customer records, migration statement SQL or privileged routine grants.

CI uses the exact fixture candidate in the existing isolated PG17 database, denies missing approval and reapplication, and checks real SQL role isolation for synthetic A/B/admin/anon. It also tests auditor ACLs. Synthetic GUC identities are **not** Supabase JWT verification.

## Fast operator path

1. Verify separate registered Eternyx Staging identity using Phase 41; confirm current empty account/assignment/request inventory. Obtain explicit approval to create exactly three dedicated staging Auth users and assign the specified admin, seed synthetic Services fixtures and provision the restricted auditor. **No production users, billing or cross-pillar records.**
2. In the staging Auth dashboard create three dedicated users (two customers and one admin), with unique credentials stored in the protected GitHub environment, not chat/logs/repository. Never insert passwords or Auth rows directly in SQL. Confirm the dedicated IDs. The current connector has no Auth admin create-user operation.
3. Using an independently target-verified staging operator psql connection, execute the reviewed fixture candidate once with `-X -1 -v ON_ERROR_STOP=1`, passing `customer_a_id`, `customer_b_id`, `admin_id`, `request_a_id`, `request_b_id` (two newly generated request UUIDs), `fixture_approval=SEED_DEDICATED_SERVICES_STAGING_FIXTURES` and `-f scripts/sql/services-staging-acceptance-fixtures-candidate.sql`. Do not run the file via normal db push. Stop on any error; do not retry against a nonempty target. Keep identifiers private.
4. Independently approve and apply the auditor candidate transactionally; confirm effective privileges, configure a private unique password using secure operator tooling, activate LOGIN only after review. Store its password in the protected environment. Recheck the actual role boundary and run the prior inventory/64-check proof.
5. Configure the existing protected manual acceptance workflow with the publishable key, three test credentials, request IDs, project identity, auditor credentials and fresh operator evidence. Run it with READ_ONLY_STAGING_ACCEPTANCE; require actual Auth sign-in, A/B/admin/anon RLS, journal source provenance and local session cleanup.

## Outstanding security review

Supabase security advisor flags admin_users RLS enabled without a policy (intentional deny-all direct access), and the shared caller-bound public.is_admin() SECURITY DEFINER function callable by anon and authenticated. The approved current function only returns a caller-specific boolean, has a fixed empty search_path, and exposes no assignment rows. Changing that shared helper may affect other pillars and existing Phase43 checks; evaluate a private definer plus public invoker compatibility design separately. No unreviewed live change was made. Do not claim production readiness until real-user acceptance and the shared helper review are completed.

Phase 47 only prepares/rehearses these separately approved operations. Production remains untouched.
