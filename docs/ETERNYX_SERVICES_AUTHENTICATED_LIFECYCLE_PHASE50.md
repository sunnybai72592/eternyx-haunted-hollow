# Services Phase 50 — authenticated review lifecycle and remaining fulfillment gate

## Current live evidence

Phase48 hardening and restricted NOLOGIN auditor deployment succeeded on Eternyx Staging; the public helper is an invoker, all 37 recorded dependencies and 64 Services catalog checks were preserved, all ten new hardening facts passed, and all 16 recorded SQL blobs matched the reviewed files. The latest read-only staging inventory shows two Auth users, zero trusted admin assignments, zero Services requests and auditor login disabled. Those existing Auth identities are not assumed to be Services fixtures. Do not grant administrator access to any existing identity without independently verified explicit approval.

## Real review lifecycle

After merge and passing CI, configure the protected services-staging environment with three dedicated and independently approved identities and their credentials (existing Phase20 email/password secrets, plus SERVICES_LIFECYCLE_CUSTOMER_A_ID, SERVICES_LIFECYCLE_CUSTOMER_B_ID and SERVICES_LIFECYCLE_ADMIN_ID variables); use the modern staging publishable key, never a service-role key. Confirm each dedicated identity's actual purpose; unrelated accounts may coexist. The authorized admin assignment requires separate approval. No credentials in chat or repository.

Dispatch **Services authenticated synthetic review lifecycle** from main with WRITE_SYNTHETIC_SERVICES_STAGING_LIFECYCLE only after explicit permission to create synthetic requests and retain their evidence. It verifies registered staging identity, checks the signed-in actor IDs with Auth, verifies all four role predicates, creates two fresh requests via the user Data API, checks cross-owner/anonymous access and unauthorized writes, exercises review, discussion, clarification, nonbinding scope, amendment and acknowledgement, verifies persisted journal lineage, and concludes the synthetic review as declined. It verifies that customer B remains unchanged and closes local Auth sessions. No real contract, paid work, customer charge or delivery is represented. Failures retain partial synthetic records; do not blindly rerun or delete records. CI independently exercises the migrated PG17 SQL roles inside a networkless container with rollback; it does not prove real JWT or HTTP acceptance.

## Critical delivery boundary

The existing deployed delivery guard deliberately rejects in_progress and completed for every actor, even a trusted administrator. The workflow requires actual denial of both transitions; it cannot honestly certify delivery. The next feature must introduce immutable versioned quotation/agreements, explicit owner acceptance, scoped admin fulfillment authorization, deliverable evidence and verified completion, with idempotent transitions and independent payment reconciliation if paid services are later approved. Retain the existing delivery guard until an independently reviewed replacement is proven. Do not connect payments or trigger a real charge during staging.

The restricted auditor must still receive a separately approved LOGIN activation and securely configured password, with actual TLS connection and privilege verification. Production compatibility, recovery, and release approval remain open. No live database writes or account changes are made by this PR.
