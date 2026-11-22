#!/usr/bin/env node
// Read a trusted remote agent through an operator-created SSH loopback tunnel.
import { readAgentToken, readAgentPort } from "../src/lib/dockerAgentConfig.mjs";
import { DOCKER_ID } from "../src/lib/dockerOperatorUtils.mjs";
import { parseCloudSnapshot } from "../src/lib/cloudInventoryUtils.mjs";
function pathFor(args) {
  if (args.length === 1 && ["health", "list", "images", "snapshot"].includes(args[0])) {
    return { kind: args[0], path: args[0] === "images" ? "/v1/images" : args[0] === "health" ? "/v1/health" : "/v1/containers" };
  }
  if (args.length === 2 && ["inspect", "stats"].includes(args[0]) && DOCKER_ID.test(args[1])) {
    return { kind: args[0], path: "/v1/containers/" + args[1] + (args[0] === "stats" ? "/stats" : "") };
  }
  throw new Error("Usage: node scripts/docker-agent-client.mjs health|list|images|snapshot|inspect ID|stats ID");
}
async function main() {
  const choice = pathFor(process.argv.slice(2));
  const port = readAgentPort(process.env.ETERNYX_DOCKER_AGENT_PORT);
  const token = readAgentToken(process.env.ETERNYX_DOCKER_AGENT_TOKEN_FILE);
  // Hardcoded loopback origin, no arbitrary URL, redirects or browser credentials.
  const response = await fetch("http://127.0.0.1:" + port + choice.path, {
    method: "GET", redirect: "error", cache: "no-store",
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Agent request failed (HTTP " + response.status + "). Check SSH forwarding and token permissions.");
  const length = response.headers.get("content-length");
  if (length && Number(length) > 524288) throw new Error("Agent response exceeded 512 KB.");
  // Limit streamed bytes even when Content-Length is absent.
  let total = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > 524288) { await response.body.cancel().catch(() => {}); throw new Error("Agent response exceeded 512 KB."); }
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (choice.kind === "snapshot") {
    if (!Array.isArray(value.containers) || value.source !== "eternyx-docker-readonly-agent") throw new Error("Unexpected Docker agent response.");
    const snapshot = parseCloudSnapshot(JSON.stringify({
      schemaVersion: 1,
      collectedAt: value.capturedAt,
      docker: { status: "available", version: "", containers: value.containers },
      kubernetes: { status: "unavailable", context: "", namespace: "", pods: [], deployments: [] },
    }));
    process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
  } else {
    process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  }
}
main().catch(err => {
  process.stderr.write((err instanceof Error ? err.message : "Agent request failed.") + "\n");
  process.exitCode = 1;
});
