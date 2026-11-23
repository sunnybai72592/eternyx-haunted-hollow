# Workspace Phase 26 — React access revalidation and tab-resume quarantine

This is a **client-side defense-in-depth** release-quality improvement. Real
authorization remains entirely on Supabase RLS and scoped, authenticated RPCs.
The browser is never an authorization boundary.

## Previously observed problem

A removed team editor's already-loaded browser can keep showing local
`workspace_team_spaces`, tasks and discussion data until a regular refresh.
Switching tabs or owner accounts can also cause older concurrent requests to
repopulate a newly selected team if their responses arrive out of order.

## Phase 26 behavior

- Every team detail response is checked for exact team ID on every row,
  a **current** membership row for the signed-in account, valid role, and
  owner/role consistency before committing to UI.
- Invalid, missing, or inaccessible membership clears team members, tasks,
  events, invitation tokens, discussion target, and task editor drafts.
  The selected team is removed from the session's list if necessary.
- A team selection is always made from the latest server-visible list;
  revoked teams cannot survive as stale local selected IDs.
- A detail panel is displayed only for a **verified owner + team selection**
  and is immediately hidden on team switching or browser tab hiding.
- Tab visibility, returning browser focus, and one-minute foreground checks
  schedule real session and membership revalidation. Cached details are
  quarantined during the recheck. No Realtime delivery is counted from a
  mere subscriber's `SUBSCRIBED` status.
- Each refresh increments a request generation, preventing outdated
  earlier responses from committing after account/selection changes.
- Temporary network failures do **not** prove revocation; they fail closed
  and hide data while allowing manual Retry/Refresh.
- Deterministic pure function tests cover stale team selection, lost access,
  row-scope mismatches, owner/role discrepancies, and UI wiring.

## Staging acceptance

Use **two separate staging accounts** with a disposable test team (owner,
editor), open a browser tab as the editor, remove editor access as owner,
switch the editor tab away/back, and verify that sensitive data disappears
and no stale task can be edited. Also test Realtime reconnect, rapid space
switches, and an offline-to-online recovery. Do not use real customer data.
A passing source/unit test **does not certify real staging behavior**.

This phase introduces **no SQL migrations, backend changes, new API keys,
remote write probes, production operations, or user data migrations**.
The Phase 25 staging revocation runner must still be run independently,
and deployment/migration history verified before production rollout.
