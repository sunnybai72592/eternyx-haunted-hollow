# ETERNYX Labs — Three-Zone Network Segmentation

**Local / staging training-range hardening only. The vulnerable HTTP challenges remain disabled for public hosted access. No paid infrastructure is created or started by this PR.**

## Why the architecture changes

The previous managed range correctly kept the intentionally vulnerable target on a Docker internal bridge, but its authenticated gateway also joined a regular bridge for localhost port publishing. The gateway could therefore have outbound network access. Simply marking the published bridge as `internal` may break host port publishing on recent Docker versions. This PR avoids that tradeoff by separating local port publishing from the authenticated gateway.

## Three services, three network boundaries

1. **`http-range`**: intentionally vulnerable challenge target, connected **only** to `local_target_only` (internal bridge); no host ports or internet route, no gateway token or Supabase credentials.
2. **`gateway`**: secret-bearing authenticated and fixed-destination request forwarder, connected to two **internal** bridges (`local_target_only` + `gateway_ingress_only`). It has no published port and no non-internal bridge. Only this service receives the 256-bit managed gateway token.
3. **`ingress`**: minimal fixed-destination relay, connected to `gateway_ingress_only` and a second standard `localhost_ingress` bridge. **Only this service publishes** `127.0.0.1:<ephemeral-port>` mapped to container port 8081. It holds no private gateway bearer or service-role secret. All authorized learner requests must pass through the separately authenticated localhost API proxy and managed gateway.

An external observer cannot pick the relay's destination. Its upstream is a hardcoded `http://gateway:8081`; requests are limited to a fixed GET/POST route allowlist with strict body/response caps. It does not follow gateway redirects or forward arbitrary learner headers.

## Eight changes in the milestone

1. Three-network Docker Compose redesign separates vulnerable target, authenticated gateway, and published relay.
2. Secret-bearing gateway has no published port and no network with ordinary outbound NAT. Both of its attached Docker networks are `internal: true`.
3. A small non-root, read-only, resource-limited relay maintains existing localhost operation without exposing a selectable upstream URL.
4. The gateway accepts the exact Docker-internal `gateway:8081` Host only in managed mode; developer-mode localhost Host checks remain unchanged.
5. Actual Docker inspect attestation verifies all three containers, exact service names, two internal bridge networks, one externally connected relay bridge, loopback-only port, and real resource/privilege constraints.
6. The local capacity envelope is explicitly recalculated for three services: **224 MiB, 0.75 vCPU and 104 PIDs per lab**, with a hard local maximum of three labs (672 MiB, 2.25 vCPU). Existing zero-default daily session launch budgets remain.
7. The independent orphan watchdog understands the third service, continues to refuse unknown project members, and still preserves unrelated Docker containers on emergency cleanup.
8. Real disposable Docker CI checks localhost token isolation and two independent training labs, target and gateway external egress refusal, cloud metadata refusal, live runtime attestation, and emergency cleanup. Unit tests cover unsafe mounts, network drift, public gateway ports, relay SSRF, wrong tokens and resource exhaustion.

## Reproducible checks

`node --test tests/ctf-range-isolation-attestation.test.mjs`; `npm test`; `npm run build`.

GitHub workflows: **Managed Cyber Range Isolation Smoke**, **CTF Watchdog Local Docker Smoke**, **Cyber Range Local Docker Smoke**, **CTF Worker Fencing and Resource Budgets**.

The real Docker checks must establish that the target and authenticated gateway cannot fetch `https://example.com` or the cloud metadata endpoint `http://169.254.169.254/latest/meta-data/`, while the operator's localhost-published relay still responds to valid private gateway tokens.

## Important limitations

- The narrow `ingress` relay still has a Docker bridge with external routing to support host localhost port publishing. Its code makes only fixed upstream requests; the bridge is not an OS-level egress-deny policy on the relay. An exploited relay could still reach outbound destinations. A dedicated sandbox host with enforceable host-firewall egress policy and independent microVM isolation is needed before public multi-user release.
- Plain local HTTP is not an Internet-facing TLS transport. Browser-native secure ingress, hardened per-user TLS sessions and audit trails must be addressed before real hosted access.
- Host-level resource caps and prior reservation budgets are not actual cloud monetary spending limits. No infrastructure cloud billing controls are activated.
- No Supabase secrets are passed into the vulnerable target or relay. Secret-bearing gateway is isolated on internal Docker bridges. The Docker socket is never mounted into any service.
- Existing operator kill switches and manual watchdog apply approval remain in force. Merging does not automatically create a daemon, VM or scheduled task.
- If the real Docker smoke or browser acceptance tests fail, investigate and fix those failures before merging. The design must not turn egress testing off to get green checks.

## Next release gates

Operator-reviewed hardened microVM (or equivalent security isolation), network firewall policies blocking arbitrary relay egress, trusted monitored host provisioning, live metered cloud budget enforcement, and audited browser-native TLS authorization. Public activation stays disabled until these gates pass.
