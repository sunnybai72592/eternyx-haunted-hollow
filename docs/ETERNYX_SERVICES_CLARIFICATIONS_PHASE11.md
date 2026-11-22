# ETERNYX Services — Phase 11: Clarification Workspace

## Verified starting point

The Phase 10 check-in migration was applied after PR #439 was reported
merged. Read-only catalog checks verified the check-in table has RLS,
anonymous SELECT/EXECUTE is denied, authenticated DELETE is denied, two
personal check-in views use SECURITY INVOKER, and the server-clock trigger
is enabled. An authenticated database role without a user session returned
zero rows from the admin queue. Real multi-account end-to-end verification
is still required.

## Eight connected improvements in Phase 11

1. Admin-authored clarification questions, bounded 15–1500 characters,
   attached to an actual customer-owned service request.
2. Exactly one saved customer answer per question, bounded 10–2500
   characters and immutable after submission. If more details are needed,
   administrators ask a new question or use the existing conversation.
3. Administrator-only closure of open questions, with database-enforced
   server timestamp and the actual administrator's identity. No reopening.
   Closure is not acceptance or verification of an answer.
4. Row-level security on both tables: questions visible only to the owner
   and verified admins, inserts admin-only, owner-only answer submissions,
   with no client DELETE or answer UPDATE.
5. Dedicated customer/admin queue views extending the existing secure
   check-in views. Real per-request counts distinguish unanswered open
   questions from answered questions awaiting administrator review.
6. Customer request page: outstanding-questions badge, server-side
   awaiting-my-answer filter, expandable clarification workspace, and
   private deep-link clarification access.
7. Administrator request desk: server-side filters for awaiting customer,
   awaiting administrator review and all open questions; summary badges,
   expandable Q&A and manual Close button.
8. Authenticated UI operations, session-bound data/drafts, status feedback,
   bounded Load older questions, regression tests, and rollout instructions.

## Deployment requirements

Migration: supabase/migrations/20261123023000_service_clarifications.sql

**This Phase 11 migration is not deployed when the PR is opened.** The
reviewed SQL must be deployed through the approved Supabase migration
process after merge. The historical Supabase management migration versions
may not match repository filenames; reconcile using official migration
repair before running any future CLI db push.

The new schema does not create agreements, contracts, refunds, payment
obligations, customer support SLAs or automatic security-testing permission.

## Staging verification — real customer A, customer B and administrator

- Customer A sees only clarification questions on their own request; they
  cannot see or answer customer B's questions.
- Anonymous reads/inserts/updates fail and anonymous API user cannot write
  questions or answers.
- Administrator creates a 15–1500-character question with a real account.
  Customer A sees it, can submit one immutable answer and cannot answer twice.
  Customer B cannot respond to it.
- Administrator can close an open item; closed_at and closed_by are from
  the database actor and clock. The client cannot reopen, forge closer
  metadata, edit a question, or change an answer.
- Customer's awaiting-answer count decreases after submission, while the
  administrator-review count increases. Closure removes it from open counts.
- Older-than-20 question history loads without replacing current drafts.
- Change accounts and request links in the same browser: no previous
  user's questions, answers or drafts remain visible.
- Test all old check-in/triage/admin queue controls, mobile/desktop browser,
  keyboard use and full repository CI.

## Product semantics

The service desk handles early discovery, clarification and scoped
discussions. Clarification closure does not mean customer acceptance,
delivery completed, payment accepted or a contract approved.
