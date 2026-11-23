import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { SECURITY_LEDGER_TABLES, evaluateLedgerReadiness } from "../src/lib/securityLedgerReadiness.mjs";

const read = path => readFile(new URL("../"+path,import.meta.url),"utf8");
const good = Object.fromEntries(SECURITY_LEDGER_TABLES.map(table=>[table,{data:[],error:null}]));
const engagement = {data:[],error:null};
const check = (overrides={}) => evaluateLedgerReadiness({
  userId:"11111111-1111-4111-8111-111111111111",
  engagements:engagement,tableResults:good,...overrides,
});

test("readiness requires all FOUR relational endpoints and owner engagement access",()=>{
  assert.equal(SECURITY_LEDGER_TABLES.length,4);
  assert.equal(check().ready,true);
  assert.equal(check({userId:""}).ready,false);
  assert.equal(check({engagements:{data:null,error:{message:"timeout"}}}).ready,false);
  assert.equal(check({tableResults:{...good, security_case_finding_history:{data:null,error:{message:"not found"}}}}).ready,false);
  assert.equal(check({tableResults:{...good, security_case_findings:undefined}}).ready,false);
  assert.equal(check({tableResults:{...good, security_case_assets:{data:{id:"fake"},error:null}}}).ready,false);
});

test("workspace probes all four tables under owner ID and fails closed if any probe errors",async()=>{
  const page=await read("src/pages/SecurityCaseLedger.tsx");
  assert.match(page,/SECURITY_LEDGER_TABLES\.map\(\(table\)/);
  assert.match(page,/ledger\(table\)\.select\("id"\)\.eq\("owner_id", userId\)\.limit\(1\)/);
  assert.match(page,/evaluateLedgerReadiness/);
  assert.match(page,/if \(readiness\.ready\)/);
  assert.match(page,/setBackendReady\(false\)/);
  assert.match(page,/Database preflight failed/);
  assert.match(page,/Schema not deployed or accessible/);
});

test("disposable PostgreSQL acceptance never contacts the production Supabase database",async()=>{
  const workflow=await read(".github/workflows/security-case-ledger-sql.yml");
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/permissions:\s*\n\s*contents: read/);
  assert.match(workflow,/--network none/);
  assert.match(workflow,/postgres:17-alpine/);
  assert.match(workflow,/openssl rand -hex 32/);
  assert.match(workflow,/docker rm -f eternyx-security-case-ledger-ci/);
  assert.match(workflow,/security-case-ledger-db-smoke\.sql/);
  assert.match(workflow,/staged-security-case-ledger\.sql/);
  assert.doesNotMatch(workflow,/supabase db push|apply_migration|DB_PASSWORD:|DATABASE_URL:|--publish|-p 5432/);
});

test("ephemeral database smoke runs real non-superuser two-account RLS, FK and revocation tests",async()=>{
  const sql=await read("tests/sql/security-case-ledger-db-smoke.sql");
  assert.match(sql,/SET ROLE authenticated/);
  assert.match(sql,/request\.jwt\.claim\.sub/);
  assert.match(sql,/11111111-1111-4111-8111-111111111111/);
  assert.match(sql,/22222222-2222-4222-8222-222222222222/);
  assert.match(sql,/excluded\.example\.test/);
  assert.match(sql,/out-of-scope\.test/);
  assert.match(sql,/foreign_key_violation/);
  assert.match(sql,/cross-owner/);
  assert.match(sql,/security_case_finding_history/);
  assert.match(sql,/security_case_finding_evidence/);
  assert.match(sql,/authorization_attested=false/);
  assert.match(sql,/ROLLBACK;/);
  assert.doesNotMatch(sql,/\\connect|\\password|\\copy/);
});

test("CLI candidate generator fails closed without explicit staging acknowledgement",async()=>{
  const script=await read("scripts/security-case-ledger-generate-migration.mjs");
  assert.match(script,/spawnSync\("supabase", \["migration", "new", filename\]/);
  assert.match(script,/ETERNYX_MIGRATION_ENV/);
  assert.match(script,/--staging-only-acknowledged/);
  assert.match(script,/process\.exit\(2\)/);
  assert.doesNotMatch(script,/migration apply|db push|supabase db reset/);
  const scriptUrl=new URL("../scripts/security-case-ledger-generate-migration.mjs",import.meta.url);
  const dry=spawnSync(process.execPath,[scriptUrl.pathname],{encoding:"utf8",env:{...process.env,ETERNYX_MIGRATION_ENV:"production"}});
  assert.equal(dry.status,0);
  assert.match(dry.stdout,/Dry run only/);
  const denied=spawnSync(process.execPath,[scriptUrl.pathname,"--generate"],{encoding:"utf8",env:{...process.env,ETERNYX_MIGRATION_ENV:"production"}});
  assert.equal(denied.status,2);
  assert.match(denied.stderr,/Refusing to generate/);
});

test("bootstrap creates isolated synthetic auth and storage structures without real identifiers",async()=>{
  const sql=await read("tests/sql/security-case-ledger-bootstrap.sql");
  assert.match(sql,/CREATE SCHEMA auth/);
  assert.match(sql,/CREATE SCHEMA storage/);
  assert.match(sql,/CREATE ROLE authenticated/);
  assert.match(sql,/CREATE FUNCTION auth\.uid\(\)/);
  assert.match(sql,/storage\.foldername/);
  assert.doesNotMatch(sql,/wcncuarekaofmfurbtbh|db\.supabase\.co/);
});
