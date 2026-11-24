# LABS Phase 27 — release planning and remaining deployment gates

Read-only management observation, 2026-11-24, Eternyx Staging
(mhodwvypfbxafamkrgsk). All six expected history pairs remain present.
The composed catalog assertions passed again (eight RLS tables,
eleven restricted RPCs, two revoked legacy RPCs and safe session columns).
Provider and spending settings remain disabled. Two LABS functions are
active with JWT verification enabled, both version 1. Auth users, solved
missions and range sessions are all zero. Other pillars' staging resources
were preserved. No live writes were performed.

The six local files used for the Phase 19 deployment match the reviewed
deployment commit exactly. These are local Git blob observations, NOT
a cryptographic attestation of what the hosted runtime is executing.
External URL dependencies are not pinned by this comparison.

Run `node scripts/labs-release-assessment.mjs` to compare all twelve
reviewed source blobs (six migrations + six local bundle files) and see the
remaining gates. A drifted file fails CI and requires reviewing the
deployment baseline; do not simply edit the evidence pins to turn CI green.
The report is deliberately offline and historical, never authorizes release,
and cannot turn a Boolean in an imported receipt into hardware proof.
The new live-safe catalog script is tested in networkless PG17 within a
read-only transaction. It retains permission and disabled-provider checks
without incorrectly requiring fixtures to remain empty forever.

## Critical path — stop treating additional repository phases as deployment

1. Configure CTF_FLAG_SECRET securely and create two dedicated confirmed
   staging accounts (Phase 20). No passwords in chat or Git.
2. Configure the protected GitHub environment and run Phase 20 fresh Auth
   acceptance, then separately approve the Phase 21 two-solve lifecycle.
3. Separately approve Phase 22 terminal fixtures for those two accounts;
   run the acceptance again and require positive and negative owner evidence.
4. Review and explicitly approve the remaining three disabled Edge functions
   before any deployment (access issuer, proxy verifier, worker).
   Keep issuance, proxy validation, provider and spending flags disabled.
5. Perform the independent approved offline KVM run with pinned images,
   guest functional probe and full 900-second expiry/teardown proof.
6. Independently verify actual hosted tenant isolation and provider hard spend
   limits before considering public rollout. No paid resources authorized.

A source match, local Docker integration, signed offline file review or a
successful no-VM CI run does not replace steps 1–6. No production changes.
