#!/usr/bin/env node
/**
 * Operator-only, local-host watchdog. No Supabase credentials are required.
 * Adding this CLI does not create any background service or cloud resource.
 * Default = inspect and report without destructive Docker operations.
 */
import { LocalDockerRangeRuntime } from "../infrastructure/cyber-range/provider/docker-runtime.mjs";
import { engageLocalHostHalt } from "../infrastructure/cyber-range/provider/local-kill-switch.mjs";
import { runOrphanSweep } from "../infrastructure/cyber-range/provider/orphan-watchdog.mjs";
import { acquireLocalOperatorLock } from "../infrastructure/cyber-range/provider/process-lock.mjs";

function help() {
  console.log([
    "ETERNYX Labs — independent local orphan watchdog",
    "Usage: npm run range:watchdog -- [--dry-run] [--loop] [--apply]",
    "       npm run range:watchdog -- --emergency-stop --apply",
    "Default is dry-run (no Docker mutations).",
    "For --apply or --emergency-stop, set ETERNYX_RANGE_WATCHDOG_ACK=LOCAL_OPERATOR_ONLY",
    "--loop checks every 30 seconds until a shutdown signal; no service installed.",
    "--emergency-stop first halts new local launches, then removes verified managed",
    "Docker projects regardless of age. It does NOT disable the cloud provider DB.",
    "The halt marker persists at ~/.eternyx-range-launches-halted.",
    "Inspect incidents and the local host before manually clearing the marker.",
  ].join("\n"));
}

const args = process.argv.slice(2);
const allowed = new Set(["--help","--dry-run","--loop","--apply","--emergency-stop"]);
if (args.some(x=>!allowed.has(x)) || args.includes("--help") ||
    (args.includes("--dry-run") && args.includes("--apply")) ||
    (args.includes("--loop") && args.includes("--emergency-stop"))) {
  help();
  if (!args.includes("--help")) process.exitCode = 2;
} else {
  const apply = args.includes("--apply");
  const emergency = args.includes("--emergency-stop");
  const repeat = args.includes("--loop");
  const approved = process.env.ETERNYX_RANGE_WATCHDOG_ACK === "LOCAL_OPERATOR_ONLY";
  if ((apply || emergency) && !approved) {
    console.error("Operator approval required; watchdog refused Docker changes.");
    process.exitCode = 1;
  } else if (emergency && !apply) {
    console.error("Emergency stop must explicitly include --apply.");
    process.exitCode = 2;
  } else {
    let terminate = false;
    process.on("SIGINT",()=>{terminate=true;});
    process.on("SIGTERM",()=>{terminate=true;});
    let lock;
    try {
      // Independent from provider lock: a dead provider must not prevent
      // emergency cleanup. Scoped runtime inspection protects other Docker
      // projects even if the provider is concurrently operating.
      lock = await acquireLocalOperatorLock(
        (await import("node:path")).join(
          (await import("node:os")).homedir(), ".eternyx-range-watchdog.lock",
        ),
      );
      if (emergency) {
        // Persistently deny future host starts BEFORE touching Docker, even
        // if the Docker daemon becomes unavailable halfway through cleanup.
        await engageLocalHostHalt();
      }
      const runtime = new LocalDockerRangeRuntime();
      runtime.validateHost();
      do {
        const { outcome, plan } = await runOrphanSweep({
          runtime, apply, emergency, approved,
        });
        console.log("Local range watchdog:", JSON.stringify(outcome));
        if (!apply) {
          for (const item of plan) {
            // Project names are validated; never print tokens/target content.
            console.log(JSON.stringify({
              project: item.project, ageSeconds: item.ageSeconds,
              eligible: item.cleanupEligible,
            }));
          }
        }
        if (!repeat || terminate) break;
        await new Promise(ok=>setTimeout(ok,30_000));
      } while (!terminate);
    } catch {
      console.error("Local watchdog stopped: inspect Docker labels, host lock and range state.");
      process.exitCode = 1;
    } finally {
      if (lock) {
        try { await lock.release(); }
        catch { console.error("Watchdog lock release requires operator review."); }
      }
    }
  }
}
