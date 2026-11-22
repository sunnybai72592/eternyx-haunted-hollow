/**
 * Local Docker project inventory. This never deletes a project by prefix
 * alone: every discovered container must carry our two explicit managed
 * labels and an expected Docker Compose service label.
 *
 * This is a trust boundary for an OPERATOR-controlled local Docker host,
 * not a public-cloud VM isolation or security boundary.
 */
import { validSessionId } from "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const PROJECT = /^cr-([0-9a-f]{32})$/;
const ALLOWED_SERVICES = new Set(["gateway", "http-range"]);
export const RANGE_MAX_AGE_SECONDS = 900;
export const RANGE_CLEANUP_GRACE_SECONDS = 120;

export function sessionFromProject(project) {
  if (typeof project !== "string") return null;
  const match = PROJECT.exec(project);
  if (!match) return null;
  const h = match[1];
  const sessionId = [
    h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20),
  ].join("-");
  return validSessionId(sessionId) ? sessionId : null;
}

export function verifyManagedContainer(inspected) {
  const labels = inspected?.Config?.Labels;
  const id = inspected?.Id;
  const created = inspected?.Created;
  if (!labels || typeof labels !== "object" || Array.isArray(labels) ||
      typeof id !== "string" || !/^[0-9a-f]{64}$/.test(id) ||
      typeof created !== "string") {
    throw new Error("Invalid Docker container inspection; cleanup refused");
  }
  const project = labels["com.docker.compose.project"];
  const service = labels["com.docker.compose.service"];
  const sessionId = sessionFromProject(project);
  if (!sessionId ||
      !ALLOWED_SERVICES.has(service) ||
      labels["org.eternyx.range.managed"] !== "v1" ||
      labels["org.eternyx.range.ttl_seconds"] !== String(RANGE_MAX_AGE_SECONDS)) {
    throw new Error("Unverified Docker project labels; cleanup refused");
  }
  if (!Number.isFinite(Date.parse(created))) {
    throw new Error("Unrecognized Docker creation timestamp; cleanup refused");
  }
  return { id, project, service, sessionId, createdAt: created };
}

export function planVerifiedCleanup(inspections, now = new Date(), emergency = false) {
  if (!Array.isArray(inspections) || inspections.length > 100 ||
      !(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      typeof emergency !== "boolean") {
    throw new Error("Invalid watchdog inventory input");
  }
  const byProject = new Map();
  const seenIds = new Set();
  for (const raw of inspections) {
    const container = verifyManagedContainer(raw);
    if (seenIds.has(container.id)) {
      throw new Error("Duplicate Docker container ID; cleanup refused");
    }
    seenIds.add(container.id);
    const group = byProject.get(container.project) ?? [];
    if (group.some(x => x.service === container.service)) {
      throw new Error("Duplicate Compose service in project; cleanup refused");
    }
    group.push(container);
    byProject.set(container.project, group);
  }

  const candidates = [];
  for (const [project, containers] of byProject) {
    const newestCreated = Math.max(...containers.map(x=>Date.parse(x.createdAt)));
    const ageSeconds = Math.floor((now.getTime()-newestCreated)/1000);
    if (!Number.isFinite(ageSeconds) || ageSeconds < -60) {
      throw new Error("Docker host clock inconsistent; cleanup refused");
    }
    candidates.push({
      project,
      sessionId: containers[0].sessionId,
      containerCount: containers.length,
      ageSeconds,
      cleanupEligible: emergency ||
        ageSeconds >= RANGE_MAX_AGE_SECONDS + RANGE_CLEANUP_GRACE_SECONDS,
    });
  }
  return candidates.sort((a,b)=>a.project.localeCompare(b.project));
}

/** No sessions, secrets, external URLs or environment variable values logged. */
export async function runOrphanSweep({
  runtime, apply = false, emergency = false, approved = false, now = new Date(),
} = {}) {
  if (!runtime || typeof runtime.listVerifiedManagedProjects !== "function" ||
      typeof runtime.stop !== "function" ||
      typeof apply !== "boolean" || typeof emergency !== "boolean") {
    throw new Error("Invalid watchdog runtime");
  }
  if (apply && approved !== true) {
    throw new Error("Explicit local operator approval required for Docker cleanup");
  }
  const all = await runtime.listVerifiedManagedProjects();
  const plan = planVerifiedCleanup(all, now, emergency);
  const outcome = {
    scannedProjects: plan.length,
    eligible: plan.filter(x=>x.cleanupEligible).length,
    removed: 0,
    dryRun: !apply,
    emergency,
  };
  if (!apply) return { outcome, plan };
  for (const entry of plan) {
    if (!entry.cleanupEligible) continue;
    // Re-read and revalidate before each mutation to avoid destroying a
    // project that was unexpectedly replaced or changed since discovery.
    const latest = planVerifiedCleanup(await runtime.listVerifiedManagedProjects(), new Date(), emergency);
    const candidate = latest.find(x=>x.project===entry.project);
    if (!candidate || !candidate.cleanupEligible ||
        candidate.containerCount !== entry.containerCount) {
      throw new Error("Docker project changed during sweep; cleanup refused");
    }
    await runtime.stop(entry.sessionId);
    outcome.removed++;
  }
  return { outcome, plan };
}
