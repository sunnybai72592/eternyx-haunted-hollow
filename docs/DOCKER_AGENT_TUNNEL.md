# ETERNYX Docker agent: private, read-only remote inventory over SSH

**This is real Docker CLI access to an operator-controlled server, not a production-ready multi-tenant cloud connector.** It is restricted to one trusted operator with SSH access. The service only listens on 127.0.0.1 and refuses Docker remote TCP/SSH endpoints; never run the Docker daemon on a public TCP socket.

## What it supports

- Authenticated GET `/v1/health` (agent readiness, NOT a Docker or cluster health check).
- GET `/v1/containers` (bounded live container listing).
- GET `/v1/images` (bounded local image listing).
- GET `/v1/containers/:full-id` (allowlisted inspect fields).
- GET `/v1/containers/:full-id/stats` (one-time resource sample).
- The CLI client can turn the live container inventory into a compatible ETERNYX Cloud & Integrations JSON snapshot.
- No Docker mutations, container logs, arbitrary commands, credentials, mounts or Docker socket access in HTTP routes.

## 1. On your trusted server

Requires Node.js 20+ and a local Docker Engine+CLI running under a trusted operator identity. Review Docker permissions; Docker access is effectively root-equivalent. Restrict SSH access to the operator, and use a dedicated account.

Generate a cryptographically random token on the server, writing to a private file:

```sh
umask 077
mkdir -p "$HOME/.eternyx"
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex') + '\n')" > "$HOME/.eternyx/docker-agent-token"
chmod 600 "$HOME/.eternyx/docker-agent-token"
export ETERNYX_DOCKER_AGENT_TOKEN_FILE="$HOME/.eternyx/docker-agent-token"
node scripts/docker-readonly-agent.mjs
```

Default agent port: 43871 (set ETERNYX_DOCKER_AGENT_PORT to a private alternate port if needed). It binds **only** to 127.0.0.1; it does not implement TLS or allow external connections.

## 2. On your trusted workstation

Make sure you can securely obtain the same token into a private **0600** local file (for example, transfer it using SSH/SCP). Do not paste it into ETERNYX, browser developer tools, screenshots, support tickets, or Git. Configure your local file with the variable ETERNYX_DOCKER_AGENT_TOKEN_FILE.

Open an **SSH authenticated local port tunnel** (keep it open in its terminal):

```sh
ssh -N -L 127.0.0.1:43871:127.0.0.1:43871 operator@YOUR_TRUSTED_SERVER
```

With SSH host keys verified, the client can read the server inventory using:

```sh
node scripts/docker-agent-client.mjs health
node scripts/docker-agent-client.mjs list
node scripts/docker-agent-client.mjs images
node scripts/docker-agent-client.mjs inspect FULL_64_CHARACTER_CONTAINER_ID
node scripts/docker-agent-client.mjs stats FULL_64_CHARACTER_CONTAINER_ID
node scripts/docker-agent-client.mjs snapshot > cloud-snapshot.json
```

Now open ETERNYX `/integrations` and import `cloud-snapshot.json`. The browser reads it locally, no data is sent to our backend. Snapshot is **point in time**, not live streaming.

## Security model and limitations

Agent: loopback-only binding, strict Bearer token comparison, local private token file, exact local Host header, rejects browser Origin, no CORS, GET-only explicit path allowlist, 30 requests/minute, 512 KB caps, short Docker timeouts, sanitized JSON, and generic error messages. The agent will not expose logs, containers' environment values, Kubernetes credentials, or write operations.

SSH tunnel: encrypted in transit and authenticated by SSH. Do not forward agent port to 0.0.0.0 or publish it via a load balancer, VPN public gateway, reverse proxy or port-forwarding service. SSH credentials, server host-key trust, Docker socket rights and endpoint security remain the operator's responsibility. Bearer tokens are held in both trusted machines' memory and read from private files. Revoke/rotate by replacing the token file and restarting the server.

**Not ready for public customers or production multi-tenancy.** The next phase needs user/workspace identity, per-tenant ownership, agent registration, credential vaulting, signed commands, durable audit, quotas and isolation. No paid cloud deployment or browser-initiated remote operations are introduced.

## Testing

```sh
node --test tests/docker-agent.test.mjs
```
