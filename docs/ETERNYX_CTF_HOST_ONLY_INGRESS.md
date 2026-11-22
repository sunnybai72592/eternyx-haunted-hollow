# ETERNYX Cyber Range — Host-only Ingress, Zero Published Docker Ports

**Status: local/staging-only Linux Docker operator prototype. NOT safe to expose publicly or sell as a hosted multi-tenant service.**

## The actual problem solved

PR #370 put the vulnerable challenge target and authenticated gateway on internal-only Docker networks while introducing a tiny separate ingress container on an Internet-routable Docker bridge for localhost publishing. That bridge still creates a possible outbound path if the ingress relay is exploited. This milestone removes that routable bridge and the relay container entirely.

## Current topology (two Docker containers, two internal bridges)

- **Challenge target `http-range`**: fixed local-only HTTP practice target, joined to `local_target_only` and no other network, no published ports. The private gateway credential is never in its environment.
- **Authenticated gateway `gateway`**: joined to `local_target_only` and `gateway_ingress_only`. Both Docker bridge networks are `internal: true`, and neither service has a published Docker port. Only this gateway receives the per-session 256-bit random private bearer.
- **Trusted Linux host relay (outside Docker)**: a Node listener bound strictly to `127.0.0.1:<ephemeral port>` inside the trusted provider process. It never accepts a user-selected upstream or DNS address. Instead, it verifies a gateway container ID, image/service label, private RFC1918 address and exact internal Docker subnet, then connects only to the verified gateway on internal port 8081. Every forwarded request re-checks Docker identity/IP before use.

The host relay uses an exact allowlist of challenge routes/methods, bearer verification with a timing-safe comparison, request/response size ceilings, no automatic redirect following, and constant sanitized error output. It forwards the gateway bearer only to the fixed authenticated gateway, never directly to the vulnerable challenge service.

## Eight improvements

1. Removed ALL Docker host port publishing and the Docker-side ingress relay service; no managed container gets a public or NAT-enabled bridge.
2. Both remaining networks are `internal: true`, with exact live Docker inspect attestation that fails if any container joins another network or publishes any port.
3. Added per-session trusted Linux host relay with fixed private upstream and localhost-only binding; Windows/macOS Docker Desktop paths are rejected by the operator start flow rather than assumed compatible.
4. Validates the upstream private IPv4 address against Docker `IPAM.Config.Subnet`, project UUID, container ID and internal bridge metadata. Public, link-local metadata, loopback, broadcast, network and malformed IP addresses are denied.
5. Revalidates gateway identity and private address **on every authorized request** so a stale host proxy cannot silently point to a newly assigned Docker endpoint.
6. Host relay starts only after a verified two-container Compose startup. A process crash removes the in-process host listener; a subsequent worker cannot claim a stale Docker range is healthy and instead reconciles it.
7. Updated host admission to **3 labs / 576 MiB container RAM / 1.95 vCPU reserved**. All Docker resource/privilege/mount checks remain live, and the dedicated orphan watchdog recognizes only the two known managed services.
8. Replaced former relay acceptance with a real Linux Docker integration test that starts **two independent private ranges**, verifies per-instance flag/token separation through the host relay, checks zero Docker exposed ports, and asserts both the target and gateway cannot reach the Internet or cloud metadata address. CI always tries to clean its disposable stacks.

## Operator limitations

**Only Linux hosts with locally routable Docker internal bridge addresses are eligible.** Host-to-container routes on Docker Desktop Windows/macOS vary and are deliberately unsupported in this prototype. Do not silently fall back to publishing a port, switching to network host mode, running a privileged helper or attaching a public network.

**No public exposure or financial activation.** This milestone commits code and CI only; it does not deploy a daemon, publish an endpoint, activate Supabase provider flags, create paid cloud infrastructure or charge a customer.

**Not complete microVM isolation.** All lab containers still share the Docker host kernel, and a privileged host process has access to the Docker socket. Host-root compromise, container escapes, abused host loopback processes and host firewall rules remain material risks. Public hosted multi-tenant labs require independently audited VM/microVM isolation, deny-by-default host egress policies, incident monitoring, budget-enforced cloud provisioning, TLS session ingress and abuse controls.

**Host listener lifecycle is temporary.** The Node host relay exists only while the trusted provider process is alive. It is not persisted or recreated from the Supabase database. On a crash, the successor must terminate/reconcile stale containers, then launch a fresh session with a new private token. This is intentionally fail-closed.

## Verification

Run `node --test tests/ctf-range-isolation-attestation.test.mjs`, `npm test`, `npm run build`, and on a disposable Ubuntu Linux runner the **Managed Cyber Range Isolation Smoke** workflow. The workflow uses explicit CI-only operator opt-ins, creates real local Docker projects, runs HTTP verification through the host relay, performs outbound/metadata denial tests and cleans up all lab projects.

**Separate existing workflows** cover the read-only watchdog, operator-approved emergency cleanup, PostgreSQL worker fencing, and the original developer-local lab. All must remain passing.

## Next real-world release gates

1. Hardened per-lab microVM isolation or an equally strong independently audited sandbox, plus host-level deny-by-default outbound policies.
2. TLS browser-native session ingress and documented user ownership/expiry/revocation semantics.
3. Cloud-provider enforced hard spending limits and egress/network billing caps, including cancellation and emergency host shutdown controls.
4. Host observability, off-host alerts and an operator-reviewed production threat model before any public use.
