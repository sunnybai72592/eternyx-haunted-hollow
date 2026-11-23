# ETERNYX Services Phase 19 — Private Action Reliability

## Scope

Harden the existing owner and administrator Services workflows against
stale sessions, failed private request lookups, transient outages and
unverified local exports. **No new SQL migration in this phase.**

## Nine connected improvements

1. **Truthful private link errors.** An inaccessible request gets a
   privacy-preserving not-found/access-denied state. Database
   connection, missing view and timeout errors are separately
   described as unavailable.
2. **Bounded private UUID fetch.** Customer direct-request lookups use
   a 15-second abort signal; cleanup aborts outstanding requests on
   URL changes and account switches.
3. **Actionable retry.** Temporary database errors offer "Retry
   private request"; a genuine missing row or access denial does not
   imply that retry will grant permission.
4. **Late-response isolation.** In-flight private lookups cannot
   repopulate prior-customer data after the active account changes.
5. **Verified original private links.** Copy private request
   revalidates auth.getUser(), the current user, and whether the
   request ID is among the owner's loaded records.
6. **Verified original brief export.** The original request brief is
   downloaded only after fresh owner-account verification. A previous
   account's asynchronous response cannot download the private copy.
7. **Check-in cleanup.** Late customer/admin manual check-in promises
   cannot clear a different signed-in account's pending action.
8. **Verified administrator actions.** Admin request links and
   customer-visible status updates require fresh auth.getUser() and
   an is_admin() RPC check. Existing database RLS remains authoritative.
9. **Stale administrator save protection.** A status update cannot
   overwrite current-account queue or feedback after an account
   switch, and the existing updated_at optimistic conflict check is
   retained. New tests cover classifications and end-to-end contracts.

## Security and permissions

- Copied links do not grant access; they are navigation context.
- Client verification is defense in depth. Database RLS and server
  constraints still enforce actual permissions.
- Temporary database failure is not a valid empty result.
- Text and CSV exports remain local, explicit actions containing
  potentially private content that must be safeguarded.
- No read receipts, fabricated metrics, automatic notifications,
  contracts, payments, delivery promises or security testing
  permissions are introduced.

## Outstanding database rollout

The connected Supabase management project reports ACTIVE_HEALTHY,
but direct SQL and migration-list endpoints repeatedly return
"Connection terminated due to connection timeout". Therefore Phase
13 and Phase 14 migrations remain unverified and were not deployed by
the assistant. Passing CI is not equivalent to deployment.

The required order is **Phase 13 before Phase 14**.
Follow docs/ETERNYX_SERVICES_DATABASE_RECOVERY.md: inspect supported
migration history, apply only missing migrations in order (Phase 13
before Phase 14), and verify SQL grants, RLS, invoker views and real
request workflows. Never hand-edit migration history or disable RLS.

## Staging checklist — customer A, customer B, administrator

1. Customer A loads a real owned request UUID and Phase 18 direct
   section link. No unrelated customer data is available.
2. Customer B opens A's link and gets an indistinguishable
   not-found/access-denied state, without A's private title or brief.
3. Simulate a missing Phase 13 view, network failure and timeout.
   Each yields a truthful error; transient failures offer retry.
4. Switch accounts during a 15-second lookup: the old customer
   response must never populate the new session.
5. Switch during Copy private link, Export my brief and manual
   check-in. Previous-account copies, notices and busy states
   must never appear under the new account.
6. Verify legitimate customer A link copying, brief export, status,
   scope, clarification, amendment, journal and queue actions.
7. A verified administrator can copy a private admin link and
   publish a real customer-visible status update only after
   auth.getUser and is_admin validation.
8. Revoke admin role or simulate unavailable role RPC: neither
   copy nor update may proceed, and no false saved claim appears.
9. Switch admin accounts during an update; prior responses must
   not update the current list, feedback or pending UI state.
10. Confirm optimistic updated_at conflict handling, full GitHub
    CI, mobile/desktop browser journeys and signed-in E2E checks.

**No new migration and no production E2E readiness claim** until
the real database is reachable and verified.
