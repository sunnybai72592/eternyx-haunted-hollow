# ETERNYX Services — Phase 18: Request workspace handoffs

## Purpose

Allow signed-in customers and verified administrators to open or share the
**specific section** of an existing private service request. The
recipient must still authenticate and pass existing Supabase RLS and
administrator permissions. An HTTPS link is a navigation convenience,
**not a secret access token**.

Phase 18 adds **no new SQL migration**.

## Eight integrated improvements

1. **Typed, allowlisted section links** for conversation, scope review,
   clarification questions, brief amendments and unified activity journal.
   Only administrator mode can link to internal triage.
2. **Verified section sharing**: each customer action checks the current
   account against the request owner; admin actions check auth.getUser()
   and the live is_admin() RPC before copying or opening a section.
3. **Correct customer restoration**: private request deep links focus
   the selected section, whether the request is on the current list page
   or must be fetched separately. Existing plain request URLs still
   display the full request workspace.
4. **Focused section rendering**: customer section links do not trigger
   every expensive workspace query at once. The selected panel loads,
   the original request stays available, and the duplicate request card
   is hidden in focused view.
5. **Correct administrator restoration**: after role verification, the
   existing server-filtered search locates the requested UUID and opens
   exactly the chosen admin workspace, including internal triage when
   permitted. A genuine nonadmin receives no private admin content.
6. **Browser navigation and session hygiene**: URL changes and reloads
   restore the panel; switching accounts resets old panel state.
   Stale asynchronous copy/open attempts do not perform actions under
   a different account.
7. **Accessible reusable controls**: labeled section picker plus
   Open section and Copy section link buttons. Feedback describes what
   was copied and explicitly states that recipients still need
   authorized access.
8. **Security and integration regression tests**: validate UUID syntax,
   duplicate or malformed parameters, role-specific panels, no query
   or fragment carry-over, no private email/brief text in links,
   customer/admin page integration, and old route compatibility.

## The URL contract

Examples (illustrative request ID only):

- Customer conversation:
  /services/requests?request=123e4567-e89b-42d3-a456-426614174001&panel=conversation
- Customer amendment history:
  /services/requests?request=123e4567-e89b-42d3-a456-426614174001&panel=brief-changes
- Admin internal triage:
  /admin/service-requests?request=123e4567-e89b-42d3-a456-426614174001&panel=triage

Allowlisted panels are conversation, scope, clarifications,
brief-changes, journal, and admin-only triage. Request UUIDs and
panel values must match the expected pattern; duplicate parameters,
queue/panel combinations, unknown values and cross-role triage links
cannot select a workspace.

Do not treat request IDs as capabilities. Existing request-owner RLS
and administrator verification must block unrelated accounts.

## Database rollout dependency

Supabase migration listing continues to fail with a
**connection timeout**, although its management API reports the
project healthy. Phase 13 amendment and Phase 14 journal migrations
remain unverified and were not deployed by this assistant.

The new section links do not repair this outage and do not create
fake data. Review docs/ETERNYX_SERVICES_DATABASE_RECOVERY.md, verify
migration history, then deploy only missing reviewed migrations:
Phase 13 before Phase 14.

## Staging plan — real customer A, customer B and administrator

- Customer A copies a conversation and a brief-change section link.
  Both reopen the right panel; a plain old request link still loads
  the full workspace. Browser Back and Forward restore the panel.
- A request outside the first page is fetched from the secured
  customer queue. If already on the current list page, the focused
  workspace appears once rather than duplicating the card.
- Customer B cannot read A's request via A's link, whether using
  the URL or querying the PostgREST view directly.
- A nonadmin cannot access admin triage or obtain an admin-only
  section link; a verified administrator can reopen all supported
  sections, including triage, after a role check.
- Verify unrecognized, duplicate and injected URL parameters are
  rejected without widening privileges.
- Switch accounts during an in-flight auth/role verification and
  confirm no previous-account URL is copied or opened.
- Confirm existing status, conversation, scope, clarification,
  amendment, journal, check-in, workload sorting, Phase 17
  queue focus links and loaded-only CSV exports still work.
- Verify desktop/mobile layout, keyboard navigation, browser CI
  and relevant signed-in real-account end-to-end tests.

No contracts, payments, delivery promises, read receipts, automatic
notifications, security-testing permissions or new database writes
are introduced.
