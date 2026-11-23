# ETERNYX Services — Phase 17: Safe queue handoff and worklist exports

## Purpose

The customer and administrator Services desks have real request counts,
filters and unified journal. Phase 17 makes focused queues easier to
share and loaded worklists safer to export without disclosing hidden
search terms or inventing an entire database report.

**Phase 17 introduces no new SQL migration.**

## Eight connected improvements

1. **Allowlisted, private focus links:** share a task category only
   (all, activity, answers, brief reviews, admin follow-up, admin
   clarifications or unassigned). No account ID, contact email, request
   UUID, search text, token or request title enters the copied link.
2. **Customer restoration:** the queue URL parameter restores the
   correct server-side owner filters for activity since check-in,
   unanswered questions or pending amendment review.
3. **Administrator restoration:** approved queue categories activate
   the appropriate server-side worklist filters without bypassing
   the administrator role check.
4. **Private request deep-link precedence:** a direct request UUID
   continues to use the dedicated private request workflow. Unknown
   or repeated queue parameters are ignored.
5. **Customer loaded-row CSV:** explicit download of only the currently
   loaded, owner-scoped request list, with title, service, status, UTC
   timestamps and real clarification/amendment pending counts.
6. **Administrator loaded-worklist CSV:** rechecks administrator rights
   before export. Includes operational metadata such as priority,
   assignment state, UTC next-review target and pending counts but
   excludes customer emails, descriptions, full briefs and private
   triage notes.
7. **Spreadsheet-formula protection:** quotes and escapes every CSV
   cell, neutralizing leading equals, plus, minus and at-sign triggers
   even after whitespace. Clipboard links use only the app's origin
   and an allowlisted route.
8. **Deterministic navigation and regression tests:** account/session
   guards, disabled link controls for unsupported filter combinations,
   no external telemetry or localStorage persistence, and dynamic
   tests of URL parsing and CSV safety.

## Behavior and intentional limitations

- Copy focus link is disabled for complex combinations of manual
  filters or free-text searches, rather than promising a different
  or incomplete view. Select a single Action Center focus first.
- A copied URL cannot grant access. Customer ownership and verified
  administrator access remain enforced by Supabase authorization.
- CSV contains **only the currently loaded request page**. It does
  not claim to export all matching requests or fetch additional data.
- CSV export is an explicit local user action. No file is uploaded,
  no email is sent and no extra database read is required.
- Original request content and all service workflow records remain
  unchanged. These are queue shortcuts, not read receipts.

## Outstanding deployment blocker

The connected Supabase project is reported healthy through its
management endpoint, but migration history continues to return a
**connection timeout**. Phase 13 and Phase 14 migrations remain
unverified and were not deployed by the assistant.

Before activating these dependent UI features, recover and verify the
database using docs/ETERNYX_SERVICES_DATABASE_RECOVERY.md.

Apply only missing reviewed migrations in order:
1. Phase 13: 20261123040000_service_brief_amendments.sql
2. Phase 14: 20261123050000_service_request_journal.sql

Do not weaken RLS or manually edit migration history.

## Staging checklist — customer A, customer B, administrator

- Customer A copies a queue focus link. Opening it restores only the
  allowlisted task filter, not search terms or a request reference.
  Customer B using the same URL sees only B's own service records.
- Unknown values, duplicate parameters and combined request+queue URLs
  do not leak records or expand access.
- Admin queue links never bypass role verification. Customer A and
  customer B cannot read administrator records.
- Unsupported combined filters disable Copy focus link.
- Export a request title beginning equals, plus, minus or at-sign;
  verify exported CSV opens as plain text instead of interpreting
  a spreadsheet-formula payload.
- Admin CSV must not include raw customer contacts, emails, full briefs,
  private notes or unnecessary identity details. Export loaded rows only.
- Switch from customer A to B during an export permission check; the
  old-account export must not be performed.
- Check pagination, mobile/desktop, keyboard controls, browser navigation
  and repository CI. Verify Phase 13/14 database readiness separately.

No payments, automated fulfillment, security testing authority,
service agreements, SLAs or notifications; **not read receipts**.
