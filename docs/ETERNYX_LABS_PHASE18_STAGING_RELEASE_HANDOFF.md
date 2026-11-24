# LABS Phase 18 — staging REST acceptance and release handoff

Phase 17 has passed its networkless six-migration PostgreSQL replay. On
2026-11-24, a separate read-only Supabase management/catalog audit observed
the healthy isolated Eternyx Staging project with zero CTF tables, zero
Edge Functions, zero Auth users and three unrelated migration-history
records. This is a dated observation, not a fresh release assertion.

## Deployment handoff (operator approval required)

Use the exact isolated project already approved for Eternyx Staging, never
the production project. Preserve all existing migration history and schema.
Re-read history/catalogs immediately before any change. Do not run a full
repository db push, reset, repair, or broad migration replay against staging:
other pillars have independent releases and historical version conflicts.

1. Pin a reviewed commit on main and generate its exact six-migration source
   inventory with node scripts/labs-bootstrap-manifest.mjs. Confirm the
   corresponding composed PostgreSQL rehearsal succeeded on that commit.
2. Independently compare the six source versions and hashes with actual
   staging history and schema; reconcile any discrepancies before proceeding.
   A source hash does not prove hosted execution or migration content.
3. Obtain explicit approval for a narrow, ordered application of ONLY the
   six reviewed LABS migrations; record actual applied migration versions.
   Preserve unrelated tables, policies, migration rows, and default-off
   provider and spend settings.
4. Configure a securely generated CTF_FLAG_SECRET (at least 32 bytes) in
   the isolated project; never log or commit it. Deploy the verified CTF
   and range-control read endpoints with configured JWT verification.
   Deploy other LABS endpoints only after independent authorization and
   keep worker/ingress disabled. Verify actual inventory and JWT settings.
5. Create two dedicated staging test accounts using secure Auth tooling.
   Use their valid short-lived access tokens and staging public key in
   the protected GitHub environment; never provide production credentials.
   Use only pre-existing, approved synthetic solved/session fixtures if
   testing positive cross-account ownership. Do not enable providers to
   obtain them. A separate reviewed fixture operation is needed if absent.
6. Dispatch LABS isolated staging read-only acceptance on main. The
   workflow checks configuration before network access. Secrets are scoped
   to the manual run step, and checkout authorization is removed before
   tests. No write, reservation, CTF submission, or paid compute is run.

## New acceptance behavior

Both accounts must be able to select the eight approved range fields.
Each account must receive SQLSTATE 42501 from PostgREST when selecting
four internal fields, filtering on those fields, or wildcard selecting.
Anonymous projection must be denied. The provider must report disabled
capacity, launch budget and hosted access. Edge and REST responses must
not contain extra session fields. If an account has a session from the
Edge response, its ID must resolve through an exact safe REST projection.
Two distinct existing session fixtures are required for a bidirectional
cross-owner denial result; otherwise report NOT TESTED. No session IDs,
private fields, JWTs, raw responses or account IDs appear in the report.

These probes validate actual endpoint behavior only when run against real
staging. The fixture checks correlate existing Edge and REST results and
do not independently provision or attest the owner of fixture records.
A passing report never authorizes production, hosted ingress, or paid
provider execution. Offline tests use injected transport only.
