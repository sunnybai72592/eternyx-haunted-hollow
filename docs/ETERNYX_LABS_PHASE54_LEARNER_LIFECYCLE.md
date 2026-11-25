# Phase 54 — learner reservation lifecycle
PR #833 merged at a26609b87c9bce02b6a4b6a590e346b60c789902; all six associated PR workflows passed.
Operator reports the manual live HTTP exercise passed; final JSON not
independently obtained. Dedicated runtime and protected grades remain gated.

This change improves the existing authenticated reservation dashboard:
key the entire private subtree to account identity, invalidate unmounted
actions, refresh visible idle tabs every ten seconds and on resume/reconnect,
show a device-clock countdown without fabricating server expiry, explain
pending cleanup, and offer a deliberate fresh reservation only for a
server-reported terminal session and a ready provider with no active
reservations. The action uses the original server quota-checked request,
not an automatic reset or a reused session identifier. Provider access
remains disabled by the current hosted access contract. No new DB,
functions, migrations, provider state, ingress or billing changes.
Seven source/pure contract tests. Browser acceptance and real authenticated
staging verification remain pending. These changes do not implement
server grading or prove actual workload reset, account access or cleanup.
Next: protected assessment ledger and server-side learner/session binding
once runtime acceptance and authorized staging configuration are available.
