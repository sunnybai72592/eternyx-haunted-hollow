# Docker Phase 35 — pin the actual local Docker CLI executable

**Prerequisite:** Phase 34 / PR #677 merged. Prior phases pin the server-signed Ed25519 permit, rootless Docker daemon and Unix socket, target image/security policy, exact container ID, last-moment lifecycle, recovery locks, journal, and receipts. But `scripts/docker-lab-agent.mjs` still used `spawnSync("docker", args)`: an operator's `PATH` could select a different executable with the same name. A fake CLI could print plausible pinned daemon metadata and undermine those checks **before any authorized Docker mutation**.

Phase 35 changes the real signed-agent subprocess entry point. It adds **two independently provided operator pins** and checks the exact installed CLI on **every** Docker subprocess call, not just startup.

## Required explicit host configuration

On an independently approved, physically isolated, non-root operator Linux host:

- `ETERNYX_DOCKER_AGENT_CLI_PATH=/usr/bin/docker` — replace with the **actual root-owned, absolute, non-symlink file path** for that host's reviewed Docker CLI binary.
- `ETERNYX_DOCKER_AGENT_CLI_SHA256=<lowercase-full-64-hex-SHA256>` — independently verify the hash of **that exact binary** as part of the operator release/attestation process. Do not copy an unreviewed hash or auto-trust one calculated after a compromise.
- Continue configuring the existing separate `ETERNYX_DOCKER_AGENT_CONTEXT`, `ETERNYX_DOCKER_AGENT_ENDPOINT`, `ETERNYX_DOCKER_AGENT_DAEMON_SHA256`, `ETERNYX_DOCKER_AGENT_IMAGE_SHA256`, and `ETERNYX_DOCKER_AGENT_POLICY_SHA256` values. **The binary pin does not replace Engine or image pins.**

There is no default CLI path or hash. Missing or inconsistent values deny Docker execution. The pinned path and its entire parent directory chain must be real (not symlinks), owned by root and not group/world writable. The executable itself must be root-owned, non-group/world-writable, executable, and at most 256 MiB. These are deliberately restrictive requirements; installation through a symlinked path or an operator-owned binary needs a distinct reviewed system installation, **not a bypass**.

## Actual agent behavior

1. Validate both the existing independent Docker Engine/target pins **and** the new exact CLI pin before the first Docker subprocess.
2. Immediately before **every** `docker context show`, `docker context inspect`, `docker info`, `docker container inspect`, and `docker container start/stop/restart`, open the absolute CLI file using `O_NOFOLLOW`; re-verify it is still root-owned, regular, non-writable and bounded, hash its actual file bytes, and compare stat identities before and after inspection. Recheck parent directories.
3. Use `spawnSync(cli.path, args, { shell:false, env:childEnv })`, never `spawnSync("docker",...)` or shell interpolation.
4. Pass only `HOME`, `PATH=/usr/bin:/bin`, `LANG=C`, `LC_ALL=C` to the child. No arbitrary operator environment, `DOCKER_HOST`, `DOCKER_CONFIG`, loader variables (`LD_PRELOAD`/`LD_LIBRARY_PATH`), proxies or cloud secrets are forwarded. The operator `HOME` must itself be a real, non-group/world-writable owner-owned directory, because Docker contexts are read from the home configuration.
5. A missing/mismatched CLI, symlink, writable parent directory, unsafe HOME or changed hash **fails closed**. Existing pre-attempt/attempted UNKNOWN rules still decide whether the original recovery hold must remain; there is no retry, automatic lock removal, or false signed failure.
6. The Docker-free `--resend-receipt` path still **does not call** `localContext()` or `docker()`, so it requires no contact with the installed Docker executable. Its complete-history receipt check remains mandatory.
7. Offline CI verifies actual host-owned `/usr/bin/ls` as a harmless stand-in binary **without executing it**, wrong SHA, path traversal, writable/symlinked files and directories, minimal child environment, source ordering and disabled-mode refusal; it also runs prior signed Docker recovery suites. No test starts a Docker container or sends a cloud request.

## Remaining security boundaries

Root ownership and rehashing reduce the window for unprivileged substitution but **do not eliminate all time-of-check/time-of-use races**, kernel/root compromise or attacks through an unreviewed Docker CLI configuration, credentials or plugins. This pin is not a hardware/code-signing attestation and does not independently prove a Docker mutation happened. The isolated host, daemon/context configuration, file permissions, installed binary provenance and physical release policy must be reviewed together.

**No production deployment or live Docker agent execution is authorized by this PR.** CI remains networkless/offline for Docker tests, and production host verification must be performed independently before any separate controlled enablement.
