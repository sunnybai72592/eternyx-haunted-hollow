# ETERNYX Services Phase 4 — Operational readiness

This PR continues the verified Services request workflow without activating
checkout, contracts, priced orders, availability promises or unverified delivery.

## Improvements in one change set

1. **Real database pagination in admin queue:** status/title/email/UUID filters are
   processed by Supabase, 20 records per page, with an exact matching count and
   deterministic created_at/id sorting. No 250-row client-side ceiling.
2. **Customer request pagination and search:** each request query remains owner
   restricted; status and title filtering are server-side.
3. **Private deep links:** customers can copy a URL containing their request UUID.
   Authorization is still enforced by Supabase RLS; knowing a UUID never grants
   access. A separate owner-scoped lookup opens the request even if it is
   outside the current page or filter, with no leak when access is denied.
4. **Local record export:** users can explicitly export the persisted brief,
   objectives and latest status as a text file on their own device. The app does
   not upload or email the export. These files may contain confidential data,
   so users should store them securely.
5. **Complete activity history:** the conversation starts with the newest 50
   events and can request previous pages; duplicate IDs are deduplicated.
   There is no fake "latest 200" hard stop.
6. **Production truth gate:** a new database trigger blocks status transitions
   to in_progress/completed in the review-only service desk. A published scope
   memo and customer expression of interest are not a delivery contract.
   The browser disables these status options as an additional UX safeguard.
7. **Regression tests** for each boundary and the existing scope/triage flow.

## Deployment & acceptance

Apply the migration chain in order, using the reviewed deployment workflow:

- 20261122201000_service_requests.sql
- 20261122213000_service_request_activity.sql
- 20261122223000_service_scope_triage.sql
- 20261122234000_services_delivery_gate.sql

Prior database inspection timed out, so production deployment is NOT assumed.
Check migration history and RLS with separate customer A, customer B and a
verified administrator. Verify a customer cannot see another's request by
supplying a known UUID; request filtering/pagination must not bypass RLS.
Verify status transitions to in_progress and completed fail even when an
admin calls the REST API directly. Legacy rows in those statuses must remain
readable, but the review desk cannot newly enter those stages.

Run npm test, npm run build and all required CI browser acceptance checks. Test
20+ records, filtered totals, navigation, export and conversation pages. Remote
database and end-to-end security tests must be run separately in staging.

## Boundaries

No paid project or real-service activation is claimed. The future fulfillment
module must verify an independently approved agreement, the project authority
and acceptance of delivery terms before the database delivery gate is relaxed.
