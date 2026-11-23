# Docker Edge HTTP integration acceptance

This test suite runs the SAME request handler used by the deployed Supabase Docker dispatch Edge Function. The Node test adapter uses real loopback HTTP requests and real Ed25519 WebCrypto signing and verification with newly generated ephemeral keys. The test database adapter is a deliberately disposable in-memory state machine, NOT a deployed Supabase project or PostgreSQL instance.

## Ten tested protocol behaviors

1. Signed agent claim over actual local HTTP, followed by server-signed short-lived permit and a matching receipt.
2. Independent pinned-server Ed25519 permit signature verification on the local agent code path.
3. Duplicate identical outcome acknowledgements and refusal of conflicting agent-reported outcomes.
4. Invalid signature rejection before nonce consumption; a valid signed retry can use the nonce after an invalid signature.
5. Replay of a consumed signed nonce always denied.
6. HTTP methods, browser Origin, disabled-by-default dispatch flag and oversize/bad JSON bodies fail closed.
7. Signed agent expiry and clock-skew checks execute before database access.
8. Revoked, pending or substituted agent keys cannot claim operations.
9. Missing server signer, backend errors or malformed permit responses never generate a false authorization.
10. Concurrent identical nonce requests cannot be accepted more than once; responses are non-cacheable and never claim independent execution verification.

## Scope and limitations

Node's Web Crypto implementation exercises production shared code through a loopback-only HTTP server bound to 127.0.0.1. No Docker API or real lab agent is invoked; the database adapter is intentionally in-memory. Database RLS and SQL transaction semantics are covered separately by merged PostgreSQL acceptance PR #450. The production Edge adapter still requires a real server-side Ed25519 secret and server-only opt-in flag.

This is not a production deployment, hosted Supabase staging test, verified JWT session, or physical Docker Engine test. The public signed-agent endpoint uses Ed25519 rather than user JWT and remains configured with verify_jwt=false; the owner control endpoint continues using authenticated JWT and verify_jwt=true. Proper key enrollment/revocation, deployment configuration, gateway protections, host ownership and actual Docker sandbox inspection must be tested separately before enabling any lab.

### Run

    node --test tests/docker-edge-http-integration.test.mjs

All test keys and state are generated in memory. No cloud credentials, paid compute, GPU or external AI API are required.
