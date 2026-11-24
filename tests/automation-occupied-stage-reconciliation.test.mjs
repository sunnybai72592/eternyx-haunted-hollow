import test from "node:test";
import assert from "node:assert/strict";
import {reconcileBefore,compareProtectedCatalogs,validateCatalog} from "../scripts/automation-occupied-stage-reconciliation.mjs";
import {STAGING_REF,ORGANIZATION_ID,PRODUCTION_REF} from "../scripts/automation-stage-snapshot-preflight.mjs";
import {OBSERVED_VERSIONS,PROTECTED_TABLES,buildCandidate} from "../scripts/automation-additive-replay-candidate.mjs";
const names=["pentest_engagement_management_staging_baseline","pentest_evidence_and_audit_staging_baseline","security_case_indexed_ledger_staging_v1"];
const snapshot=()=>({schema:"eternyx-staging-snapshot-v1",project:{id:STAGING_REF,ref:STAGING_REF,organization_id:ORGANIZATION_ID,region:"us-east-1",status:"ACTIVE_HEALTHY"},migrations:OBSERVED_VERSIONS.map((version,i)=>({version,name:names[i]})),functions:[]});
const catalog=()=>({schema:"eternyx-occupied-stage-catalog-v1",postgres_major:17,tables:PROTECTED_TABLES.map(name=>({name,rls:true,catalog_fingerprint:"a".repeat(32)})),automation_ctf_tables:0,automation_ctf_rpcs:0});
test("exact occupied journal and real source candidate reconcile without authorizing writes",async()=>{
 const result=reconcileBefore(snapshot(),catalog(),await buildCandidate());
 assert.equal(result.existingSecurityTables,7);assert.ok(result.candidateCount>=23);
 assert.equal(result.releaseAuthorized,false);assert.equal(result.sqlApplied,false);
});
test("production, renamed journal entry, new migration and partial core state are blocked",async()=>{
 const c=await buildCandidate();
 let s=snapshot();s.project.ref=PRODUCTION_REF;assert.throws(()=>reconcileBefore(s,catalog(),c),/wrong_target/);
 s=snapshot();s.migrations[0].name="wrong";assert.throws(()=>reconcileBefore(s,catalog(),c),/journal_drift/);
 s=snapshot();s.migrations.push({version:"20261123215212",name:"extra"});assert.throws(()=>reconcileBefore(s,catalog(),c),/journal_drift/);
 s=snapshot();s.functions=[{slug:"automation-control"}];assert.throws(()=>reconcileBefore(s,catalog(),c),/existing_core_objects/);
 const t=catalog();t.automation_ctf_rpcs=1;assert.throws(()=>reconcileBefore(snapshot(),t,c),/existing_core_objects/);
});
test("missing tables, duplicate tables, disabled RLS and wrong PostgreSQL major are rejected",()=>{
 for(const change of [c=>c.tables.pop(),c=>{c.tables[0]=c.tables[1]},c=>{c.tables[0].rls=false},c=>{c.postgres_major=16}]){
  const c=catalog();change(c);assert.throws(()=>validateCatalog(c),/occupied_stage_/);
 }
});
test("protected schema fingerprint comparison detects changes but never claims row preservation",()=>{
 const a=catalog(),b=catalog();b.automation_ctf_tables=15;b.automation_ctf_rpcs=60;
 assert.deepEqual(compareProtectedCatalogs(a,b),{protectedSchemaUnchanged:true,changedTables:[],rowContentsVerified:false,releaseAuthorized:false});
 b.tables[0].catalog_fingerprint="b".repeat(32);
 assert.deepEqual(compareProtectedCatalogs(a,b).changedTables,[PROTECTED_TABLES[0]]);
 assert.equal(compareProtectedCatalogs(a,b).protectedSchemaUnchanged,false);
});
test("candidate provenance and migration collisions are checked",async()=>{
 const c=await buildCandidate();c.files[0].sha256="bad";assert.throws(()=>reconcileBefore(snapshot(),catalog(),c),/candidate_identity/);
});
