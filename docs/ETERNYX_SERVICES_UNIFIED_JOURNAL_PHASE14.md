# ETERNYX Services — Phase 14: Unified Request Activity Journal

## Purpose

Service requests already have real messages, scope reviews and feedback,
clarification questions and answers, and immutable brief amendments.
Customers and admins should not need to open four different workspaces
to reconstruct the chronology.

Phase 14 adds a **read-only, security-invoker journal** that combines
existing, RLS-protected participant-visible records. It does not create
duplicate stored events or invent activity.

## Eight connected improvements

1. A read-only, owner/admin-scoped journal view over actual customer-visible
   request activity (request creation, messages and customer updates).
2. Real scope memo publication and nonbinding customer response events.
3. Clarification creation, owner answers and administrator closure events,
   separately timestamped using the original durable source rows.
4. Customer brief amendments and administrator review acknowledgements;
   original project brief and immutable source rows are untouched.
5. A responsive request activity journal with a category selector, actual
   actor type, timestamps and properly wrapped full event details.
6. Server-side category filters with 30-event initial loading, exact
   counts, stable date-and-key cursor pagination and deduplication.
7. An explicit private plain-text export of the **loaded events only**,
   with a clear warning that recipients must safeguard the file.
8. Customer and admin request-card integration, customer private-link
   integration, account-switch state isolation, typed schema and
   regression/security tests.

## Database/privacy policy

Migration: supabase/migrations/20261123050000_service_request_journal.sql

The underlying tables all maintain their own RLS and authenticated
SELECT privileges. The journal view is SECURITY INVOKER and additionally
requires an owner or verified administrator relationship to the request.
Anonymous SELECT is denied. Client INSERT, UPDATE and DELETE are not
granted on the journal. It does NOT read internal service_request_triage,
service_triage_history, admin audit notes, priority/assignment metadata
or private reviewer comments. It does not create read receipts.

Activity-journal events are nonbinding; a scope memo or brief review
is not proof of a contract, delivery, purchase or payment.

## Deployment status

**This Phase 14 migration is not deployed as part of the PR.** Its
prerequisite, Phase 13 service_brief_amendments, was reported merged,
but on starting this phase the Supabase database connection timed out
during read-only migration listing and SQL connectivity checks.
The assistant could not verify or deploy Phase 13 from that state.
Do NOT claim it deployed or attempt dependent Phase 14 deployment until
the database connection is restored and the migrations are confirmed
in official migration history.

Management-applied migration versions can differ from repository
filenames. Use the supported Supabase migration workflow and reconcile
any CLI state through official migration-repair procedures; don't
hand-edit the migration history.

## Required staging walkthrough — real customer A, customer B and administrator

- With signed-in customer A, a request produces a chronological journal
  only from A's authorized service records; customer A cannot retrieve
  customer B's events through URL or direct view querying.
- An unrelated customer B receives no rows for A's UUID. Anonymous
  access to journal read endpoints is blocked.
- An admin sees exactly the same customer-visible journal plus their
  authorized status events, but no internal triage history or private notes.
- Publish an actual scope memo, submit a nonbinding response, ask and
  answer clarification questions, close one, submit a customer amendment
  and review it. Each action produces correctly dated journal entries
  without fake completion or automated receipts.
- Test multiple events at the same timestamp and new events inserted
  during older-page loading. Cursor results must not skip/duplicate
  older events; repeat refresh with account switches and stream filters.
- Check owner direct-link journal, keyboard category selection, mobile
  and desktop layouts, long messages, 30+ event histories, and private
  text export (loaded page only).
- Confirm legacy Services admin, triage, status, messaging, scope,
  clarification, amendment and check-in functionality still passes CI.

**No automated notification, no payments, no SLAs, not read receipts,
no signed contract and no security-testing authorization.**
