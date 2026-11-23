import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { validateWriteStagingConfig,buildPostgresCommand,WAVE12_STAGING_SQL } from "../scripts/security-ledger-staging-writes.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const actorA="11111111-1111-4111-8111-111111111111";
const actorB="22222222-2222-4222-8222-222222222222";
const env={
 ETERNYX_STAGING_ONLY:"yes",ETERNYX_STAGING_WRITE_ACK:"I_APPROVE_ROLLBACK_ONLY_STAGING_TEST",
 ETERNYX_STAGING_PROJECT_REF:"stagingabcd",ETERNYX_PRODUCTION_PROJECT_REF:"prodexample",
 ETERNYX_STAGING_USER_A_ID:actorA,ETERNYX_STAGING_USER_B_ID:actorB,
 PGHOST:"db.stagingabcd.supabase.co",PGPORT:"5432",PGDATABASE:"postgres",PGUSER:"postgres",
 PGPASSWORD:"fake-test-password",PGSSLMODE:"verify-full",
 PGSSLROOTCERT:fileURLToPath(new URL("../tests/security-ledger-staging-writes.test.mjs",import.meta.url)),
};
test("dedicated staging host, TLS and two independent operator approvals are required",()=>{
 const valid=validateWriteStagingConfig(env);
 assert.equal(valid.actorA,actorA);
 assert.equal(valid.actorB,actorB);
 assert.equal(valid.stagingRef,"stagingabcd");
 const malicious=[
  {ETERNYX_STAGING_ONLY:"no"},
  {ETERNYX_STAGING_WRITE_ACK:"yes"},
  {ETERNYX_PRODUCTION_PROJECT_REF:"stagingabcd"},
  {PGHOST:"db.prodexample.supabase.co"},
  {PGHOST:"localhost"},
  {PGPORT:"5433"},
  {PGDATABASE:"production"},
  {PGUSER:"service_role"},
  {PGSSLMODE:"require"},
  {PGSSLROOTCERT:"/not-real-certificate.crt"},
  {ETERNYX_STAGING_USER_B_ID:actorA},
  {ETERNYX_STAGING_USER_A_ID:"not-a-uuid"},
  {PGOPTIONS:"-c search_path=evil"},
  {PGHOSTADDR:"127.0.0.1"},
 ];
 for(const extra of malicious)assert.throws(()=>validateWriteStagingConfig({...env,...extra}));
});
test("psql arguments specify only actor UUIDs and local script, never connection secret or project URL",()=>{
 const command=buildPostgresCommand(validateWriteStagingConfig(env));
 assert.ok(command.includes("ON_ERROR_STOP=1"));
 assert.ok(command.includes("actor_a="+actorA));
 assert.ok(command.includes("actor_b="+actorB));
 assert.ok(command.some(s=>s.endsWith(WAVE12_STAGING_SQL)));
 assert.equal(command.some(s=>s.includes(env.PGPASSWORD)),false);
 assert.equal(command.some(s=>s.includes(env.PGHOST)),false);
});
test("SQL uses per-session claim emulation, real role policies and rollback proof",async()=>{
 const sql=await read(WAVE12_STAGING_SQL);
 for(const needle of [
 "BEGIN;", "SET ROLE authenticated;","ROLLBACK;","BEGIN TRANSACTION READ ONLY;",
 "auth.users", "security_case_assets", "security_case_findings",
 "security_case_finding_history", "pentest_audit_events", "insufficient_privilege",
 "check_violation", "request.jwt.claim.sub","wave12-excluded.example.test",
 "Wave 12 two-role transactional writes, revocation and rollback",
 "authorization_attested=false","still allowed finding edits",
 ])
  assert.ok(sql.toLowerCase().includes(needle.toLowerCase()),"Missing acceptance: "+needle);
 assert.match(sql,/ROLLBACK;[\s\S]*BEGIN TRANSACTION READ ONLY;/);
 assert.match(sql,/ROLLBACK;[\s\S]*COMMIT;/);
 assert.equal((sql.match(/^\s*ROLLBACK;/gm)||[]).length,1);
 assert.equal((sql.match(/^\s*COMMIT;/gm)||[]).length,1);
 const blocks=[...sql.matchAll(/DO \$([a-z]+)\$[\s\S]*?\$\1\$;/g)].map(m=>m[0]);
 assert.ok(blocks.length>=5);
 assert.ok(blocks.every(s=>!s.includes(":'actor_a'")&&!s.includes(":'eng_a'")),
   "PL/pgSQL cannot substitute psql variables inside dollar-quoted bodies");
});
test("the networkless CI executes actual role emulation and repeats 60 catalog checks",async()=>{
 const workflow=await read(".github/workflows/security-case-ledger-sql.yml");
 assert.match(workflow,/security-ledger-transactional-writes\.sql/);
 assert.match(workflow,/actor_a=11111111-1111-4111-8111-111111111111/);
 assert.match(workflow,/actor_b=22222222-2222-4222-8222-222222222222/);
 assert.match(workflow,/security-ledger-catalog-gate\.mjs --evaluate/);
 assert.match(workflow,/--network none/);
 assert.match(workflow,/if: always\(\)/);
 assert.doesNotMatch(workflow,/ETERNYX_STAGING_JWT_A=/);
});
test("no remote database work happens without explicit --run, and no secrets are logged",()=>{
 const cli=fileURLToPath(new URL("../scripts/security-ledger-staging-writes.mjs",import.meta.url));
 assert.ok(existsSync(cli));
 const blocked={...process.env,ETERNYX_STAGING_ONLY:""};
 const explain=spawnSync(process.execPath,[cli,"--explain"],{encoding:"utf8",env:blocked});
 assert.equal(explain.status,0);
 assert.match(explain.stdout,/DOES NOT test JWT HTTP auth/i);
 const config=spawnSync(process.execPath,[cli,"--check-config"],{encoding:"utf8",env:blocked});
 assert.equal(config.status,2);
 const run=spawnSync(process.execPath,[cli,"--run"],{encoding:"utf8",env:blocked});
 assert.equal(run.status,2);
 assert.doesNotMatch(run.stdout+run.stderr,/password.*=|Bearer /i);
 const configOK=spawnSync(process.execPath,[cli,"--check-config"],{encoding:"utf8",env:{...env}});
 assert.equal(configOK.status,0);
 assert.match(configOK.stdout,/without opening a database connection/);
});
