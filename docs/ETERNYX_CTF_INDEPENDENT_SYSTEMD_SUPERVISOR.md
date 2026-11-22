# ETERNYX Labs — Independent Offline Firecracker Supervisor

**Status: local Linux-only operator integration; no paid/public infrastructure enabled.** This milestone implements a real systemd-run/systemctl system-service boundary and operator commands, but CI uses a **simulated systemd command runner**, not a real Firecracker jail or KVM VM.

## What changes from PR #401

PR #401 created an actual Firecracker Unix API boot controller that would not boot without an independent supervisor. This PR adds a Linux systemd-backed supervisor class implementing `guardian.attest`, `guardian.armTimeout`, `guardian.terminate`, and `guardian.verifyDead`, plus an explicit `launchJailer` method. **It does not invoke bootJailedMicrovm automatically**. Existing `ETERNYX_RANGE_RUNTIME=firecracker` remains blocked; there is no cloud or public-facing route.

## Eight improvements in one release

1. **systemd-owned transient jailer service:** fixed deterministic `eternyx-fc-cr-<uuid>.service` name and exact reviewed jailer executable/arguments, with real `systemd-run` and `systemctl` subprocess commands. Shell execution is disabled; all command inputs come from a validated session and fixed allowlist.
2. **Independent 900-second deadline:** systemd `RuntimeMaxSec=900s`, `KillMode=control-group`, `SendSIGKILL=yes`, `TimeoutStopSec=5s`, `Restart=no`. The service manager, not a Node timer, retains timeout and kill responsibilities if the parent controller crashes. The VM must not boot until `guardian.armTimeout(900)` confirms active unit settings.
3. **Resource bounds:** systemd `MemoryMax=402653184`, `TasksMax=64`, `CPUQuota=100%` alongside the pre-existing Firecracker jailer cgroup v2 limits; the supervisor re-reads systemd properties to reject unbounded or modified units.
4. **Offline network enforcement:** the operator pre-creates `/run/netns/eternyx-cr-<uuid>`. The supervisor inspects interfaces using `ip -j -n <namespace> link show` and requires **exactly one loopback interface**. Any `eth0`, TAP, veth, unexpected link type or unverified namespace fails preflight and re-attestation.
5. **Cryptographic executable and guest integrity:** operator-provided SHA-256 pins for `/usr/local/bin/jailer` and `/usr/local/bin/firecracker`; root-owned non-symlink regular files with no group/world write, single link and bounded size are streamed and checked for concurrent mutation. Existing guest `vmlinux.bin` and `rootfs.ext4` hashes are checked again before a service can start.
6. **Operator auth and kill switch:** separate root-only local env opt-ins, existing host launch-halt file, no inherited cloud/service secrets in subprocess environment, no remote Docker, no arbitrary machine IDs. The CLI supports `--status UUID`, explicit `--terminate UUID --confirm`, and `--halt-new-launches --confirm`.
7. **Fail-closed lifecycle/recovery:** never overwrite an existing/foreign systemd unit. Every ambiguous launch error triggers supervisor-owned stop plus proof of empty service cgroup; otherwise it raises an operator intervention error. Termination never directly guesses or signals PIDs and refuses foreign systemd units.
8. **Adversarial CI:** test the exact systemd command contract, runtime/CPU/memory/PID attestation, hostile network interfaces, no opt-ins, nonroot requests, service collision, changed namespace during launch, orphan cgroup processes, foreign service stopping, and mock systemd crash/recovery. Tests never run a real Firecracker VM or access paid/cloud APIs.

## Safe operator commands

Read-only service status:

```bash
npm run range:microvm:supervisor -- --status 123e4567-e89b-42d3-a456-426614174001
```

Emergency halt of new launches (requires Linux root and both local approval env values):

```bash
sudo --preserve-env=ETERNYX_FIRECRACKER_HOST_EXECUTION,ETERNYX_RANGE_OPERATOR_ACK \
  npm run range:microvm:supervisor -- --halt-new-launches --confirm
```

Stop a known, attested VM service:

```bash
sudo --preserve-env=ETERNYX_FIRECRACKER_HOST_EXECUTION,ETERNYX_RANGE_OPERATOR_ACK \
  npm run range:microvm:supervisor -- --terminate YOUR_SESSION_UUID --confirm
```

Required opt-ins: `ETERNYX_FIRECRACKER_HOST_EXECUTION=operator_approved` and `ETERNYX_RANGE_OPERATOR_ACK=LOCAL_ONLY_NO_PUBLIC_INGRESS`. No command in this PR auto-creates a jailer, hosts public lab traffic or deploys VMs.

## Host prerequisites still requiring independent confirmation

- A dedicated, patched KVM Linux machine with systemd, cgroup v2, Firecracker and jailer installed under their pinned exact paths; an **offline network namespace** created and reviewed by a privileged operator. Host identity and named namespaces must be protected from untrusted modifications.
- A verified, separately signed Firecracker kernel/root filesystem build that boots and supplies only authorized vsock services. Hash matching by itself does not prove code safety.
- Careful end-to-end review of `systemd-run`/jailer argument compatibility, the life cycle of jailer `--new-pid-ns` children, actual cgroup and namespace membership, the service's `ExecStart` formatting, and crash recovery on a disposable physical KVM host. GitHub CI validates the expected command contracts with mocks; **no actual host process was run in CI**.
- A **root-owned host security boundary** beyond the Node service. This implementation tests a named namespace for only a loopback interface, but host-root compromise, namespace replacement after inspection, file swapping by root, systemd manager faults or malicious vsock servers remain outside this guarantee.
- A separate provider with actual billing caps/kill switch, network egress quotas, and authenticated TLS user access is still absent. Existing PostgreSQL reservations are not a hard provider bill ceiling.

## Verification

```bash
node --test tests/ctf-firecracker-systemd-supervisor.test.mjs
npm test
npm run build
```

Dedicated GitHub Action: **CTF Independent Firecracker Systemd Supervisor**, along with the existing Firecracker Unix controller, hosted spending, worker fencing, local Docker isolation, watchdog and full browser acceptance checks.

References: [Firecracker Jailer](https://github.com/firecracker-microvm/firecracker/blob/main/docs/jailer.md), [Firecracker production host setup](https://github.com/firecracker-microvm/firecracker/blob/main/docs/prod-host-setup.md), [systemd transient services](https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html), [systemd service runtime deadlines](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html).
