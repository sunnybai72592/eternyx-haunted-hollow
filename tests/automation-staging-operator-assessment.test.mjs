import test from "node:test";
import assert from "node:assert/strict";
import {sourceJournal,assess} from "../scripts/automation-staging-operator-assessment.mjs";
import {readFileSync} from "node:fs";
const now=Date.parse("2026-11-27T15:25:00Z");
const source=sourceJournal();
const make=()=>({schema:"eternyx-automation-operator-snapshot-v1",observedAt:new Date(now).toISOString(),
 tables:30,rlsTables:30,unsafeTableGrants:0,rpcs:92,unsafeRpcs:0,workflows:0,runs:0,
 schedulerEnabled:false,enabledSchedules:0,expiredLeases:0,activeLeases:0,failedSchedules:0,
 enabledWebhooks:0,staleApprovals:0,stuckProviderCalls:0,failedProviderCalls24h:0,providerCalls:0,confirmedAccounts:2,
 journal:source.map((s,i)=>({...s,version:"202611241310"+String(i).padStart(2,"0"),statementCount:1}))});
test("actual tracked 22 files match ordered journal without claiming live execution",()=>{
 const s=make();const report=assess(s,source,{now});
 assert.equal(source.length,22);assert.equal(report.operatorInspectionPassed,true);
 assert.equal(report.observedCompletedRuns,0);assert.equal(report.productionReady,false);
 assert.equal(report.authenticatedRuntimeVerified,false);assert.equal(report.releaseAuthorized,false);
});
test("hash drift, missing file and ordering mismatch block inspection",()=>{
 for(const change of [s=>s.journal[0].gitBlobSha="0".repeat(40),s=>s.journal.pop(),s=>{const x=s.journal[0].version;s.journal[0].version=s.journal[1].version;s.journal[1].version=x;}]){
  const s=make();change(s);assert.ok(assess(s,source,{now}).blockers.includes("migration_integrity"));
 }
});
test("duplicates, split statement, expired evidence, invalid counters fail closed",()=>{
 for(const change of [s=>s.journal[1].version=s.journal[0].version,s=>s.journal[0].statementCount=2,s=>s.observedAt=new Date(now-900001).toISOString(),s=>s.runs=-1,s=>s.schedulerEnabled=null]){
  const s=make();change(s);assert.throws(()=>assess(s,source,{now}));
 }
});
test("security regression, unexpected scheduler activation, stuck work and absent accounts are distinct blockers",()=>{
 const s=make();s.unsafeRpcs=1;s.schedulerEnabled=true;s.stuckProviderCalls=1;s.confirmedAccounts=1;
 assert.deepEqual(assess(s,source,{now}).blockers,["catalog_security","unexpected_scheduler_activity","operational_attention","test_accounts_missing"]);
});
test("operator SQL is read-only and omits user identity and SQL statement text from output",()=>{
 const sql=readFileSync(new URL("../scripts/automation-staging-operator-snapshot.sql",import.meta.url),"utf8");
 assert.match(sql,/BEGIN READ ONLY;/);assert.match(sql,/COMMIT;/);
 assert.match(sql,/extensions\.digest/);assert.match(sql,/cardinality\(statements\)/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|DELETE FROM|UPDATE public\.|ALTER TABLE|CREATE TABLE)\b/i);
});
