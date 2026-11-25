# Phase 53 — live fixed HTTP security exercise acceptance
PR #829 merged at ae5d3f642eab677e55ac31ba69ada655e2f62a3b; all nine associated PR workflows passed.
Build the opt-in exercise rootfs within the authenticated kernel/module
preparation path. Its distinct bundle schema cannot be consumed by the
ordinary diagnostic or dedicated diagnostic pilot. The live exercise
entrypoint explicitly opts into the exercise schema and reuses same-run
bounded artifact copies, kernel pin and rootfs/initrd hash checks.

Manual main-only workflow LABS live HTTP security exercise acceptance:
I_APPROVE_EPHEMERAL_HTTP_SECURITY_EXERCISE. Two existing fresh liveness
challenges precede six HTTP exchanges (five routes plus post-rejection
health) and one invalid synthetic Host request. Require exact expected
synthetic response bodies, HTTP status codes, security headers and
bounded response EOF, with isolation re-attestation around each exchange.
Only local UDS/vsock; no TCP, arbitrary URLs, user data or external
requests. Reuse scoped guest kill, cgroup/namespace/jail cleanup and
unchanged rootfs check. Final exercise report appears only after cleanup.
The six fixed acceptance assertions are not learner grades.

Seven new offline tests (real socketpair framing, time/size bounds and
mock exchange ordering), plus actual image build and existing contracts.
No live KVM in PR jobs. Manual live execution, real dedicated hardware,
independent image review, provider runtime, authenticated learner
sessions, grading and quotas remain pending. No paid infrastructure,
deployment or public activation.
