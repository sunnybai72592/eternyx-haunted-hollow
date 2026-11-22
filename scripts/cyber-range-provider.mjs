#!/usr/bin/env node
/**
 * Trusted local operator only. No background worker or paid infrastructure is
 * started by committing this file. Explicit operator opt-ins are mandatory.
 */
import { LocalDockerRangeRuntime } from "../infrastructure/cyber-range/provider/docker-runtime.mjs";
import { RangeWorkerApi } from "../infrastructure/cyber-range/provider/worker.mjs";
import { runFencedProviderTick } from "../infrastructure/cyber-range/provider/fenced-worker.mjs";
import { acquireLocalOperatorLock } from "../infrastructure/cyber-range/provider/process-lock.mjs";
import { assertNoUnverifiedHostedRuntime } from "../infrastructure/cyber-range/provider/hosted-readiness.mjs";

const usage = () => {
  console.log([
    "ETERNYX Labs operator-only fenced worker",
    "Usage: npm run range:provider -- --once | --loop",
    "Required: RANGE_PROVIDER_API_URL, CTF_RANGE_WORKER_TOKEN (never log)",
    "Required: ETERNYX_PROVIDER_EXECUTION=enabled",
    "Required: ETERNYX_RANGE_OPERATOR_ACK=LOCAL_ONLY_NO_PUBLIC_INGRESS",
    "Host must have local Docker and a dedicated operator process lock.",
    "Database quotas/ingress are disabled until independently approved.",
    "A stale operator lock must be manually inspected before recovery.",
  ].join("\n"));
};

const flag = process.argv[2];
if (!["--once", "--loop"].includes(flag)) {
  usage();
  if (flag && !["--help", "-h"].includes(flag)) process.exitCode = 2;
} else if (process.env.ETERNYX_PROVIDER_EXECUTION !== "enabled" ||
           process.env.ETERNYX_RANGE_OPERATOR_ACK !== "LOCAL_ONLY_NO_PUBLIC_INGRESS") {
  console.error("Range execution disabled: explicit operator opt-in required.");
  process.exitCode = 1;
} else {
  let shutdown = false;
  process.once("SIGINT", () => { shutdown = true; });
  process.once("SIGTERM", () => { shutdown = true; });
  let localLock;
  let leaseId = null;
  let api;
  try {
    assertNoUnverifiedHostedRuntime(process.env);
    localLock = await acquireLocalOperatorLock();
    api = new RangeWorkerApi(
      process.env.RANGE_PROVIDER_API_URL ?? "",
      process.env.CTF_RANGE_WORKER_TOKEN ?? "",
    );
    const runtime = new LocalDockerRangeRuntime();
    runtime.validateHost();

    do {
      const tick = await runFencedProviderTick({ api, runtime, leaseId });
      leaseId = tick.leaseId; // NEVER print the private lease generation.
      console.log("Range worker tick:", JSON.stringify(tick.stats));
      if (flag === "--once" || shutdown) break;
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    } while (!shutdown);
  } catch {
    console.error("Range provider halted; verify owner lease, quota and local Docker safely.");
    process.exitCode = 1;
  } finally {
    // Releasing the fence on clean exit permits a new operator to recover
    // running sessions. A crash leaves a 180-second stale DB lease instead.
    if (api && leaseId) {
      try { await api.call({ action: "release", leaseId }); }
      catch { console.error("Worker lease release failed; timeout will handle failover."); }
    }
    if (localLock) {
      try { await localLock.release(); }
      catch { console.error("Local lock release failed; operator review required."); }
    }
  }
}
