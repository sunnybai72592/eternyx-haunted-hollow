# ETERNYX Services — Project scoping and private triage (Phase 3)

This milestone converts service enquiries into structured feasibility reviews
without inventing quotes, employees, delivery capacity, SLAs or payments.

## Bundled improvements

1. A richer intake brief: expected outcome, preferred timeframe, constraints,
   and explicit acknowledgment that requesting a security review DOES NOT
   authorize testing. Past requests remain readable with null structured fields.
2. A separate administrator-only triage table for priority, private review notes
   and verified administrator assignments. No secret internal notes are
   added to customer-readable service_requests.
3. Append-only, immutable scope-review publications describing proposed scope,
   potential deliverables, exclusions, assumptions and next steps. Each
   correction is a new record and remains visible as revision history.
4. Non-binding customer feedback on a specific scope review: interested in
   discussion, change requested, or not proceeding. This does not constitute
   contract acceptance, service authorization, invoicing or payment.
5. Guard against marking a request "Proposal shared" without at least one
   real published scope review. Client and admin surfaces surface verified
   database writes/errors rather than simulated success.
6. A recency fix for service activity: show the latest 200 events, rather than
   keeping only the oldest events and hiding the newest updates.
7. Explicit typed Supabase tables and regression contract coverage.

## Release gates before enabling the new feature

- Apply migrations in dependency order:
  1. 20261122201000_service_requests.sql
  2. 20261122213000_service_request_activity.sql
  3. 20261122223000_service_scope_triage.sql
- The remote Supabase database is NOT changed by merging this PR. A previous
  database connection attempt timed out; deployment must be independently
  verified before claiming the service is operational.
- Run npm test and npm run build, then test with user A, user B and a verified
  administrator on a staging environment. Ensure user A cannot read user B's
  scope reviews or submit feedback under user B's account.
- Verify customer SELECT on service_request_triage returns zero records,
  and owner INSERT/UPDATE attempts on triage and scopes are denied.
- Verify new admin review can be published, old revision persists, customer
  can add non-binding feedback, and none of those acts creates an order.
- Verify "proposal_sent" cannot be saved without a published scope review.
- Verify conflict detection for triage when two admins edit the same record.
- Review database and security advisors. Test keyboard/mobile layouts,
  fail-closed error states, and resumed sessions before release.

## Boundaries

This is a pre-commercial service desk. No pricing, paid order, accepted contract,
availability guarantee, SOW signature, attachment storage, automated AI
fulfillment, or billing flow exists in this PR.
