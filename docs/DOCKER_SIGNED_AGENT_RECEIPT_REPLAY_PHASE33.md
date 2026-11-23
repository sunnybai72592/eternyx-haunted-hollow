# Docker Phase 33 — signed receipt-only replay requires original local forensic evidence

**Prerequisite:** Docker Phase 32, PR #663, merged. Earlier phases independently pinned rootless Docker Engine, prevented duplicate container mutations, protected journal namespace durability and locked UNKNOWN attempts. One important exception remained in the *actual* `scripts/docker-lab-agent.mjs`: operator `--resend-receipt CLAIM_UUID` read just one parsed claim and would immediately sign and transmit that claimed outcome, without correlating other historical claims or recovery locks through the strict read-only inventory.

## Real signed-agent changes (not an interface simulation)

The new pure `src/lib/dockerSignedReceiptReplayFence.mjs` works on the existing bounded, read-only, double-read inventory. The live agent applies it **twice** during receipt-only replay, with no Docker calls:

1. **Before any signed receipt network request:** require a complete stable inventory of the operator-owned journal directory, the exact original claimant agent ID and claim UUID, a stable 64-character hash of that claim file and the single O_EXCL per-agent lock held for this invocation.
2. **Reject ambiguous or incomplete claims:** only exactly `reserved → attempted → completed` or `reserved → guard_denied` is eligible. An old `failed` event is **not** safe merely because earlier code wrote a terminal entry: historical execution could have timed out, producing an ambiguous result. `reserved`, `attempted` only, changed events and already acknowledged records cannot produce another signed receipt.
3. **Require completed target-lock release:** a still-retained per-container recovery lock for this exact container is evidence of unresolved state. Neither a terminal journal nor a trusted operator can silently waive the lock through receipt replay.
4. **Check historical same-container claims:** older UNKNOWN or reserved-only attempts, unacknowledged completed/guard-denied results, and legacy `failed` (even already acknowledged) block replay for this exact container until independent review. Unrelated completed, acknowledged claims do not automatically block it.
5. **Refuse unknown-origin orphan agent locks:** a separate agent lock without an associated claim cannot be attributed safely to a different container; it blocks a false claim of complete recovery.
6. **After a valid signed server acknowledgement:** run the complete journal inventory **again** and require the original claim-file SHA-256 fingerprint, container identity and outcome to be unchanged *before* fsyncing `receipt_accepted`. Changed/partial local evidence is not upgraded into a verified acknowledgement.
7. **Offline regression and operator guidance:** test authentic fsynced local journals, old-failure quarantine, unrelated target isolation, missing owner lock, leftover container lock, symlinks/public files, partial writes, hash drift, exact execution ordering and no Docker contact.

The existing Ed25519 signature and nonce, server acknowledgement validator, HTTPS Supabase origin restriction, per-agent O_EXCL lock and append-only journal remain mandatory. This phase does not touch the actual Docker Engine, enable cloud dispatch or repair unknown history. The new function returns `independentlyVerified:false`, `dockerExecuted:false` and `locksAutomaticallyReleased:false` deliberately: a successful **receipt transport** is not independent physical execution evidence.

### Operator procedure

1. Inspect: `node scripts/docker-lab-recovery.mjs --strict-inventory`.
2. Ensure the local journal and incident evidence are independently reviewed, and that the target is on a physically isolated approved rootless host.
3. If an original **completed or guard_denied** receipt is terminal but not acknowledged, the explicit existing `--resend-receipt CLAIM_UUID` mode may replay the *same original claimed outcome*, subject to the new safety gate.
4. On a local `failed`, UNKNOWN, retained container lock, corrupt history, or mismatch, **do not** delete the journal, clear recovery locks, manufacture a receipt, or retry a Docker mutation. Escalate through an out-of-band approved incident-resolution procedure.

Even a successful replay only records the server's acknowledgement of the *signed agent's statement*, **not** independent proof a Docker mutation happened. No production deployment has been validated. The offline CI scripts do not run Docker, call Supabase or require secrets.
