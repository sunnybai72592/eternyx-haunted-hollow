# Docker independent release reviewer and SHA-256 history integrity

This milestone follows merged PR #506. It turns metadata-only owner review into a **separate-account acceptance workflow** and makes stored audit events SHA-256-linked. It does not verify signed offline release evidence automatically, attest the real Docker host, or grant deployment authority.

## Eleven bundled improvements

1. Add `docker_release_reviewer_assignments` with one immutable reviewer selection per release review and an owner/reviewer split enforced by a database constraint.
2. Allow only an owner of an `in_review` release to invite a different user UUID. A repeated identical invite is idempotent; switching to a different reviewer is refused.
3. A different, authenticated invitee may accept or decline the specific release candidate using its full SHA-256; wrong candidate hashes or uninvited users fail closed.
4. Reviewer responses are terminal and cannot be changed to the opposite decision; independent reviewer action is recorded with that account's actor UUID.
5. Owner transitions from `in_review` to `reviewed` now require the independently authenticated invitee to have accepted the same candidate SHA-256.
6. Reviewer assignments are protected by PostgreSQL RLS: owners and invited reviewers may only SELECT their own relevant assignments. Neither may mutate them directly.
7. Owner review audit events gain actor identity, previous SHA-256 and current SHA-256. Existing events are backfilled in per-review chronology.
8. New events get their SHA-256 from a server-side PostgreSQL trigger; a trigger rejects UPDATE or DELETE of event rows through normal application channels.
9. A shared WebCrypto module recomputes the reported event chain in the browser and distinguishes consistent, broken and **incomplete** history windows. Missing genesis never counts as verification.
10. A functional account invitation/response panel lets owners invite a second account and invited reviewers accept or decline the exact candidate, while the completion button is disabled until accepted.
11. CI tests the original migration and existing behaviors first, applies the new migration on an actual isolated PostgreSQL 17 instance, verifies owner/reviewer RLS and historic backfill, and runs real WebCrypto and UI/contract regressions.

## How the updated workflow behaves

An account owner submits the previously checked release candidate's SHA metadata, starts review, and invites a different ETERNYX account by user UUID. A reviewer signing in to their own account finds that invitation in Docker Operation Review, independently checks the offline evidence, enters the exact 64-character candidate SHA-256, then accepts or declines with a meaningful note. Only an accepted response allows the owner to mark the review record complete.

Accepting an invitation is an **authenticated account action**, not cryptographic proof of having reviewed the offline artifact. The existing dual-Ed25519-signature verification from PR #498 remains an independent offline requirement. The owner may still block the release at any time. A declined invitation is terminal for the given review, so a different reviewer requires a new review submission.

## Audit-chain properties

SHA-256 links each event to its previous event for the same release, including event ID, review ID, owner ID, actor UUID, event kind, UTC timestamp and the UTF-8 note. The browser verifier checks this formula with native WebCrypto. If the recent bounded response is missing the first event, the UI says **incomplete**, not verified. An altered event, broken predecessor or invalid hash says **broken**.

**Limits:** A privileged database administrator can change history, disable triggers or recompute hashes; the chain is not cryptographically signed by an external trust anchor. Even a consistent hash chain only verifies internal consistency of the server-supplied data. The owner has a recent 100-event API window, not a guaranteed complete audit archive. Independent export and separately trusted storage remain future work.

## Security and deployment

The Docker Control Edge function continues deriving owner and reviewer identities from verified Supabase `getUser()` sessions. New service-role-only PostgreSQL RPCs are `docker_release_invite_reviewer` and `docker_release_respond_reviewer`; browser roles retain SELECT-only RLS. The reviewer can see their invitation summary but cannot read the owner's full release-review table or unrelated audit history.

The release metadata, reviewer acceptance and chain consistency NEVER grant permission to publish Edge Functions, manipulate Docker containers or turn on remote execution. UI and Edge responses still disclose `releaseExecutionAuthorized=false` and `releaseIndependentApprovalVerified=false`.

This PR creates schema and code in GitHub only. No live staging/production migration, Docker host, customer data or cloud secrets are accessed. After merging, deploy both release-review migrations and the updated Docker Control Edge Function **only to an explicitly authorized staging project**, and run fresh real-account acceptance before considering the feature operational. Existing offline PostgreSQL integration and browser acceptance CI are necessary but not sufficient.
