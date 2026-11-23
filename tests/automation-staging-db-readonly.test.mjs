import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  inspectStagingConnection,classifyStagingPgFailure,parseProbeLines,
  ETERNYX_PRODUCTION_REF,
} from "../scripts/automation-staging-db-readonly.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const staging="abcdefghijklmnopqrst";
const prod=ETERNYX_PRODUCTION_REF;
const env=(x={})=>({
  ETERNYX_AUTOMATION_STAGING_REF:staging,
  ETERNYX_AUTOMATION_PRODUCTION_REF:prod,
  ETERNYX_AUTOMATION_STAGING_PGHOST:"db."+staging+".supabase.co",
  ETERNYX_AUTOMATION_STAGING_PGUSER:"postgres",
  ETERNYX_AUTOMATION_STAGING_PGPORT:"5432",
  ETERNYX_AUTOMATION_STAGING_PGDATABASE:"postgres",
  ...x,
});
function goodOutput(extra=""){
  return [
    "connection_ok=true",
    "transaction_read_only=true",
    "migration_history_present=true",
    "automation_workflows_present=true",
    "automation_runs_present=true",
    "automation_webhooks_present=false",
    "automation_schedules_present=false",extra,
  ].filter(Boolean).join("\n");
}
test("isolated direct connection validates project ref, TLS and true SELECT-only boundaries",()=>{
  const info=inspectStagingConnection(env());
  assert.equal(info.stagingRef,staging);
  assert.equal(info.connectionType,"direct");
  assert.equal(info.requireTlsVerifyFull,true);
  assert.equal(info.requirePinnedCa,true);
  assert.equal(info.transactionMode,"READ ONLY");
  assert.equal(info.databaseWritesAllowed,false);
  assert.equal(info.stagingApproved,false);
  assert.equal(info.productionReady,false);
  assert.equal(info.executed,false);
});
test("Supabase session-pooler username must contain the exact staging project ref",()=>{
  const info=inspectStagingConnection(env({
    ETERNYX_AUTOMATION_STAGING_PGHOST:"aws-0-us-east-1.pooler.supabase.com",
    ETERNYX_AUTOMATION_STAGING_PGUSER:"postgres."+staging,
  }));
  assert.equal(info.connectionType,"session_pooler");
  assert.equal(info.targetBound,true);
});
test("known production ref and arbitrary alternate prod-ref declarations are rejected",()=>{
  const attempts=[
    {ETERNYX_AUTOMATION_STAGING_REF:prod,
     ETERNYX_AUTOMATION_STAGING_PGHOST:"db."+prod+".supabase.co"},
    {ETERNYX_AUTOMATION_PRODUCTION_REF:staging},
    {ETERNYX_AUTOMATION_STAGING_REF:prod,
     ETERNYX_AUTOMATION_PRODUCTION_REF:staging,
     ETERNYX_AUTOMATION_STAGING_PGHOST:"db."+prod+".supabase.co"},
    {ETERNYX_AUTOMATION_STAGING_REF:"wrong"},
    {ETERNYX_AUTOMATION_STAGING_REF:""},
  ];
  for(const attempt of attempts)
    assert.throws(()=>inspectStagingConnection(env(attempt)),
      /staging_db_target_not_isolated/);
});
test("strict allowlist rejects private hosts, URLs, IPs, injection and invalid database or port",()=>{
  const hosts=[
    "127.0.0.1","localhost","postgres.internal",
    "evil.example.com","db."+prod+".supabase.co",
    "db."+staging+".supabase.co;rm -rf /",
    "http://db."+staging+".supabase.co",
    "db."+staging+".supabase.co.example.net",
    "aws-0-us-east-1.pooler.supabase.com.evil.invalid",
    "aws-0-us-east-1.pooler.supabase.com:5432",
  ];
  for(const host of hosts)
    assert.throws(()=>inspectStagingConnection(env({
      ETERNYX_AUTOMATION_STAGING_PGHOST:host,
    })));
  for(const attempt of [
    {ETERNYX_AUTOMATION_STAGING_PGUSER:"postgres."+prod},
    {ETERNYX_AUTOMATION_STAGING_PGUSER:"root"},
    {ETERNYX_AUTOMATION_STAGING_PGPORT:"6543"},
    {ETERNYX_AUTOMATION_STAGING_PGPORT:"5432;evil"},
    {ETERNYX_AUTOMATION_STAGING_PGDATABASE:"template1"},
    {ETERNYX_AUTOMATION_STAGING_PGDATABASE:"postgres?sslmode=disable"},
    {ETERNYX_AUTOMATION_STAGING_PGHOST:"aws-0-us-east-1.pooler.supabase.com",
      ETERNYX_AUTOMATION_STAGING_PGUSER:"postgres."+prod},
  ]) assert.throws(()=>inspectStagingConnection(env(attempt)));
});
test("sanitized diagnostic classes distinguish observed SSL EOF vs reset from unsupported guesses",()=>{
  const cases=[
    ["could not accept SSL connection: EOF detected","tls_handshake_interrupted"],
    ["could not receive data from client: Connection reset by peer","management_client_connection_reset"],
    ["SSL error: certificate verify failed","tls_certificate_verification_failed"],
    ["FATAL: password authentication failed for user postgres","authentication_failed"],
    ["could not translate host name","dns_resolution_failed"],
    ["connection timeout expired","connection_timeout"],
    ["Connection refused","network_unreachable"],
    ["ERROR: permission denied for schema","read_permission_denied"],
    ['ERROR: relation "supabase_migrations.schema_migrations" does not exist',
      "migration_history_unavailable"],
    ["canceling statement due to statement timeout","read_query_timeout"],
    ["could not start foobar","other_readonly_probe_failure"],
  ];
  for(const [raw,expected] of cases)
    assert.equal(classifyStagingPgFailure(raw),expected,raw);
  assert.equal(classifyStagingPgFailure(null),"unknown_failure");
});
test("allowlisted staging read evidence exposes only schema presence and collided versions",()=>{
  const report=parseProbeLines(goodOutput([
    "applied_collision_version=20261123030000",
    "applied_collision_version=20261123070000",
  ].join("\n")));
  assert.equal(report.schema,"eternyx-automation-staging-db-probe-result-v1");
  assert.equal(report.observed.connection_ok,true);
  assert.equal(report.observed.migration_history_present,true);
  assert.equal(report.observed.automation_webhooks_present,false);
  assert.deepEqual(report.collidedAppliedVersions,[
    "20261123030000","20261123070000",
  ]);
  assert.equal(report.collidedAppliedVersionCount,2);
  assert.equal(report.whichCollidedSqlExecuted,"unknown");
  assert.equal(report.migrationRepairsPerformed,false);
  assert.equal(report.databaseWritesPerformed,false);
  assert.equal(report.releaseAuthorized,false);
  const encoded=JSON.stringify(report);
  assert.doesNotMatch(encoded,/password|Bearer |session_token|private_key/);
});
test("untrusted query output, nonread-only status and invented version fail closed",()=>{
  const outputs=[
    goodOutput("applied_collision_version=20261123140000"),
    goodOutput("applied_collision_version=20261123030000\napplied_collision_version=20261123030000"),
    goodOutput("password=secret"),
    goodOutput("PGHOST=localhost"),
    goodOutput("connection_ok=true"),
    goodOutput().replace("transaction_read_only=true","transaction_read_only=false"),
    goodOutput().replace("migration_history_present=true","migration_history_present=false"),
    goodOutput().replace("connection_ok=true","connection_ok=false"),
    goodOutput().replace("automation_runs_present=true",""),
    "BEGIN\n"+goodOutput(),
    "ERROR: unauthorized",
    "a".repeat(4001),
  ];
  for(const line of outputs)
    assert.throws(()=>parseProbeLines(line),line.slice(0,80));
});
test("hardcoded SQL file contains only SELECT/SET in READ ONLY transaction, collision versions exactly",async()=>{
  const script=await readFile(path.join(root,"scripts/sql/automation-staging-db-readonly.sql"),"utf8");
  const uncommented=script.replace(/--[^\n]*/g,"").replace(/\/\*[\s\S]*?\*\//g,"");
  assert.match(uncommented,/BEGIN READ ONLY;/);
  assert.match(uncommented,/SET LOCAL statement_timeout = '5s';/);
  assert.match(uncommented,/SET LOCAL lock_timeout = '2s';/);
  assert.match(uncommented,/FROM supabase_migrations\.schema_migrations/);
  assert.match(uncommented,/COMMIT;/);
  assert.doesNotMatch(uncommented,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|COPY|CALL|DO)\b/i);
  assert.doesNotMatch(uncommented,/SELECT\s+\*\s+FROM|information_schema\.columns|auth\.users/i);
  const versions=[...uncommented.matchAll(/'((?:2026)\d{10})'/g)].map(x=>x[1]);
  assert.equal(versions.length,11);
  assert.equal(new Set(versions).size,11);
});
test("bash runner enforces approval, TLS full verification, fixed query and redacted errors",async()=>{
  const file=path.join(root,"scripts/automation-staging-db-readonly.sh");
  const syntax=spawnSync("bash",["-n",file],{encoding:"utf8"});
  assert.equal(syntax.status,0,syntax.stderr);
  const s=await readFile(file,"utf8");
  for(const token of [
    "I_APPROVE_READONLY_ISOLATED_STAGING","--check-config",
    "PGSSLMODE=\"verify-full\"","PGSSLROOTCERT",
    "PGOPTIONS=\"-c default_transaction_read_only=on",
    "PGCONNECT_TIMEOUT=\"8\"","--no-psqlrc",
    "--set ON_ERROR_STOP=1",
    "scripts/sql/automation-staging-db-readonly.sql",
    "classifyStagingPgFailure","parseProbeLines",
    "trap cleanup EXIT",
  ])assert.ok(s.includes(token),token);
  const executable=s.split("\n").filter(line=>!line.trimStart().startsWith("#")).join("\n");
  assert.doesNotMatch(executable,/\becho\s+"\$ETERNYX_AUTOMATION_STAGING_PGPASSWORD"|supabase db push|migration repair/i);
  const blocked=spawnSync("bash",[file],{cwd:root,encoding:"utf8",
    env:{...process.env,ETERNYX_AUTOMATION_STAGING_DB_CONSENT:"NOT_APPROVED"}});
  assert.equal(blocked.status,2);
  assert.match(blocked.stderr,/staging_db_explicit_approval_required/);
  assert.equal(blocked.stdout,"");
});
test("GitHub action has manual-only protected staging environment and no checkout-triggered database work",async()=>{
  const w=await readFile(path.join(root,
    ".github/workflows/automation-staging-db-readonly.yml"),"utf8");
  assert.match(w,/workflow_dispatch:/);
  assert.doesNotMatch(w,/^\s+(?:push|pull_request|schedule):/m);
  assert.match(w,/environment: automation-staging/);
  assert.match(w,/staging_readonly_approval == 'I_APPROVE_READONLY_ISOLATED_STAGING'/);
  assert.match(w,/secrets\.ETERNYX_AUTOMATION_STAGING_PGPASSWORD/);
  assert.match(w,/secrets\.ETERNYX_AUTOMATION_STAGING_CA_PEM/);
  assert.match(w,/run: node scripts\/automation-staging-db-readonly\.mjs --check-config/);
  assert.match(w,/bash scripts\/automation-staging-db-readonly\.sh/);
  assert.doesNotMatch(w,/SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|supabase db push|functions deploy/);
});
