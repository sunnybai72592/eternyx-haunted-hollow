# Docker Phase 41 — real-host staging transition observation without authorizing execution

**Prerequisite:** Docker Phase 40 / PR #753 merged. The existing Phase 38 host command already inspects the independently pinned rootless Engine, no-network hardened container, root-owned CLI ELF/config, and complete recovery journal without mutation. Phase 39/40 provide a separate, challenge-bound attestor report and one-time reviewer consumption, **not proof of a real lifecycle transition**.

Phase 41 adds a **read-only before/after transition capture** to the original protected host command and a separate **offline consistency reviewer**. It does **not** start/stop/restart a container; any mutation, if approved, must happen through an independently controlled staging procedure outside these tools. CI tests only synthetic Docker inspection objects and local temporary files.

## Eight integrated improvements

1. **One existing hardened real-host CLI:** `scripts/docker-lab-host-preflight.mjs --capture-lifecycle before|after FULL_CONTAINER_ID start|stop|restart`. Retains Linux non-root requirement, CI/root refusal, both disabled lab execution flags, exact independently pinned daemon/socket/image/policy/ELF/config, per-command strict allowlist and **two complete read-only observation rounds**.
2. **Real independent post-state verification:** The signed-agent `validateSignedAgentTarget` runs for both observations with `stage:"after"` as appropriate. Stop must result in `exited`/not running; start and restart must result in `running`. Each snapshot is rejected if engine identity, container epoch/PID/counters, network-none settings, image, mounts, security policy or complete journal inventory changes **within its own double read**.
3. **Cross-stage transition validation:** A pure reviewer confirms before/after target/context/daemon/image/policy/CLI/config pins, network containment, correct start/finish epochs, stopped/started states and timestamps. It invokes the already-existing signed agent's `validateSignedAgentLifecycleEvidence` against the separately captured **sanitized state**. A stop with an unexpected changed start epoch or a replay of the same state fails closed.
4. **Strict recovery history in both captures:** Reuse Phase 38's complete, owner-private, bounded two-pass recovery inventory validator. Reserved, attempted-only, UNKNOWN, legacy failed (even if acknowledged), unacknowledged, stale locks or changing claim files refuse collection. No journal deletion, automatic retry, receipt or claim writes.
5. **Privacy-preserving bounded evidence:** Instead of raw Docker inspect or Engine output, return domain-separated SHA-256 commitments for target/context/daemon/image/policy/CLI/config, network state, original recovery inventory, and PID/start/finish epochs. Only controlled status, booleans, exit code, restart counter and two capture times are exposed. Report bytes are SHA-256 bound; secrets, raw container ID, Unix-socket path, daemon ID and Docker environment never appear.
6. **Independent offline reviewer:** `scripts/docker-staging-lifecycle-review.mjs /ABS/BEFORE.json /ABS/AFTER.json /ABS/APPROVED.json` requires an independently authored **private, canonical** approvals file. Refuses symlinked/replaced files, noncanonical/duplicate-key JSON, unexpected keys, mismatched independent pins, reversed/stale observations, gaps exceeding 15 minutes, and failed transition. No Docker or cloud usage.
7. **Clear non-authorization result:** Passing means `reportedLifecycleTransitionConsistent:true`; it also says `executedActionAttributionProven:false`, `signedPermitAndRevocationVerified:false`, `crashRecoveryDrillProven:false`, `receiptReconciliationProven:false`, `reviewerWitnessSignatureVerified:false`, `physicalIsolationProven:false`, `stagingExecutionAuthorized:false` and `productionDeploymentAuthorized:false`. Offline capture hashes can be forged by an operator controlling the capture process; they are **not independently signed/witnessed**. The Phase 40 one-time signed preflight does not magically authorize these captures.
8. **Dedicated offline regression CI:** Synthetic full managed container objects for start/stop/restart; refusal for policy/network/PID/epoch/daemon changes, unresolved signed agent recovery, stale/tampered evidence, independent reviewer pins, filesystem ownership, source command ordering and CI-mode failure. Reruns all Phase26–40 offline Docker safety suites without using Docker, Supabase, paid infrastructure or production configuration.

## Suggested manual staging order — requires separate approval

