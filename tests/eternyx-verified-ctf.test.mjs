import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildVerifiedCtfArtifact, constantTimeFlagEquals, deriveVerifiedCtfFlag,
  isVerifiedMission, tallyVerifiedCtfSolves, VERIFIED_CTF_MISSIONS,
} from "../src/lib/eternyxVerifiedCtf.mjs";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const secret = "this-is-a-long-ctf-secret-for-the-test-suite-only-not-production";
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

test("verified CTF catalog has three original finite-score missions", () => {
  assert.deepEqual(VERIFIED_CTF_MISSIONS.map(({ id }) => id), [
    "encoded-access-log", "header-evidence", "reversed-manifest",
  ]);
  assert.ok(VERIFIED_CTF_MISSIONS.every((mission) => mission.hints.length === 3 && mission.points > 0));
  assert.ok(!isVerifiedMission("__proto__"));
  assert.ok(!isVerifiedMission("invalid"));
});

test("server flags derive from secret, verified JWT owner and mission, never a client score", async () => {
  const first = await deriveVerifiedCtfFlag(secret, userA, "encoded-access-log");
  const repeated = await deriveVerifiedCtfFlag(secret, userA, "encoded-access-log");
  const otherOwner = await deriveVerifiedCtfFlag(secret, userB, "encoded-access-log");
  const otherMission = await deriveVerifiedCtfFlag(secret, userA, "header-evidence");
  assert.equal(first, repeated);
  assert.match(first, /^ETERNYX\{encoded_access_log_[0-9a-f]{24}\}$/);
  assert.notEqual(first, otherOwner);
  assert.notEqual(first, otherMission);
  assert.equal(constantTimeFlagEquals(first, first), true);
  assert.equal(constantTimeFlagEquals(otherOwner, first), false);
  assert.equal(constantTimeFlagEquals(first + "x", first), false);
  assert.equal(constantTimeFlagEquals(undefined, first), false);
});

test("server flag generation fails closed if signing key and identity are invalid", async () => {
  await assert.rejects(deriveVerifiedCtfFlag("test", userA, "encoded-access-log"), /not configured/);
  await assert.rejects(deriveVerifiedCtfFlag(secret, "anonymous", "encoded-access-log"), /Invalid challenge/);
  await assert.rejects(deriveVerifiedCtfFlag(secret, userA, "unknown"), /Invalid challenge/);
});

test("forensic casefiles encode account-specific flags for investigation without network access", async () => {
  for (const mission of VERIFIED_CTF_MISSIONS) {
    const flag = await deriveVerifiedCtfFlag(secret, userA, mission.id);
    const casefile = buildVerifiedCtfArtifact(mission.id, flag);
    assert.ok(casefile.length > 100);
    assert.equal(casefile.includes(flag), false, "Casefile must require an encoding step");
    assert.doesNotMatch(casefile, /https:\/\/(?!training\.invalid)/);
  }

  const encoded = await deriveVerifiedCtfFlag(secret, userA, "encoded-access-log");
  const log = buildVerifiedCtfArtifact("encoded-access-log", encoded);
  const fromLog = log.match(/lab_trace=([A-Za-z0-9+/=]+)/)?.[1];
  assert.ok(fromLog);
  assert.equal(Buffer.from(fromLog, "base64").toString("utf8"), encoded);

  const headerFlag = await deriveVerifiedCtfFlag(secret, userA, "header-evidence");
  const header = buildVerifiedCtfArtifact("header-evidence", headerFlag);
  const hex = header.match(/X-Lab-Evidence: ([0-9a-f]+)/)?.[1];
  assert.ok(hex);
  assert.equal(Buffer.from(hex, "hex").toString("utf8"), headerFlag);

  const reversedFlag = await deriveVerifiedCtfFlag(secret, userA, "reversed-manifest");
  const manifest = JSON.parse(buildVerifiedCtfArtifact("reversed-manifest", reversedFlag));
  assert.equal([...manifest.integrity.reverse_marker].reverse().join(""), reversedFlag);
  assert.throws(() => buildVerifiedCtfArtifact("does-not-exist", "ETERNYX{x}"), /Invalid casefile/);
});

test("verified scores derive from unique recognized server-owned solves only", () => {
  assert.deepEqual(tallyVerifiedCtfSolves([]), { solved: 0, total: 3, points: 0, possible: 440 });
  assert.deepEqual(tallyVerifiedCtfSolves(["header-evidence", "header-evidence", "unknown"]), {
    solved: 1, total: 3, points: 140, possible: 440,
  });
});

test("server endpoint verifies JWT owner, uses server key, rate limits, never reads client scores", async () => {
  const endpoint = await read("supabase/functions/ctf-verified/index.ts");
  const auth = await read("supabase/functions/_shared/user-auth.ts");
  const config = await read("supabase/config.toml");
  assert.match(endpoint, /authenticateUser\(req\)/);
  assert.match(auth, /supabase\.auth\.getUser\(match\[1\]\)/);
  assert.match(endpoint, /CTF_FLAG_SECRET/);
  assert.match(endpoint, /deriveVerifiedCtfFlag\(secret, user\.id, missionId\)/);
  assert.match(endpoint, /ctf_claim_verification_attempt/);
  assert.match(endpoint, /user_id: user\.id/);
  assert.match(endpoint, /ignoreDuplicates: true/);
  assert.match(endpoint, /"Cache-Control": "no-store"/);
  assert.match(config, /\[functions\.ctf-verified\]\s*verify_jwt\s*=\s*true/);
  assert.doesNotMatch(endpoint, /body\.user_id|body\.userId|body\.score|body\.points|Math\.random/);
});

test("CTF schema grants only owner SELECT, server-only inserts and atomic quota", async () => {
  const sql = await read("supabase/migrations/20261122170000_ctf_verified_missions.sql");
  assert.match(sql, /ctf_verified_solves/);
  assert.match(sql, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.ctf_verified_solves TO authenticated/);
  assert.match(sql, /USING \(\(SELECT auth\.uid\(\)\) = user_id\)/);
  assert.match(sql, /GRANT ALL ON TABLE public\.ctf_verified_solves TO service_role/);
  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.ctf_claim_verification_attempt\(uuid, text\) TO service_role/);
  assert.match(sql, /ON CONFLICT \(user_id, mission_id\) DO UPDATE/);
  assert.doesNotMatch(sql, /GRANT INSERT ON TABLE public\.ctf_verified_solves TO authenticated/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
});

test("verified mission route has truthful unavailable state and preserves browser-only CTF", async () => {
  const app = await read("src/App.tsx");
  const page = await read("src/pages/EternyxVerifiedCtf.tsx");
  const labs = await read("src/pages/EternyxLabs.tsx");
  const practice = await read("src/pages/EternyxCtf.tsx");
  assert.ok(app.includes('path="/labs/verified" element={<EternyxVerifiedCtf />}'));
  assert.match(app, /EternyxVerifiedCtf = lazy/);
  assert.match(labs, /to="\/labs\/verified"/);
  assert.match(practice, /to="\/labs\/verified"/);
  assert.match(page, /Verified missions are not available yet/);
  assert.match(page, /server-verified forensic training tasks/i);
  assert.match(page, /supabase\.functions\.invoke\("ctf-verified"/);
  assert.doesNotMatch(page, /localStorage\.setItem|fake.*score|mock.*progress/i);
});
