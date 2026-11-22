# Cloud & Integrations — real operator inventory (phase 1)

This milestone provides **genuine read-only measurements** from Docker Engine and a single Kubernetes namespace, captured by an operator running the repository CLI on a trusted machine. The ETERNYX web page imports a sanitized snapshot locally. **It is not a remote live control plane.**

## Run locally

1. Install Node.js 20+, Docker CLI (with access to your own Docker Engine) and/or kubectl (with a least-privilege read-only context). No cluster or host access is provisioned automatically.
2. In the repository checkout, run:

   ```sh
   node scripts/cloud-inventory.mjs > cloud-snapshot.json
   ```

3. For a non-default namespace, set `ETERNYX_KUBE_NAMESPACE` in your shell before the command. The collector only requests pods and deployments in that namespace, and only reads the Docker container inventory.
4. Open ETERNYX `/integrations` and select **Import snapshot**. The JSON is parsed in the browser and held in memory; it is not uploaded, cached or persisted.

The collector does not execute a shell, start/stop containers, create resources, dump kubeconfig, read secrets, or modify infrastructure. Individual commands time out. Docker socket access is sensitive: do not give it to untrusted applications. Run the operator CLI only on a trusted device with trusted CLI configuration.

## Capability status

- **Available now:** Docker CLI read-only container inventory; kubectl read-only namespace pod/deployment inventory; browser-local import/validation, explicit unavailable states and timestamps.
- **Not built:** hosted agents, persistent connections, live streaming, remote API access, container lifecycle changes, Kubernetes mutation, cross-tenant credential management, paid resources.

Failures to connect are shown as **unavailable**, not filled with sample data. Snapshots can become stale immediately; re-run the collector for fresh data. Output holds resource names and metadata and should be handled as potentially sensitive operational information.

## Production-grade next phase

Use an operator-installed backend/agent (not a browser-to-Docker-socket link) with per-user authorization, least-privilege access, server-side credential storage, audit trails, rate limits, network restrictions, quotas, and explicit infrastructure ownership verification. Keep destructive operations disabled by default. Automated tests and independent security review are required before enabling remote execution.
