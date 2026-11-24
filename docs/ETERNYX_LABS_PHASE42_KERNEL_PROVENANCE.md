# Phase 42 — independently authenticated guest kernel provenance

PR #806 merged at fffb2d3b78eea078cf65e625713b1e711e741d97.
Operator-provided Phase 41 output shows two fixed Jailer guests completed,
normal child exit 0, forced SIGKILL -9, all eleven isolation checks in both,
and owned resource cleanup. The /run noexec diagnosis was confirmed.
The runner kernel SHA-256 observed in both Phase 40 and 41 is
a6a897d3b8c177c8736e8bce85b6b9cd8e3275f94107221ee93820fcd5388384.
This is a reviewed immutable equality target, NOT yet vendor provenance.

After merge, dispatch LABS independently authenticated kernel provenance on
main with I_APPROVE_EPHEMERAL_KERNEL_PROVENANCE. This separate diagnostic
does not boot a guest or install packages. It reads the runner kernel and
dpkg owner/version, requires the exact observed pin, then uses isolated APT
configuration and fresh authenticated Ubuntu noble archive metadata, restricted
to the installed Ubuntu archive keyring. The downloaded exact version's SHA256
and size must match the signed archive index. Extract only the exact regular
kernel member from a bounded tar stream written to a private temporary file.
Its SHA256 must match both the observed bytes and the immutable prior pin.
No automatic pin update, unsigned sources, packages installed, root archive
extraction, staging/production mutation, dedicated host, or provider activation.

Sources: https://documentation.ubuntu.com/security/common-mistakes/deb-download-archive/
and https://manpages.ubuntu.com/manpages/noble/man8/apt-secure.8.html.

Trust remains scoped to the hosted runner's preinstalled Ubuntu archive keyring,
APT and dpkg toolchain; not an independently attested host. A newer runner kernel,
retired package version, unavailable authenticated archive, unsupported package
owner or mismatch fails closed. Do not substitute a different version or
unverified mirror to obtain a green result. If the package is retired, obtain
a reviewed signed Ubuntu snapshot reference as a separate follow-up.
Live archive verification and dedicated hardware acceptance remain pending.
Existing Jailer workflows and release gates remain unchanged.
