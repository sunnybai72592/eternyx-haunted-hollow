# ETERNYX Docker operator: real local Docker operations

This CLI runs actual Docker commands on a trusted operator machine. It does not host an HTTP endpoint or provide remote Docker access from the ETERNYX website.

## Usage

Prerequisites: Node.js 20+, Docker Engine and Docker CLI on a trusted workstation with a selected local Unix socket or Windows named-pipe Docker context.

node scripts/docker-operator.mjs list
node scripts/docker-operator.mjs images
node scripts/docker-operator.mjs inspect FULL_64_CHARACTER_CONTAINER_ID
node scripts/docker-operator.mjs stats FULL_64_CHARACTER_CONTAINER_ID
node scripts/docker-operator.mjs logs FULL_64_CHARACTER_CONTAINER_ID

These are real, read-only Docker operations. Lists return at most 100 items. Inspect returns allowlisted fields only, never environment variables; stats is a single sample. Logs return up to 50 lines and may contain sensitive application data. Never upload logs without reviewing them.

## Guarded container lifecycle

Mutations (start, stop, restart) are only for operator-owned disposable test containers. Targets require the exact 64-character ID, BOTH labels io.eternyx.operator.managed=true and io.eternyx.operator.scope=local-workbench, non-root numeric user, read-only filesystem, network none, no host namespaces, mounts or published ports, no privilege escalation, ALL capabilities dropped, positive memory and PID limits, and disabled automatic restart policy.

First preview (no action executed):
node scripts/docker-operator.mjs stop FULL_64_CHARACTER_CONTAINER_ID

Then explicitly confirm on your own trusted Docker host:
node scripts/docker-operator.mjs stop FULL_64_CHARACTER_CONTAINER_ID --confirm FULL_64_CHARACTER_CONTAINER_ID

The operator re-inspects the target and checks the guard before executing. Before mutation it must append an audit entry under ~/.eternyx/docker-operator-audit.jsonl; if writing fails, it aborts. It appends completed or failed outcome afterward. These local logs are not tamper-resistant.

To create an eligible lab target, use a reviewed local image pinned by digest, no network, --read-only, --user 10001:10001, --cap-drop ALL, --security-opt no-new-privileges, --pids-limit 64, --memory 128m, --restart no, and both labels above. Do not use this restricted tool on production containers.

## Security limitations

Labels do NOT authorize untrusted users; this is only defense in depth for an already-trusted operator with Docker privileges. The script refuses TCP/SSH Docker endpoints, uses shell:false, bounded outputs and timeouts, and does not expose the Docker socket to the web app. Docker socket access remains extremely powerful. Do not mount docker.sock in public services or enable unauthenticated TCP Docker endpoints.

Remote multi-user Docker management will require a separate secure agent, authentication, tenant isolation, rate limits, durable audit, ownership verification and defense against malicious workloads.

Run unit regression tests with: node --test tests/docker-local-operator.test.mjs
