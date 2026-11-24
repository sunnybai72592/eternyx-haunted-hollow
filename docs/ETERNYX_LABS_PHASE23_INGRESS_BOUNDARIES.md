# LABS Phase 23 — loopback ingress fail-closed hardening

The operator-local prototype still binds to 127.0.0.1 only. Its verifier
accepts exactly the reviewed isolated staging Edge Function URL. The
production ref, alternate hosts, credentials in URLs, redirects and
arbitrary destinations are rejected. No provider or access flag is enabled.

The verifier requires an exact 200 JSON no-store response with one boolean
authorized field, or a denied 403. Its streamed response is capped at
1024 bytes. The fixed localhost gateway response is streamed with a 32 KiB
cap; redirects are refused, never followed. Header and request timeouts,
a 32-connection limit, deadline checks and forced socket closure on stop
bound local resource usage. Only the fixed gateway credential is forwarded;
the user JWT and access grant remain at the ingress authorization boundary.
Canonical path validation rejects normalized path aliases.

Focused CI uses actual localhost HTTP for gateway/ingress tests and an
injected verifier transport; it does not deploy or reach staging. This is
not a public ingress, TLS termination, multi-tenant routing or proof of
hosted isolation. Do not deploy publicly. The two access Edge functions
and worker remain undeployed in staging under the approved Phase 19 scope.
Live secret/account configuration and independent provider approval remain
required. No new SQL, production mutation or paid infrastructure.
