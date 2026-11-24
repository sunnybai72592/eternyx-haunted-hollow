# Phase 46 — authenticated kernel driver classification
PR #813 merged at 6a5ed4a22f1eaad90f0b99c53268b721e5a9d186, all five PR workflows successful.
Actual ext4 image and extracted static service were built/tested. No real
rootfs boot or vsock yet.

Run the new LABS authenticated kernel driver audit on main after merge with
I_APPROVE_AUTHENTICATED_KERNEL_DRIVER_AUDIT. The Phase 42 provenance routine
first authenticates the exact signed image package and unchanged kernel hash.
The audit reads the fixed boot/config member if present, or a directly
embedded IKCONFIG gzip marker if present, or the exact same-version
linux-modules package from authenticated metadata. The fallback is bounded
and rechecks package size/digest before reading only the exact config member;
it does not install or load modules. A compressed kernel may not expose the
embedded marker directly; missing exact authenticated config fails closed.
No current-runner config, alternate version, arbitrary URL or unsigned fallback.

Classifies eight required driver config symbols as built-in y, module m,
disabled n or unknown; also records optional command-line enumeration,
module and initrd support. A green audit means evidence was collected, NOT
that the minimal guest is compatible. requiredBuiltInDriversPresent is the
actual profile outcome. A modular driver requires separately authenticated
modules and a boot-time load plan, or a new reviewed kernel. Even all y is
only configuration evidence: actual device enumeration, root mounting and
vsock service still require a live isolated guest. No VM, production, paid
resources or dedicated-host acceptance. Seven new offline tests.

## Modules archive size correction after PR #814

Operator log independently authenticated the image package (16,695,418 bytes,
SHA256 bb4e1aae90d41945b100459233ee440c3494e019467f9a2e60ec931f988cf00b)
and exact immutable kernel SHA256. Config fallback reached the exact modules
metadata but failed the generic image package size predicate. Actual modules
size was not printed, so exceeding the 128 MiB cap is likely, not established.
Retain the original 128 MiB compressed/256 MiB tar image limits; only the exact
historical modules package may use a separate 512 MiB compressed and 2 GiB
uncompressed budget. Check free workspace capacity, enforce child file-size
limits on download and decompression, verify exact signed package size/hash,
and log selected size and digest. No module extraction to the host filesystem,
installation or loading. The configuration member remains limited to 2 MiB.
Four new offline regressions; live config availability and compatibility remain
pending. If the larger limits are exceeded, stop and review the observed size.
