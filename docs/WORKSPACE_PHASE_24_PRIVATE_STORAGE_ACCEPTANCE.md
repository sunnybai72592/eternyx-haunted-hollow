# Workspace Phase 24 — existing staging file bytes and private Storage RLS

This phase adds an operator-run **read-only** acceptance harness for one
preexisting, non-sensitive test file in a strictly separate nonproduction
Supabase project. No file is created, uploaded, modified or deleted. No SQL
migrations are added. This is not production certification.

Create a small private Workspace file fixture under a test owner account
and record the `workspace_items` UUID for that file. Independently
calculate a trusted SHA-256 digest of the original bytes. Use the four real
owner/editor/viewer/outsider staging accounts from Phase 21, and the same
environment settings from that phase. Add:

- `WORKSPACE_STAGING_STORAGE_FILE_ITEM_ID`: preexisting file-kind item ID
- `WORKSPACE_STAGING_STORAGE_SHA256`: expected SHA-256 hex (64 characters)
- `WORKSPACE_STAGING_STORAGE_CONFIRM=PRIVATE_FIXTURE_BYTES_READ_ONLY_STAGING`

Run `npm run workspace:staging:storage:config` first (offline) and then
`npm run workspace:staging:storage` for actual authenticated tests. Do not
use real customer files or privileged Supabase keys. Phase 21 config guards
explicitly block the known Eternyx production reference.

Acceptance requires: four distinct verified Auth accounts; owner-private
file record and project ownership; correct owner/project/key prefix; MIME
and 5 MiB limits; owner download byte-size equality and independently
provided SHA-256 equality; zero other-account or anonymous item/project
visibility; explicit rejection of every other account's download AND
signed-URL creation; and a public unauthenticated URL that returns an
access-denied HTTP status without redirects.

An error caused by a network failure or 500 response is **never** counted
as a successful access-denial check. Owner downloads are in memory only.
No signed bearer link is printed or made for the owner. Report contains
fixed check labels only, no secret keys, actual UUIDs, file contents,
paths or raw SDK errors.

This staging check cannot verify the live migration history, private link
revocation, cross-browser behavior, Realtime delivery, actual staging
permissions for unrelated features, or production readiness. Run Phases
21–23 independently and reconcile the hosted database before rollout.
