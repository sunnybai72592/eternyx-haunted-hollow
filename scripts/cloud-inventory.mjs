#!/usr/bin/env node
// Operator-run, read-only Docker and Kubernetes inventory. Does NOT serve HTTP.
import { spawnSync } from "node:child_process";
import { CLOUD_SNAPSHOT_VERSION, parseCloudSnapshot } from "../src/lib/cloudInventoryUtils.mjs";

function exec(executable, args) {
  try {
    const result = spawnSync(executable, args, {
      shell: false, encoding: "utf8", timeout: 8000, maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return result.error || result.status !== 0 ? null : result.stdout.trim();
  } catch { return null; }
}
function dockerInventory() {
  const version = exec("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (!version) return { status: "unavailable", version: "", containers: [] };
  const lines = exec("docker", ["container", "ls", "--all", "--format", "{{json .}}"]);
  if (lines === null) return { status: "unavailable", version: "", containers: [] };
  let containers;
  try {
    containers = lines ? lines.split("\n").slice(0, 100).map((line) => {
      const item = JSON.parse(line);
      return { id: item.ID || "", name: item.Names || "", image: item.Image || "", state: item.State || "", status: item.Status || "" };
    }) : [];
  } catch { return { status: "unavailable", version: "", containers: [] }; }
  return { status: "available", version, containers };
}
function kubernetesInventory() {
  // Restrict discovery to an explicit namespace, never the entire cluster by default.
  const namespace = process.env.ETERNYX_KUBE_NAMESPACE || "default";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(namespace)) {
    return { status: "unavailable", context: "", namespace: "", pods: [], deployments: [] };
  }
  const context = exec("kubectl", ["config", "current-context"]);
  const opts = ["--namespace", namespace, "--request-timeout=5s", "-o", "json"];
  const podText = exec("kubectl", ["get", "pods", ...opts]);
  const deploymentText = exec("kubectl", ["get", "deployments", ...opts]);
  if (podText === null || deploymentText === null) {
    return { status: "unavailable", context: "", namespace, pods: [], deployments: [] };
  }
  try {
    const podList = JSON.parse(podText);
    const deployList = JSON.parse(deploymentText);
    if (!Array.isArray(podList.items) || !Array.isArray(deployList.items)) throw new Error("Invalid workload response.");
    const pods = podList.items.slice(0, 100).map((pod) => {
      const statuses = Array.isArray(pod.status?.containerStatuses) ? pod.status.containerStatuses : [];
      return {
        name: pod.metadata?.name || "", namespace: pod.metadata?.namespace || namespace,
        phase: pod.status?.phase || "Unknown",
        ready: statuses.filter((item) => item.ready === true).length + "/" + (pod.spec?.containers?.length || 0),
      };
    });
    const deployments = deployList.items.slice(0, 100).map((item) => ({
      name: item.metadata?.name || "", namespace: item.metadata?.namespace || namespace,
      replicas: item.spec?.replicas ?? 0, ready: item.status?.readyReplicas ?? 0,
    }));
    return { status: "available", context: context || "", namespace, pods, deployments };
  } catch { return { status: "unavailable", context: "", namespace, pods: [], deployments: [] }; }
}
if (process.argv.length > 2) {
  if (process.argv[2] === "--help" && process.argv.length === 3) {
    process.stdout.write("Run: node scripts/cloud-inventory.mjs > cloud-snapshot.json\nOptional: ETERNYX_KUBE_NAMESPACE=your-namespace\n");
    process.exit(0);
  }
  process.stderr.write("Unexpected argument. Use --help.\n");
  process.exit(2);
}
const snapshot = {
  schemaVersion: CLOUD_SNAPSHOT_VERSION,
  collectedAt: new Date().toISOString(),
  docker: dockerInventory(),
  kubernetes: kubernetesInventory(),
};
// Schema-validate and sanitize before printing; never emit kubeconfig, tokens, or raw workload JSON.
process.stdout.write(JSON.stringify(parseCloudSnapshot(JSON.stringify(snapshot)), null, 2) + "\n");
