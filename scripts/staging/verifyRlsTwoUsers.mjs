/**
 * MANUAL, STAGING-ONLY TWO-ACCOUNT Supabase RLS acceptance.
 * Executes synthetic writes only after explicit approval and distinct
 * project refs; never uses service_role or calls production.
 * Reports contain case IDs and results ONLY (no emails, UUIDs, tokens, rows).
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  validateStagingRlsConfig, ISOLATION_SCENARIOS,
} from "./stagingRlsConfig.mjs";

const REPORT = "test-results/staging-rls-isolation.json";
const results = [];
const fixtures = [];
let cleanupClients = [];
let cleanupFailed = false;
let configured = false;
let authenticatedAccounts = 0;
const checkedTables = [];
const approved = "isolated staging only: manual fixture writes";
const marker = randomUUID();

function record(caseId, passed) {
  results.push({ case: caseId, result: passed ? "passed" : "failed" });
  process.stdout.write((passed ? "PASS " : "FAIL ") + caseId + "\n");
}
async function scenario(caseId, fn) {
  try { await fn(); record(caseId, true); }
  catch { record(caseId, false); }
}
function requireState(condition) {
  if (!condition) throw new Error("Assertion failed");
}
function denied(result) {
  return Boolean(result.error && (
    result.error.code === "42501" ||
    /permission denied|row.level security/i.test(result.error.message || "")
  ));
}
function expectedRows(result, count) {
  requireState(!result.error && Array.isArray(result.data) && result.data.length === count);
}
function client(config) {
  return createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: false, autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
async function getOwnedRow(c, table, id, ownerField, changedField) {
  const fields = ["id", ownerField, changedField].filter(Boolean).join(",");
  const r = await c.from(table).select(fields).eq("id", id).maybeSingle();
  requireState(!r.error && r.data);
  return r.data;
}
function writeReport() {
  mkdirSync("test-results", { recursive: true });
  writeFileSync(REPORT, JSON.stringify({
    schema: 1, environment: "isolated-supabase-staging",
    approval: configured ? approved : "not-approved",
    production_tested: false,
    stage_fixture_cleanup_failed: cleanupFailed,
    tested_tables: checkedTables,
    expected_tables: ISOLATION_SCENARIOS.map(s => s.table),
    configured_account_slots: configured ? 2 : 0,
    authenticated_accounts: authenticatedAccounts,
    expected_cases: 27,
    attempted_cases: results.length,
    passed_cases: results.filter(r => r.result === "passed").length,
    results,
    production_certified: false,
  }, null, 2) + "\n");
}
async function verifyPrivateProfiles(a, b, anon, ids) {
  const rows = [];
  for (const [i, c] of [a, b].entries()) {
    const r = await c.from("profiles")
      .select("id,user_id,is_profile_public").eq("user_id", ids[i]);
    expectedRows(r, 1);
    requireState(r.data[0].user_id === ids[i]);
    requireState(r.data[0].is_profile_public === false);
    rows.push(r.data[0].id);
  }
  record("profiles.own-private-read", true);
  await scenario("profiles.cross-user-read-denied", async () => {
    for (const [i, c] of [a, b].entries()) {
      const r = await c.from("profiles").select("id")
        .eq("user_id", ids[1 - i]);
      requireState(denied(r) || (!r.error && r.data.length === 0));
    }
  });
  await scenario("profiles.anonymous-read-denied", async () => {
    const r = await anon.from("profiles").select("id").in("id", rows);
    requireState(denied(r) || (!r.error && r.data.length === 0));
  });
}
async function main() {
  const config = validateStagingRlsConfig(process.env);
  configured = true;
  const [a, b] = [client(config), client(config)];
  cleanupClients = [a, b];
  const anon = client(config);
  const users = [];
  for (const [index, c] of [a, b].entries()) {
    const { data, error } = await c.auth.signInWithPassword(config.accounts[index]);
    requireState(!error && data?.user?.id);
    const current = await c.auth.getUser();
    requireState(!current.error && current.data?.user?.id === data.user.id);
    users.push(data.user.id);
  }
  requireState(users[0] !== users[1]);
  authenticatedAccounts = 2;
  record("two-distinct-authenticated-staging-users", true);
  for (const [i, c] of [a, b].entries()) {
    await scenario("non-admin-user-" + (i + 1), async () => {
      const r = await c.rpc("is_admin");
      requireState(!r.error && r.data === false);
    });
  }
  requireState(results.every(r => r.result === "passed"));
  await verifyPrivateProfiles(a, b, anon, users);
  for (const s of ISOLATION_SCENARIOS) {
    // Each row is synthetic, generated inside dedicated staging accounts.
    const rows = [];
    try {
      for (const [i, c] of [a, b].entries()) {
        const payload = s.makeFixture(users[i], marker);
        const insert = await c.from(s.table).insert(payload)
          .select(["id", s.owner, s.changedField].filter(Boolean).join(","))
          .single();
        requireState(!insert.error && insert.data?.id &&
          insert.data[s.owner] === users[i]);
        rows.push(insert.data);
        fixtures.push({ table: s.table, id: insert.data.id, ownerIndex: i });
      }
      checkedTables.push(s.table);
      record(s.table + ".fixtures-created", true);
      await scenario(s.table + ".own-read", async () => {
        for (const [i, c] of [a, b].entries()) {
          const row = await getOwnedRow(c, s.table, rows[i].id, s.owner, s.changedField);
          requireState(row[s.owner] === users[i]);
        }
      });
      await scenario(s.table + ".cross-read-denied", async () => {
        for (const [i, c] of [a, b].entries()) {
          const res = await c.from(s.table).select("id")
            .eq("id", rows[1 - i].id);
          requireState(denied(res) || (!res.error && res.data.length === 0));
        }
      });
      await scenario(s.table + ".anon-read-denied", async () => {
        const res = await anon.from(s.table).select("id")
          .in("id", rows.map(r => r.id));
        requireState(denied(res) || (!res.error && res.data.length === 0));
      });
      await scenario(s.table + ".forged-owner-insert-denied", async () => {
        const spoof = await a.from(s.table)
          .insert(s.makeFixture(users[1], marker + "-spoof"))
          .select("id");
        if (!spoof.error && Array.isArray(spoof.data) && spoof.data.length) {
          for (const row of spoof.data) fixtures.push({
            table: s.table, id: row.id, ownerIndex: 1,
          });
        }
        requireState(denied(spoof));
      });
      if (s.canUpdate) {
        await scenario(s.table + ".cross-update-denied", async () => {
          const field = s.changedField;
          const value = "ETERNYX-RLS-" + marker + "-attack";
          const changed = await a.from(s.table)
            .update({ [field]: value }).eq("id", rows[1].id).select("id");
          requireState(denied(changed) ||
            (!changed.error && Array.isArray(changed.data) && changed.data.length === 0));
          const original = await getOwnedRow(b, s.table, rows[1].id, s.owner, field);
          requireState(original[field] === rows[1][field]);
        });
      }
      await scenario(s.table + ".cross-delete-denied", async () => {
        const changed = await a.from(s.table).delete().eq("id", rows[1].id)
          .select("id");
        requireState(denied(changed) ||
          (!changed.error && Array.isArray(changed.data) && changed.data.length === 0));
        const original = await getOwnedRow(b, s.table, rows[1].id, s.owner, s.changedField);
        requireState(original[s.owner] === users[1]);
      });
    } catch {
      record(s.table + ".fixture-or-schema-error", false);
      // Continue to cleanup; do not interpret missing fixtures as test passes.
    }
  }
}
try {
  await main();
} catch {
  record("staging-configuration-or-authentication", false);
} finally {
  // Cleanup uses the same authenticated test identities and RLS. If records
  // remain, the runner fails rather than claiming a clean test.
  // Cleanup cannot use service_role or other privileged credentials.
  try {
    // Use only authenticated test-account clients; never a privileged key.
    for (const fixture of fixtures.reverse()) {
      const owner = cleanupClients[fixture.ownerIndex];
      if (!owner) { cleanupFailed = true; continue; }
      const deleted = await owner.from(fixture.table).delete()
        .eq("id", fixture.id).select("id");
      if (deleted.error || deleted.data?.length !== 1) cleanupFailed = true;
    }
  } catch {
    cleanupFailed = true;
  }
  if (cleanupClients.length) {
    const results = await Promise.all(cleanupClients.map(async c => {
      try {
        const r = await c.auth.signOut();
        return !r.error;
      } catch {
        return false;
      }
    }));
    const signedOut = results.every(Boolean);
    if (!signedOut) cleanupFailed = true;
    record("staging-sign-out", signedOut);
  }
  writeReport();
}
if (!configured || cleanupFailed || !checkedTables.every(
  t => ISOLATION_SCENARIOS.some(s => s.table === t)
) || checkedTables.length !== ISOLATION_SCENARIOS.length ||
  results.length !== 27 || results.some(r => r.result !== "passed")) {
  process.exitCode = 1;
}
