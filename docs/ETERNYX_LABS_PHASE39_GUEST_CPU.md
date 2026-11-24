# Phase 39 — minimal real KVM guest execution on GitHub Actions

Operator supplied successful Phase 38 logs from merged commit
5154664001cc651819563bfed76501553e194f7f: 15 regression tests,
KVM API 12, empty VM creation and descriptor closure. No Firecracker
or actual guest execution had yet been demonstrated.

Run LABS ephemeral KVM guest CPU execution on main with
I_APPROVE_EPHEMERAL_KVM_GUEST_CPU. This is an opt-in standard x86 Ubuntu
runner diagnostic, not a persistent or dedicated host. It opens one
verified KVM character device, creates one VM, registers one 4 KiB page
and one vCPU, and executes a fixed four-byte real-mode instruction
sequence. It requires the HLT exit and exact register result. Unexpected
exit or failed cleanup returns nonzero. Internal alarm and outer timeout
bound execution; neither success nor failure launches a network service.
No arbitrary guest code, image download, network, filesystem passthrough,
guest input, disk, Firecracker, credentials, cloud resources, or staging
and production changes. No privileged pull request tests.

The offline contract compiles with warnings as errors, checks four result
predicates, and denies an unapproved execution. It does not run KVM.
The manual workflow is the only intended real execution path.

A successful guest CPU report proves a small KVM guest execution on that
runner, not Firecracker boot, isolation, namespace policy, guest service
or 900-second expiry. Dedicated trusted host evidence is still required
for the production acceptance gate. No provider activation.
