# Workspace Phase 30 — Correct refresh snapshots, membership status, and invitation reveal

## Defects addressed

1. An ordinary team refresh previously loaded current server team rows, but then
   fetched details against `spaces` captured by an earlier React render. On
   team archival, stale `status=active` could incorrectly preserve an editor's
   unfinished local draft. Now `loadSpaces` returns a single `{chosen,rows}`
   snapshot and the same **fresh rows** are used by `loadDetails`.
2. Unknown server team statuses and malformed team identities now fail closed,
   rather than being interpreted as writable data.
3. When creating a team or accepting a one-time invite, the explicitly returned
   team ID must appear in the new server snapshot. A missing target fails with
   an error instead of silently falling back to an unrelated old team.
4. Create and join no longer trigger two competing refreshes. The selected
   team's own detail effect completes after a fresh selection.
5. A newly generated invitation's one-time code remains visible. Previously,
   the general mutation wrapper immediately invoked `refresh()`, which erased
   the secret before the owner could copy it. This operation skips that refresh
   and never logs the token. Leaving the team or revalidation still hides it.
6. Ordinary post-mutation success notifications now appear **after** a
   successful membership refresh. A failed server recheck cannot claim the UI
   was reconciled when it was not.

## Regression tests

`tests/workspace-team-fresh-snapshot.test.mjs` covers fresh versus stale
archive status, newly created team target absence, malformed team states,
retained/revoked task drafts, success ordering, invitation token visibility,
and exact component wiring. The usual full test/build/browser CI remains required.

## Scope of security claims

No SQL migrations or production writes. Backend RLS and scoped RPCs remain
the **actual** authorization boundary; UI revalidation is defense in depth.
The Phase 29 operator-only database metadata audit is still not a live
four-account staging acceptance or permission certification.

For real release verification, an authorized operator must separately stage
the new migrations, validate role-based reads/writes, revoke members while
other sessions are active, verify Storage and Realtime, and retain evidence.
