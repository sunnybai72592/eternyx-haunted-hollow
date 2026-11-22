#!/usr/bin/env node
/**
 * Trusted host-side provider process. Never deploy inside ETERNYX frontend,
 * Supabase Edge Runtime, a vulnerable target or the public web server.
 *
 * No scheduled/background service is created by adding this file.
 * Manually invoked; disabled until two explicit local execution opt-ins.
 */
import { LocalDockerRangeRuntime } from "../infrastructure/cyber-range/provider/docker-runtime.mjs";
import { RangeWorkerApi, runProviderTick } from "../infrastructure/cyber-range/provider/worker.mjs";

const usage = () => {
  process.stdout.write([
    "ETERNYX isolated range provider (operator-only, no paid cloud deployment)",
    "Usage: node scripts/cyber-range-provider.mjs --once | --loop",
    "Required: RANGE_PROVIDER_API_URL, CTF_RANGE_WORKER_TOKEN (secret)",
    "Required opt-ins: ETERNYX_PROVIDER_EXECUTION=enabled",
    "                 ETERNYX_RANGE_OPERATOR_ACK=LOCAL_ONLY_NO_PUBLIC_INGRESS",
    "The endpoint must be HTTPS, at /functions/v1/ctf-range-worker.",
    "The provider runs on a dedicated operator-controlled host with local Docker.",
    "Operator must separately enable provider capability and approve ingress in DB.",
  ].join("\n") + "\n");
};

const flag = process.argv[2];
if (!["--once", "--loop"].includes(flag)) {
  usage();
  if (flag && !["--help", "-h"].includes(flag)) process.exitCode = 2;
} else if (process.env.ETERNYX_PROVIDER_EXECUTION !== "enabled" ||
           process.env.ETERNYX_RANGE_OPERATOR_ACK !== "LOCAL_ONLY_NO_PUBLIC_INGRESS") {
  console.error("Range execution is disabled; operator opt-in is required.");
  process.exitCode = 1;
} else {
  let shutdown = false;
  process.on("SIGINT", () => { shutdown = true; });
  process.on("SIGTERM", () => { shutdown = true; });

  try {
    const api = new RangeWorkerApi(
      process.env.RANGE_PROVIDER_API_URL ?? "",
      process.env.CTF_RANGE_WORKER_TOKEN ?? "",
    );
    const runtime = new LocalDockerRangeRuntime();
    runtime.validateHost();

    do {
      const result = await runProviderTick({ api, runtime });
      // Safe metrics only: never print the worker token, gateway bearer or user ID.
      console.log("Range tick:", JSON.stringify(result));
      if (flag === "--once" || shutdown) break;
      await new Promise((done) => setTimeout(done, 10_000));
    } while (!shutdown);
  } catch {
    console.error("Range provider stopped: inspect trusted control-plane health and Docker state.");
    process.exitCode = 1;
  }
}
