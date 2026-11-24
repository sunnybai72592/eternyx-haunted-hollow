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
does not boot a guest or install packages. It uses the fixed historical guest
package identity and immutable observed pin, then uses isolated APT
configuration and fresh authenticated Ubuntu noble archive metadata, restricted
to the independently published 2018 Ubuntu archive primary signing key. The downloaded exact version's SHA256
and size must match the signed archive index. Extract only the exact regular
kernel member from a bounded tar stream written to a private temporary file.
Its SHA256 must match the immutable Phase 41 prior pin. Current runner bytes
are a separately reported comparison, not a guest selection input.
No automatic pin update, unsigned sources, packages installed, root archive
extraction, staging/production mutation, dedicated host, or provider activation.

Sources: https://documentation.ubuntu.com/security/common-mistakes/deb-download-archive/
and https://manpages.ubuntu.com/manpages/noble/man8/apt-secure.8.html.

Trust remains scoped to the pinned Canonical archive signing key and the hosted
runner's GPG, APT and dpkg toolchain; not an independently attested host. A
retired pinned package version, unavailable authenticated archive or archive
kernel hash mismatch fails closed. A different current runner kernel is not
a failure of historical guest provenance. Do not substitute a different version or
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

## Runner independence correction after PR #808

The next live run stopped at the current runner hash drift guard, before
archive authentication. The exact historical identity had already been
reported by the prior hash-matching run: 7.0.0-1014-aws,
linux-image-7.0.0-1014-aws, 7.0.0-1014.14~24.04.1, amd64.
Fix these literals, not the current runner's uname/dpkg owner, as the only
archive download selection. The independently authenticated archive member
must still hash to the unchanged Phase 41 digest. Record current runner
release and optional observed hash; report runnerKernelIndependentlyPinned
only if it matches. phase41GuestKernelIndependentlyPinned is the separate
historical provenance result. Do not allow an unobserved or different runner
to be described as independently pinned. No host boot or installation.
No silent fallback, unsigned sources, relaxed freshness checks, or automatic
repin. If the exact version is no longer published, use a separately reviewed
Ubuntu snapshot (https://ubuntu.com/server/docs/how-to/software/snapshot-service/).
Dedicated hardware and provider activation remain false.

## Archive path correction after PR #809

Live operator output confirmed runner independence (AWS guest, Azure host),
exact signing-key fingerprint and successful APT update, before the filename
validator rejected the matching metadata record. The prior keyring inode
was root-owned mode 0777, explaining the earlier permission predicate failure;
trust now rests on the exact pinned signing fingerprint, not file mode.
The previous filename grammar excluded the legitimate Debian version character
~ in the pinned 7.0.0-1014.14~24.04.1 version. The rejected raw filename was not
logged. Admit ~ within strictly bounded relative pool paths with regular .deb
suffixes; continue rejecting traversal, empty components, URLs, percent
escapes, whitespace, query/fragment delimiters and backslashes. Add four
regression tests including the exact historical package/version filename
fixture. Log successful signed metadata selection, downloaded digest/size
verification and extracted kernel hash separately. These logs are diagnostics,
not a release approval. The immutable kernel pin, exact signer, authenticated
metadata and package integrity gates remain unchanged. Live download and
kernel member equality are not yet verified.
