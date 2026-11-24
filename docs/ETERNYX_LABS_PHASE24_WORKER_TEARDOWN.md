# LABS Phase 24 — worker teardown proof

Phase 23 merged with all seven applicable checks passing, including real Docker
integration. This change hardens existing local-only worker operations without
deploying or enabling anything.

* Validate the complete fenced inventory before mutating any runtime.
* Refuse duplicate sessions and queued rows in the worker's active inventory.
* Never report terminal state if local stop does not return strict true.
* Attempt scoped cleanup even when Compose up fails after partial creation.
* Recheck the local halt switch after Compose up and before returning readiness.
* Verify every exact-project container's managed identity before Compose down,
  including unlabelled project members, and refuse changed membership.
* Do not request orphan or volume removal. The managed template defines no
  named volumes. Check the exact project for residual containers after down.
* Watchdog passes the verified container ID set, then independently rescans.
* A dangling halt symlink is treated as halted; sync the marker before success.

Focused regression tests use injected worker/runtime contracts. Existing
Docker CI checks actual local container behavior. The exact-project checks
are not atomic against independent Docker administrators. Host operator
trust remains mandatory; network-only orphan discovery and stronger
resource-specific teardown attestation remain separate follow-up work.
A successful cleanup does not establish hosted VM isolation. No public
ingress, production change, paid infrastructure or live staging write.
