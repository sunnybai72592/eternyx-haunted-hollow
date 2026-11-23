# Workspace Phase 27 — Safe draft recovery and queued tab revalidation

## Problems fixed

Previously, a routine background/foreground recheck or once-per-minute
foreground refresh destroyed unfinished team task drafts even when the editor
still had valid access. If tab focus returned while a previous request was
still pending, the second recheck could be dropped, leaving the panel masked
until another poll.

## What changed

1. Revalidation masks team names, shared rows and editing controls while
   preserving the unsaved draft in memory. A successful fresh Auth/team
   membership/row-scope/role verification may restore it.
2. Drafts are cleared when current membership is revoked, downgraded to
   viewer, the team is archived, or the edited task is no longer present.
   The old server data never becomes an authorization source.
3. A pending focus/visibility signal is queued if another request is in
   flight and is replayed once that request settles.
4. Supabase sign-out and real cross-account auth events immediately
   quarantine cached teams, drafts and invitation data. The subscription
   unsubscribes on component cleanup; same-user token refresh does not
   trigger the destructive path.
5. Offline tests cover preservation vs. revocation, auth switch, archived
   teams, task deletion, queued tab resume, and critical component wiring.

## Manual staged browser acceptance

- With two disposable staging accounts, owner and editor, open an existing
  active team task as editor and start an unsaved edit.
- Switch tabs, return, and confirm that the team is masked while the live
  server membership is checked; once verified, the draft must reappear.
- Remove the editor using the owner session while its tab is hidden. Return
  to that tab and verify the team, tasks and draft remain inaccessible.
- Repeat with editor-to-viewer downgrade, archived team, and a deleted
  task. In each case, no stale editing controls or draft may survive.
- Deliberately delay a network request and switch tabs twice; verify
  the newer focus event is rechecked without waiting for a minute-long poll.
- Sign out or switch accounts in another tab and ensure immediate UI
  quarantine. Confirm Supabase RLS denies the revoked account's direct APIs.

These are **manual staging criteria**, not claimed executed tests. Production
authorization still depends on real Supabase RLS and scoped authenticated
RPCs. Browser masking is defense in depth.

## Release limits

No migration, production data mutation, new secret, or paid API is added.
During preparation, the connected ETERNYX project reported healthy, but
read-only SQL and migration inventory both timed out. Hosted migration
status and Phase 25 real-account staging acceptance remain unverified.
