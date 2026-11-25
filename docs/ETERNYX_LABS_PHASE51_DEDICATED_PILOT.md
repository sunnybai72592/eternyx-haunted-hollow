# Phase 51 — first dedicated fixed diagnostic pilot

PR #819 merged at b8abae5a762fb3329ea19aa03ac15b78da8c41a4; all three associated PR workflows succeeded.
Operator reports the short hosted crash watchdog passed. Manual final JSON
not independently obtained. No dedicated host is accessible.

The audit's next priority is an actual dedicated session. Do not provision
a paid host or turn on any remote provider. Use an existing separately
approved disposable physical x86_64 Linux/KVM machine only. This is the
fixed Phase 49 read-only diagnostic service, not the existing provider's
HTTP challenge pack or full learner runtime. Its full-duration timer is
the Phase 50 independent timer, not the provider's RuntimeMaxSec service.

On a separate trusted preparation machine, with the reviewed repository
checkout, build as an unprivileged user:

    umask 077
    work="$(mktemp -d)"
    python3 -I -B scripts/labs-prepare-authenticated-guest.py "$work"
    curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --max-time 60 --max-filesize 7606252 --output "$work/release.tgz" 'https://github.com/firecracker-microvm/firecracker/releases/download/v1.18.0/firecracker-v1.18.0-x86_64.tgz'
    sha256sum "$work/bundle.json"

An independent reviewer must inspect source commit, toolchain and signed
archive provenance, actual rootfs/initrd, configuration, and manifest;
retain the manifest SHA256 externally before transfer. A hash alone does
not establish reviewer identity or independent origin. Securely transfer
the exact bundle to the dedicated host. Install reviewed pinned binaries
manually according to Phase 44; do not use an untrusted checkout as root.
Use a reviewed root-owned non-writable checkout on the dedicated machine.
No network download is performed by the pilot. Stop existing runtime
selection and verify host exclusivity before running.

First run the existing read-only Phase 44 inspection:

    sudo /usr/bin/python3 -I -B scripts/labs-dedicated-host-readiness.py --inspect I_CONFIRM_DEDICATED_OFFLINE_LABS_HOST_INSPECTION

Then run one fixed session with the actual external bundle SHA256:

    sudo /usr/bin/python3 -I -B scripts/labs-dedicated-fixed-pilot.py --session I_APPROVE_DEDICATED_FIXED_LAB_SESSION /absolute/path/to/bundle REVIEWED_MANIFEST_SHA256

Only after reviewing successful boot and cleanup, separately approve the
full-duration crash drill:

    sudo /usr/bin/python3 -I -B scripts/labs-dedicated-fixed-pilot.py --expiry I_APPROVE_DEDICATED_FIXED_900_SECOND_CRASH_DRILL /absolute/path/to/bundle REVIEWED_MANIFEST_SHA256

The runner refuses CI/container/detected VM contexts and active runtime
flags, checks physical readiness before mutation, uses a root-only
advisory lock for this one pilot, refuses remnants from prior diagnostics,
copies bounded inputs to private root workspace and verifies the external
manifest pin and all bundle hashes before KVM. The same fixed service
must pass two vsock challenges and teardown. The separately approved
expiry mode observes the actual 900-second independent timer after
controller SIGKILL; a 75-second result cannot pass it. Keep the original
operator logs and external pin; independent reviewer must verify them.
If any leftover resource is detected, stop and investigate, never delete
unknown resources automatically. The persistent lock file is intentional;
it is not a guest resource and must not be removed while held.

No learner accounts, public ingress, provider state or production changes.
No automatic host provisioning or paid infrastructure. CI runs offline
tests only. Even a successful dedicated fixed diagnostic does not
establish independent physical identity, independent image provenance,
actual provider hardware acceptance, concurrent capacity or learner
lifecycle. Next: use reviewed host evidence to accept the existing provider
harness with a real approved challenge image; then staging account,
provision/reset/expire/grade/quota acceptance and measured capacity.
