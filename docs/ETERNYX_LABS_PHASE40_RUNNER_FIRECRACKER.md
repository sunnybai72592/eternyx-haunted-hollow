# Phase 40 — fixed diskless Firecracker boot diagnostic

Operator-supplied Phase 39 logs from 4ce9a914417f366e353e3aa222064572a9b9582c:
real KVM guest instructions, HLT and descriptor cleanup succeeded.
Phase 39 PR merged with applicable CI green.

Run LABS ephemeral Firecracker diskless boot on main with
I_APPROVE_EPHEMERAL_FIRECRACKER_BOOT. The runner downloads only the official
v1.18.0 x86_64 archive, pinned to its GitHub release API size (7606252 bytes)
and SHA256 (1ac8eec866dd5eea14efecf6323e22b23eea24054545338a5b34bc5bca6623cd).
Exact regular ELF members only, no archive path extraction. Source:
https://api.github.com/repos/firecracker-microvm/firecracker/releases/tags/v1.18.0

The ephemeral guest uses the runner's existing Linux kernel, hashed at runtime
but NOT independently pinned, and a locally compiled fixed initramfs with only
a console and a marker-writing rebooting init. No ISO, packages, disk drives,
NICs, vsock, host filesystem passthrough, external user guest input or API.
Firecracker retains default seccomp, runs as non-root with only the KVM group
inside a new network namespace, no new privileges or ambient capabilities.
If host kernel is absent/incompatible, device group unsuitable, network
namespace creation fails, boot times out, exit is nonzero, or marker missing,
the job fails. No fallback to root Firecracker or weakened permissions.

Success means actual Firecracker guest init and clean process exit on that
runner only. Jailer is extracted and version-reported but NOT used in this
diagnostic. It is not dedicated host, independent provenance, jailer/cgroup
isolation, expiry or production acceptance. All provider gates stay disabled.
No credentials, staging changes, new infrastructure or charges beyond
existing standard Actions usage. PR tests do not download or execute a VM.
Known legacy gitlink cleanup warnings are unrelated; no global repo change.
