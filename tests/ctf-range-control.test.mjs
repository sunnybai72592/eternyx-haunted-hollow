import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  RANGE_PACK, RANGE_ACTIVE_STATES, parseRangeRequest,
  providerIsOnline, publicRangeSession,
} from "../supabase/functions/_shared/ctf-range-contract.mjs";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const sessionId = "123e4567-e89b-42d3-a456-426614174001";

test("range control accepts only explicitly supported actions and strict input shapes", () => {
  assert.deepEqual(parseRangeRequest({ action: "status" }), { ok: true, action: "status" });
  assert.deepEqual(parseRangeRequest({ action: "sessions" }), { ok: true, action: "sessions" });
  assert.deepEqual(parseRangeRequest({ action: "request", pack: RANGE_PACK }),
    { ok: true, action: "request", pack: RANGE_PACK });
  assert.deepEqual(parseRangeRequest({ action: "stop", sessionId }),
    { ok: true, action: "stop", sessionId });

  for (const item of [
    null, [], "status", { action: "create" },
    { action: "status", userId: "victim" },
    { action: "sessions", owner: "someone-else" },
    { action: "request" },
    { action: "request", pack: "custom-image" },
    { action: "request", pack: RANGE_PACK, score: 9999 },
    { action: "request", pack: RANGE_PACK, endpoint: "https://evil.invalid" },
    { action: "stop", sessionId: "invalid-uuid" },
    { action: "stop", sessionId, user_id: "victim" },
    { action: "stop", sessionId, force: true },
  ]) {
    assert.deepEqual(parseRangeRequest(item), { ok: false }, "Rejected: " + JSON.stringify(item));
  }
});

test("provider readiness requires independent operator approval, capacity and fresh heartbeat", () => {
  const now = new Date("2026-11-22T18:00:00Z");
  const base = {
    enabled: true,
    ingress_approved: true,
    max_active_sessions: 2,
    last_heartbeat_at: "2026-11-22T17:59:40Z",
  };
  assert.equal(providerIsOnline(base, now), true);
  assert.equal(providerIsOnline({ ...base, ingress_approved: false }, now), false);
  assert.equal(providerIsOnline({ ...base, enabled: false }, now), false);
  assert.equal(providerIsOnline({ ...base, max_active_sessions: 0 }, now), false);
  assert.equal(providerIsOnline({ ...base, max_active_sessions: 4 }, now), false);
  assert.equal(providerIsOnline({ ...base, last_heartbeat_at: "2026-11-22T17:58:00Z" }, now), false);
  assert.equal(providerIsOnline({ ...base, last_heartbeat_at: "2026-11-22T18:00:10Z" }, now), false);
  assert.equal(providerIsOnline({ ...base, last_heartbeat_at: "nonsense" }, now), false);
  assert.equal(providerIsOnline(null, now), false);
});

test("owner-visible session serialization omits provider references, user ID and credentials", () => {
  const safe = publicRangeSession({
    id: sessionId,
    user_id: "secret-owner-id",
    provider_instance_ref: "internal-container-reference",
    ingress_url: "https://never-expose.invalid",
    jwt: "secret.jwt",
    challenge_pack: RANGE_PACK,
    status: "queued",
    requested_at: "2026-11-22T17:58:00Z",
    updated_at: "2026-11-22T17:58:00Z",
    expires_at: "2026-11-22T18:13:00Z",
    started_at: null,
    finished_at: null,
  });
  assert.deepEqual(Object.keys(safe), [
    "id", "challenge_pack", "status", "requested_at", "updated_at", "expires_at", "started_at", "finished_at",
  ]);
  assert.equal(JSON.stringify(safe).includes("internal-container-reference"), false);
  assert.equal(JSON.stringify(safe).includes("secret"), false);
  assert.equal(RANGE_ACTIVE_STATES.includes("stopping"), true);
  assert.throws(() => publicRangeSession(null), /Invalid session/);
});

test("Postgres migration is disabled by default, quota guarded and client read-only", async () => {
  const sql = await read("supabase/migrations/20261122180000_ctf_range_session_control.sql");
  assert.match(sql, /enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql, /ingress_approved boolean NOT NULL DEFAULT false/);
  assert.match(sql, /max_active_sessions smallint NOT NULL DEFAULT 0/);
  assert.match(sql, /BETWEEN 0 AND 3/);
  assert.match(sql, /last_heartbeat_at <= pg_catalog\.statement_timestamp\(\) - interval '60 seconds'/);
  assert.match(sql, /pg_advisory_xact_lock\(20261122, 340\)/);
  assert.match(sql, /v_daily >= 3/);
  assert.match(sql, /v_active >= v_provider\.max_active_sessions/);
  assert.match(sql, /INTERVAL '15 minutes'|interval '15 minutes'/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ctf_range_sessions_one_active_per_user/);
  assert.match(sql, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FOR SELECT TO authenticated/);
  assert.match(sql, /USING \(\(SELECT auth\.uid\(\)\) = user_id\)/);
  assert.match(sql, /GRANT SELECT ON public\.ctf_range_sessions TO authenticated/);
  assert.match(sql, /REVOKE ALL ON public\.ctf_range_provider FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.ctf_range_request_session\(uuid,text\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.ctf_range_request_session\(uuid,text\)\s*TO service_role/);
  assert.match(sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(sql, /provider_instance_ref/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
  assert.doesNotMatch(sql, /GRANT INSERT ON public\.ctf_range_sessions TO authenticated/);
});

test("controller derives JWT identity, avoids host APIs and has bounded request body", async () => {
  const handler = await read("supabase/functions/ctf-range-control/index.ts");
  const config = await read("supabase/config.toml");
  assert.match(handler, /authenticateUser\(req\)/);
  assert.match(handler, /user\.is_anonymous/);
  assert.match(handler, /raw\.length > 512/);
  assert.match(handler, /parseRangeRequest\(body\)/);
  assert.match(handler, /p_user_id: user\.id/);
  assert.match(handler, /providerIsOnline\(data, new Date\(\)\)/);
  assert.match(handler, /hostedAccessAvailable: false/);
  assert.match(handler, /"Cache-Control": "no-store"/);
  assert.match(handler, /publicRangeSession\(session\)/);
  assert.match(config, /\[functions\.ctf-range-control\]\s*verify_jwt\s*=\s*true/);
  assert.doesNotMatch(handler, /body\.user_id|body\.userId|body\.points|body\.score/);
  assert.doesNotMatch(handler, /from\s+["\x27]node:child_process|spawnSync\(|createServer\(|\/var\/run\/docker\.sock/);
});

test("account session dashboard links are discoverable and don't claim hosted access", async () => {
  const app = await read("src/App.tsx");
  const guide = await read("src/pages/EternyxCyberRange.tsx");
  const page = await read("src/pages/EternyxRangeSessions.tsx");
  assert.match(app, /EternyxRangeSessions = lazy/);
  assert.ok(app.includes('path="/labs/sessions" element={<EternyxRangeSessions />}'));
  assert.ok(guide.includes('to="/labs/sessions"'));
  assert.match(page, /Not available yet/);
  assert.match(page, /session reservations/i);
  assert.match(page, /hostedAccessAvailable === true/);
  assert.match(page, /supabase\.functions\.invoke\("ctf-range-control"/);
  assert.match(page, /Nothing is launched or billed when the service is unavailable/);
  assert.doesNotMatch(page, /Math\.random|localStorage\.setItem|fakeInstanceId|mockInstanceId|mockResults/i);
});