These are **future operator actions**, not CI steps or instructions to enable production.

1. **Independent isolation approval:** A named safety reviewer independently verifies the Linux test host is physically/scheduling/network-isolated, disposable, non-production, rootless and has an unprivileged operator account. Inventory the installed Docker CLI and its pinned **root-owned** configuration, Unix socket, daemon, image, sandbox containment and all durable recovery histories. Do not test a shared or production daemon.
2. **Review a fresh, consumed Phase40 host attestation** for the same exact pinned host context/target/image/policy using the reviewer-controlled challenge ledger. Keep the challenge/attestor key and offline reviewer approvals separately protected; no other reviewer or host report may reuse its challenge.
3. **Capture a before snapshot** on the approved host with *both execution feature switches disabled*:

```sh
node scripts/docker-lab-host-preflight.mjs \
  --capture-lifecycle before FULL_64_CHARACTER_CONTAINER_ID stop \
  > /ABS/PRIVATE/staging-before.json
```

4. **Separate controlled, authorized staging action:** An independent operator and witness may execute **one approved** lifecycle operation under the existing separate staging permit/revocation/containment procedure. This PR does not supply a command to perform it, does not configure credentials or enable the signed agent, and cannot approve its safety. Stop on any unexpected target, privilege, network, daemon, RLS, lock or permit state. Never repeat an UNKNOWN outcome automatically.
5. **Capture a post-state snapshot immediately** using the same pinned host and target, ideally within 15 minutes of the before capture:

```sh
node scripts/docker-lab-host-preflight.mjs \
  --capture-lifecycle after FULL_64_CHARACTER_CONTAINER_ID stop \
  > /ABS/PRIVATE/staging-after.json
```

6. **Independently review two canonical files** on a trusted separate reviewer computer with a trusted clock. The reviewer supplies their own `approved.json` with eight exact fields in the order shown below (all lowercase 64-digit digests are independent approvals, not copied from snapshots):

```json
{
  "operatorTargetSha256": "64-lowercase-hex",
  "approvedContextSha256": "64-lowercase-hex",
  "approvedDaemonIdSha256": "64-lowercase-hex",
  "approvedImageSha256": "64-lowercase-hex",
  "approvedPolicySha256": "64-lowercase-hex",
  "approvedClientSha256": "64-lowercase-hex",
  "approvedConfigManifestSha256": "64-lowercase-hex",
  "operation": "stop"
}
```

The placeholders above are illustrative **invalid values**. Author the real file using `JSON.stringify(independentApprovals)+"\n"`, mode 0600, preserving exact key order. Execute:

```sh
node scripts/docker-staging-lifecycle-review.mjs \
  /ABS/PRIVATE/staging-before.json \
  /ABS/PRIVATE/staging-after.json \
  /ABS/PRIVATE/approved.json
```

7. **Separate incident and containment drills:** The independent release reviewer also needs real physical-host evidence for zero egress/published ports/mounts/privilege escalation, arbitrary command denial, lease expiry and signed-permit rejection, pre-/post-revocation isolation, crash-before/after-mutation UNKNOWN preservation, duplicate-command prevention, dropped/late receipts, audit and operator/owner A/B account isolation. The Phase41 comparison **does not** test these; no checklist or fake result may mark them green.
8. **Release decision:** Keep original signed agent, staging database and prod feature switches disabled unless the actual real-host staging and server-side drills are independently witnessed and signed, the source/deployment digests match, immutable human-reviewed evidence exists, and the project owner explicitly authorizes any further action. Never use a passing Phase41 JSON as a deployment or production unlock.

## Major boundaries

This code reads the already installed Docker daemon **only when an independently approved human actually runs the host CLI**; the CI runner does not call Docker. The offline reviewer checks integrity **relative to provided files**, not cryptographic authorship: a malicious host operator can forge an internally consistent pair. Action causality, independent host identity, physical isolation and external witness signatures remain unverified, and an unapproved lifecycle action is never justified by the comparison.

**No mutation, provisioning, Supabase network call, paid resource, production deployment, Docker command retry, or automatic recovery lock clearing is introduced.** The next honest milestone is real, separately approved, independently witnessed host acceptance—not another source-only green check.
