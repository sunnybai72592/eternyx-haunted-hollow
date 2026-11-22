/**
 * Single-operator, fail-closed provider tick.
 * All trusted control-plane work is requested through ctf-range-worker.
 * No untrusted account ever supplies the target image, command or network.
 * This module is testable without Docker or Supabase.
 */
import {
  projectForSession, safeWorkerSession, validSessionId,
} from "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";

export const PROVIDER_PACK = "http-basics-v1";

function expiredAt(isoDate, now) {
  const expiry = Date.parse(isoDate);
  return !Number.isFinite(expiry) || expiry <= now.getTime();
}

export async function runProviderTick({ api, runtime, now = new Date() }) {
  if (!api || typeof api.call !== "function" ||
      !runtime || typeof runtime.start !== "function" ||
      typeof runtime.stop !== "function" || typeof runtime.exists !== "function" ||
      !Number.isFinite(now.getTime())) {
    throw new Error("Invalid provider dependencies");
  }

  const outcome = { heartbeat: false, cleaned: 0, failed: 0, running: 0, claimed: 0 };

  const beat = await api.call({ action: "heartbeat" });
  if (beat?.ok !== true) throw new Error("Provider heartbeat was not accepted");
  outcome.heartbeat = true;

  const inventory = await api.call({ action: "reconcile" });
  if (inventory?.ok !== true || !Array.isArray(inventory.sessions) || inventory.sessions.length > 12) {
    throw new Error("Provider session inventory is invalid");
  }

  // First clean up or recover prior sessions (including a worker-process crash).
  for (const entry of inventory.sessions) {
    const session = safeWorkerSession({
      id: entry.id, status: entry.status,
      expires_at: entry.expiresAt, provider_instance_ref: entry.instanceRef,
    });
    const needsTeardown = session.status === "stopping" ||
      expiredAt(session.expiresAt, now) ||
      session.status === "provisioning"; // Stale provisioning from a previous tick/crash.

    if (needsTeardown) {
      // Never mark terminal or release DB capacity if Docker cleanup fails.
      await runtime.stop(session.id);
      const terminal = expiredAt(session.expiresAt, now) ? "expired"
        : session.status === "provisioning" ? "failed" : "stopped";
      const reported = await api.call({
        action: "report", sessionId: session.id, state: terminal,
      });
      if (reported?.ok !== true) throw new Error("Provider cleanup was not acknowledged");
      outcome.cleaned++;
      continue;
    }

    if (session.status === "running") {
      if (!await runtime.exists(session.id)) {
        await runtime.stop(session.id);
        const reported = await api.call({ action: "report", sessionId: session.id, state: "failed" });
        if (reported?.ok !== true) throw new Error("Missing target failure was not acknowledged");
        outcome.failed++;
      } else outcome.running++;
    }
  }

  // Claim at most one session per tick to bound burst resource consumption.
  const claimed = await api.call({ action: "claim" });
  if (!claimed || claimed.ok !== true) return outcome;
  if (!validSessionId(claimed.sessionId) ||
      claimed.challengePack !== PROVIDER_PACK ||
      typeof claimed.expiresAt !== "string") {
    throw new Error("Worker queue claim was invalid; refusing to start any target");
  }
  outcome.claimed = 1;
  const id = claimed.sessionId;
  if (expiredAt(claimed.expiresAt, new Date())) {
    const ack = await api.call({ action: "report", sessionId: id, state: "expired" });
    if (ack?.ok !== true) throw new Error("Expired queued claim could not be closed");
    outcome.cleaned++;
    return outcome;
  }

  try {
    const started = await runtime.start(id);
    if (!started || started.instanceRef !== projectForSession(id)) {
      throw new Error("Docker runtime returned an unrecognized instance reference");
    }

    if (expiredAt(claimed.expiresAt, new Date())) {
      throw new Error("Session expired while provisioning");
    }
    const recorded = await api.call({
      action: "report", sessionId: id, state: "running",
      instanceRef: started.instanceRef,
    });
    if (recorded?.ok !== true) throw new Error("Range provider rejected running transition");
    outcome.running++;
  } catch (error) {
    // Stop whatever may have been created before freeing reservation capacity.
    await runtime.stop(id);
    const ack = await api.call({ action: "report", sessionId: id, state: "failed" });
    if (ack?.ok !== true) throw new Error("Failed deployment cleanup was not acknowledged");
    outcome.failed++;
  }

  return outcome;
}

/** Trusted operator endpoint client: token is never sent to any training target. */
export class RangeWorkerApi {
  constructor(url, token) {
    if (typeof url !== "string" || typeof token !== "string" || token.length < 48) {
      throw new Error("Provider API configuration missing");
    }
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        parsed.search || parsed.hash ||
        parsed.pathname !== "/functions/v1/ctf-range-worker") {
      throw new Error("Worker API must use an exact HTTPS Edge Function URL");
    }
    this.url = parsed.toString();
    this.token = token;
  }

  async call(action) {
    const response = await fetch(this.url, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "x-range-worker-token": this.token,
      },
      body: JSON.stringify(action),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Range worker backend rejected an action");
    const value = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid provider response");
    }
    return value;
  }
}
