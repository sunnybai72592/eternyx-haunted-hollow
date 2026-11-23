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
 ...WORKSPACE_AUDIT_TABLES.map(v=>"table_status="+v+":true:false:true"),
 ...WORKSPACE_AUDIT_FUNCTIONS.map(v=>"function_status="+v+":true:true:true:true:false:1"),
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
 assert.equal(r.version,2);
 assert.equal(WORKSPACE_AUDIT_TABLES.length,18);
 assert.equal(WORKSPACE_AUDIT_FUNCTIONS.length,17);
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
  clean.replace("function_status="+WORKSPACE_AUDIT_FUNCTIONS[0]+":true:true:true:true:false:1",
    "function_status="+WORKSPACE_AUDIT_FUNCTIONS[0]+":false:true:true:true:false:1"),
  clean.replace("table_status="+WORKSPACE_AUDIT_TABLES[0]+":true:false:true",
    "table_status="+WORKSPACE_AUDIT_TABLES[0]+":false:false:true"),
  clean.replace("table_status="+WORKSPACE_AUDIT_TABLES[0]+":true:false:true",
    "table_status="+WORKSPACE_AUDIT_TABLES[0]+":true:true:true"),
 ];
 for(const receipt of cases)assert.equal(parseWorkspaceStagingAudit(receipt).release_gate,"blocked");
});
test("malformed, fake, duplicate and incomplete receipts are never proof",()=>{
 for(const receipt of [
  allGood().replace("transaction_read_only=true","transaction_read_only=false"),
  allGood().replace("migration_history_present=true","migration_history_present=false"),
  allGood().replace("connection_ok=true","connection_ok=false"),
  allGood().replace("function_status="+WORKSPACE_AUDIT_FUNCTIONS[0]+":true:true:true:true:false:1",""),
  allGood().replace("table_status="+WORKSPACE_AUDIT_TABLES[0]+":true:false:true",""),
  allGood()+"\npassword=fake",
  allGood()+"\napplied_version=20261111111111",
  allGood()+"\napplied_version="+WORKSPACE_AUDIT_VERSIONS[0],
  allGood()+"\ntable_status="+WORKSPACE_AUDIT_TABLES[0]+":true:false:true",
  "X".repeat(16001),
 ])assert.throws(()=>parseWorkspaceStagingAudit(receipt));
});
test("SQL is strictly SELECT catalog metadata in a read-only transaction",()=>{
 const sql=readFileSync(path.join(root,"scripts/sql/workspace-staging-db-audit.sql"),"utf8");
 const clean=sql.replace(/--[^\n]*/g,"");
 const statements=clean.replace(/'[^']*'/g,"''");
 assert.match(clean,/BEGIN READ ONLY;/);
 assert.match(clean,/SET LOCAL statement_timeout = '5s';/);
 assert.match(clean,/SET LOCAL lock_timeout = '2s';/);
 assert.match(clean,/FROM supabase_migrations\.schema_migrations/);
 assert.match(clean,/pg_catalog\.pg_class/);
 assert.match(clean,/pg_catalog\.pg_proc/);
 assert.match(clean,/pg_catalog\.pg_policy/);
 assert.match(clean,/to_regprocedure/);
 assert.match(clean,/has_function_privilege/);
 assert.match(clean,/has_table_privilege/);
 assert.match(clean,/search_path=/);
 assert.match(clean,/COMMIT;/);
 assert.doesNotMatch(statements,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|COPY|CALL|DO)\b/i);
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

test("every expected Workspace table is included, not just the Phase 28 subset",()=>{
 for(const name of ["workspace_import_batches","workspace_import_files","workspace_item_revisions"])
   assert.ok(WORKSPACE_AUDIT_TABLES.includes(name),name);
});
test("table with no policy or an anonymous write grant blocks staging readiness",()=>{
 const fixture=allGood();
 const table=WORKSPACE_AUDIT_TABLES[0];
 for(const state of [":true:false:false",":true:true:true"]){
   const receipt=fixture.replace("table_status="+table+":true:false:true",
     "table_status="+table+state);
   assert.equal(parseWorkspaceStagingAudit(receipt).release_gate,"blocked");
 }
});
test("exact function signature, definer, search_path and execute grants must all match",()=>{
 const clean=allGood(),name=WORKSPACE_AUDIT_FUNCTIONS[0];
 const receipt="function_status="+name+":true:true:true:true:false:1";
 for(const bad of [
   ":false:false:false:false:false:0", // exact signature missing
   ":true:false:true:true:false:1", // not SECURITY DEFINER
   ":true:true:false:true:false:1", // unpinned search_path
   ":true:true:true:false:false:1", // authenticated role cannot call
   ":true:true:true:true:true:1", // anon can EXECUTE
   ":true:true:true:true:false:2", // unreviewed overload exists
 ]){
   const report=parseWorkspaceStagingAudit(clean.replace(receipt,
     "function_status="+name+bad));
   assert.equal(report.release_gate,"blocked",bad);
 }
});
test("downgrade and forged legacy v1 receipts cannot silently pass the v2 catalog",()=>{
 const legacy=allGood().replace(
  "function_status="+WORKSPACE_AUDIT_FUNCTIONS[0]+":true:true:true:true:false:1",
  "function_status="+WORKSPACE_AUDIT_FUNCTIONS[0]+":true");
 assert.throws(()=>parseWorkspaceStagingAudit(legacy),/unexpected_output/);
 const mismatch=allGood().replace(
  "table_status="+WORKSPACE_AUDIT_TABLES[0]+":true:false:true",
  "table_status="+WORKSPACE_AUDIT_TABLES[0]+":true:false");
 assert.throws(()=>parseWorkspaceStagingAudit(mismatch),/unexpected_output/);
});
