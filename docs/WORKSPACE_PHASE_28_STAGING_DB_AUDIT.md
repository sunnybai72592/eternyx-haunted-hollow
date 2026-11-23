# Workspace Phase 28 — Approved isolated-staging migration and RLS audit

Workspace source inventory and local PostgreSQL CI are not evidence that the
hosted Supabase schema was deployed. This phase supplies an **operator-only,
read-only, metadata-only audit** for a separate staging database.

## Required evidence

The audit checks the 14 expected Workspace migration ledger version numbers,
the presence of 17 team RPC function names, and 15 Workspace tables whose
RLS must be enabled and whose direct `anon` SELECT grants must be absent.
Missing evidence produces a nonzero exit status. Even with a clean audit
the result is `manual_review_required`, never production certification.

An applied migration *version* does NOT prove that the intended SQL body was
executed. Table RLS enabled does not prove its policies work for real accounts;
function presence does not prove safe RPC permissions. This audit neither
reads any customer table rows nor inspects function source definitions.

## Explicit operator setup

Provision a **separate, disposable, nonproduction Supabase project**. Never
use the ETERNYX production project. On a trusted operator workstation install
Node/npm dependencies, `psql`, and the pinned staging database CA certificate.

Set these variables from a trusted private secret manager or shell session,
never in GitHub files or CI:

- `WORKSPACE_AUDIT_CONFIRM=I_APPROVE_READ_ONLY_WORKSPACE_STAGING`
- `WORKSPACE_AUDIT_REF`: staging project reference (20 lowercase letters)
- `WORKSPACE_AUDIT_PGHOST`: exact `db.<staging-ref>.supabase.co`
  or approved Supabase session pooler endpoint
- `WORKSPACE_AUDIT_PGUSER`: `postgres` (direct) or
  `postgres.<staging-ref>` (session pooler)
- `WORKSPACE_AUDIT_PGPORT=5432` and `WORKSPACE_AUDIT_PGDATABASE=postgres`
- `WORKSPACE_AUDIT_PGPASSWORD`: private staging credential
- `WORKSPACE_AUDIT_CA_PEM`: trusted CA PEM for TLS `verify-full`

First run `npm run workspace:staging:db:config` (offline target metadata
check only). When separately authorized to connect to the staging database,
run `npm run workspace:staging:db:audit` to execute the fixed SELECT-only SQL.

The runner locks the exact staging host, checks the known production ref,
rejects inherited libpq host overrides, enforces pinned TLS verification,
and places the entire SQL in a READ ONLY transaction with bounded timeouts.
Passwords, CA contents, raw stderr and connection strings are not printed.

## Still required for release

Run Phases 21–25 owner/editor/viewer/outsider staging acceptance, real
revocation and Realtime delivery, actual private Storage byte checks,
migration SQL-body review, application deployment validation, and operator
signoff. No migration or production write occurs automatically.

At PR creation, the connected account exposed only the ETERNYX production
Supabase project; production database inventory timed out in earlier checks.
**No isolated staging database was connected, and no live audit was run.**
