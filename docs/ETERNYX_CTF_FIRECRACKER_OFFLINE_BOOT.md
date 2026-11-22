# ETERNYX Labs — Offline Firecracker Boot Controller

**Stage: trusted-Linux-operator integration only. No Firecracker VM or cloud instance is started by the repo's normal app/server, the CLI, or CI. Public cyber range and paid hosted runtime remain OFF.**

## What this milestone actually implements

The prior work (PRs #374, #383 and #396) made local Docker labs private and added Ed25519 quote validation plus atomic PostgreSQL spend reservations. This change adds an **actual Firecracker HTTP-over-Unix-socket controller** that can configure and issue `InstanceStart` to an **already launched, independently supervised jailed** microVM. It does not itself create the privileged jailer, host namespace or cloud infrastructure.

## Eight improvements

1. A strictly validated 1-vCPU / 256-MiB / 900-second Firecracker boot plan with exact known endpoints: `/machine-config`, `/boot-source`, `/drives/rootfs`, `/vsock`, and `/actions` `InstanceStart`.
2. Deterministic per-session jail roots and a per-session vsock CID. The pinned root filesystem is mounted as a read-only virtio root disk; no TAP, virtio-net, metadata API, cloud IP, public TCP port, or snapshot endpoint is configured.
3. Actual on-disk SHA-256 streaming verification of jailed `vmlinux.bin` and `rootfs.ext4` against the immutable manifest. Files must be regular, single-linked, non-writable, appropriately size-limited, and opened with `O_NOFOLLOW` to reject symlink traversal.
4. A genuine Node `http.request` over the jailed Unix socket `/run/firecracker.socket`: fixed API paths, bounded request/response sizes, strict HTTP 204 status, short local timeout, sanitized failures and no DNS/TCP fallback.
5. A boot authorization boundary requiring an **independently managed trusted supervisor** to attest the jailer, owner, per-VM cgroup, host network denial, cloud-not-enabled state, and independent watchdog. A 900-second kill deadline must be armed *before* any boot API request.
6. Re-attestation before every API write and fail-closed behavior on any partial configuration, unexpectedly lost HTTP response or changed host network policy. All failures request termination and require positive proof that the VM is dead.
7. A non-executing hardened jailer argument contract with dedicated UID/GID range, pre-existing isolated network namespace, Linux cgroup v2 memory/CPU/PID limits, no daemonization, new PID namespace and fixed Firecracker binary paths. These arguments are **not yet applied to a live jailer**, and a host auditor must still verify owner/paths/binaries, process-group cleanup and cgroup kill behavior.
8. A read-only operator command and dedicated CI acceptance testing actual Unix-socket request/response transport against a synthetic Firecracker API server, pinned guest image enforcement, no networking, supervisor failure, mandatory kill confirmation and safe error reporting.

## Read-only operator verification

On an operator-maintained Linux host with pre-staged immutable guest images:

```bash
npm run range:microvm:plan -- \
  --session 123e4567-e89b-42d3-a456-426614174001 \
  --kernel-sha YOUR_VERIFIED_64_HEX_KERNEL_SHA256 \
  --rootfs-sha YOUR_VERIFIED_64_HEX_ROOTFS_SHA256 \
  --uid 22001 --gid 22001
```

This command validates files under `/srv/eternyx-firecracker/firecracker/cr-<session-without-hyphens>/root/` and prints the planned requests and immutable jailer arguments. It **does not** run the jailer or start a VM.

## Independent host supervisor requirement

Because Firecracker jailer `--new-pid-ns` may spawn a child and there is no general-purpose safe `StopInstance` operation comparable to `InstanceStart`, the operator MUST own the actual PID/cgroup cleanup. This PR deliberately does not include an unsafe `kill(pid)` guess, automatic service creation, privileged host command, or a public controller endpoint.

A future externally audited supervisor must verify that the guest is in its own cgroup, that its binary/guest image provenance is pinned, that network isolation and metadata denial are enforced independently of guest configuration, and that a **durable** 900-second kill deadline survives controller and worker crashes. The interface is `guardian.attest`, `guardian.armTimeout`, `guardian.terminate`, `guardian.verifyDead`. Only then can `bootJailedMicrovm` write the real `InstanceStart` action.

## What remains unverified

- An actual KVM guest has **not** booted in GitHub CI. The test server emulates only Firecracker's HTTP response protocol, not kernel execution, KVM, guest vsock services, jailer privileges or hardware virtualization.
- The current immutable hashes are manifest pins verified on local disk, not verified signatures from an independently controlled image repository; image build/approval and supply-chain provenance still need a separately audited path.
- No real host supervisor implementation or persistent kill watchdog is installed in this PR, and a successful `guardian.attest` callback is not independently proven by this module.
- A guest with vsock can still interact with host-side listeners an operator exposes; access must be narrowly bound to an audited host gateway and never expose cloud metadata or a shell.
- There is no installed off-host provider hard spending limit. The reservation ledger only constrains ETERNYX-side quoted/estimated spend and cannot prevent external provider charges.
- The existing `ETERNYX_RANGE_RUNTIME=firecracker` execution path remains disabled; merging this PR does not enable production or hosted VM starts.

## Tests

`node --test tests/ctf-firecracker-boot-controller.test.mjs`

`npm test`

`npm run build`

GitHub Actions: **CTF Firecracker Jailed Offline Boot Controller** and existing hosted-readiness, hosted-spend-SQL, managed Docker, watchdog and full browser CI checks.

## Primary Firecracker references

- https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md
- https://github.com/firecracker-microvm/firecracker/blob/main/docs/jailer.md
- https://github.com/firecracker-microvm/firecracker/blob/main/docs/vsock.md
- https://github.com/firecracker-microvm/firecracker/blob/main/docs/prod-host-setup.md
- https://github.com/firecracker-microvm/firecracker/blob/main/src/firecracker/swagger/firecracker.yaml
