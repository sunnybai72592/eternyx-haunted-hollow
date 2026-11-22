#!/usr/bin/env node
/**
 * Intentionally manual local staging ingress runner. Does not deploy a cloud
 * endpoint or expose any public interface. Starts only with operator opt-in.
 * Raw grant, provider key and private gateway token must never be logged.
 */
import {
  RangeAccessVerifier, startLocalIngress,
} from "../infrastructure/cyber-range/ingress/server.mjs";

function help() {
  console.log([
    "ETERNYX staging-only per-session HTTP ingress",
    "No public network binding, remote Docker, or automatic cloud deployment.",
    "Required: RANGE_INGRESS_SESSION_ENABLED=enabled",
    "          RANGE_INGRESS_OPERATOR_ACK=LOCAL_LOOPBACK_ONLY",
    "          RANGE_SESSION_ID=<trusted reservation UUID>",
    "          RANGE_GATEWAY_PORT=<verified localhost managed gateway port>",
    "          RANGE_GATEWAY_TOKEN=<private 64 hex gateway credential>",
    "          RANGE_ACCESS_CHECK_URL=https://<project>/functions/v1/ctf-range-access-check",
    "          CTF_RANGE_PROXY_TOKEN=<dedicated private proxy verifier secret>",
    "Run: npm run range:ingress -- --serve",
    "Every request needs both an ETERNYX-issued grant bearer and a current Supabase Auth JWT.",
  ].join("\n"));
}

if (process.argv[2] !== "--serve") {
  help();
  if (process.argv[2] && process.argv[2] !== "--help") process.exitCode = 2;
} else if (process.env.RANGE_INGRESS_SESSION_ENABLED !== "enabled" ||
           process.env.RANGE_INGRESS_OPERATOR_ACK !== "LOCAL_LOOPBACK_ONLY") {
  console.error("Range ingress is disabled. Operator must explicitly opt in.");
  process.exitCode = 1;
} else {
  try {
    const verifier = new RangeAccessVerifier(
      process.env.RANGE_ACCESS_CHECK_URL ?? "",
      process.env.CTF_RANGE_PROXY_TOKEN ?? "",
    );
    const range = await startLocalIngress({
      sessionId: process.env.RANGE_SESSION_ID,
      gatewayPort: Number(process.env.RANGE_GATEWAY_PORT),
      gatewayToken: process.env.RANGE_GATEWAY_TOKEN,
      verifier,
      port: 0,
      lifetimeSeconds: 900,
    });
    console.log("Local staging ingress ready on 127.0.0.1:" + range.port);
    console.log("Access remains limited to one account-bound session and 60-second grants.");
    // Deliberately no browser URL or credential printed.
    const stop = async () => { await range.close(); process.exit(0); };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch {
    console.error("Local session ingress refused to start: inspect operator configuration.");
    process.exitCode = 1;
  }
}
