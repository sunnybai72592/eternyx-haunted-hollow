# Docker Agent Connection Registry — trusted workstation

This milestone manages multiple **real SSH-tunneled Docker read-only agents**. It is **not** multi-tenant ETERNYX cloud account registration, nor a hosted connection service. It does not open remote sockets on your behalf, start paid servers, run lifecycle mutations, or store token contents.

## Prerequisites

- A trusted operator workstation and Node.js 20+.
- The read-only agent from PR #380 running on each operator-controlled Docker host.
- A separately authenticated SSH tunnel for each host, bound to a unique loopback port, with verified SSH host keys.
- Per-host random, unique, private 0600 token file on the workstation. Do not put tokens or exported logs in Git.

Example tunnel to a remote machine (repeat with unique port and unique token for each server):

```sh
ssh -N -L 127.0.0.1:43872:127.0.0.1:43871 operator@YOUR_AUTHORIZED_SERVER
```

## Operator commands

```sh
node scripts/docker-connections.mjs add lab-east 43872 /ABSOLUTE/PRIVATE/TOKEN-FILE
node scripts/docker-connections.mjs list
node scripts/docker-connections.mjs check lab-east
node scripts/docker-connections.mjs check-all
node scripts/docker-connections.mjs images lab-east
node scripts/docker-connections.mjs snapshot lab-east > cloud-snapshot.json
node scripts/docker-connections.mjs rotate lab-east /ABSOLUTE/PRIVATE/NEW-TOKEN-FILE
node scripts/docker-connections.mjs remove lab-east
```

Registration requires a live bearer-authenticated health response before saving. `list` reports **not-checked**, never a fabricated online state. `check` and `check-all` query the real agent at the moment of invocation. A reachable agent does not prove the Docker Engine itself is healthy. To inspect Engine inventory, use `snapshot` or `images`.

`rotate` changes only the local credential-file reference after authenticating with the new token. You must rotate the remote token first and restart the agent. `remove` removes the local registration only; it does NOT revoke the remote token or close the SSH tunnel.

Import the resulting `cloud-snapshot.json` at ETERNYX `/integrations`. The page processes it locally. Snapshots are point-in-time data, not live streaming.

## Security

The local registry lives at `~/.eternyx/docker-connections.json` (directory 0700, file 0600 on POSIX). It contains only connection IDs, localhost tunnel ports, registration timestamps, and absolute token-file **paths**, never credentials themselves. Writes require a lock and use atomic rename. Manually remove stale `.lock` files only after confirming that no concurrent manager process is running.

The manager only targets `127.0.0.1` and the allowlisted read-only agent endpoints. It never accepts arbitrary URLs or HTTP methods. The token is loaded from a private file on each request. Remote Docker daemons should not expose TCP ports or share docker.sock with web-facing services.

**Trust boundary:** The SSH client, local workstation and read-only agent are trusted; an authenticated remote agent does not establish per-customer tenancy or billing/ownership authorization. ETERNYX must add a separate server-side identity model and hardened gateway before customer-facing remote Docker controls.

Run tests: `node --test tests/docker-connection-registry.test.mjs`
