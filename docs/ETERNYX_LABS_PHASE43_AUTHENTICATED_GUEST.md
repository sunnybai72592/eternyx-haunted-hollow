# Phase 43 — one-run authenticated immutable guest lifecycle
PR #810 merged at 274771a39d0b6eb2290d0b8606a44348a5bedb85. Both PR workflows succeeded. The operator reports
the main-only provenance workflow passed; the final manual run JSON has not
been independently retrieved in this change. Phase 41 live isolation and
cleanup were established by the previously supplied detailed operator logs.

New main-only manual workflow: LABS authenticated immutable guest boot.
Approval: I_APPROVE_AUTHENTICATED_IMMUTABLE_GUEST_BOOT.
It uses Phase 42 signed Ubuntu metadata, exact package version, full
signing-key fingerprint, package size/digest and immutable kernel equality,
then exports the single validated kernel member to a private runner directory
without installing it. Export is hashed again and atomically published without
overwriting. The root Jailer supervisor copies the input to its private
workspace and rechecks the immutable kernel pin before either VM starts.
Both existing fixed guests must pass all Phase 41 live evidence and cleanup.
No host kernel substitution; no user payload, guest networking, API, disk,
vsock, provider activation, deployment, or dedicated hardware acceptance.
This is a hosted diagnostic, not a production execution service.

Three additional offline regressions cover immutable export and overwrite
refusal, mismatched bytes and nonprivate parents, and required pin at root
boot boundary. Existing workflows retain their prior default behavior.
If exact signed package is unavailable, fail closed; no unsigned fallback.
Only the authenticated workflow plus real lifecycle log establishes the
combined acceptance; passing PR tests is insufficient.
