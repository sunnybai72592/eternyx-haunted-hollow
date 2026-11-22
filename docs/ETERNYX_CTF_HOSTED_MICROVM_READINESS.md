# ETERNYX Labs — Hosted MicroVM Readiness and Signed Spending Guard

> **Pre-provisioning safety controls only.** No real Firecracker microVM, cloud VM, provider billing API, internet-facing target, automatic daemon or paid infrastructure is installed or activated by this milestone. The existing Linux/Docker localhost operator path remains the only implemented runtime and is disabled unless separately opted into.

## Purpose

The lab prototype now has two private Docker networks, zero Docker-published ports and a trusted Linux-host relay (PR #374). Its next step toward an eventual hosted platform must not silently create internet-facing workloads or open-ended cloud costs. This PR makes unapproved hosted execution **explicitly impossible** through the existing provider runtime and gives future trusted adapters precise validation contracts.

## Eight improvements

1. **Pinned microVM workload policy:** `validateMicrovmManifest` rejects unknown challenge packs, image names, hypervisors, unsigned/missing kernel and rootfs SHA-256 *identifiers*, mutable rootfs, multiple vCPUs, unbounded RAM, runtime beyond 900 seconds, metadata access, host TCP ingress, non-jailer operation, snapshots and arbitrary extra fields. Its approved profile is Firecracker / 1 vCPU / 256 MiB / max 900 seconds / vsock-only ingress / deny-all egress. **Important:** checking a manifest's hashes is not the same as verifying actual guest boot artifacts or auditing a launched VM.
2. **Exact canonical signed provider quote:** future trusted provider adapters must supply an Ed25519 signature over exact provider quote fields, including a session UUID, fixed image identifier, nonce, USD price components and timestamps. Quote JSON must contain no extra/missing fields.
3. **Pinned verification key:** the trusted operator must independently pin the SHA-256 fingerprint of the quote issuer's Ed25519 public key. A valid signature from a caller-supplied arbitrary public key is rejected. Quote freshness is limited to 60 seconds from issue and at most a five-minute signed validity window.
4. **Integer-only spending estimate:** quoted worst-case 15-minute cost is calculated in micro-USD via BigInt ceiling arithmetic for CPU, 256 MiB RAM, 256 MiB storage, 64 MiB quoted network egress and fixed costs. Negative, fractional, NaN, infinity, oversized or unsupported fields are refused. This is an **estimate based on a signed quote**, not actual metered billing.
5. **Zero-default budget boundary:** a prelaunch evaluation refuses a quote unless explicit per-session and rolling-24-hour USD micro-unit caps permit it after including *both* completed and reserved amounts. The returned object never grants cloud provisioning; it explicitly says `providerHardLimitVerified:false` and `cloudProvisioningAllowed:false` until a real off-host provider enforcement layer exists.
6. **Read-only Firecracker/KVM host probe:** `npm run range:microvm:preflight -- --json` inspects Linux/CPU architecture, CPU virtualization, read-write `/dev/kvm` access, cgroup v2, and locally installed executable Firecracker and jailer binaries. `--require-kvm` is strict and exits nonzero if any prerequisite fails. It downloads and runs nothing.
7. **Explicit hosted-runtime denial:** the existing `scripts/cyber-range-provider.mjs` and `LocalDockerRangeRuntime.start()` reject any `ETERNYX_RANGE_RUNTIME` value other than `local-docker`. Selecting `firecracker`, `cloud`, or an unrecognized runtime cannot quietly run the old Docker code.
8. **Real regression tests and no-cost CI:** `tests/ctf-range-hosted-readiness.test.mjs` tests cryptographic tampering, wrong keys, changing session ID and price, replay-window expiration, exact math boundaries, cumulative budget exhaustion, policy drift, KVM probe failures and blocked provider selection. The GitHub `CTF Hosted MicroVM Readiness and Signed Spend Guard` workflow tests these with a disposable locally generated signing key. It doesn't call a cloud service or mount `/dev/kvm`.

## Operator command

    npm run range:microvm:preflight -- --json

To fail if local prerequisites are unavailable:

    npm run range:microvm:preflight -- --require-kvm

This is a **capability report**, never an authorization to create paid services. `readyForPublicHostedLabs` remains unconditionally false; neither local KVM nor a valid quote alone implies secure multi-tenant deployment.

## Required before integrating any real paid provider

- A separately audited **microVM runner** using the Firecracker jailer, verified pinned kernel/rootfs artifacts, safe cgroup and namespace configuration, unique per-session identity and a host-level deny-by-default network/metadata firewall.
- A trusted provider-quote issuer and operator-pinned signing key distributed outside learner input. Quote and nonce must be bound to an **atomic persistent** reservation ledger preventing quote replay or concurrent over-commit. The arguments in the current pure function are not a trustworthy ledger themselves.
- Cloud-provider hard spending ceilings, quota and stop APIs, automated timeouts, continuous reconciliation of actual charges, egress/volume/snapshot accounting, and a real operator kill switch. No price estimator or reservation alone can prevent unexpected provider charges.
- Authenticated browser TLS access, abuse/rate limits, per-account session ownership, logging that does not leak secrets, monitoring and an independently audited production threat model.

Firecracker official references:

- Getting started and KVM prerequisites: https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md
- Production host and jailer setup: https://github.com/firecracker-microvm/firecracker/blob/main/docs/prod-host-setup.md
- Jailer operations: https://github.com/firecracker-microvm/firecracker/blob/main/docs/jailer.md

## Test commands

    node --test tests/ctf-range-hosted-readiness.test.mjs
    npm test
    npm run build

Also require the existing GitHub actions **Managed Cyber Range Isolation Smoke**, **CTF Watchdog Local Docker Smoke**, **CTF Worker Fencing and Resource Budgets** and **Cyber Range Local Docker Smoke** to remain green. Even if all checks pass, public/paid hosting stays OFF until the remaining cloud-provider controls are implemented and independently validated.
