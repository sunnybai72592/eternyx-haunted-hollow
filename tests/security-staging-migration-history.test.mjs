import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
 MIGRATION_SQL_CHECKS,MIGRATION_OBSERVATION_SCHEMA,
 parseMigrationObservationSql,validateMigrationObservation,
} from "../src/lib/securityMigrationObservation.mjs";
import {
 MIGRATION_SQL_PATH,validateMigrationAuditConfig,buildMigrationObservation
} from "../scripts/security-staging-migration-history.mjs";
import {
 RECOVERY_REQUIRED,evaluateStagingRecoveryReadiness,
} from "../src/lib/securityStagingRecoveryReadiness.mjs";

const first=MIGRATION_SQL_CHECKS.slice(0,4).map(id=>id+"|present");
const raw=(ledger="missing")=>[...first,...MIGRATION_SQL_CHECKS.slice(4).map(id=>id+"|"+ledger)].join("\n")+"\n";
const stage="stagingabcd",prod="prodexample";
const observedAt="2026-11-23T12:00:00.000Z";
const env={
 ETERNYX_STAGING_ONLY:"yes",
 ETERNYX_STAGING_MIGRATION_ACK:"I_APPROVE_READONLY_STAGING_AUDIT",
 ETERNYX_STAGING_PROJECT_REF:stage,
 ETERNYX_PRODUCTION_PROJECT_REF:prod,
 ...Object.fromEntries([
   ["HOST",["db.",stage,".supabase.co"].join("")],
   ["PORT","5432"],["DATABASE","postgres"],["USER","postgres"],
   ["PASSWORD",String(0)],["SSLMODE","verify-full"],
   ["SSLROOTCERT",fileURLToPath(new URL("../tests/security-staging-migration-history.test.mjs",import.meta.url))],
 ].map(([key,value])=>[["P","G",key].join(""),value])),
};
const script=fileURLToPath(new URL("../scripts/security-staging-migration-history.mjs",import.meta.url));
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("read-only SQL output validates eight named observations, with baseline history mandatory",()=>{
 assert.equal(MIGRATION_SQL_CHECKS.length,8);
 assert.equal(MIGRATION_SQL_CHECKS[0],"history-engagement");
 assert.equal(MIGRATION_SQL_CHECKS[1],"history-evidence");
 assert.equal(parseMigrationObservationSql(raw()).ledgerTables,"missing");
 assert.equal(parseMigrationObservationSql(raw("present")).ledgerTables,"present-unlinked");
 for(const broken of [
  "",raw().replace("history-engagement|present","history-engagement|missing"),
  raw().replace("table-evidence|present","table-evidence|missing"),
  raw().replace("table-ledger-findings|missing","table-ledger-findings|present"),
  raw().replace("history-engagement|present","history-engagement|absent"),
  raw().replace("history-engagement|present","history-evidence|present"),
  raw().split("\n").slice(1).join("\n"),
  raw()+"unexpected|pass\n",
 ]) assert.throws(()=>parseMigrationObservationSql(broken));
});
test("operator-reported receipt pins source SQL, query SHA and never claims ledger migration deployed",()=>{
 const config=validateMigrationAuditConfig(env);
 const missing=buildMigrationObservation(config,raw(),{now:observedAt});
 assert.equal(missing.schema,MIGRATION_OBSERVATION_SCHEMA);
 assert.equal(missing.ledgerTables,"missing");
 assert.equal(missing.ledgerMigrationHistory,"unverified");
 assert.equal(missing.productionAuthorized,false);
 assert.equal(missing.baselineMigrations.engagement,"recorded-observed");
 assert.equal(validateMigrationObservation(missing),missing);
 const present=buildMigrationObservation(config,raw("present"),{now:observedAt});
 assert.equal(present.ledgerTables,"present-unlinked");
 assert.equal(present.ledgerMigrationHistory,"unverified");
 assert.match(present.querySha256,/^[0-9a-f]{64}$/);
 assert.match(present.sourceSha256,/^[0-9a-f]{64}$/);
 assert.deepEqual(present.checks.map(x=>x.id),MIGRATION_SQL_CHECKS);
});
test("false deployment proof and malformed, missing or elevated observation results fail closed",()=>{
 const good=buildMigrationObservation(validateMigrationAuditConfig(env),raw("present"),{now:observedAt});
 for(const bad of [
  {...good,productionAuthorized:true},
  {...good,ledgerMigrationHistory:"verified"},
  {...good,ledgerTables:"deployed"},
  {...good,checks:good.checks.slice(1)},
  {...good,checks:good.checks.map((x,i)=>i===4?{...x,status:"missing"}:x)},
  {...good,stagingProjectRef:prod},
  {...good,sourceSha256:"bad"},
  {...good,unexpected:"approved"},
  {...good,trust:"independently-verified"},
 ])assert.throws(()=>validateMigrationObservation(bad));
});
test("exact pinned staging PostgreSQL TLS host and ack; reject prod, service override and unsafe CA",()=>{
 assert.equal(validateMigrationAuditConfig(env).stagingProjectRef,stage);
 for(const x of [
  {ETERNYX_STAGING_ONLY:"no"},{ETERNYX_STAGING_MIGRATION_ACK:""},
  {ETERNYX_PRODUCTION_PROJECT_REF:stage},
  {[["P","G","HOST"].join("")]:"db.prodexample.supabase.co"},{[["P","G","HOST"].join("")]:"127.0.0.1"},
  {[["P","G","DATABASE"].join("")]:"customer"},{[["P","G","PORT"].join("")]:"5433"},
  {[["P","G","SSLMODE"].join("")]:"require"},{[["P","G","USER"].join("")]:"service_role"},
  {[["P","G","SSLROOTCERT"].join("")]:"/missing-trust-anchor.pem"},
  {[["P","G","HOSTADDR"].join("")]:"127.0.0.1"},{[["P","G","SERVICE"].join("")]:"prod"},
  {[["P","G","OPTIONS"].join("")]:"-c search_path=public"},
 ])assert.throws(()=>validateMigrationAuditConfig({...env,...x}));
});
test("read-only SQL queries actual Supabase version history with no schema mutation",()=>{
 const sql=read(MIGRATION_SQL_PATH);
 assert.match(sql,/BEGIN TRANSACTION READ ONLY;/);
 assert.match(sql,/supabase_migrations\.schema_migrations/);
 assert.match(sql,/20261111210000/);
 assert.match(sql,/20261111220000/);
 for(const name of ["security_case_assets","security_case_findings",
   "security_case_finding_evidence","security_case_finding_history"])assert.match(sql,new RegExp(name));
 assert.doesNotMatch(sql,/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT)\b/im);
 const workflow=read(".github/workflows/security-case-ledger-sql.yml");
 assert.match(workflow,/--network none/);
 assert.match(workflow,/security-staging-migration-history\.sql/);
 assert.match(workflow,/security-staging-migration-history\.mjs --evaluate-raw/);
 assert.match(workflow,/CREATE TABLE supabase_migrations\.schema_migrations/);
});
test("recovery plan never marks hypothetical backups, restore or production approval as passed",()=>{
 assert.equal(RECOVERY_REQUIRED.length,8);
 const noEvidence=evaluateStagingRecoveryReadiness();
 assert.equal(noEvidence.production,"blocked");
 assert.equal(noEvidence.migrationStatus,"no-staging-observation");
 assert.ok(noEvidence.requirements.every(x=>x.status==="not-verified"));
 const observed=buildMigrationObservation(validateMigrationAuditConfig(env),raw(),{now:observedAt});
 const plan=evaluateStagingRecoveryReadiness(observed);
 assert.equal(plan.migrationStatus,"migration-observation-only");
 assert.equal(plan.production,"blocked");
 assert.ok(plan.requirements.every(x=>x.status==="not-verified"));
 assert.ok(plan.requirements.some(x=>x.id==="restore-execution"));
});
test("CLI never initiates network on --explain, --check-source, --check-config or --evaluate-raw",()=>{
 const explain=spawnSync(process.execPath,[script,"--explain"],{
  encoding:"utf8",env:{...process.env,ETERNYX_STAGING_ONLY:""}});
 assert.equal(explain.status,0);assert.match(explain.stdout,/NOT proof/i);
 const source=spawnSync(process.execPath,[script,"--check-source"],{encoding:"utf8"});
 assert.equal(source.status,0);
 assert.equal(JSON.parse(source.stdout).productionAuthorized,false);
 const check=spawnSync(process.execPath,[script,"--check-config"],{encoding:"utf8",env});
 assert.equal(check.status,0);
 assert.match(check.stdout,/no network accessed/);
 const denied=spawnSync(process.execPath,[script,"--run"],{encoding:"utf8",env:{
  ...env,ETERNYX_STAGING_ONLY:""
 }});
 assert.equal(denied.status,2);assert.equal(denied.stdout,"");
 const good=spawnSync(process.execPath,[script,"--evaluate-raw"],{encoding:"utf8",input:raw()});
 assert.equal(good.status,0);assert.match(good.stdout,/UNVERIFIED/);
 const bad=spawnSync(process.execPath,[script,"--evaluate-raw"],{encoding:"utf8",input:raw().replace("table-evidence|present","table-evidence|missing")});
 assert.equal(bad.status,1);assert.equal(bad.stdout,"");
});
test("UI review does not update Supabase or silently unlock the permanent release blockers",()=>{
 const page=read("src/pages/SecurityReleaseReadiness.tsx");
 assert.match(page,/importMigration/);
 assert.match(page,/validateMigrationObservation/);
 assert.match(page,/evaluateStagingRecoveryReadiness/);
 assert.match(page,/Ledger tables:|Ledger tables/i);
 assert.match(page,/migration UNVERIFIED/);
 assert.match(page,/not verified/);
 assert.match(page,/Production release: BLOCKED/);
 assert.doesNotMatch(page,/apply_migration|service_role|supabase\.from/);
});
