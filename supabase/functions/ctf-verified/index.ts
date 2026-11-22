import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import {
  buildVerifiedCtfArtifact, constantTimeFlagEquals, deriveVerifiedCtfFlag,
  isVerifiedMission, tallyVerifiedCtfSolves, VERIFIED_CTF_MISSIONS,
} from "../../../src/lib/eternyxVerifiedCtf.mjs";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

const actions = new Set(["catalog", "artifact", "submit", "progress"]);
const validBody = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 1024) return reply({ error: "Request is too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid JSON request" }, 400);
  }

  if (!validBody(body) ||
      Object.keys(body).some((key) => !["action", "missionId", "flag"].includes(key)) ||
      typeof body.action !== "string" || !actions.has(body.action)) {
    return reply({ error: "Invalid CTF request" }, 400);
  }

  const action = body.action;
  if ((action === "artifact" || action === "submit") && !isVerifiedMission(body.missionId)) {
    return reply({ error: "Unknown CTF mission" }, 400);
  }
  if (action === "submit" &&
      (typeof body.flag !== "string" || body.flag.length > 120 ||
       !/^ETERNYX\{[a-z0-9_]+\}$/.test(body.flag.trim()))) {
    return reply({ error: "Enter a flag in ETERNYX{...} format" }, 400);
  }

  // Do not trust user identifiers, scores or ownership assertions in request bodies.
  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase || user.is_anonymous) return reply({ error: "Sign in to access verified missions" }, 401);

  const secret = Deno.env.get("CTF_FLAG_SECRET") ?? "";
  if (new TextEncoder().encode(secret).length < 32) {
    return reply({ error: "Verified missions are not enabled on this server" }, 503);
  }

  try {
    if (action === "catalog") {
      return reply({ missions: VERIFIED_CTF_MISSIONS, verifiedByServer: true });
    }

    if (action === "artifact") {
      const missionId = body.missionId as string;
      const expected = await deriveVerifiedCtfFlag(secret, user.id, missionId);
      return reply({
        missionId,
        casefile: buildVerifiedCtfArtifact(missionId, expected),
        description: "Signed-in, user-specific forensic training artifact; no network target is provisioned.",
      });
    }

    if (action === "progress") {
      const { data, error } = await supabase
        .from("ctf_verified_solves")
        .select("mission_id,solved_at")
        .eq("user_id", user.id);
      if (error) {
        console.error("CTF verified progress storage is unavailable", { code: error.code });
        return reply({ error: "Verified CTF storage is unavailable" }, 503);
      }

      const solvedIds = (data ?? []).map((row: { mission_id: string }) => row.mission_id);
      return reply({
        solves: data ?? [],
        summary: tallyVerifiedCtfSolves(solvedIds),
        verifiedByServer: true,
      });
    }

    if (action === "submit") {
      const missionId = body.missionId as string;
      const submittedFlag = (body.flag as string).trim();

      // One atomic rate slot per user/mission: 12 attempts / 15 minutes,
      // with a 3-second minimum gap. Unauthorized clients cannot invoke the RPC.
      const { data: allowed, error: attemptError } = await supabase.rpc(
        "ctf_claim_verification_attempt",
        { p_user_id: user.id, p_mission_id: missionId },
      );
      if (attemptError) {
        console.error("CTF submission rate limit storage unavailable", { code: attemptError.code });
        return reply({ error: "CTF verification is temporarily unavailable" }, 503);
      }
      if (allowed !== true) {
        return reply({ error: "Too many attempts. Try again after the cooldown." }, 429);
      }

      const expected = await deriveVerifiedCtfFlag(secret, user.id, missionId);
      if (!constantTimeFlagEquals(submittedFlag, expected)) {
        return reply({ accepted: false, error: "This flag does not match your account's casefile." }, 422);
      }

      // Unique constraint ensures the same challenge is awarded only once.
      // No score, user ID, or solve timestamp is accepted from the browser.
      const { error: saveError } = await supabase.from("ctf_verified_solves").upsert(
        { user_id: user.id, mission_id: missionId },
        { onConflict: "user_id,mission_id", ignoreDuplicates: true },
      );
      if (saveError) {
        console.error("CTF verified solve could not be persisted", { code: saveError.code });
        return reply({ error: "Flag matched but the verified solve could not be saved" }, 503);
      }
      return reply({ accepted: true, missionId, verifiedByServer: true });
    }

    return reply({ error: "Invalid CTF request" }, 400);
  } catch {
    // Never expose secrets, expected flags or internal database details.
    console.error("CTF verification failed unexpectedly");
    return reply({ error: "CTF verification is temporarily unavailable" }, 503);
  }
});
