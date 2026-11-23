# Docker full release-review audit export and independent SHA-256 checks

**Next milestone after merged PR #514.** This supplies a complete, account-owned audit export for an individual Docker release review. It links that release's Git commit, candidate SHA-256, source snapshot, deployment manifest, reviewer assignment and all recorded release-review event hashes. It does **not** grant production or Docker permission.

## Ten coordinated improvements

1. Add service-role-only SECURITY INVOKER `docker_release_export_audit` PostgreSQL RPC; takes the actual authenticated owner's user ID and one review UUID.
2. Acquire the same owner-scoped transaction advisory lock as review mutations, so the database captures that review during a consistent, read-only critical section.
3. Fetch **all events** for a specified review, ordered by durable increasing event ID, rather than assuming the Docker governance page's latest 100 events contain the complete history.
4. Fail closed if the release does not belong to the owner, if there are zero events, if the 32-event bound is exceeded, or if the database event count and JSON length disagree.
5. Include only the owned release metadata, bound reviewer assignment, complete event entries and explicit flags that no independent attestation or deployment authorization was given.
6. Add an exact allowlisted authenticated `release_export_audit` action to the existing Docker Control Edge Function; it never grants a reviewer or a different owner access to the original release notes.
7. Add browser-side real WebCrypto SHA-256 verification of each event, the expected candidate and commit, owner/reviewer linkage, server count, canonical order, and terminal review state.
8. Provide a functional **Export complete audit (unanchored JSON)** control. It refuses incomplete or broken data before generating a local file, and explicitly discloses that browser-listed metadata cannot establish an independently trusted tail anchor.
9. Add a strict **offline verifier** that requires separately pinned owner/review UUIDs, the candidate SHA-256, intended Git commit and last event SHA-256. Wrong, missing or substituted pins cause a nonzero exit; the command never contacts the network.
10. Add independent Node/WebCrypto/CLI regression tests, real isolated PostgreSQL 17 two-owner acceptance tests and a documented operator review workflow. Production execution continues to be OFF.

## Obtain an audit export

On Docker Operation Review, locate a release you own and click **Export complete audit (unanchored JSON)**. The Edge Function loads every event for that review and applies the owner check in the database. The browser verifies its internally consistent SHA-256 chain before downloading.

The downloaded file may contain reviewer names/UUIDs, release metadata and bounded internal reviewer notes: treat it as confidential. Do not upload it to public GitHub issues, CI logs or chat messages. Store privately.

## Independently pin the evidence

Use an independently trusted release record for each of these environment variables, **not values read back from the downloaded JSON itself**:

- `ETERNYX_DOCKER_AUDIT_OWNER_ID` — expected 36-character authenticated release-owner UUID
- `ETERNYX_DOCKER_AUDIT_REVIEW_ID` — previously approved release review UUID
- `ETERNYX_DOCKER_AUDIT_PINNED_CANDIDATE_SHA256` — the externally checked dual-Ed25519 release candidate SHA-256 from PR #498
- `ETERNYX_DOCKER_AUDIT_PINNED_COMMIT_SHA` — independently confirmed intended Git commit SHA
- `ETERNYX_DOCKER_AUDIT_PINNED_TAIL_SHA256` — a **separately trusted tail hash** captured before review; never copy the tail from the export and call that an independent pin

Then run on a trusted operator computer with Node 22:

    node scripts/docker-release-audit-verify.mjs /ABS/PRIVATE/release-audit.json

The audit file must be a regular owner-owned, private file with mode 0600 recommended and size at most 64 KiB. The command does not read API keys, send HTTP requests, create approvals, alter SQL or control Docker. On success it returns `pinned_tail_consistent_server_report` and `reportAuthenticationIndependentlyEstablished=false`; on failure it exits nonzero without printing notes or raw records.

## Boundaries and why the pin matters

A consistent SHA-256 chain is a cryptographic integrity check **of the data you supplied**, not proof that it came from the real staging database. A privileged administrator could rewrite the entire database chain and recompute hashes. An independently retained trusted tail anchor increases the chance of detecting such changes, but cannot authenticate an unsigned export. The offline dual-Ed25519 candidate should still be checked against its original raw evidence separately.

A finite export is not necessarily complete in a compromised database, so the database reports exact row count and a bounded complete window, and client validators require all records. These counters are still server assertions, not an external audit of every earlier record.

The old releases that predate independent reviewer assignments can be downloaded but will not pass the current strict offline `reviewed` validator without a distinct accepted reviewer. Create a new reviewed release under the current workflow rather than silently treating legacy self-reviewed releases as independently verified.

## CI and deployment

CI applies the original Docker release-review schema, independently tests two owners, upgrades to reviewer-accountability, and finally applies the export-only SQL migration before testing full owner-only history export. GitGuardian, both regular app build/browser checks, and existing Docker staging gates remain applicable.

**A merged PR is not a deployed migration.** The SQL migration and Docker Control function change require a separately authorized staging deployment and real test accounts. No production Docker Engine, paid API, credentials or live Supabase project is contacted by these changes.
