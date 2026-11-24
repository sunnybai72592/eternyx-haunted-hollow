# Phase 36 — GitHub-hosted runner KVM capability discovery

The operator has limited local storage and requested GitHub Actions instead
of installing Ubuntu. Run **LABS GitHub runner KVM capability** on main with
`I_APPROVE_READONLY_KVM_PROBE`. Standard ubuntu-24.04 only; no larger or
self-hosted runner, no credentials, sudo, packages or guest downloads.
Standard Actions usage remains subject to the repository's existing quota.

The probe checks a real character device, opens it with no symlink following,
checks the opened identity, and invokes only KVM_GET_API_VERSION (0xAE00).
API version 12 is a candidate capability signal; it does not test VM creation,
nested virtualization execution, Firecracker/jailer startup, guest services,
expiry, namespaces, teardown or host isolation. A successful workflow with
a negative probe is a successful inspection, not successful hardware acceptance.

If KVM is unavailable, keep hardware acceptance pending. If available,
review the runner's suitability and pinned guest/kernel/binaries before a
separately approved hardware test. Do not treat a shared ephemeral CI runner
as the dedicated operator-controlled host required by the current harness.
All provider and production release gates remain false. No staging changes.

## Phase 37 — distinguish ordinary user from administrator access

Operator-supplied Phase 36 output: all seven contract tests passed;
KVM character device detected but open returned access_denied. Firecracker
and jailer were absent. This is not hardware acceptance.

For one separately consented diagnostic, select
`I_APPROVE_PRIVILEGED_READONLY_KVM_PROBE` on main. The ordinary probe runs
first, followed by exactly the same API-version-only probe under GitHub's
documented passwordless sudo for its standard Linux VM, with a cleared
environment and isolated system Python. No device chmod, group membership
change, packages, VM creation, or KVM access from pull-request CI.
The effectiveRoot field distinguishes reports. Even a successful
administrator API probe is not proof of nested guest execution or a
dedicated operator-controlled host. If administrator access is denied,
stop this approach; do not weaken runner security. No paid runner or
staging/production changes.

Reference: https://docs.github.com/en/actions/reference/runners/github-hosted-runners#administrative-privileges
