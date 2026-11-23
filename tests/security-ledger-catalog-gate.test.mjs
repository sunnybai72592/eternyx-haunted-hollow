import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
 EXPECTED_IDS,TABLES,LEDGER,SQL_FKEYS,SQL_FUNCTIONS,SQL_TRIGGERS,
 evaluateCatalogOutput,sourceReleasePreflight,
} from "../scripts/security-ledger-catalog-gate.mjs";

const good=EXPECTED_IDS.map(id=>id+"|pass").join("\n")+"\n";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("catalog contract has 60 deterministic, owner-scoped privileged checks",()=>{
 assert.equal(TABLES.length,7);
 assert.equal(LEDGER.length,4);
 assert.equal(SQL_FKEYS.length,5);
 assert.equal(SQL_FUNCTIONS.length,4);
 assert.equal(SQL_TRIGGERS.length,4);
 assert.equal(EXPECTED_IDS.length,60);
 assert.equal(new Set(EXPECTED_IDS).size,EXPECTED_IDS.length);
 assert.ok(EXPECTED_IDS.includes("history-append-only"));
 assert.ok(EXPECTED_IDS.includes("private-evidence-bucket"));
 assert.ok(EXPECTED_IDS.includes("private-storage-rls"));
 assert.equal(evaluateCatalogOutput(good).passed,60);
 assert.equal(evaluateCatalogOutput(good).productionAuthorized,false);
});
test("catalog gate rejects disabled RLS, public access, missing triggers, missing lines and false success",()=>{
 for(const item of [
  "rls:security_case_assets",
  "anon-deny-select:security_case_findings",
  "ledger-deny-delete:security_case_finding_evidence",
  "owner-read-policy:pentest_evidence",
  "ledger-write-owner-policy:security_case_assets",
  "ledger-update-owner-policy:security_case_findings",
  "composite-fk:security_case_finding_history_finding_fk",
  "function-execute-denied:security_case_guard_asset_scope",
  "trigger:security_case_guard_asset_scope_trg",
  "history-append-only",
 ]) {
  assert.throws(()=>evaluateCatalogOutput(good.replace(item+"|pass",item+"|fail")),
    /Security catalog invariant failed/);
 }
 assert.throws(()=>evaluateCatalogOutput(""),/missing/);
 assert.throws(()=>evaluateCatalogOutput(good+"bogus|pass\n"),/required check rows/);
 assert.throws(()=>evaluateCatalogOutput(good.replace("table:pentest_evidence|pass","table:pentest_engagements|pass")),/Duplicate catalog check|Missing catalog/);
 assert.throws(()=>evaluateCatalogOutput(good.replace("table:pentest_evidence|pass","garbled")),/Invalid catalog/);
});
test("source plan fingerprints reviewed SQL and never reports migration deployed or production ready",()=>{
 const plan=sourceReleasePreflight();
 assert.match(plan.sourceSha256,/^[0-9a-f]{64}$/);
 assert.match(plan.catalogSha256,/^[0-9a-f]{64}$/);
 assert.equal(plan.parentSha256.length,2);
 assert.ok(plan.parentSha256.every(x=>/^[0-9a-f]{64}$/.test(x)));
 assert.equal(plan.readOnlyCatalogChecks,60);
 assert.equal(plan.stagingDeploymentPerformed,false);
 assert.equal(plan.productionAuthorized,false);
 assert.equal(plan.manualReleaseBlockers.length,5);
});
test("catalog SQL is read-only and checks actual PostgreSQL policy and grant catalogs",async()=>{
 const s=await read("scripts/sql/security-ledger-catalog-gate.sql");
 for(const field of ["BEGIN TRANSACTION READ ONLY;","COMMIT;","pg_class",
  "pg_policies","pg_constraint","pg_trigger","pg_proc","storage.buckets",
  "has_table_privilege","has_function_privilege"])assert.ok(s.includes(field),field);
 assert.match(s,/SELECT id, CASE WHEN ok THEN 'pass' ELSE 'fail' END/);
 assert.doesNotMatch(s,/^\s*(INSERT|UPDATE|DELETE|ALTER TABLE|DROP TABLE|CREATE TABLE|TRUNCATE)\s/im);
});
test("rollback rehearsal changes and then restores catalog RLS only inside a transaction",async()=>{
 const s=await read("tests/sql/security-ledger-rollback-drill.sql");
 assert.match(s,/BEGIN;/);
 assert.match(s,/ALTER TABLE public.security_case_assets DISABLE ROW LEVEL SECURITY/);
 assert.match(s,/ROLLBACK;/);
 assert.match(s,/after rollback/i);
 assert.doesNotMatch(s,/COMMIT;/);
});
test("workflow runs real disposable PG catalog gate before and after transaction rollback",async()=>{
 const workflow=await read(".github/workflows/security-case-ledger-sql.yml");
 assert.match(workflow,/security-ledger-catalog-gate\.sql/);
 assert.match(workflow,/security-ledger-catalog-gate\.mjs --evaluate/);
 assert.match(workflow,/security-ledger-rollback-drill\.sql/);
 assert.match(workflow,/--network none/);
 assert.match(workflow,/if: always\(\)/);
});
test("script fails closed on bogus catalog input and has a safe no-network source preflight",()=>{
 const script=new URL("../scripts/security-ledger-catalog-gate.mjs",import.meta.url).pathname;
 const a=spawnSync(process.execPath,[script,"--check-source"],{encoding:"utf8"});
 assert.equal(a.status,0);
 const json=JSON.parse(a.stdout);
 assert.equal(json.productionAuthorized,false);
 assert.equal(json.stagingDeploymentPerformed,false);
 const b=spawnSync(process.execPath,[script,"--evaluate"],{encoding:"utf8",input:""});
 assert.notEqual(b.status,0);
 assert.match(b.stderr,/BLOCKED:/);
 const c=spawnSync(process.execPath,[script,"--evaluate"],{encoding:"utf8",input:good});
 assert.equal(c.status,0);
 assert.match(c.stdout,/NOT production approval/);
});
