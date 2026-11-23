# ETERNYX Automation Phase 3F — Independent Staging DB Connectivity Proof

**Mode:** manual, independently approved, isolated-staging-only, SQL read-only.
**Not deployed:** no staging database was created and no live database probe has run.

## Verified incident context (23 November 2026)

The connected ETERNYX Supabase project \`wcncuarekaofmfurbtbh\`
reports \`ACTIVE_HEALTHY\`, but live Management API migration-history
listing and even compact table listing repeatedly return
**connection terminated due to connection timeout**. Its active function
inventory lists only \`automation-github-issues\`,
\`automation-github-public\` and \`automation-schedule-control\`.
The missing \`automation-control\`, \`automation-webhook\` and
\`automation-scheduler-worker\` are **not** presumed deployed.

Read-only PostgreSQL log metadata around these failures includes
\`08006\` with \`could not receive data from client: Connection reset by peer\`
(including \`mgmt-api\` sessions) and \`08P01\` with
\`could not accept SSL connection: EOF detected\`. These observations
indicate broken/aborted connections, but **do not establish whether the
problem originates with the database, network, client, resource pressure,
SSL configuration, or the Management API**. Avoid restarts, credential
rotations and infrastructure changes based only on these records.

The connected project currently has no separate staging branch. A
live staging probe **cannot run until an isolated environment exists**.

## Twelve practical safeguards and diagnostics

1. **Independent read-only connection path**: uses standard PostgreSQL
   \`psql\`, not the failing Management API, to separate API transport
   faults from reachable staging SQL.
2. **Manual-only GitHub Action**: no push, PR or schedule trigger
   connects to a hosted database.
3. **Environment approval and exact acknowledgment** before accessing
   credentials: \`I_APPROVE_READONLY_ISOLATED_STAGING\` only.
4. **Production ref hard-deny**: rejects the currently connected live
   project and requires explicitly distinct staging/prod refs.
5. **Strict target binding**: direct host \`db.<staging-ref>.supabase.co\`
   with user \`postgres\`; or known Supabase pooler hostname with user
   \`postgres.<staging-ref>\`. Rejects URLs, IPs, arbitrary hosts,
   embedded port strings, wrong database and arbitrary shell options.
6. **Session-pooler-only port 5432** and \`postgres\` database;
   no transaction pooler fallback or silent host rewrite.
7. **Authenticated TLS** with \`PGSSLMODE=verify-full\` and an
   operator-provided trusted CA PEM, never \`sslmode=disable\`.
8. **Credential secrecy**: password and CA are GitHub Environment
   secrets, not repository variables; \`psql\` output and errors are
   captured in temporary private files, never printed raw.
9. **Timeout and write-guard**: short connection, lock and statement
   timeouts; PostgreSQL \`default_transaction_read_only=on\`;
   fixed SQL explicitly starts \`BEGIN READ ONLY\`.
10. **Metadata only**: verifies real migration-history relation,
    Automation workflow/run/webhook/schedule relations and the 11
    historically collided migration versions. No customer/owner records.
11. **Sanitized diagnosis**: reports known classes such as DNS,
    network timeout, TLS verification, login failure, permissions,
    migration-history absent, and query timeout; never prints raw
    connection strings or password-bearing messages.
12. **Regression tests**: protect forbidden production refs, pooler
    ref mismatches, unsafe hostnames, fake read-only results,
    duplicate/forged versions and manual-only workflow boundaries.

## Operator setup — only AFTER isolated staging is authorized

Create and **independently verify a separate staging project**, not a
snapshot of production user data, with an approved hosting budget and
explicit owner approval. New Supabase project/branch creation may incur
charges; this PR creates none.

In GitHub, set up the protected **\`automation-staging\` Environment**,
with required reviewer approval. Configure these environment variables:

| GitHub Environment variable | Expected |
|---|---|
| \`ETERNYX_AUTOMATION_STAGING_REF\` | Distinct 20-letter staging Supabase project ref |
| \`ETERNYX_AUTOMATION_STAGING_PGHOST\` | Exact staging direct database hostname or verified session-pooler hostname |
| \`ETERNYX_AUTOMATION_STAGING_PGUSER\` | \`postgres\` (direct), or \`postgres.<staging-ref>\` (pooler) |

The runner pins \`ETERNYX_AUTOMATION_PRODUCTION_REF\` to the known
production project ref, port \`5432\`, and database \`postgres\`.
Do **not** point either host or username at production.

Configure **two environment secrets** (never upload or paste them into
GitHub commits, chat, logs or PR descriptions):

- \`ETERNYX_AUTOMATION_STAGING_PGPASSWORD\`: the isolated staging database
  password only; **not** the production password or a service-role key.
- \`ETERNYX_AUTOMATION_STAGING_CA_PEM\`: the verified CA chain for the
  staging direct database/session pooler connection, obtained from the
  authorized Supabase project database settings.

The runner requires a preinstalled \`psql\` client. If the GitHub hosted
image lacks it, installation must be reviewed separately; no shell
fallback disables SSL verification.

## Execute manually (once staging exists)

GitHub → **Actions** → **Automation staging direct PostgreSQL read-only
diagnosis** → Run workflow → choose
\`I_APPROVE_READONLY_ISOLATED_STAGING\`.

GitHub will enforce the configured \`automation-staging\` Environment
review requirement. The job verifies target metadata **before**
accessing either secret.

It then connects with \`verify-full\` TLS and executes the reviewed
\`scripts/sql/automation-staging-db-readonly.sql\` in a SQL
\`READ ONLY\` transaction. A successful report contains only
\`connection_ok\`, \`transaction_read_only\`, historical migration
version identifiers and boolean schema-presence flags. No changes are
applied, no function is deployed, and no schedule is enabled.

### Interpret outcomes without guesswork

- **Direct staging DB succeeds; Management API still fails**:
  prioritize Management API routing, credential mode and network
  reachability with Supabase Support. This does *not* prove production
  works.
- **TLS, DNS or network connection fails**: review the staging-only
  endpoint, IP/IPv6 access, host-bound pooler username and CA before
  making changes. Do not disable TLS.
- **Read-only connection succeeds but migration-history relation is
  missing**: stop. Do not invent an empty history or use
  \`migration repair\`.
- **History lists a duplicated version**: the timestamp alone cannot
  identify which of its competing SQL files was run. Independently
  compare actual staging schema and prior deployment records.
- **All expected schema relations exist**: still not proof of RLS,
  deployment, function code version, isolation, or production readiness.
- **No staging branch/project**: the workflow cannot provide live
  evidence. Reuse the earlier offline PostgreSQL acceptance results
  only for what they actually tested.

## Non-negotiable boundaries

No automatic production checks or writes, remote migrations, branch
creation, secret disclosure, \`db push\`, \`migration repair\`,
\`functions deploy\`, billing changes, webhook or scheduled execution.
After database access is restored, staging SQL reconciliation, three
missing Edge Function deployments and the two-account HTTP acceptance
remain independent, **separately approved** operations.

References for operator verification:
- https://supabase.com/docs/guides/database/psql
- https://supabase.com/docs/guides/platform/ssl-enforcement
- https://supabase.com/docs/guides/local-development/cli/migrating-to-v3
