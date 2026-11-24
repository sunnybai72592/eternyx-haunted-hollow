import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {MIGRATIONS,FUNCTIONS,validateMigrationInventory,validateFunctionConfig,
  createLabsBootstrapManifest} from "../scripts/labs-bootstrap-manifest.mjs";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
test("exact ordered LABS migrations and five real functions have source hashes",async()=>{
  const m=await createLabsBootstrapManifest();
  assert.deepEqual(m.migrations.map(x=>x.path.split("/").at(-1)),MIGRATIONS);
  assert.deepEqual(m.functions.map(x=>[x.slug,x.verifyJwt]),Object.entries(FUNCTIONS));
  assert.ok(m.migrations.every(x=>/^[0-9a-f]{64}$/.test(x.sha256)));
  assert.ok(m.functions.every(x=>/^[0-9a-f]{64}$/.test(x.entrypointSha256)));
  assert.equal(m.remoteDeploymentVerified,false);
  assert.equal(m.deploymentAuthorized,false);
});
test("missing, unexpected and collided migration versions refuse manifest",()=>{
  assert.equal(validateMigrationInventory([...MIGRATIONS]),true);
  for(const names of [
    MIGRATIONS.slice(1),
    [...MIGRATIONS,"20261124123456_ctf_new.sql"],
    [...MIGRATIONS,"20261122170000_other.sql"],
  ])assert.throws(()=>validateMigrationInventory(names));
});
test("worker and gateway authentication policy cannot drift unnoticed",async()=>{
  const config=await read("supabase/config.toml");
  assert.equal(validateFunctionConfig(config),true);
  assert.throws(()=>validateFunctionConfig(config.replace(
    "[functions.ctf-verified]\nverify_jwt = true","[functions.ctf-verified]\nverify_jwt = false")));
  assert.throws(()=>validateFunctionConfig(config+"\n[functions.ctf-range-worker]\nverify_jwt = true"));
});
test("runner installs the exact chain, exercises old RPCs before fencing and rolls back fixtures",async()=>{
  const s=await read("scripts/labs-bootstrap-rehearsal.sh");
  assert.match(s,/--network none/);
  assert.match(s,/ON_ERROR_STOP=1/);
  assert.match(s,/CI-only rehearsal/);
  const installed=[...s.matchAll(/^install supabase\/migrations\/(.+)$/gm)].map(m=>m[1]);
  assert.deepEqual(installed,MIGRATIONS);
  assert.match(s,/printf 'BEGIN;\\n'/);
  assert.match(s,/ROLLBACK;/);
  assert.ok(s.indexOf("smoke tests/sql/ctf-range-access-db-smoke.sql")<
    s.indexOf("install supabase/migrations/20261122200000"));
  assert.match(s,/eternyx-labs-composed-catalog-smoke.sql/);
  assert.doesNotMatch(s,/supabase db push|https:\/\/.*supabase\.co|PGHOST=|--link/);
});
test("final catalog enforces the column allowlist and checks disabled budgets",async()=>{
  const s=await read("tests/sql/eternyx-labs-composed-catalog-smoke.sql");
  assert.match(s,/has_column_privilege/);
  assert.match(s,/Session column boundary failed/);
  assert.match(s,/Table-level session SELECT bypasses allowlist/);
  assert.match(s,/max_24h_micro_usd=0/);
  assert.match(s,/max_reserved_minutes_per_24h=0/);
  assert.match(s,/Legacy unfenced RPC callable/);
});

test("forward repair exactly matches the server public session projection",async()=>{
  const migration=await read("supabase/migrations/20261124123000_ctf_range_session_column_privacy.sql");
  const contract=await read("supabase/functions/_shared/ctf-range-contract.mjs");
  const fields=[...contract.match(/const SESSION_FIELDS = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
  const grant=migration.match(/GRANT SELECT \(([^)]+)\)\s+ON TABLE public.ctf_range_sessions TO authenticated/)[1].split(",");
  assert.deepEqual(grant,fields);
  assert.match(migration,/REVOKE ALL PRIVILEGES ON TABLE/);
  assert.match(migration,/REVOKE ALL PRIVILEGES \(%I\)/);
  assert.doesNotMatch(migration,/\b(?:CREATE POLICY|SECURITY DEFINER|DROP TABLE|DELETE FROM)\b/);
  const smoke=await read("tests/sql/eternyx-labs-session-privacy-smoke.sql");
  assert.match(smoke,/SET ROLE service_role/);
  assert.match(smoke,/Private column filter accepted/);
  assert.match(smoke,/Wildcard select leaked/);
  assert.match(smoke,/Owner B visibility failed/);
});
