import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdtemp,writeFile,rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const runner=path.join(root,"scripts/automation-staging-db-readonly.sh");
const STAGE="abcdefghijklmnopqrst";
const PROD="wcncuarekaofmfurbtbh";
const secret="STAGING_TEST_PASSWORD_NEVER_LOG";
const vars=(patch={})=>({
  ...process.env,
  ETERNYX_AUTOMATION_STAGING_DB_CONSENT:"I_APPROVE_READONLY_ISOLATED_STAGING",
  ETERNYX_AUTOMATION_STAGING_REF:STAGE,
  ETERNYX_AUTOMATION_PRODUCTION_REF:PROD,
  ETERNYX_AUTOMATION_STAGING_PGHOST:"db."+STAGE+".supabase.co",
  ETERNYX_AUTOMATION_STAGING_PGUSER:"postgres",
  ETERNYX_AUTOMATION_STAGING_PGPORT:"5432",
  ETERNYX_AUTOMATION_STAGING_PGDATABASE:"postgres",
  ETERNYX_AUTOMATION_STAGING_PGPASSWORD:secret,
  ETERNYX_AUTOMATION_STAGING_CA_PEM:"-----BEGIN CERTIFICATE-----\nSYNTHETIC_ONLY\n-----END CERTIFICATE-----",
  ...patch,
});
async function runFakePsql(fakeScript,patch={}){
  const fakeRoot=await mkdtemp(path.join(tmpdir(),"eternyx-psql-readonly-"));
  try{
    await writeFile(path.join(fakeRoot,"psql"),fakeScript,{mode:0o755});
    return spawnSync("bash",[runner],{
      cwd:root,encoding:"utf8",timeout:10000,
      env:vars({...patch,PATH:fakeRoot+":"+process.env.PATH}),
    });
  }finally{await rm(fakeRoot,{recursive:true,force:true});}
}
test("actual staging runner clears hostile libpq overrides and emits only parsed allowlisted evidence",async()=>{
  const fake=[
    "#!/usr/bin/env bash","set -euo pipefail",
    '[[ -z "${PGHOSTADDR:-}" ]] || exit 91',
    '[[ -z "${PGSERVICE:-}" ]] || exit 92',
    '[[ -z "${PGPASSFILE:-}" ]] || exit 93',
    '[[ -z "${PGGSSENCMODE:-}" ]] || exit 94',
    '[[ "${PGSSLMODE:-}" == "verify-full" ]] || exit 95',
    '[[ "${PGCONNECT_TIMEOUT:-}" == "8" ]] || exit 96',
    '[[ "${PGHOST:-}" == "db.abcdefghijklmnopqrst.supabase.co" ]] || exit 97',
    '[[ "${PGUSER:-}" == "postgres" ]] || exit 98',
    '[[ "${PGPORT:-}" == "5432" ]] || exit 99',
    '[[ "${PGDATABASE:-}" == "postgres" ]] || exit 100',
    '[[ "${PGOPTIONS:-}" == *"default_transaction_read_only=on"* ]] || exit 101',
    '[[ -s "${PGSSLROOTCERT:-/nonexistent}" ]] || exit 102',
    '[[ "$*" == *"--no-psqlrc"* ]] || exit 103',
    "cat <<'OUTPUT'",
    "connection_ok=true",
    "transaction_read_only=true",
    "migration_history_present=true",
    "automation_workflows_present=true",
    "automation_runs_present=true",
    "automation_webhooks_present=false",
    "automation_schedules_present=false",
    "applied_collision_version=20261123030000",
    "OUTPUT",
  ].join("\n")+"\n";
  const response=await runFakePsql(fake,{
    PGHOSTADDR:"127.0.0.1",PGSERVICE:"malicious-service",
    PGPASSFILE:"/tmp/production-secret",PGGSSENCMODE:"require",
    PGSSLMODE:"disable",PGCONNECT_TIMEOUT:"180",
    PGOPTIONS:"-c default_transaction_read_only=off",
    PGUSER:"postgres.OTHERPROJECT",
  });
  assert.equal(response.status,0,response.stderr);
  const output=JSON.parse(response.stdout);
  assert.equal(output.observed.connection_ok,true);
  assert.equal(output.observed.transaction_read_only,true);
  assert.equal(output.observed.automation_webhooks_present,false);
  assert.deepEqual(output.collidedAppliedVersions,["20261123030000"]);
  assert.equal(output.databaseWritesPerformed,false);
  assert.equal(output.releaseAuthorized,false);
  assert.doesNotMatch(response.stdout+response.stderr,/STAGING_TEST_PASSWORD_NEVER_LOG|malicious-service|production-secret/);
});
test("runner exposes sanitized connection-failure class, never raw psql credentials or stderr",async()=>{
  const fake=[
    "#!/usr/bin/env bash",
    "echo 'could not receive data from client: Connection reset by peer; password=STAGING_TEST_PASSWORD_NEVER_LOG' >&2",
    "exit 1",
  ].join("\n")+"\n";
  const response=await runFakePsql(fake);
  assert.equal(response.status,1);
  assert.equal(response.stdout,"");
  assert.match(response.stderr,/staging_db_probe_failed:management_client_connection_reset/);
  assert.doesNotMatch(response.stderr,/STAGING_TEST_PASSWORD_NEVER_LOG|password=/);
});
test("untrusted success response with read-only=false must be rejected without emitting user rows",async()=>{
  const fake=[
    "#!/usr/bin/env bash",
    "echo connection_ok=true","echo transaction_read_only=false",
    "echo migration_history_present=true","echo automation_workflows_present=true",
    "echo automation_runs_present=true","echo automation_webhooks_present=true",
    "echo automation_schedules_present=true",
  ].join("\n")+"\n";
  const response=await runFakePsql(fake);
  assert.equal(response.status,1);
  assert.equal(response.stdout,"");
  assert.match(response.stderr,/staging_db_malformed_readonly_result/);
});
test("known production project cannot reach even a fake psql subprocess",async()=>{
  const fake="#!/usr/bin/env bash\necho 'this subprocess MUST NOT RUN'\n";
  const response=await runFakePsql(fake,{
    ETERNYX_AUTOMATION_STAGING_REF:PROD,
    ETERNYX_AUTOMATION_STAGING_PGHOST:"db."+PROD+".supabase.co",
  });
  assert.equal(response.status,2);
  assert.equal(response.stdout,"");
  assert.match(response.stderr,/staging_db_target_not_isolated/);
  assert.doesNotMatch(response.stderr,/this subprocess MUST NOT RUN/);
});
test("real PG17 workflow includes actual SQL, journal-absent rejection, write-denial and cleanup",async()=>{
  const work=await readFile(path.join(root,".github/workflows/automation-staging-db-offline-contract.yml"),"utf8");
  for(const s of [
    "pull_request:","workflow_dispatch:","postgres:17-alpine","--network none",
    "automation-staging-db-readonly-fixture.sql",
    "20261122220000_automation_manual_control_plane.sql",
    "20261122230000_automation_signed_webhook_triggers.sql",
    "20261122234500_automation_scheduled_runs.sql",
    "scripts/sql/automation-staging-db-readonly.sql","ON_ERROR_STOP=1",
    "default_transaction_read_only=on","parseProbeLines",
    "missing-journal","readonly-write-denied","docker rm --force",
  ])assert.ok(work.includes(s),"missing real offline acceptance guard: "+s);
  assert.doesNotMatch(work,/\$\{\{\s*secrets\.|SUPABASE_ACCESS_TOKEN|service_role_key/i);
  const fixture=await readFile(path.join(root,"tests/sql/automation-staging-db-readonly-fixture.sql"),"utf8");
  assert.match(fixture,/CREATE SCHEMA supabase_migrations/);
  assert.match(fixture,/INSERT INTO supabase_migrations\.schema_migrations/);
  assert.match(fixture,/synthetic fixture, not an applied real migration/);
  assert.doesNotMatch(fixture,/wcncuarekaofmfurbtbh|704936db-cc9c-427b-b760-1c7c9b97618a/);
});
test("runner stays Bash-valid and removes inherited hostaddr and SQL repair paths",async()=>{
  const text=await readFile(runner,"utf8");
  assert.equal(spawnSync("bash",["-n",runner],{encoding:"utf8"}).status,0);
  assert.match(text,/unset PGSERVICE/);
  assert.match(text,/PGHOSTADDR/);
  assert.match(text,/PGSSLMODE="verify-full"/);
  assert.match(text,/default_transaction_read_only=on/);
  assert.match(text,/trap cleanup EXIT/);
  assert.doesNotMatch(text.split("\n").filter(x=>!x.trimStart().startsWith("#")).join("\n"),
    /\b(?:supabase db push|migration repair|functions deploy)\b/i);
});
