# ETERNYX Docker agent identity enrollment (PR following #384)

This milestone adds **real Supabase account-bound workspace and agent registration**, using Ed25519 proof-of-private-key possession. It does **not** verify physical ownership of a server, connect a Docker engine to the browser, or turn on remote operations. Enrollment status is `pending`, `key_verified` or `revoked`; **never** shown as `online`.

## How to use

1. Review and apply the SQL migration using the project's normal Supabase migration workflow; deploy the `docker-enrollment` Edge Function after verification. No migrations are applied automatically by opening the PR.
2. Sign in to ETERNYX, open `/integrations/docker-enrollment`, create your workspace.
3. On the operator-controlled server or trusted workstation, run `node scripts/docker-enrollment-key.mjs generate /ABSOLUTE/PRIVATE/docker-agent.pem`. The CLI prints only the public key. The private key file stays on that machine, mode 0600. Do not commit or upload it.
4. Paste public key into ETERNYX, set a display name, choose your workspace and request enrollment. ETERNYX returns a unique short-lived canonical message and nonce.
5. Save the message **exactly** as text to `challenge.txt` on the trusted machine (the CLI strips one trailing newline), then run `node scripts/docker-enrollment-key.mjs sign /ABSOLUTE/PRIVATE/docker-agent.pem /ABSOLUTE/challenge.txt`.
6. Paste the returned signature into ETERNYX and submit before the 10-minute expiry. Verify that state becomes `key_verified`, **not connected**. Old nonces cannot be reused after verification. Revocation disables the enrollment record but does not remove files or disable the independent Docker SSH agent.

## Security contract

- JWT verified through Supabase Auth `getUser`; anonymous accounts refused; request user IDs are never trusted.
- Tables have RLS with per-account SELECT and no client INSERT/UPDATE/DELETE. Service-role-only, SECURITY INVOKER SQL RPCs enforce owner, quotas (3 workspaces, 10 active agents, 15 enrollments/day) and atomic challenge consumption.
- Agent's public key is global-unique; the private Ed25519 key stays operator-side. Only its public key, challenge SHA-256, expiry, metadata and audit events are stored.
- Challenge binds `ETERNYX_DOCKER_ENROLLMENT_V1`, owner UUID, workspace UUID, registration UUID, random 32-byte nonce and expiry. Signatures are verified before consuming the single-use nonce with a conditional database update.
- Browser never contacts a Docker daemon. No arbitrary URLs, SSH credentials, Docker sockets, customer billing, automatic agent trust or control privileges are introduced.
- Enrollment proves that a signer possessed the matching key at the time of the challenge, not that they own the server or that a live Docker Engine is connected. Production agent attestation, real server ownership, network access and tenant-safe control remain separate security milestones.

## Testing and deployment limitations

`node --test tests/docker-enrollment.test.mjs` checks contract, signatures and migration security invariants. This is **not a live RLS test**; run the migration against a staging database and test owner A vs owner B, anonymous callers, quotas, replay, expiration and revocation before production deployment. Deploying the Edge Function is a separate operator action.

Use short-lived JWTs for sensitive operations. The key-verified record cannot grant Docker access by itself.
