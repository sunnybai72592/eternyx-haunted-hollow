import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

/**
 * Public BUILD provenance only. Never read or publish environment secrets.
 * The SHA is an observed local Git checkout; without Git metadata, it is null.
 * A successful build stamp is not proof of production deployment.
 */
export function validatedSha(candidate) {
  return typeof candidate === "string" && /^[a-f0-9]{40}$/i.test(candidate.trim())
    ? candidate.trim().toLowerCase()
    : null;
}

export function readCheckedOutSha(cwd = process.cwd()) {
  try {
    const sha = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd, encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"],
    });
    return validatedSha(sha);
  } catch {
    return null;
  }
}

export function createReleaseStamp({
  cwd = process.cwd(),
  buildId = randomBytes(16).toString("hex"),
  now = new Date().toISOString(),
} = {}) {
  if (!/^[a-f0-9]{32}$/.test(buildId)) throw new Error("Invalid build identifier");
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(now)) {
    throw new Error("Invalid build timestamp");
  }
  const sourceSha = readCheckedOutSha(cwd);
  return Object.freeze({
    schema: 1,
    project: "eternyx",
    build_id: buildId,
    source_sha: sourceSha,
    source_sha_origin: sourceSha ? "git-checkout" : "unavailable",
    built_at: now,
    production_verified: false,
  });
}
