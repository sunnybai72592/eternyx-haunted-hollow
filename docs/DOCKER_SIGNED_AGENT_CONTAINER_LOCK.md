# Docker Phase 30 — exclusive per-container lock across signed agents

Follows merged PR #635 (Phase 29). The signed lab agent already has a durable **per-agent** lock, a permanent per-claim journal, independent rootless Docker Engine pins, and immediate target reinspection. However, two **different agent IDs using the same operator-owned local Docker journal directory** could both possess a separately valid, signed claim for the **same container ID**. Per-agent exclusivity does not protect a shared container.

## Real-agent change

This phase adds an operator-private, exclusive, durable `container-FULL_64_HEX_ID.lock` to the **actual** `scripts/docker-lab-agent.mjs`. It does **not** add Docker Engine execution in CI or enable staging/production dispatch.

1. After verifying the original server-signed Ed25519 permit but **before** creating the claim journal, acquire the exact container's lock using the operating system's `O_CREAT | O_EXCL | O_NOFOLLOW` exclusive creation. The filename contains the complete lower-case Docker container ID (not a short or reusable name).
2. Fsync the canonical private lock record and its parent journal directory. The record binds the exact agent UUID, claim UUID, container ID and creation timestamp. A private `0700` directory and `0600`-style lock permissions are required.
3. A competing signed agent on the **same shared private journal path** gets `EEXIST` and does **not** reserve a claim or run a Docker mutation. A definite `EEXIST` releases only its own per-agent lock; the existing target lock remains untouched.
4. If lock creation partially writes or fsync fails, retain the original agent lock for manual review. Never assume an interrupted `O_EXCL` reservation did not leave an incomplete lock.
5. After a claim is durably reserved, the target lock remains held through first inspection, `attempted`, reinspection, Docker mutation, terminal postcondition, and durable journal write/readback. If the operation is **UNKNOWN** or terminal journaling fails, both the agent lock and target lock remain in place.
6. The target unlock routine independently checks that the **exact matching claim** has a valid fsynced terminal `completed`, `guard_denied` or legacy `failed` event; it also verifies the original lock's inode, device, private permissions, timestamps and complete bytes before unlinking. It will never unlock an attempted-only UNKNOWN claim.
7. The existing strict read-only recovery inventory now accepts, validates and fingerprints the new target locks. It correlates them with the original claims, flags orphan locks, matching-identity mismatches, terminal claims with retained locks, and unresolved attempted claims lacking a matching target lock. It continues to refuse any automated repair, retry or receipt authorization.

### Operator inspection

`node scripts/docker-lab-recovery.mjs --strict-inventory`

The output retains the original `lockCount` for **agent locks** and adds `containerLockCount` and `totalLockCount`. Each claim adds `containerLockPresent`; the report also lists bounded `containerLocks`, each with its fingerprint and exact claim correlation. The same maximum **100 total files** applies; extra files are a hard error, never an incomplete success.

An orphan container lock with no journal may mean the signed agent died **between atomic target lock acquisition and journal reservation**. It must remain untouched pending an independently approved local process and container-state review. **Do not remove it simply because there is no matching journal.**

### Boundaries and remaining risk

This OS lock coordinates only processes using **the same trusted operator-owned, private local journal directory and the same underlying filesystem**. It does **not** prevent another Unix user, a different host, a different configured HOME, a non-ETERNYX Docker CLI process, or a separate Docker daemon from modifying the container. Independent physical isolation, OS access controls, host-level single-operator procedure, real signed-agent staging exercises and separate release approval remain mandatory. No production capability has been enabled.

The server-signed permit, rootless/Unix-socket/image/policy pins, Phase 29 last-moment drift checks, durable terminal-only reporting, and Docker-free `--resend-receipt` mode remain in place.

### Offline regression

`node --test tests/docker-container-lock.test.mjs`

The tests use actual owner-private, fsynced files and an independent Node child process to verify OS-level `O_EXCL` across different agent IDs. They also test terminal-only release, UNKNOWN lock retention, tamper/symlink/permission refusals and strict inventory correlation. **No actual Docker daemon is contacted or mutated in CI.**

Merge only once all dedicated, full CI/build/browser, SQL and security checks are green. Real isolated-host approval remains a separate release gate.
