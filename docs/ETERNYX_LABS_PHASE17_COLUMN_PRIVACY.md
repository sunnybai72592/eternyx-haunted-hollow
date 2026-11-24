# LABS Phase 17: session column privacy

The previous composed SQL replay found that the owner-only row policy did not
restrict columns: signed-in users could read internal worker and provider fields
of their own sessions via direct database access. This forward migration removes
table and explicit column grants from browser roles and restores SELECT on
exactly the eight fields already returned by the control Edge Function.

Existing owner RLS, records, privileged RPCs and service-role grants remain
unchanged. Direct wildcard selects and filters on private fields are intentionally
denied. The application already queries the Edge Function, not the table.

The composed rehearsal now installs six migrations; its final catalog gate
fails if any unauthorized column is readable. Actual role-switched synthetic
SQL tests exercise both owners, anonymous denial, hidden fields and filters,
wildcards, mutations and service-role access. All fixture writes roll back.

This is a source change and disposable database test, not proof of live
Supabase deployment or PostgREST behavior. Phase 15 staging acceptance,
a real two-owner REST projection/denial check, migration reconciliation,
test accounts, flag secret and deployment remain required. No paid provider
or worker is enabled. The original migrations remain unchanged.
