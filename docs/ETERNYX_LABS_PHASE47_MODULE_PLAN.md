# Phase 47 — authenticated guest module dependency planning
PR #815 merged at 12463ead4b7a48c318c08997edb6c663d094df1f; all four PR workflows passed. Operator reports the
manual driver workflow passed. Actual driver classification JSON is not yet
available to this change. A successful driver audit is not compatibility proof.

New manually approved main-only workflow: LABS authenticated guest module
dependency plan; I_APPROVE_AUTHENTICATED_GUEST_MODULE_PLAN.
It reruns exact signed archive/kernel provenance and the Phase 46 driver
classification. Built-in-only profiles need no module plan. Unavailable or
unknown required drivers, or absent module/initrd support, report blocked.
For modular profiles, reuse the authenticated exact-version modules tar
within the same private inspection or independently authenticate it.
Index only the exact release's lib/modules or usr/lib/modules kernel paths,
reject duplicate/unsafe members, read bounded modules.builtin, extract only
selected module files to a private temporary directory, and use modinfo
against those explicit files to verify name and matching kernel vermagic.
Resolve hard dependencies in dependency-first order, bounded to 64 modules,
16 MiB per file and 64 MiB total; report hashes and firmware/soft dependency
review flags. No host module loading, package installation, module execution,
VM launch, user payload, provider activation, paid resources or deployment.

The exact module names/layout and toolchain support must still be confirmed
by the live workflow. Missing modules (including those in separate packages),
unexpected archive layout, ABI mismatches or dependency cycles fail closed.
The plan does not prove module signature acceptance by the guest kernel,
firmware readiness, complete soft dependencies or a successful guest initrd.
Next step: prepare a verified initramfs for modular profiles or boot the
fixed ext4 image directly if all required drivers are built in. Real vsock
and dedicated hardware acceptance remain pending. Seven new offline tests.
