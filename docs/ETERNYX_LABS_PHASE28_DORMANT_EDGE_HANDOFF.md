# LABS Phase 28 — dormant Edge deployment handoff

Phase 27 merged and passed all five applicable checks. Actual staging
inventory still contains ctf-verified and ctf-range-control, version 1,
plus an unrelated security function. The remaining three functions are
not deployed.

This PR adds an unconditional source-level dormant lock to access issuance,
proxy validation and worker operations, in addition to their existing
environment activation flags. Even stale true flags cannot activate this
reviewed source. A later separately reviewed source change is required
to unlock any project. This lock applies to all three handlers in all
environments. The two already deployed functions and their reviewed local
dependencies remain unchanged. Bounded UTF-8 JSON body reads are wired for
future reviewed activation. A source-only manifest verifies the reviewed
local dependency closure, SHA-256 bytes, expected JWT settings and fixed
external import URLs. It does not authenticate external transitive bytes,
verify compiled Deno execution, or prove a hosted deployment.

Deployment approval must explicitly name Eternyx Staging
(mhodwvypfbxafamkrgsk), the three functions, and dormant scope. After merge,
revalidate the exact main source and local bundle digests, live schema
permissions, zero provider/spend budgets and function inventory. Deploy
only ctf-range-access (verify_jwt=true), ctf-range-access-check
(verify_jwt=false, private proxy authentication when eventually unlocked),
and ctf-range-worker (verify_jwt=false, private worker authentication when
eventually unlocked). Verify active versions and JWT settings via the
management inventory and test disabled responses with no privileged
credentials. Issuance may be rejected at the gateway before its handler.
The source lock is not proof that an actual HTTP request has been tested.

No workflow automatically deploys. No secrets, migration replay,
provider enablement, production mutation, paid compute, or live requests
have been made by this PR. Do not enable or remove the lock as part of
deployment. Two dedicated Auth accounts and the CTF flag secret still
need operator setup. Physical KVM proof remains separate.
