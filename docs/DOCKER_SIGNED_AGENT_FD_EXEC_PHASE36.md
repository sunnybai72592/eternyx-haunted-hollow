# Docker Phase 36 — execute the same verified CLI inode through fd 3

**Prerequisite:** Docker Phase 35 / PR #682 merged. Phase 35 verified the actual installed `docker` CLI through an independently supplied absolute-path and SHA-256 pin, but it then **closed the verified file and launched the original pathname**. A privileged or otherwise capable host process changing that pathname between verification and `spawnSync` could make the agent execute a different file. Root-owned, non-writable parents reduced that possibility but did not bind the *checked inode* to the one the kernel executed.

This phase closes the file-path lookup gap in the real signed agent on its explicitly approved **Linux** host.

## Implementation

1. `withPinnedDockerCliFile(env, callback)` opens the root-owned absolute CLI with `O_NOFOLLOW` and holds the original descriptor through the entire synchronous callback. It validates owner/permissions, canonical root-owned non-writable parent directory chain, bounded size, inode/device/ctime/mtime identity, the actual file bytes and the independently supplied full SHA-256.
2. **ELF-only CLI:** the verified executable must start with the Linux ELF magic bytes. Shell-script wrappers and shebang-style launchers are denied even if the operator accidentally pins their SHA-256. The independently reviewed host Docker CLI must be a native executable.
3. The agent calls `spawnSync("/proc/self/fd/3", args, ...)`, with `stdio:["ignore","pipe","pipe",verified.fd]`. Child fd 3 is an inherited descriptor for the same checked inode, and Linux resolves `/proc/self/fd/3` to **that open file**, not the original `PATH` or renamed source pathname. No fallback to the original pathname is allowed if proc-fd execution is unavailable.
4. This descriptor is closed in `finally`, whether the subprocess succeeds, fails, is timed out, cannot be spawned, or a verification/handler error occurs. Callbacks returning a Promise are explicitly rejected so an asynchronous worker cannot outlive the pinned descriptor.
5. The existing `verifyPinnedDockerCliExecutable(env)` remains a **read-only preflight** for `localContext()`. It shares the new verifier, but does **not** return a live file descriptor. Actual commands must use the descriptor-bound function.
6. The child environment remains restricted to `HOME`, `PATH=/usr/bin:/bin`, `LANG=C` and `LC_ALL=C`; no inherited user secrets, Docker override, loader variables, proxies, or shell interpolation. `stdin` is ignored, stdout/stderr bounded, and existing command timeout preserved.
7. Offline regression tests use a harmless, root-owned ELF available on Linux GitHub runners (e.g. Git or Bash), **never Docker**. They actually execute `--version` through inherited fd3, verify that a renamed/replaced pathname still runs the original inode, ensure descriptors close on success/error, reject hash mismatch, reject asynchronous callback escape, check exact source integration, and rerun Phase 26–35 safety suites. Tests do not contact Supabase or mutate a live Docker container.

## Separate operator requirements

`ETERNYX_DOCKER_AGENT_CLI_PATH` and `ETERNYX_DOCKER_AGENT_CLI_SHA256` remain mandatory independent operator-provided pins, in addition to the rootless daemon/context/socket/image/policy pins and short-lived Ed25519 signed permit. No host configuration is auto-created and no production execution is enabled.

The descriptor bind addresses a local executable **rename/replacement** race. It does not prove the trustworthiness of a compromised root/kernel, Docker CLI dependencies or its ELF interpreter, managed Docker configuration and plugins, the remote Docker daemon, or the underlying physical isolation. This is not Linux `fexecve(2)`, a kernel code-signature enforcement facility, an isolated-host staging acceptance, or proof that the Docker mutation actually happened. Root-owned library/interpreter and Docker config provenance remain independent release concerns. Failures retain the existing Phase 26–35 UNKNOWN/manual recovery protections; there is no automatic Docker retry, receipt fabrication, or cleanup.
