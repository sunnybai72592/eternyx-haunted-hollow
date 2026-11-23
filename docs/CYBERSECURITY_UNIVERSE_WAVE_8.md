# Cybersecurity Universe — Wave 8: Private Evidence Provenance

## Deliverable

A protected, read-only evidence integrity workspace that uses the *existing* private engagement, metadata, storage and audit tables. No migration, service-role browser key, external scanner, or production write.

Eight improvements bundled:

1. Owner-scoped engagement selection and bounded/paginated private evidence metadata with stale-request guards.
2. On-demand **real SHA-256 content hashing** of downloaded private files (bounded 20 MiB) using Web Crypto; exact registered byte count enforced.
3. Private storage key, identity, MIME, file size and timestamp validation before downloads; no public links or signed URL exposure.
4. A **first-observation in-session baseline**, and explicit re-download/re-hash comparison that reports changes as mismatched bytes, **not** proven tampering.
5. Optional operator-supplied SHA-256 comparison (exact 64 hex digits); mismatch never silently accepted.
6. Read-only **investigation evidence reference tracing**: read a real private investigation snapshot, revalidate its current attested scope, fetch referenced evidence metadata in an owner+engagement+IDs query, refuse incomplete/foreign/duplicate links; hashing the referenced file is a separate action.
7. Actual recent owner-scoped database audit events and a bounded deterministic JSON **manifest export** containing IDs, hashes, bytes, timestamps and comparison outcomes but no object paths, filenames or raw evidence.
8. Security tests for hash known vectors, altered bytes, cross-owner and path rejection, incomplete references, no fake integrity statements and UI integration.

## Limits

- SHA-256 verifies that **the downloaded bytes** match a previously computed in-session hash or an operator-supplied hash. Without an independently trusted baseline, signed receipts and custody controls, it cannot prove originality, author identity, non-tampering or legal chain of custody.
- The first-observation baseline lives only in browser memory and clears on account/engagement switch or unmount. Manifest files are downloaded locally and should be protected as confidential.
- The screen never uploads, deletes, updates or publicly exposes evidence. The existing storage RLS and private audit policies remain authoritative.
- Recent audit rows prove database metadata events were recorded, not that a file's contents were independently validated.
- Investigation reference tracing establishes owner-scoped *metadata* associations, not verified content authenticity.
- No indexed Wave 4 ledger deployment is implied. That migration remains gated behind genuine isolated Supabase staging acceptance.
- SHA hashing processes at most the existing 20 MiB private bucket maximum in browser memory. Keep current tab secure and avoid public terminals.

## Verification

Use two real user accounts in an isolated staging environment. Confirm one cannot list or download another's private evidence, including direct Storage API calls. Download the same object twice and compare hashes; expected SHA comparisons must reject mismatches. Change bytes or metadata in a disposable fixture and verify hard failure on size mismatch. Trace an investigation referencing both owned and foreign/missing metadata IDs; incomplete references must not be shown as verified. Verify the JSON export contains no private storage paths or raw contents. Switch accounts while a download is in progress and verify late data is discarded. Exercise mobile layout, keyboard access and failure states.

## Next security milestone

Real Supabase deployment staging validation, trusted server-side immutable content hash receipts, and proper reviewer roles/retention policies before claiming any formal custody proof.
