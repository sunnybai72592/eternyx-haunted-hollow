# Workspace Phase 31 — Complete team pages and owner-fenced action results

Team member/task lists previously used hard limits without exact server counts.
A truncated page could be accepted as a full team snapshot. Mutation buttons
also relied only on asynchronous React busy state; old RPC results could
publish success, clear editing drafts or reveal invitation codes after an
account switch.

## Improvements

1. Fetch exact counts for member and task pages; reject mismatched totals,
   missing/null counts, exceeded limits, invalid IDs and duplicate identities.
2. Treat malformed team pages as untrusted, not as a confirmed empty roster.
3. Use a synchronous action lock to prevent rapid duplicate RPC submissions.
4. Fence each action by an owner and generation; signing out or switching
   accounts invalidates old pending operations and resets the busy flag.
5. Revalidate the current account after an RPC returns and before changing
   any sensitive local state or showing success.
6. Reveal one-time invitation tokens only in the verified-current confirmation
   callback; clear created/joined input and saved task drafts only after success.
7. Delay deletion/discussion UI state and invite revocation UI updates until
   confirmed reconciliation, and reject superseded refreshes as successful.
8. Avoid a false membership-revoked warning when no team was selected.

All tests are offline. No new migration, hosted SQL, or production writes.
Real Supabase RLS and scoped RPCs remain the authorization boundary.
An isolated staging environment with four authenticated accounts, Storage
and Realtime acceptance is still required before any production signoff.