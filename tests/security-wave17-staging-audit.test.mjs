import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {
 W17_STAGING_REF,W17_DEPLOYMENTS,W17_TABLES,W17_CHECK_IDS,W17_REPORT_SCHEMA,
 parseWave17Catalog,validateWave17AuditReport
} from "../src/lib/securityWave17StagingAudit.mjs";
import {
 W17_AUDIT_SQL,verifyWave17ReviewedSources,wave17RunReport,emitDisposableSeed
} from "../scripts/security-wave17-live-audit.mjs";
const sha=s=>createHash("sha256").update(s).digest("hex");
const stage=W17_STAGING_REF,production="wcncuarekaofmfurbtbh";
const baseline=W17_CHECK_IDS.map(id=>id+"|"+(id==="auth-two-user-fixtures"?"blocked":"pass")).join("\n")+"\n";
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const cli=fileURLToPath(new URL("../scripts/security-wave17-live-audit.mjs",import.meta.url));
test("verified staging maps three actual migration versions to exact GitHub SQL digests",()=>{
 assert.equal(W17_DEPLOYMENTS.length,3);
 assert.equal(W17_TABLES.length,7);
 assert.equal(W17_CHECK_IDS.length,12);
 assert.equal(stage,"mhodwvypfbxafamkrgsk");
 const entries=verifyWave17ReviewedSources();
 for(let i=0;i<entries.length;i++){
  const d=entries[i];
  assert.equal(sha(source(d.source)),d.sha256);
  assert.equal(d.bytes,Buffer.byteLength(source(d.source)));
  assert.match(d.version,/^20261123215[0-9]{3}$/);
 }
 assert.deepEqual(entries.map(x=>x.name),[
  "pentest_engagement_management_staging_baseline",
  "pentest_evidence_and_audit_staging_baseline",
  "security_case_indexed_ledger_staging_v1"
 ]);
});
test("live audit 11 schema/source checks pass but zero accounts is a visible unfinished acceptance",()=>{
 const parsed=parseWave17Catalog(baseline);
 assert.equal(parsed.checks.length,12);
 assert.equal(parsed.checksPassed,11);
 assert.equal(parsed.authFixturesPresent,false);
 const report=wave17RunReport({stagingProjectRef:stage,productionProjectRef:production},
  baseline,{now:"2026-11-23T21:52:11.000Z"});
 assert.equal(report.schema,W17_REPORT_SCHEMA);
 assert.equal(report.catalogPassed,60);
 assert.equal(report.jwtHttpAcceptance,"not-tested");
 assert.equal(report.productionAuthorized,false);
 assert.equal(report.sourceHashMatched,true);
 assert.equal(validateWave17AuditReport(report),report);
 assert.equal(report.checksPassed,11);
});
test("the presence of two users does not automatically turn JWT HTTP acceptance green",()=>{
 const allPass=baseline.replace("auth-two-user-fixtures|blocked","auth-two-user-fixtures|pass");
 const report=wave17RunReport({stagingProjectRef:stage,productionProjectRef:production},
  allPass,{now:"2026-11-23T21:52:11.000Z"});
 assert.equal(report.authFixturesPresent,true);
 assert.equal(report.jwtHttpAcceptance,"not-tested");
 assert.equal(report.productionAuthorized,false);
 assert.equal(report.checksPassed,12);
});
test("missing, duplicate, forged, re-ordered and failed source checks are always rejected",()=>{
 for(const invalid of [
  "",baseline.replace("migration:security_case_indexed_ledger_staging_v1|pass","migration:security_case_indexed_ledger_staging_v1|blocked"),
  baseline.replace("rls:pentest_evidence|pass","rls:pentest_evidence|blocked"),
  baseline.replace("auth-two-user-fixtures|blocked","auth-two-user-fixtures|failed"),
  baseline.split("\n").slice(1).join("\n"),baseline+"unexpected|pass\n",
  baseline.replace("private-evidence-bucket|pass","private-evidence-bucket|approved"),
  baseline.replace("private-evidence-bucket|pass","auth-two-user-fixtures|pass")
 ])assert.throws(()=>parseWave17Catalog(invalid));
});
test("unsigned report cannot be promoted, impersonate production, change check schema or forge JWT acceptance",()=>{
 const report=wave17RunReport({stagingProjectRef:stage,productionProjectRef:production},
  baseline,{now:"2026-11-23T21:52:11.000Z"});
 for(const changed of [
  {...report,productionAuthorized:true},
  {...report,jwtHttpAcceptance:"verified"},
  {...report,trust:"signed"},
  {...report,sourceHashMatched:false},
  {...report,catalogPassed:59},
  {...report,stagingRef:production},
  {...report,productionRef:stage},
  {...report,checksPassed:12},
  {...report,checks:report.checks.slice(1)},
  {...report,checks:report.checks.map(x=>x.id==="rls:pentest_evidence"?{...x,status:"blocked"}:x)},
  {...report,unexpected:true},
 ])assert.throws(()=>validateWave17AuditReport(changed));
});
test("auditor SQL is read-only, source-pinned and never supplies a JWT or invents Auth users",()=>{
 const sql=source(W17_AUDIT_SQL);
 assert.match(sql,/BEGIN TRANSACTION READ ONLY/);
 assert.match(sql,/sha256\(convert_to\(m\.statements\[1\]/);
 assert.match(sql,/auth\.users/);
 assert.match(sql,/storage\.buckets/);
 assert.match(sql,/c\.relrowsecurity/);
 for(const dep of W17_DEPLOYMENTS){
  assert.ok(sql.includes(dep.name)&&sql.includes(dep.version)&&sql.includes(dep.sha256));
 }
 assert.doesNotMatch(sql,/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|TRUNCATE)\b/im);
});
test("CI-only disposable migration seed is not usable as a real staging operation",()=>{
 assert.throws(()=>emitDisposableSeed({}));
 assert.throws(()=>emitDisposableSeed({CI:"true"}));
 assert.throws(()=>emitDisposableSeed({ETERNYX_EPHEMERAL_POSTGRES_ONLY:"yes"}));
 const seed=emitDisposableSeed({CI:"true",ETERNYX_EPHEMERAL_POSTGRES_ONLY:"yes"});
 assert.match(seed,/ALTER TABLE supabase_migrations\.schema_migrations/);
 assert.match(seed,/INSERT INTO supabase_migrations\.schema_migrations/);
 assert.match(seed,/20261123215211/);
 assert.ok(seed.includes("-- ETERNYX Wave 4 security case ledger"));
 const workflow=source(".github/workflows/security-case-ledger-sql.yml");
 assert.match(workflow,/--network none/);
 assert.match(workflow,/security-wave17-live-audit\.sql/);
 assert.match(workflow,/ETERNYX_EPHEMERAL_POSTGRES_ONLY=yes/);
 assert.match(workflow,/security-wave17-live-audit\.mjs --evaluate/);
});
test("CLI explain and source check never contact staging or leak database credentials",()=>{
 const env={...process.env,ETERNYX_STAGING_ONLY:""};
 const explain=spawnSync(process.execPath,[cli,"--explain"],{env,encoding:"utf8"});
 assert.equal(explain.status,0);
 assert.match(explain.stdout,/production never accessed/i);
 const checked=spawnSync(process.execPath,[cli,"--check-source"],{env,encoding:"utf8"});
 assert.equal(checked.status,0,checked.stderr);
 assert.equal(JSON.parse(checked.stdout).productionAuthorized,false);
 const verified=spawnSync(process.execPath,[cli,"--evaluate"],{env,encoding:"utf8",input:baseline});
 assert.equal(verified.status,0,verified.stderr);
 assert.match(verified.stdout,/11\/12/);
 assert.match(verified.stdout,/JWT HTTP acceptance NOT TESTED/);
 const blocked=spawnSync(process.execPath,[cli,"--run"],{env,encoding:"utf8"});
 assert.equal(blocked.status,1);
 assert.equal(blocked.stdout,"");
});
test("staging snapshot and migration reconciliation notes are committed with explicit production gate",()=>{
 const note=source("docs/CYBERSECURITY_UNIVERSE_WAVE_17.md");
 assert.match(note,/60\/60/);
 assert.match(note,/20261123215211/);
 assert.match(note,/migration history/i);
 assert.match(note,/zero Auth users/i);
 assert.match(note,/Production.*BLOCKED/i);
});
