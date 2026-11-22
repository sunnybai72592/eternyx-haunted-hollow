# ETERNYX Cyber Range — Runtime Isolation Attestation

**Status: trusted-operator local/staging Docker hardening. No public multi-tenant workload approval.**

## Why this milestone matters

Earlier PRs added worker fencing, daily 15-minute reservation limits and a separate cleanup watchdog. The next failure mode is Docker configuration drift: a Compose file can be secure while a running container is unexpectedly privileged, exposes a target port, has no resource limits, or attaches to an unapproved network.

This milestone validates **the actual running Docker container and network inspections**, not the desired YAML alone, before acknowledging a lab as ready.

## Delivered improvements

1. **Read-only runtime security attestation:** the operator inspects Docker HostConfig, Config, State, mounts, port bindings and attached networks. Exactly two managed services must match one validated UUIDv4 lab project. Only sanitized pass/fail summaries are returned; secrets and raw Docker inspect output are never logged.
2. **Resource cgroup checks:** target memory 128 MiB, gateway memory 64 MiB, no additional swap, bounded 0.40 + 0.25 vCPU and 48 + 32 process limits. Actual Docker cgroup settings must match these configured upper bounds or the attestation fails.
3. **Privilege and filesystem checks:** non-root UID/GID, read-only root filesystem, dropped ALL capabilities, no-new-privileges, no added privileges, no devices/bind/volume mounts, no host PID/IPC/user/network namespace, no dangerous security-option overrides, no unexpected restart policy.
4. **Network and published-port checks:** the vulnerable HTTP target must attach only to a Docker internal bridge and publish no host ports; gateway must attach only to the expected two bridges and publish exactly one loopback-only port. Network metadata must confirm the target bridge is internal.
5. **Startup admission gate:** before launching, the local operator refuses a fourth managed lab or an existing project with the same session ID. Maximum reserved local footprint: 3 labs, 576 MiB container memory, 1.95 vCPU and 240 bounded PIDs. This is a local resource envelope, **not cloud billing enforcement**.
6. **Live health attestation:** every provider health check on a running gateway re-inspects the actual isolated Docker services. Unexpected drift throws a fail-closed error rather than silently treating the target as healthy; the operator must investigate before resuming service.
7. **Read-only host audit:** `npm run range:audit -- --json` audits current verified managed projects without starting or deleting containers. Each project gets only an ID and pass/fail flag; a drifted project causes a nonzero exit status. No Supabase secrets or network access are required for the audit.
8. **Real and synthetic security tests:** Node tests perturb resource limits, privilege flags, mounts, networks, port bindings, target secrets and local capacity; a real disposable Docker GitHub workflow starts a managed stack, checks its actual running limits/ports/networks and attempts blocked target internet egress while leaving unrelated containers alone.

## Operator commands

Read-only audit on a trusted private Docker test host:

    npm run range:audit
    npm run range:audit -- --json

Existing worker is still separately disabled until both local execution acknowledgements and operator-approved database gates are intentionally configured. Adding this code does not start Docker, enable any paid cloud VM, or turn on public hosted labs.

## Limits and security caveats

- Docker containers **are not** a guaranteed security boundary for adversarial internet-facing multi-tenancy. Production needs audited microVM or equivalent independent kernel isolation, deny-by-default egress, separate host identity and operational review.
- The target has an internal Docker network; the gateway has a second bridge for its localhost-exposed service. This PR **does not prove that the gateway lacks outbound Internet access**. Its attack surface must be addressed before launching public hosted labs.
- The local three-lab memory/CPU cap is enforced only for the operator-managed Docker runtime. It is not a host-wide resource/cgroup scheduler or monetary charging cap. Existing zero-default daily database admission budgets remain.
- An unexpected running-container mutation will cause the provider to fail closed; it does **not** authorize removing Docker projects with unverified labels or unknown additional services. The dedicated watchdog remains read-only by default and requires operator approval for destructive cleanup.
- This audit can only inspect Docker state when the daemon is reachable. It is not a background service, external watchdog, real-time stream, off-host alerting service, or guarantee of host-crash recovery.
- Docker inspection fields may vary across engines/platforms. If a legitimate supported engine reports different data, review its exact inspect schema and tests before updating the policy; never silently ignore missing host-security fields.
- Cloud budgets, browser-native secure HTTPS ingress, host networking restrictions and isolation validation in a hardened staging VM remain separate milestones.

## Review gates

Run `node --test tests/ctf-range-isolation-attestation.test.mjs`, `npm test`, and `npm run build`. The GitHub **CTF Watchdog Local Docker Smoke** workflow exercises `scripts/cyber-range-isolation-audit.mjs --json` against a real managed Docker stack, verifies the target's external network fetch fails, confirms that the unrelated Alpine container survives emergency cleanup, and deletes all temporary resources on completion.

Review before deployment: exact source-to-container privileged capability map, rootless/user-namespace isolation, Docker default seccomp and AppArmor protection, gateway outbound egress, locally scoped admission policies, and tested emergency teardown. Do not activate production/public access based only on this PR.
