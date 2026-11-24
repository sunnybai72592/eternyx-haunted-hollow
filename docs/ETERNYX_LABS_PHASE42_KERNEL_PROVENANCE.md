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
to the independently published 2018 Ubuntu archive primary signing key. The downloaded exact version's SHA256
and size must match the signed archive index. Extract only the exact regular
kernel member from a bounded tar stream written to a private temporary file.
Its SHA256 must match both the observed bytes and the immutable prior pin.
No automatic pin update, unsigned sources, packages installed, root archive
extraction, staging/production mutation, dedicated host, or provider activation.

Sources: https://documentation.ubuntu.com/security/common-mistakes/deb-download-archive/
and https://manpages.ubuntu.com/manpages/noble/man8/apt-secure.8.html.

Trust remains scoped to the pinned Canonical archive signing key and the hosted
runner's GPG, APT and dpkg toolchain; not an independently attested host. A newer runner kernel,
retired package version, unavailable authenticated archive, unsupported package
owner or mismatch fails closed. Do not substitute a different version or
unverified mirror to obtain a green result. If the package is retired, obtain
a reviewed signed Ubuntu snapshot reference as a separate follow-up.
Live archive verification and dedicated hardware acceptance remain pending.
Existing Jailer workflows and release gates remain unchanged.

## Keyring preflight correction after PR #807

Operator log identified 7.0.0-1014-aws, linux-image-7.0.0-1014-aws,
7.0.0-1014.14~24.04.1, then failed the local keyring inode/ownership/mode
predicate. The exact failing attribute is unknown. Treat the installed
public keyring bytes as untrusted input, read only a bounded regular file
(even when the fixed path is a symlink), snapshot in a private workspace,
require the published full primary fingerprint
F6ECB3762474EDA9D21B7022871920D1991BC93C, and restrict APT Signed-By to
that exact primary signer (!), not the entire keyring. No keys imported into
system trust and no authentication or freshness checks bypassed. If Canonical
rotates the signer, stop for independent review. References:
https://wiki.ubuntu.com/Security/FAQ and
https://documentation.ubuntu.com/security/software-integrity/image-verification/.
Record original file UID/mode/symlink status for diagnosis; use the actual
runner username for APT sandbox configuration. Live archive proof pending.
