#!/usr/bin/env node
/** Read-only operator audit. Never starts, stops or configures Docker projects. */
import { LocalDockerRangeRuntime } from "../infrastructure/cyber-range/provider/docker-runtime.mjs";
import { auditHostIsolation } from "../infrastructure/cyber-range/provider/isolation-policy.mjs";

const flags = process.argv.slice(2);
if (flags.length > 1 || (flags.length === 1 && flags[0] !== "--json" && flags[0] !== "--help")) {
  console.error("Usage: npm run range:audit [-- --json | --help]");
  process.exitCode = 2;
} else if (flags[0] === "--help") {
  console.log([
    "ETERNYX local managed cyber-range isolation audit",
    "Usage: npm run range:audit -- --json",
    "Read-only: never deploys, stops or modifies Docker containers.",
    "Requires a trusted local Docker daemon. No Supabase credentials or cloud resources.",
    "Checks actual Docker resource/network/privilege settings; nonzero exit on drift.",
    "Never prints Docker environment variables, gateway tokens or raw inspect output.",
  ].join("\n"));
} else {
  try {
    const runtime = new LocalDockerRangeRuntime();
    runtime.validateHost();
    const outcome = await auditHostIsolation(runtime);
    // Return only validated project IDs and safe pass/fail status.
    console.log(JSON.stringify(outcome));
    if (outcome.drifted > 0) process.exitCode = 1;
  } catch {
    console.error("Range isolation audit could not verify the local Docker host.");
    process.exitCode = 1;
  }
}
