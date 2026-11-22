/**
 * Fenced worker tick. The coordinator generation is never logged, accepted
 * from a browser, or forwarded to training targets.
 *
 * Only one trusted process per local Docker host may run this tick. The CLI
 * enforces a fail-closed operator lock and the SQL layer enforces the lease.
 */
import { projectForSession, safeWorkerSession, validSessionId } from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import { acceptedFence } from
  "../../../supabase/functions/_shared/ctf-range-fenced-contract.mjs";

const isExpired = (date, at) => {
  const t = Date.parse(date);
  return !Number.isFinite(t) || t <= at.getTime();
};

export async function runFencedProviderTick({ api, runtime, leaseId = null, now = new Date() }) {
  if (!api || typeof api.call !== "function" ||
      !runtime || typeof runtime.start !== "function" ||
      typeof runtime.stop !== "function" || typeof runtime.exists !== "function" ||
      !Number.isFinite(now.getTime()) ||
      (leaseId !== null && !acceptedFence(leaseId))) {
    throw new Error("Invalid fenced provider dependencies");
  }

  const acquire = await api.call({
    action: "acquire", ...(leaseId ? { leaseId } : {}),
  });
  if (acquire?.ok !== true || !acceptedFence(acquire.leaseId)) {
    throw new Error("Worker lease unavailable; no local Docker changes permitted");
  }
  if (leaseId !== null && acquire.leaseId !== leaseId) {
    throw new Error("Worker lease generation changed; refusing stale control");
  }
  const fence = acquire.leaseId;
  const stats = { heartbeat: true, cleaned: 0, failed: 0, running: 0, claimed: 0, budgetBlocked: false };

  // Reacquire immediately before each destructive action. A returned new
  // generation is NOT accepted by a process already holding a prior fence.
  async function verifyOwnership() {
    const renewed = await api.call({ action: "acquire", leaseId: fence });
    if (renewed?.ok !== true || renewed.leaseId !== fence) {
      throw new Error("Worker lease was lost; refusing local mutation");
    }
  }

  const inventory = await api.call({ action: "reconcile", leaseId: fence });
  if (inventory?.ok !== true || !Array.isArray(inventory.sessions) ||
      inventory.sessions.length > 12) {
    throw new Error("Worker inventory missing or lease lost");
  }
  for (const entry of inventory.sessions) {
    const session = safeWorkerSession({
      id: entry.id, status: entry.status,
      expires_at: entry.expiresAt, provider_instance_ref: entry.instanceRef,
    });
    const expired = isExpired(session.expiresAt, now);
    if (session.status === "stopping" || session.status === "provisioning" || expired) {
      await verifyOwnership();
      await runtime.stop(session.id);
      await verifyOwnership();
      const state = expired ? "expired" : session.status === "provisioning" ? "failed" : "stopped";
      const reported = await api.call({
        action: "report", leaseId: fence, sessionId: session.id, state,
      });
      if (reported?.ok !== true) {
        throw new Error("Worker cleanup not acknowledged; reservation stays active");
      }
      stats.cleaned++;
      continue;
    }
    if (session.status === "running") {
      if (!await runtime.exists(session.id)) {
        await verifyOwnership();
        await runtime.stop(session.id);
        await verifyOwnership();
        const reported = await api.call({
          action: "report", leaseId: fence, sessionId: session.id, state: "failed",
        });
        if (reported?.ok !== true) throw new Error("Missing range was not fenced-closed");
        stats.failed++;
      } else stats.running++;
    }
  }

  await verifyOwnership();
  const claim = await api.call({ action: "claim", leaseId: fence });
  if (claim?.ok !== true) {
    if (["budget_disabled", "budget_exhausted"].includes(claim?.reason)) stats.budgetBlocked = true;
    if (claim?.reason === "lease_lost") throw new Error("Worker lease lost during claim");
    return { leaseId: fence, stats };
  }
  if (!validSessionId(claim.sessionId) ||
      claim.challengePack !== "http-basics-v1" ||
      typeof claim.expiresAt !== "string") {
    throw new Error("Unsafe worker claim; refusing target launch");
  }
  const id = claim.sessionId;
  stats.claimed = 1;
  if (isExpired(claim.expiresAt, new Date())) {
    await verifyOwnership();
    const ack = await api.call({
      action: "report", leaseId: fence, sessionId: id, state: "expired",
    });
    if (ack?.ok !== true) throw new Error("Unable to close expired claim");
    stats.cleaned++;
    return { leaseId: fence, stats };
  }

  try {
    await verifyOwnership();
    const started = await runtime.start(id);
    if (!started || started.instanceRef !== projectForSession(id)) {
      throw new Error("Invalid Docker instance reference");
    }
    await verifyOwnership();
    if (isExpired(claim.expiresAt, new Date())) {
      throw new Error("Session expired during provisioning");
    }
    const reported = await api.call({
      action: "report", leaseId: fence, sessionId: id, state: "running",
      instanceRef: started.instanceRef,
    });
    if (reported?.ok !== true) throw new Error("Running state refused by fenced database");
    stats.running++;
  } catch {
    // Do not execute cleanup after losing the lease. The new owner, once
    // elected, will adopt and reconcile this session and Docker project.
    await verifyOwnership();
    await runtime.stop(id);
    await verifyOwnership();
    const ack = await api.call({
      action: "report", leaseId: fence, sessionId: id, state: "failed",
    });
    if (ack?.ok !== true) throw new Error("Failed range not safely closed");
    stats.failed++;
  }
  return { leaseId: fence, stats };
}
