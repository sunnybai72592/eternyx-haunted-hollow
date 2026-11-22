# ETERNYX Cyber Range — Account-bound Access Foundation

**Status: developer-local/staging authorization prototype. Not a public cyber range.**

This milestone adds a complete request/verification policy for short-lived session-bound access, plus a localhost-only reverse proxy that can enforce the policy on every HTTP request. It is **disabled by default**, requires security-reviewed operator activation, and never starts a cloud VM or publishes a vulnerable target to the Internet.

## Architecture and trusted boundaries

1. A logged-in ETERNYX user calls the JWT-protected `ctf-range-access` Edge Function with `{action:'issue',sessionId:'...'}`.
2. The Edge Function confirms identity through `authenticateUser(req)`, generates 32 random bytes (`rx_` + 64 lowercase hex chars), hashes the opaque token using SHA-256, and calls the privileged `ctf_range_issue_access_grant` RPC with **JWT-derived** `user.id`.
3. SQL grants access only if the session belongs to that user, status is `running`, lifetime is unexpired, a trusted worker instance reference exists, and the provider is **enabled, ingress-approved and recently heartbeating**. At most 2 active credentials per user/session and 4 issue operations per rolling minute are permitted.
4. The user receives the raw opaque access token **once** (never logged or persisted in the DB); the database stores only its SHA-256 hash, session ID, owner ID and expiry. Grants expire no later than 60 seconds or the session deadline.
5. A dedicated trusted reverse proxy makes a POST to `ctf-range-access-check` for **every user HTTP request**. In addition to the session grant, the browser must supply its current ETERNYX Auth JWT in a separate request header. The proxy sends both through its **separate, server-only** `CTF_RANGE_PROXY_TOKEN` authentication channel; no public browser can call this verifier successfully.
6. The checker first revalidates the learner JWT against Supabase Auth, then hashes the opaque grant and calls SQL with the **verified Auth user ID**. SQL requires the grant owner to match that user on the specific session, and checks expiry, revocation, current running state and provider readiness. Another learner's valid JWT plus a stolen grant cannot authorize access to the original learner's lab.
7. The staging-only localhost ingress forwards approved requests to exactly one preconfigured **local** managed Docker gateway with a separate private per-container bearer. The browser's grant is never forwarded to the vulnerable target or gateway.

## Cost and production status

- Adding this PR does not start Docker, create paid compute, provision Supabase resources or activate any public user lab.
- Two secret environment gates default off: `CTF_RANGE_ACCESS_ISSUANCE_ENABLED` and `CTF_RANGE_INGRESS_REVIEWED` on the user-facing issuer. The checker separately requires `CTF_RANGE_PROXY_VALIDATION_ENABLED=true` **and** `CTF_RANGE_INGRESS_REVIEWED=true`. In addition, SQL requires the existing operator-approved provider with a live heartbeat.
- No user-facing public URL is issued; the Edge Function returns `hostedTargetUrl:null`. `/labs/sessions` remains honest about the unavailable hosted access.
- The localhost prototype binds only to `127.0.0.1`, has a 15-minute maximum runtime, restricts routes and HTTP methods, checks the learner grant on every request, blocks wrong Origin values, and caps request/response sizes.
- Production still requires hardened per-user sandbox isolation, a remote authenticated TLS proxy, distributed worker fencing, denial of metadata/internal network access, audit logs, session revocation latency tests, and strict infrastructure spend limits. **Do not set the operator gates in production yet.**

## Database changes

`supabase/migrations/20261122190000_ctf_range_access_grants.sql` introduces:

- `ctf_range_access_grants`: RLS enabled, privileges revoked from `anon` and `authenticated`, `service_role` only. Contains *only hashed* grant values.
- `ctf_range_issue_access_grant(user_id,session_id,token_hash)`: privileged atomic session ownership and provider-readiness checks, 60-second TTL, issuance and active-grant rate limits.
- `ctf_range_check_access_grant(session_id,verified_user_id,token_hash)`: privileged per-request Boolean verification; binds token to the exact session, independently authenticated account and current session state.
- `ctf_range_revoke_access_after_stop()` trigger: revokes grants when a running session leaves that state. The verifier also checks the session status and does not rely solely on the trigger.

