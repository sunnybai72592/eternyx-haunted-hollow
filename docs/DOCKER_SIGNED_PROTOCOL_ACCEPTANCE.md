# Docker real signed-protocol acceptance

This milestone follows merged PR #450. It wires shared Ed25519 verification into the actual Docker dispatch Edge Function and exact pinned permit and receipt validation into the actual lab-agent script.

## Eleven improvements

1. The Edge Function uses a shared Deno/Node real-WebCrypto verifier before any database nonce or claim call.
2. Enrolled-agent ID, key-verified status and revocation are checked.
3. Real Ed25519 signing and verification are tested for claim, authorize and receipt messages.
4. Noncanonical/oversized signatures, wrong 32-byte public keys and wrong nonces are rejected.
5. Past and future action timestamp skew windows are tested.
6. Signed client messages bind all protected action fields; substitutions fail.
7. Local agent verifies the server signature using an independently pinned public key.
8. Exact agent, claim, request, operation and full container ID binding is tested.
9. Expired, future-dated and tampered short-lived permits are rejected before local reservation.
10. Normal and receipt-only recovery require an exact server-reported receipt acknowledgement before writing receipt_accepted.
11. Dedicated path-scoped Node22 WebCrypto CI plus existing full-repository builds and security tests.

## Boundaries

These tests use ephemeral real Ed25519 keys locally. They do not contact a hosted Supabase instance, validate a deployed Edge JWT handler, or run Docker. The previous isolated PostgreSQL acceptance validates database ownership, nonce replay and incident holds separately. A complete hosted staging JWT/signature/agent test remains a separate operator-approved requirement.

Keep remote lab flags disabled in production. Never treat signed agent outcomes as independent physical Docker attestation.

Run node --test tests/docker-signed-protocol-integration.test.mjs