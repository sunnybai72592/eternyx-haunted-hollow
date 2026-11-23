# Docker Phase 32 — durable local journal filenames and original-agent-lock identity

**Prerequisite:** PR #650 merged. Phases 26–31 introduced an UNKNOWN-outcome hold, strict double-read inventory, independently pinned rootless Engine/target, exact last-moment inspection, exclusive per-container locks, and a legacy unresolved-claim fence. The underlying `src/lib/dockerLabRecovery.mjs` used `fsync()` on the newly created file but did not sync the **parent directory entry** for new agent locks and claim journals. It also released the per-agent lock by pathname with a private-file check, without comparing its original inode and contents.

These gaps matter after a crash: a surviving durable `attempted` append is not enough if the newly created `claim-<uuid>.jsonl` filename was not durably linked. Similarly, pathname-only unlocking is weaker than the Phase 30 per-container lock's identity guard.

## Changes to the real local recovery layer

1. **New agent lock persisted as a file *and* a directory entry.** After the exclusive `O_CREAT | O_EXCL | O_NOFOLLOW` creation and checked full-length write, fsync the lock file, close it, then fsync the operator-private journal directory. Fail closed if either step fails; never clean up an uncertain file.
2. **New claim reservation receives the same durable namespace barrier.** The signed agent does not proceed to the first read/attempt until `reserveLabClaim()` has synced both its reservation bytes and its parent directory entry. Filename reservation remains permanent and O_EXCL; no retry or reuse.
3. **Exact original agent-lock release.** Capture the original file device/inode, size, mtime/ctime, private owner and full bytes after durable creation. Before release verify the original inode and complete canonical bytes through an `O_NOFOLLOW` file descriptor, then recheck the pathname. Replaced, edited, symlinked or public locks are never automatically removed.
4. **File-write error is explicit, not a false fsync success.** Check that each `writeSync()` wrote the full intended byte count before `fsyncSync()`. An incomplete record remains a hard error; the caller's original agent lock stays held for review.
5. **Safer journal reads and appends.** Read through `O_NOFOLLOW | O_NONBLOCK` owner-private descriptors, recheck device/inode/size/mtime/ctime before and after the read and verify no path substitution occurred. On appending, bind the target to the stat-checked file descriptor and reject a write that would exceed the strict 16 KiB file limit. A changed journal is not valid evidence of a terminal outcome.
6. **Durable namespace deletion for completed agent locks.** After the caller's explicit safe-release policy and original-lock validation, unlink the original agent lock, then fsync its parent directory. There is no automatic stale-lock collection.
7. **Crash-like child process and tamper tests in dedicated offline CI.** A separate Node process persists a lock and attempted-only claim, exits without cleanup, and a new process proves that duplicate reservations remain blocked, without a Docker daemon. Also test same-path inode replacement, byte modifications, symlinks, public modes, malformed partial journals and correct attempted/completed/receipt event order.

## Scope and remaining limits

These changes harden the *operator-owned local filesystem* durability story; they do **not** guarantee durability on filesystems or storage devices that dishonor fsync barriers, protect against a compromised operator account, or prove physical isolation of Docker Engine. There is a short inevitable check/unlink race against another process running with the same Unix account. Shared host ownership and an externally approved isolated-rootless-host protocol remain mandatory.

`--resend-receipt` remains Docker-free. The existing no-retry UNKNOWN hold, same-container history quarantine, Ed25519 pinned permit checks and detached production enablement remain intact. CI never invokes the real Docker CLI from the agent.

### Offline verification

```sh
node --test tests/docker-durable-journal-fsync.test.mjs
node --test tests/docker-lab-recovery.test.mjs
node --test tests/docker-container-lock.test.mjs
node --test tests/docker-signed-container-history-fence.test.mjs
```

A successful offline test and green CI **do not** constitute production authorization, an interrupted-power hardware test, or independent live Docker agent acceptance.
