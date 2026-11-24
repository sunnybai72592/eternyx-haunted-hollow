import test from "node:test";
import assert from "node:assert/strict";
import {reconcile,compare,JOURNAL,TABLES,LABS_FUNCTIONS} from "../scripts/automation-after-labs-stage-plan.mjs";
import {buildCandidate,CTF} from "../scripts/automation-additive-replay-candidate.mjs";
import {STAGING_REF,PRODUCTION_REF,ORGANIZATION_ID} from "../scripts/automation-stage-snapshot-preflight.mjs";
const snapshot=()=>({schema:"eternyx-staging-snapshot-v1",project:{id:STAGING_REF,ref:STAGING_REF,organization_id:ORGANIZATION_ID,region:"us-east-1",status:"ACTIVE_HEALTHY"},migrations:JOURNAL.map(([version,name])=>({version,name})),functions:LABS_FUNCTIONS.map(slug=>({slug,status:"ACTIVE",verify_jwt:true,version:1,ezbr_sha256:"a".repeat(64)}))});
const catalog=()=>({schema:"eternyx-labs-occupied-stage-catalog-v2",postgres_major:17,tables:TABLES.map(name=>({name,rls:true,catalog_fingerprint:"a".repeat(32)})),automation_tables:0,automation_rpcs:0,ctf_rpc_fingerprint:"b".repeat(32),ctf_rpc_service_only:true});
test("22 source-pinned Automation migrations exclude installed CTF foundation",async()=>{
 const r=reconcile(snapshot(),catalog(),await buildCandidate());
 assert.equal(r.files.length,22);assert.ok(r.files.every(f=>f.name!==CTF));
 assert.equal(r.protectedTableCount,15);assert.equal(r.remoteExecutionAuthorized,false);
 assert.equal(r.requiresRehearsalWithAllSixLabsMigrations,true);
});
test("wrong target, journal drift, and partial Automation install fail closed",async()=>{
 const candidate=await buildCandidate();
 let s=snapshot();s.project.id=PRODUCTION_REF;assert.throws(()=>reconcile(s,catalog(),candidate),/wrong_target/);
 s=snapshot();s.migrations[3].name="unknown";assert.throws(()=>reconcile(s,catalog(),candidate),/journal_drift/);
 s=snapshot();s.migrations.pop();assert.throws(()=>reconcile(s,catalog(),candidate),/journal_drift/);
 const c=catalog();c.automation_tables=1;assert.throws(()=>reconcile(snapshot(),c,candidate),/partial_automation/);
});
test("missing, disabled or unauthenticated LABS functions are rejected",async()=>{
 const candidate=await buildCandidate();
 for(const mutate of [s=>s.functions.pop(),s=>{s.functions[0].verify_jwt=false},s=>{s.functions[0].status="INACTIVE"},s=>{s.functions[0].ezbr_sha256="bad"}]){
  const s=snapshot();mutate(s);assert.throws(()=>reconcile(s,catalog(),candidate),/labs_stage_function/);
 }
});
test("all 15 protected tables and restricted CTF RPC remain mandatory",async()=>{
 const candidate=await buildCandidate();
 for(const mutate of [c=>c.tables.pop(),c=>{c.tables[0].rls=false},c=>{c.ctf_rpc_service_only=false}]){
  const c=catalog();mutate(c);assert.throws(()=>reconcile(snapshot(),c,candidate),/labs_stage_/);
 }
});
test("catalog comparison detects table and RPC changes without claiming row verification",()=>{
 const before=catalog(),after=catalog();
 assert.equal(compare(before,after).protectedSchemaUnchanged,true);
 after.ctf_rpc_fingerprint="c".repeat(32);after.tables[0].catalog_fingerprint="d".repeat(32);
 const r=compare(before,after);assert.equal(r.protectedSchemaUnchanged,false);assert.equal(r.ctfRpcUnchanged,false);assert.deepEqual(r.changedTables,[TABLES[0]]);assert.equal(r.rowContentsVerified,false);
});
