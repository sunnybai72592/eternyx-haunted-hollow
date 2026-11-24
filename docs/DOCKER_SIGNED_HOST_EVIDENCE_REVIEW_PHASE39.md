# Docker Phase 39 — independently reviewable signed read-only host evidence

**Prerequisite:** PR #723 merged. Phase 38 added an actual local **read-only**, non-root Linux preflight for a pinned rootless Docker Engine and hardened disposable container. That report was an unsigned JSON object. A reviewer receiving the JSON could not tell if somebody modified it, copied an old passing result, changed the approved target/policy, or even generated a synthetic report without a real host.

Phase 39 adds a **separate opt-in Ed25519 host-evidence attestor key** and a **reviewer-generated, single-use challenge** to the real Phase38 command, plus an independent **offline** reviewer. Nothing deploys, contacts Supabase, changes Docker state, clears a recovery hold or authorizes production. The signed result authenticates the dedicated attestor key's statement; **it is not independent proof of a physically isolated host or Docker execution**.

## Seven related improvements

1. **Sign the real preflight result, not arbitrary uploaded JSON.** The Phase38 on-host read-only command still runs its two rounds of approved Docker `context show/inspect`, rootless Engine `info` and full-ID `container inspect`, followed by its strict private journal and policy review. Only *after* those validations may the optional signing call execute. Original unsigned read-only mode remains for local troubleshooting; it does **not** qualify for independent verification.
2. **Separate signer and challenge.** New fixed-form invocation adds `--sign-evidence /ABS/PRIVATE/host-attestor.pk8 --challenge CHALLENGE_64_LOWERCASE_HEX`. Keep that dedicated Ed25519 key separate from the server permit signer and the lab command agent credential. The independent reviewer generates a new random 32-byte challenge for **each** host review and retains it out of band; a challenge must not be copied from an untrusted report.
3. **No weak key-file inputs.** The signing key must be a real, single-link, owner-only private Ed25519 PEM or PKCS#8 DER file with absolute path, `O_NOFOLLOW`, bounded byte read and inode/time checks. The key is never included in a report, child Docker environment or GitHub artifact. Do not save private keys in the repo or paste them into chat.
4. **Full canonical evidence binding.** The Ed25519 message is domain-separated and signs the exact original Phase38 report, independently issued challenge and UTC issuance time. The reviewer rechecks *every* permitted report field, the Phase38 SHA-256 evidence hash chain, fixed false authorization and release flags, no unknown/missing/reordered fields, correct operation/pre-state, and matching hardening-policy digest. No signature can promote self-reported `completed`, physical isolation or production approval.
5. **Independent offline reviewer pins.** Run `node scripts/docker-lab-host-evidence-review.mjs /ABS/SIGNED-EVIDENCE.json /ABS/REVIEWER-PINNED-PUBLIC.key /ABS/REVIEWER-EXPECTED.json`. The reviewer must independently retain exact target hash, context hash, daemon/image/policy/CLI/config hashes, expected operation, challenge and the SHA-256 of the pinned 32-byte public key. The trusted public key and expectations are owner-only, ordinary files (not symlinks), and their JSON is canonical. Never derive the expected values from the report under review.
6. **Freshness and anti-replay requirement.** Report must be signed no later than 60 seconds after the observation. Review must happen within 15 minutes of observation and issuance, with at most 2 minutes future clock skew. A wrong or previously consumed challenge is not eligible; uniqueness/consumption is an **external reviewer process**, not a remote database operation or automatically enforced global lock.
7. **Regression and no-Docker CI.** Tests generate real Ed25519 key pairs, the actual Phase38 synthetic rootless Engine/target observations and private journal inventories; verify valid signatures and independently pinned expectations, tampered fields, wrong identities/pins/challenges, expired results, noncanonical JSON, symlink or public key files, output privacy and actual offline reviewer subprocess. The dedicated workflow also reruns Phase 26–38 offline Docker safety suites without Docker, Supabase, credentials or live host.

## Operator/reviewer procedure (not performed by CI)

1. Independently approve and physically isolate a non-root Linux host. Complete the Phase35–38 CLI/config/daemon/socket/image/policy pinning and ensure no unknown local recovery holds. Keep both execution flags disabled.
2. On a trusted key-management machine, generate **a new dedicated attestor Ed25519 key** with `node scripts/docker-lab-keygen.mjs /ABS/PRIVATE/host-attestor.pk8`. Keep the private file owner-only. The keygen instructions mention server secrets, but **do not use this new key for a server permit**; retain only its independently trusted public value for the host-evidence review.
3. Reviewer generates a fresh 32-byte random challenge, e.g., `node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'`, records it as unused, and provides it to the operator **outside the submitted report**. Verify the approved host pins and attestor public key separately.
4. Operator runs **only read-only preflight** with `--sign-evidence /ABS/PRIVATE/host-attestor.pk8 --challenge <reviewer-challenge>`, redirecting stdout to an operator-private local file. The command itself still rejects CI/root execution and refuses if lab execution flags are enabled.
5. Reviewer builds an independently trusted `expected.json` with exactly these keys **in this order**:

```json
{
  "operatorTargetSha256": "64-lowercase-hex",
  "approvedContextSha256": "64-lowercase-hex",
  "approvedDaemonIdSha256": "64-lowercase-hex",
  "approvedImageSha256": "64-lowercase-hex",
  "approvedPolicySha256": "64-lowercase-hex",
  "approvedClientSha256": "64-lowercase-hex",
  "approvedConfigManifestSha256": "64-lowercase-hex",
  "observationOperation": "stop",
  "challenge": "64-lowercase-hex",
  "publicKeySha256": "64-lowercase-hex"
}
```

The illustration uses placeholders, **not valid values**. Write as compact, single-line `JSON.stringify(expected)+"\n"`, mode `0600`, using independently approved values. The attestor `.pub` file contains **only** the 43-character base64url encoding of the 32-byte Ed25519 key plus one newline, mode `0600`. The `publicKeySha256` is SHA-256 of those **raw 32 bytes**, not of the text representation. The target/context digests use Phase38 domain-separated formulas (`ETERNYX_DOCKER_HOST_TARGET_V1\n` + ID and `ETERNYX_DOCKER_HOST_CONTEXT_V1\n` + approved context name). Keep these out-of-band approvals separate from report contents.
6. Run the reviewer CLI on a **separate trusted machine** with a trusted clock. Interpret `signatureValid:true` as *attestor-key authentication and report integrity only*. Independently document whether the challenge was already consumed; never reuse it for another acceptance.
7. Separately execute authorized staged mutation, crash, permit/revocation and receipt tests on a **physically isolated disposable host** under human release control. The Phase39 report cannot authorize those tests or enable production.

### Residual risks

An adversary who controls the attestor key, operator or host can sign fabricated observations. Ed25519 signatures do not attest Docker Engine code, hardware identity, kernel isolation, host network separation, or physical mutation causality. A valid signature **does not** prove the lab was actually run on a real host. Reviewers must protect the trusted public-key pin and expected hashes, generate unpredictable fresh challenges, enforce one-time use independently, and assess host/permit/rollback/recovery controls. No production Docker or Supabase deployment is requested, enabled or represented as verified.
