# Docker real isolated host — operator-only read-only acceptance

This milestone follows merged #540. This is the next operational validation step: inspecting an actual operator-owned **Linux rootless Docker Engine** and one explicitly pinned disposable container, without starting, stopping, restarting, building, deploying, enrolling or polling anything. The PR's GitHub CI uses a deterministic fake CLI; a real host is contacted **only by an operator running `--inspect` on that host**.

## Eleven safeguards bundled into one milestone

1. Explicit operator approval flag; `--preflight` never invokes Docker and never starts a network request.
2. Pin an exact Linux Docker context name, **local Unix socket endpoint**, Docker daemon ID digest, full 64-character container ID and 64-character image content ID.
3. Refuse `DOCKER_HOST`, `DOCKER_CONTEXT`, Docker config/TLS/API overrides, Windows named-pipe endpoints and all remote Docker execution flags.
4. Check the exact Unix socket file is a real socket, not a symlink, owned by the current operator and not world-writable before calling the Docker CLI.
5. Inspect only a local Docker context; refuse context substitution, TCP, TLS, SSH, proxy endpoints or an unexpected socket.
6. Require the observed daemon identity to match an independently retained SHA-256 pin, Docker rootless mode and inactive Swarm status.
7. Reuse the existing **production managed-target guard** to require both lab labels, unprivileged numeric user, read-only rootfs, `network=none`, no privileged capabilities/devices/mounts/published ports, PID/memory limits and no restart policy.
8. Compare the observed image SHA-256 ID with an independently pinned image ID; reject any unexpected extra network or published-port endpoint.
9. Inspect the same container twice, verifying that policy, image and runtime status do not change between reads. A drift or uncertain response stops the acceptance.
10. Require all inspected local claim journals to be fully acknowledged; an unresolved, invalid, oversized or locked journal blocks host acceptance until operator investigation.
11. Emit a **sanitized operator-only read-only observation** and dedicated offline CI with adversarial tests. Never output the raw `docker inspect` object, environment variables, full daemon ID or private socket address.

## How to use on an explicitly authorized operator-owned isolated Linux host

Prerequisites: an actual rootless Docker Engine installed locally, Docker CLI, Node.js 22+, and a disposable test container created separately under a reviewed procedure with BOTH required ETERNYX labels and the existing restricted resource/network policy. Never use a production Docker Engine, customer's machine, or shared workload.

First verify and independently record the Docker context and local Unix socket using the Docker CLI's **read-only** context inspection and operating-system socket tools. Collect the Docker daemon ID through `docker --context CONTEXT info --format '{{.ID}}'` and pin it by calculating `SHA256('ETERNYX_DOCKER_HOST_DAEMON_ID_V1\n' + DAEMON_ID)`. Do not copy a hash from the test report as though it were an independent pin.

Record the exact container ID and its image ID (`sha256:<64 hex>`), independently checked against your approved disposable lab image digest. An image ID does not automatically prove registry signatures or software-supply-chain trust.

Set these operator environment variables **only on the isolated host**:

- `ETERNYX_DOCKER_HOST_READONLY_APPROVAL=I_APPROVE_LOCAL_DOCKER_INSPECTION`
- `ETERNYX_DOCKER_HOST_CONTEXT` — independently approved local rootless context
- `ETERNYX_DOCKER_HOST_ENDPOINT` — identical local Unix endpoint, for example `unix:///run/user/1000/docker.sock` (not a remote proxy)
- `ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256` — independently retained 64-character SHA-256 over the daemon ID with the domain string above
- `ETERNYX_DOCKER_HOST_CONTAINER_ID` — exact 64-character test container ID
- `ETERNYX_DOCKER_HOST_IMAGE_SHA256` — exact 64-character reviewed image ID digest

Keep `ETERNYX_REMOTE_LAB_ENABLED` and `DOCKER_REMOTE_LAB_ENABLED` unset or false. Also unset `DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_CONFIG`, TLS and Docker API override environment variables. The Docker host must not be on a Swarm node or connected to production infrastructure.

Run on the isolated operator workstation:

    node scripts/docker-host-readonly-acceptance.mjs --preflight
    node scripts/docker-host-readonly-acceptance.mjs --inspect > /ABS/PRIVATE/docker-host-inspection.json

The second command invokes only `docker context show`, `docker context inspect`, `docker info` and two `docker container inspect` calls, with hardcoded arguments and no shell. It checks pending recovery journals before contacting Docker. Store its sanitized output privately. **The JSON is a tool-generated observation, not cryptographically signed or independently authenticated.**

## Remaining mandatory acceptance

Even if every check passes, Docker socket privileges remain extremely powerful; a local socket could be proxied and the operator host could be compromised. The tool cannot prove physical network isolation, externally attest host identity, reproduce signed-command dispatch, test a real crash/receipt sequence, check staging server flags, or authorize production execution. The result always contains `independentHostAttestation:false`, `actualRemoteSignedDispatchTested:false`, `crashRecoveryDrillOnRealHostPerformed:false`, `productionDeploymentAuthorized:false`, and `stagingDockerExecutionAuthorized:false`.

A separate protected operator-approved integration test may then be planned for strictly controlled disposable container execution and crash recovery; never turn on a production Docker execution flag based solely on this read-only report.

**CI does not run Docker on the runner.** Its mocked-CLI test fixtures deliberately have fake daemon IDs, fake rootless contexts and synthetic metadata. No staging deployment, real host access or secrets were used for this PR.