## Safe operator inspection (does NOT start a vulnerable lab)

    node --test tests/ctf-range-access.test.mjs
    npm test
    npm run build
    npm run range:ingress -- --help

Run GitHub Actions workflow `CTF Range Access SQL Acceptance` for a **networkless disposable PostgreSQL 17 database**. The workflow creates synthetic accounts, applies the existing session-control migration and then the new access-grant migration, checks owner separation, short TTL, rate limits, stop revocation, operator kill switch, and disallows direct access from browser roles. The Node tests exercise the local HTTP ingress through a synthetic upstream without creating real Docker containers.

## Staging acceptance — do NOT use production

1. Review schema/RLS and run the SQL acceptance suite before staging migration deployment.
2. In a separate staging Supabase project, deploy the existing session-control plane, new grant migration, `ctf-range-access` (`verify_jwt=true`) and `ctf-range-access-check` (`verify_jwt=false` with independent server-only proxy token).
3. Verify the two edge functions both refuse requests in the **default disabled** state; verify unauthenticated users and anonymous accounts cannot issue grants.
4. With a reviewed staging provider, independently approve ingress, enable all gated functions only on staging, and create two separate running synthetic sessions.
5. Confirm a user can issue a token only for their owned session, never for someone else's. Grant is stored only by hash and expires within 60 seconds. Validate the minting limits.
6. Confirm the proxy verifier authorizes only the correct session/token. A token from session A must never grant access to B. Revoke a session, disable the provider and simulate a stale heartbeat; access must stop **on the next request**.
7. On a **trusted private Docker host only**, start one managed Compose target separately; capture its private localhost gateway port and generated gateway token through a secure operator channel, **never** into browser code or Supabase tables.
8. Set `RANGE_INGRESS_SESSION_ENABLED=enabled`, `RANGE_INGRESS_OPERATOR_ACK=LOCAL_LOOPBACK_ONLY`, `RANGE_SESSION_ID`, `RANGE_GATEWAY_PORT`, `RANGE_GATEWAY_TOKEN`, `RANGE_ACCESS_CHECK_URL`, and `CTF_RANGE_PROXY_TOKEN` in a private process environment or secret manager. Run `npm run range:ingress -- --serve`. It only binds to a dynamically chosen `127.0.0.1` port.
9. Use a local HTTP API client with both `Authorization: Bearer <the short-lived ETERNYX user grant>` and `x-eternyx-auth-jwt: <the learner's current Supabase Auth access JWT>` on **every request** to the local staging ingress. The proxy revalidates both and forwards neither to the vulnerable target; only a separate gateway credential reaches the target.
10. Terminate the local proxy and all Docker instances, revoke dedicated proxy and worker secrets, and turn all approval flags off.

### Important browser limitation

The localhost ingress currently requires an explicit `Authorization` grant and a current `x-eternyx-auth-jwt` login header on **every** HTTP request. Normal HTML forms and URL bar navigations do not automatically carry bearer tokens. This is therefore a working *authenticated HTTP API training proxy*, not yet a complete browser-native interactive lab. Production should adopt an audited TLS browser-auth flow with CSRF/replay resistance and session-bound, short-lived cookies or an equivalent secure transport. **Never place the grant in a URL or query string.**

## Known gaps before public launch

- No hosted TLS routing or certificate management, no remote learner terminal, and no production CTF grant use.
- No multi-worker fencing/lease ownership or external watchdog guaranteed to destroy orphan containers after a host crash.
- No audited multitenant microVM isolation and no hardened per-player network policy.
- No paid subscription activation and no metered cloud-cost control plane.
- No claims that a running container exists merely because a database row is `running`.

## Engineering next

The next separate PR should secure distributed worker ownership/fencing and a strict operator kill-switch budget. Only after those controls and audited isolation are complete should we implement a browser-friendly TLS session proxy and consider activating user-facing hosted sessions.
