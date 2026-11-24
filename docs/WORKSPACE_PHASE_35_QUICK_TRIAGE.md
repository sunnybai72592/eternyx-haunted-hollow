# Workspace Phase 35 — Quick ownership and priority triage

## Real collaboration improvements

1. Every authenticated editor can **Claim** an unassigned shared task
   (assign it to themselves) using the existing team task RPC.
2. An editor can **Release** their own assigned task to the shared pool.
   The quick button does not overwrite a teammate's assignment; full
   Edit remains the explicit option for authorized reassignment.
3. Inline **Priority** choices update urgency without opening the
   full editor or changing other fields.
4. A **priority filter** combines with the existing status, due-date,
   search and sort controls for both List and Board layouts.
5. An **assignee filter** supports All / Mine / Unassigned / one
   currently verified team member; teammate names remain pseudonymous.
6. **Member-revocation resilient:** stale member filter selections
   fall back to All after a refreshed membership snapshot.
7. Every quick edit uses a single validated field patch, and
   preserves the whole record with the server's exact optimistic
   concurrency timestamp. It is never a direct table mutation.
8. Clear a matching open edit draft only after the server RPC
   and authorized membership refresh succeed.
9. Reset quick view filter preferences on account/team switches.

## Verification

Ten Node test groups cover claim/release, priority patches,
record integrity, malformed fields, stale revisions,
filter compositions, changed membership, source wiring
and the no-optimistic-write rule. The normal npm test,
build and desktop/mobile Chrome jobs must pass.

No new backend permissions, production SQL migrations, remote writes
or external API calls. The existing RLS and team save_task RPC must
be deployed and verified in staging with real owner/editor/viewer/
outsider accounts before production.
