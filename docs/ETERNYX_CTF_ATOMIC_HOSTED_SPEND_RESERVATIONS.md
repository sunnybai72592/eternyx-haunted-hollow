# ETERNYX Labs — Atomic Hosted Spending Reservations

> **Backend pre-provisioning contract only.** This change does **not** launch a Firecracker microVM, provision an AWS/Azure/GCP VM, activate billing, or authorize public hosted labs. The hosted provider adapter is still disabled. Budget reservations constrain ETERNYX's own trusted orchestration, **not actual provider charges**.

## Purpose

The previous milestone PR #383 validated pinned Ed25519 price quotes, fixed 900-second microVM envelopes, and zero-default spend estimates. A per-process arithmetic check cannot defend against concurrent worker claims, duplicate quote use, or lost hosts. This milestone records reservations in PostgreSQL, atomically serializes the spending calculation, and preserves a permanent nonce receipt.

## Eight improvements

1. A singleton `public.ctf_hosted_spend_policy` has `enabled=false`, `max_single_session_micro_usd=0`, `max_24h_micro_usd=0`, and `max_reservations_per_24h=0` by default. All caps are integer micro-USD with database CHECK limits.
2. Append-only `public.ctf_hosted_spend_reservations` records exactly one reservation per session UUID and unique signed-quote nonce. Each row includes a SHA-256 digest of the signed quote's canonical payload, amount, expiry, worker generation, and owner.
3. **Atomic DB admission:** service-only `public.ctf_hosted_reserve_quote` obtains the existing worker transaction advisory lock plus a `FOR UPDATE` lock on the singleton spending policy. It counts the full conservative 24-hour reservation total and prevents competing claims from both passing a stale budget snapshot.
4. **Worker fencing:** a quote may only reserve against an existing live worker lease and a still-provisioning session owned by that exact fence. A stale or arbitrary worker, forged session ID, expired quote, missing nonce, bad digest or absent database worker claim is refused.
5. **No replay/refund shortcut:** repeating an already reserved session always fails; using an old quote nonce on a different session always fails. Reservations cannot be updated or deleted through the service role. Early cleanup and failed launches do not release the worst-case 24-hour reservation.
6. **Browser isolation:** RLS is enabled on both tables. `anon` and `authenticated` have no direct table access or privileged RPC execution; `SECURITY INVOKER`, explicit grants and signature-specific `REVOKE` statements defend the function boundary.
7. **Trusted host JS boundary:** `reserveSignedHostedQuote` verifies the pinned issuer's Ed25519 signature, exact session, immutable microVM manifest and canonical quote hash BEFORE asking an injected trusted service-side RPC client for a DB reservation. It rejects misleading RPC replies and never returns permission to launch a VM.
8. **Live disposable Postgres acceptance:** CI applies the existing range session schema and worker-fence migration, then the new reservation migration, in a networkless Postgres 17 container. SQL tests cover default-off, 24-hour count and USD caps, wrong leases, nonces, duplicate sessions, expired quotes, append-only privileges and browser RBAC. Node tests cover signer tampering and fail-closed responses.

## Reservation sequence (no paid provider involved)

1. A trusted operator verifies a signed short-lived USD quote from a pinned provider issuer and the fixed microVM policy.
2. The fenced worker must own a provisioning session. No user/client input can choose worker owner, quote signing key, VM image or cost policy.
3. In a single PostgreSQL transaction, a worker proves its lease, locks the policy, verifies that the session is currently claimed, checks the entire rolling 24-hour reservation total and creates the unique receipt.
4. The returned result is **always** `cloudProvisioningAllowed: false` and `providerHardLimitVerified: false`. The flow **stops there**.

### Key implementation boundaries

- SQL reservations are **append-only, pessimistic 24-hour held funds**. There is intentionally no refund, reservation release or automatic expiry cleanup. Otherwise an unconfirmed crashed VM could continue billing after its budget is freed. This overestimates costs but prevents bypassing ETERNYX's own rolling reservation gate.
- The RPC trusts **service_role and the existing worker fence**. It does not cryptographically verify the Ed25519 quote on its own; the trusted host function must do so before calling it. Even successful SQL insertion is NOT authorization to start any paid resource.
- This is **not an authoritative record of provider-billed amounts**. If a provider charges above the quote, continues billing after worker failure, charges network egress or storage outside the quoted envelope, the database cannot stop it. A provider-side hard spending limit and off-host kill switch remain mandatory.
- No cloud secrets, service_role keys, signed private keys or Firecracker artifacts are included in this repository or its CI logs.
- The migration is committed for review and exercised in disposable CI; this PR does **not** apply it to the linked production Supabase project.

## Verification

`node --test tests/ctf-hosted-quote-reservation.test.mjs`

`npm test`

`npm run build`

GitHub Actions workflow: **CTF Hosted Atomic Spend Reservation SQL**, plus existing **CTF Hosted MicroVM Readiness and Signed Spend Guard**, **CTF Worker Fencing and Resource Budgets**, and main CI.

## Production release requirements

Independently tested per-VM Firecracker jailer, audited guest kernel/rootfs image and attestation; host-enforced network egress and metadata denial; actual provider quote issuance and billing telemetry; provider-enforced quota and destruction of abandoned instances; durable signed settlement of actual provider charges; explicit administrative review before enabling hosted workloads.
