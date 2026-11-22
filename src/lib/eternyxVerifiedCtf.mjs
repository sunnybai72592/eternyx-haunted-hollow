/**
 * CTF verified casefiles. The correct flag is derived only in a trusted Edge Function.
 * Public metadata and artifact format are intentionally inspectable.
 * This is forensic/encoding practice, NOT an exploitable network service.
 */
export const VERIFIED_CTF_MISSIONS = Object.freeze([
  {
    id: "encoded-access-log",
    title: "Access Log Anomaly",
    difficulty: "Beginner",
    category: "Log analysis",
    points: 120,
    objective: "Inspect a server access log and decode an evidence token hidden in the analyst trace.",
    hints: [
      "Find an unusual lab_trace value in the diagnostic lines.",
      "The trace is encoded using Base64, which is not encryption.",
      "Decode the Base64 value to recover an ETERNYX{...} flag.",
    ],
  },
  {
    id: "header-evidence",
    title: "The Hex Header",
    difficulty: "Beginner",
    category: "HTTP forensics",
    points: 140,
    objective: "Identify and decode a hex-encoded evidence token in a captured HTTP response.",
    hints: [
      "Look for a nonstandard response header.",
      "A two-character hexadecimal sequence can represent one UTF-8 byte.",
      "Decode the X-Lab-Evidence header from hexadecimal text.",
    ],
  },
  {
    id: "reversed-manifest",
    title: "Build Manifest Mystery",
    difficulty: "Intermediate",
    category: "Build forensics",
    points: 180,
    objective: "Inspect a build manifest entry and reverse the unusual marker value to recover the flag.",
    hints: [
      "A marker is stored in a reversible, unusual order.",
      "The field name gives away the transformation.",
      "Reverse the string in the integrity.reverse_marker field.",
    ],
  },
]);

const missionIds = new Set(VERIFIED_CTF_MISSIONS.map(({ id }) => id));
const encoder = new TextEncoder();

export function isVerifiedMission(id) {
  return typeof id === "string" && missionIds.has(id);
}

export async function deriveVerifiedCtfFlag(secret, userId, missionId) {
  if (typeof secret !== "string" || encoder.encode(secret).length < 32) {
    throw new Error("CTF signing key is not configured");
  }
  if (!isVerifiedMission(missionId) ||
      typeof userId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(userId)) {
    throw new Error("Invalid challenge identity");
  }
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode("ctf-verified:v1:" + userId + ":" + missionId));
  const hex = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return "ETERNYX{" + missionId.replace(/-/g, "_") + "_" + hex.slice(0, 24) + "}";
}

function encodeBase64(value) {
  const bytes = encoder.encode(value);
  // btoa is available in supported browsers, Node 22+ and the Supabase Deno runtime.
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function encodeHex(value) {
  return [...encoder.encode(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildVerifiedCtfArtifact(id, flag) {
  if (!isVerifiedMission(id) || typeof flag !== "string" || !/^ETERNYX\{[a-z0-9_]+\}$/.test(flag)) {
    throw new Error("Invalid casefile");
  }
  if (id === "encoded-access-log") {
    return [
      "# ETERNYX RANGE / captured access log",
      "# Training casefile. All IP addresses are documentation-only examples.",
      "2026-11-22T08:22:14Z GET /home 200 192.0.2.10",
      "2026-11-22T08:22:15Z GET /admin 403 198.51.100.44",
      "2026-11-22T08:22:16Z INFO collector=range-lab lab_trace=" + encodeBase64(flag),
      "2026-11-22T08:22:17Z GET /favicon.ico 200 192.0.2.10",
      "# Task: explain the anomaly and recover the trace token.",
    ].join("\n");
  }
  if (id === "header-evidence") {
    return [
      "HTTP/1.1 200 OK",
      "Content-Type: text/plain; charset=utf-8",
      "Cache-Control: private, no-store",
      "X-Content-Type-Options: nosniff",
      "X-Lab-Evidence: " + encodeHex(flag),
      "X-Trace-Id: casefile-02",
      "",
      "Recorded training response. No real HTTP request was made.",
    ].join("\n");
  }
  return JSON.stringify({
    kind: "eternyx.training.build-manifest",
    version: 1,
    artifact: "demo-app.js",
    integrity: {
      reverse_marker: [...flag].reverse().join(""),
      note: "Legacy collector inadvertently wrote this marker backwards.",
    },
    advisory: "Training data. Do not rely on this as a real package signature.",
  }, null, 2);
}

export function constantTimeFlagEquals(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string") return false;
  const lhs = encoder.encode(candidate);
  const rhs = encoder.encode(expected);
  // Fixed expected length is server-controlled. No early exit on unequal bytes.
  let diff = lhs.length ^ rhs.length;
  for (let i = 0; i < Math.max(lhs.length, rhs.length); i++) {
    diff |= (lhs[i] ?? 0) ^ (rhs[i] ?? 0);
  }
  return diff === 0;
}

export function tallyVerifiedCtfSolves(solvedIds) {
  const owned = new Set(Array.isArray(solvedIds) ? solvedIds : []);
  return {
    solved: VERIFIED_CTF_MISSIONS.filter((mission) => owned.has(mission.id)).length,
    total: VERIFIED_CTF_MISSIONS.length,
    points: VERIFIED_CTF_MISSIONS.reduce((sum, mission) => sum + (owned.has(mission.id) ? mission.points : 0), 0),
    possible: VERIFIED_CTF_MISSIONS.reduce((sum, mission) => sum + mission.points, 0),
  };
}
