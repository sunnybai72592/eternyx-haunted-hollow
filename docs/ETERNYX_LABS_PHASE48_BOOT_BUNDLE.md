# Phase 48 — authenticated fixed guest boot bundle

PR #816 merged at 7ae51312c116064975f755f49eb14ca4a32143a6; all three associated PR workflows passed.
Operator reports the manual module plan passed, but actual final JSON was not
retrieved. The preparation reruns signed archive and immutable kernel proof,
driver classification and exact module planning in one private workspace.

Main-only workflow: LABS authenticated guest boot bundle.
Approval: I_APPROVE_AUTHENTICATED_GUEST_BOOT_BUNDLE.

Direct built-in profile needs no initrd. Modular profile requires built-in
devtmpfs, confirmed MMIO command-line device enumeration, complete hard
dependency closure and no unreviewed firmware or soft dependencies. The same
MMIO requirement applies to direct boot. If unsupported, stop; no fallback
kernel or silent driver assumptions.

For modular mode, verify selected archive module bytes against the plan,
decompress known compression formats with file and time limits, retain
module signatures, and build fixed numbered newc entries in dependency-first
order. Static bootstrap PID 1 only loads these exact files in the guest,
then mounts devtmpfs and the fixed ext4 root read-only, chroots and executes
/sbin/init. No shell, generic module loader, arbitrary command or host module
loading. CI only compiles the bootstrap and tests its refusal outside PID 1;
actual guest module signature acceptance, block enumeration and filesystem
mount are unverified. The 32 MiB diagnostic rootfs is built in the same run.
Manifest binds kernel/config, module archive, rootfs and optional initrd
hashes; it is local build evidence, not independent image approval.

The workflow builds then deletes its disposable bundle. No artifacts
published, KVM started, packages installed, deployment, dedicated-host
acceptance or provider activation. Eight offline regressions. Next: consume
the same preparation within a separately approved real isolated rootfs/vsock
workflow, rehash all inputs at the privileged boundary, confirm liveness and
cleanup. Missing zstd/xz/gzip or unexpected module compression fails closed.

## Fortified compiler correction

PR #817 offline job 139250577118 passed seven module-plan tests and seven
of eight bundle tests; the static compilation failed with stderr hidden by
the command wrapper. Reproduced locally with GCC 14 and _FORTIFY_SOURCE=3:
ignoring write's warn_unused_result was rejected under -Werror. Check the
write result explicitly while retaining unconditional failure/reboot behavior.
Use one shared fortified compilation helper for build and test, preserve
-Werror, and surface bounded compiler stderr on failure. Locally verified
static C compilation for module counts 1, 2 and 64 and exit 1 outside PID 1.
Two new tests cover compiler diagnostics and invalid count rejection. Full
updated CI and live bundle preparation still require verification.
