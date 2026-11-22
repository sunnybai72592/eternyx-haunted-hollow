// Strict, local-only parsing for operator-generated infrastructure snapshots.
// No input is sent to ETERNYX servers, and unknown fields never reach UI state.
export const CLOUD_SNAPSHOT_VERSION = 1;
export const MAX_SNAPSHOT_BYTES = 512 * 1024;
const MAX_ITEMS = 100;
const trimmed = (value, max = 180) => typeof value === "string" ? value.slice(0, max) : "";
const list = (value) => {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new Error("Snapshot contains an invalid or oversized inventory list.");
  return value;
};
const status = (value) => {
  if (value !== "available" && value !== "unavailable") throw new Error("Snapshot has an invalid provider status.");
  return value;
};
export function parseCloudSnapshot(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > MAX_SNAPSHOT_BYTES) {
    throw new Error("Choose a JSON snapshot smaller than 512 KB.");
  }
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error("Snapshot is not valid JSON."); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.schemaVersion !== CLOUD_SNAPSHOT_VERSION) {
    throw new Error("Unsupported ETERNYX infrastructure snapshot format.");
  }
  if (typeof raw.collectedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(raw.collectedAt) || !Number.isFinite(Date.parse(raw.collectedAt))) {
    throw new Error("Snapshot has no valid collection timestamp.");
  }
  if (!raw.docker || !raw.kubernetes || typeof raw.docker !== "object" || typeof raw.kubernetes !== "object") {
    throw new Error("Snapshot must contain Docker and Kubernetes provider results.");
  }
  const dockerStatus = status(raw.docker.status);
  const kubeStatus = status(raw.kubernetes.status);
  const docker = list(raw.docker.containers).map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid Docker inventory item.");
    return { id: trimmed(item.id, 24), name: trimmed(item.name), image: trimmed(item.image), state: trimmed(item.state, 40), status: trimmed(item.status) };
  });
  const pods = list(raw.kubernetes.pods).map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid Kubernetes pod.");
    return { name: trimmed(item.name), namespace: trimmed(item.namespace), phase: trimmed(item.phase, 40), ready: trimmed(item.ready, 20) };
  });
  const deployments = list(raw.kubernetes.deployments).map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid Kubernetes deployment.");
    return { name: trimmed(item.name), namespace: trimmed(item.namespace), replicas: Number.isSafeInteger(item.replicas) && item.replicas >= 0 ? item.replicas : 0, ready: Number.isSafeInteger(item.ready) && item.ready >= 0 ? item.ready : 0 };
  });
  return {
    schemaVersion: CLOUD_SNAPSHOT_VERSION,
    collectedAt: new Date(raw.collectedAt).toISOString(),
    docker: { status: dockerStatus, version: trimmed(raw.docker.version, 80), containers: dockerStatus === "available" ? docker : [] },
    kubernetes: { status: kubeStatus, context: trimmed(raw.kubernetes.context, 120), namespace: trimmed(raw.kubernetes.namespace, 63), pods: kubeStatus === "available" ? pods : [], deployments: kubeStatus === "available" ? deployments : [] },
  };
}
