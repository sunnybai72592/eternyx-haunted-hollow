# Phase 52 — first bounded HTTP security exercise image
PR #825 merged at 0c346f0180ecedfba7c5362e3f4948327b36f78a; four associated PR workflows passed. Dedicated host
has not been accessed. Keep provider and learner execution gates closed.

The separate opt-in rootfs build adds an actual static HTTP/1.1 responder
to the existing fixed guest PID1 vsock listener. The default diagnostic
profile still accepts only its prior liveness protocol. Exercise profile
accepts five exact synthetic requests, returning health/profile 200,
admin 403, missing route 404 and unsupported method 405 with Allow: GET.
The content type, no-store and nosniff headers are observable. Exact
request framing excludes arbitrary URLs, methods, body, user-supplied
headers, filesystem paths and pipeline data in the same frame. No TCP
listener, IP networking, real data or vulnerable host service. This is
a constrained HTTP protocol fixture, not a general HTTP server.

    umask 077
    work="$(mktemp -d)"
    python3 -I -B scripts/labs-build-fixed-guest.py --http-exercise "$work/rootfs.ext4"

CI builds actual ext4 images, checks the compiled/extracted static init,
runs five real response fixtures and verifies the local six-question
feedback contract, negative framing, response lengths and compatibility
with the existing diagnostic challenge. Local evaluation uses observed
response bytes, not a protected account grade. Eight new offline tests.
The profile has distinct build evidence including header source digest.
Do not relabel this as existing provider http-basics-v1 or use its digest
to bypass independent review. Live exercise vsock transport, approved
bundle integration, dedicated host, protected grading and quotas remain
unverified. Next: explicitly bind exercise profile to authenticated bundle,
verify actual HTTP exchange in the isolated guest, and integrate protected
learner/session grading only after dedicated runtime acceptance.
No deployment, host provisioning or paid resources.
