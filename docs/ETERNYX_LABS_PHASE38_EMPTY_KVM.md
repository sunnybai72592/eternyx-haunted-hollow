# Phase 38 — empty KVM lifecycle on standard GitHub-hosted Ubuntu

Operator supplied Phase 37 logs: eight tests passed, ordinary access
denied, administrator KVM API version 12 returned. Firecracker and jailer
absent. The API result does not establish actual guest execution.

Run LABS ephemeral empty KVM lifecycle on main, explicitly selecting
I_APPROVE_EPHEMERAL_EMPTY_KVM_VM. Standard runner only; existing Actions
quota applies. The approved mode uses KVM_CREATE_VM once, machine type 0,
only after checking API version 12 and the device identity. Close both
descriptors before reporting success. No vCPU, memory mapping, guest code,
network, process fork, packages, images, external service, provider or
production changes. A nonzero result or cleanup failure is not acceptance.

Reference: https://docs.kernel.org/virt/kvm/api.html

This is NOT Firecracker/jailer or physical host acceptance. CI tests are
mocked and only the manual main workflow calls the real lifecycle.
A standard ephemeral runner does not substitute for the dedicated trusted
host and signed evidence demanded by the production gate.
