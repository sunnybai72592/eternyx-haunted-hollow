# Phase 56 — signed assessment evidence candidate
PR #851 merged at e04d9d6cc935bc21ba53df433ee9a7f1a185ab11; three associated workflows passed including PG17.
The existing rehearsal candidate is strengthened, not deployed.

The dormant Node adapter validates exact five HTTP response bytes and
creates a domain-separated digest bound to user, session, provider
instance, reviewed bundle and externally issued 256-bit nonce. Actual
Ed25519 signatures cover that digest and a fixed 30-second validity window.
Verifier requires an independently pinned SPKI fingerprint, the original
response bytes and separately trusted expected binding, rejects stale or
tampered evidence before RPC, and accepts only a positive DB receipt.
No raw transcript or signature enters the learner result. SQL additionally
locks and matches current provider instance, stores unique nonce and
rejects submission after instance replacement. The existing owner/grant
checks and single submission remain. A dormant learner adapter uses a
caller-supplied verified Auth user (nonanonymous), exact six answer fields
and hashes the opaque grant; validates exact owner-scoped result shape.
It is not an HTTP endpoint and does not verify JWTs itself.

Seven Node tests use real ephemeral Ed25519 keys and fabricated response
fixtures. Existing networkless PG17 rehearsal extends wrong-instance,
nonce replay and replacement tests. No production key material, live
host evidence, network access or new migrations. Cryptographic signing
does not establish the truth of captured bytes: a compromised host or
service role can fabricate evidence. The live capture adapter, secure
nonce issuance, independent key review/rotation, actual dedicated host,
authenticated Edge deployment and staging race/owner acceptance remain
required. The SQL service-role boundary trusts the admission adapter;
SQL itself does not verify Ed25519. Do not deploy or activate.

## CI correction
The initial Phase 56 job 140592591237 passed all seven Ed25519 tests but
failed parsing the candidate SQL. Replacement-string expansion corrupted
regex anchors and duplicated SQL suffixes. Rebuilt the candidate from the
passed Phase 55 source with literal replacements, preserving all instance,
nonce, ownership and grant checks. Added malformed nonce and instance
rejections to the actual PostgreSQL smoke test. Updated CI remains required.
