# LABS Phase 25 — exact resource teardown and orphan recovery

Phase 24 passed nine applicable checks including real Docker emergency cleanup.
The managed Compose network template now carries a separate network ownership
marker. Local teardown verifies exact container and network IDs, network
ownership labels, expected names, internal local bridge topology and endpoint
membership before mutation. Unknown project volumes cause refusal rather than
deletion. Container removal targets only verified IDs; network removal targets
only verified IDs after confirming no endpoints remain. Both inventories must
be empty before the worker releases capacity. No broad Compose down, prune
or orphan removal is used in this runtime path.

The watchdog discovers network-only orphans, applies the same age/grace gate,
rechecks identity before mutation, and verifies disappearance afterwards.
New starts fail closed if orphan networks are present. Existing networks made
before the new marker was introduced are deliberately not automatically
adopted; a trusted operator must inspect and reconcile legacy resources.
The real Docker CI exercises an empty managed network and preserves an
unrelated network as well as an unrelated container. No new hosted
infrastructure, deployment, credentials or production changes.
A dedicated trusted host remains mandatory; independent Docker administrators
can race inspection and mutation, and hosted VM isolation is not certified.
