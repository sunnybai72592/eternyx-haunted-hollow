import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {
 WORKSPACE_AUDIT_VERSIONS,WORKSPACE_AUDIT_TABLES,WORKSPACE_AUDIT_FUNCTIONS,
 inspectWorkspaceAuditConfig,parseWorkspaceStagingAudit,
} from "../scripts/workspace-staging-db-audit.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const stage="abcdefghijklmnopqrst",prod="wcncuarekaofmfurbtbh";
const config=(delta={})=>({
 WORKSPACE_AUDIT_CONFIRM:"I_APPROVE_READ_ONLY_WORKSPACE_STAGING",
 WORKSPACE_AUDIT_REF:stage,WORKSPACE_AUDIT_PGHOST:"db."+stage+".supabase.co",
 WORKSPACE_AUDIT_PGUSER:"postgres",WORKSPACE_AUDIT_PGPORT:"5432",
 WORKSPACE_AUDIT_PGDATABASE:"postgres",...delta,
});
const allGood=()=>[
 "connection_ok=true","transaction_read_only=true",
 "migration_history_present=true",
 ...WORKSPACE_AUDIT_VERSIONS.map(v=>"applied_version="+v),
 ...WORKSPACE_AUDIT_TABLES.map(v=>"table_status="+v+":true:false"),
 ...WORKSPACE_AUDIT_FUNCTIONS.map(v=>"function_status="+v+":true"),
].join("\n");
test("staging config is strictly pinned and nonproduction; reporting is metadata-only",()=>{
 const r=inspectWorkspaceAuditConfig(config());
 assert.equal(r.staging_reference,stage);
 assert.equal(r.tls_verify_full,true);
 assert.equal(r.pinned_ca_required,true);
 assert.equal(r.production_allowed,false);
 assert.equal(r.db_writes_allowed,false);
 assert.equal(r.executed,false);
 assert.doesNotMatch(JSON.stringify(r),/password|secret|token|CA_PEM/i);
});
test("production, missing consent, invalid network endpoints and pooler swaps fail closed",()=>{
 for(const d of [
  {WORKSPACE_AUDIT_CONFIRM:"NO"},
  {WORKSPACE_AUDIT_REF:prod,WORKSPACE_AUDIT_PGHOST:"db."+prod+".supabase.co"},
  {WORKSPACE_AUDIT_PGHOST:"localhost"},
  {WORKSPACE_AUDIT_PGHOST:"db."+stage+".supabase.co.evil.invalid"},
  {WORKSPACE_AUDIT_PGUSER:"postgres."+prod},
  {WORKSPACE_AUDIT_PGPORT:"6543"},
  {WORKSPACE_AUDIT_PGDATABASE:"template1"},
  {WORKSPACE_AUDIT_PGHOST:"aws-0-us-east-1.pooler.supabase.com",
   WORKSPACE_AUDIT_PGUSER:"postgres."+prod},
 ])assert.throws(()=>inspectWorkspaceAuditConfig(config(d)));
 assert.equal(inspectWorkspaceAuditConfig(config({
  WORKSPACE_AUDIT_PGHOST:"aws-0-us-east-1.pooler.supabase.com",
  WORKSPACE_AUDIT_PGUSER:"postgres."+stage,
 })).connection_type,"session_pooler");
});
test("complete migration, table RLS, no-anon and RPC inventory is NOT production certified",()=>{
 const r=parseWorkspaceStagingAudit(allGood());
 assert.equal(WORKSPACE_AUDIT_VERSIONS.length,14);
 assert.equal(r.release_gate,"manual_review_required");
 assert.equal(r.applied_migration_count,14);
 assert.equal(r.inspected_table_count,WORKSPACE_AUDIT_TABLES.length);
 assert.equal(r.inspected_function_count,WORKSPACE_AUDIT_FUNCTIONS.length);
 assert.equal(r.production_certified,false);
 assert.equal(r.actual_migration_sql_verified,false);
 assert.equal(r.database_writes_performed,false);
});
test("absent migration, missing RPC, disabled RLS, and anon direct reads each BLOCK",()=>{
 const clean=allGood();
 const cases=[
  clean.replace("applied_version="+WORKSPACE_AUDIT_VERSIONS[0]+"\n",""),
  clean.replace("function_status="+WORKSPACE_AUDIT_FUNCTIONS[0]+":true",
    "function_status="+WORKSPACE_AUDIT_FUNCTIONS[0]+":false"),
  clean.replace("table_status="+WORKSPACE_AUDIT_TABLES[0]+":true:false",
    "table_status="+WORKSPACE_AUDIT_TABLES[0]+":false:false"),
  clean.replace("table_status="+WORKSPACE_AUDIT_TABLES[0]+":true:false",
    "table_status="+WORKSPACE_AUDIT_TABLES[0]+":true:true"),
 ];
 for(const receipt of cases)assert.equal(parseWorkspaceStagingAudit(receipt).release_gate,"blocked");
});
test("malformed, fake, duplicate and incomplete receipts are never proof",()=>{
 for(const receipt of [
  allGood().replace("transaction_read_only=true","transaction_read_only=false"),
  allGood().replace("migration_history_present=true","migration_history_present=false"),
  allGood().replace("connection_ok=true","connection_ok=false"),
  allGood().replace("function_status="+WORKSPACE_AUDIT_FUNCTIONS[0]+":true",""),
  allGood().replace("table_status="+WORKSPACE_AUDIT_TABLES[0]+":true:false",""),
  allGood()+"\npassword=fake",
  allGood()+"\napplied_version=20261111111111",
  allGood()+"\napplied_version="+WORKSPACE_AUDIT_VERSIONS[0],
  allGood()+"\ntable_status="+WORKSPACE_AUDIT_TABLES[0]+":true:false",
  "X".repeat(16001),
 ])assert.throws(()=>parseWorkspaceStagingAudit(receipt));
});
test("SQL is strictly SELECT catalog metadata in a read-only transaction",()=>{
 const sql=readFileSync(path.join(root,"scripts/sql/workspace-staging-db-audit.sql"),"utf8");
 const clean=sql.replace(/--[^\n]*/g,"");
 assert.match(clean,/BEGIN READ ONLY;/);
 assert.match(clean,/SET LOCAL statement_timeout = '5s';/);
 assert.match(clean,/SET LOCAL lock_timeout = '2s';/);
 assert.match(clean,/FROM supabase_migrations\.schema_migrations/);
 assert.match(clean,/pg_catalog\.pg_class/);
 assert.match(clean,/pg_catalog\.pg_proc/);
 assert.match(clean,/COMMIT;/);
 assert.doesNotMatch(clean,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|COPY|CALL|DO)\b/i);
 assert.doesNotMatch(clean,/auth\.users|SELECT\s+\*\s+FROM|pg_get_functiondef/i);
 for(const v of WORKSPACE_AUDIT_VERSIONS)assert.ok(clean.includes("'"+v+"'"),v);
 for(const v of WORKSPACE_AUDIT_TABLES)assert.ok(clean.includes("'"+v+"'"),v);
 for(const v of WORKSPACE_AUDIT_FUNCTIONS)assert.ok(clean.includes("'"+v+"'"),v);
});
test("unapproved runner aborts before psql or credentials",()=>{
 const r=spawnSync("bash",["scripts/workspace-staging-db-audit.sh"],{
  cwd:root,env:{PATH:process.env.PATH},encoding:"utf8"});
 assert.equal(r.status,2);
 assert.match(r.stderr,/consent_required/);
});
test("runner pins TLS, rejects libpq overrides and deletes ephemeral evidence",()=>{
 const shell=readFileSync(path.join(root,"scripts/workspace-staging-db-audit.sh"),"utf8");
 for(const marker of ["PGSSLMODE=\"verify-full\"","PGSSLROOTCERT=","PGHOSTADDR",
  "PGSERVICE","PGOPTIONS=\"-c default_transaction_read_only=on",
  "scripts/sql/workspace-staging-db-audit.sql",
  "rm -f \"$ca_file\" \"$result_file\" \"$error_file\""]){
  assert.ok(shell.includes(marker),marker);
 }
 assert.doesNotMatch(shell,/--command(?:=|\s)/);
});
