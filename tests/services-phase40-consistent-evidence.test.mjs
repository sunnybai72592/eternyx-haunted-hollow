import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 validateStagingEnvelope,verifyLiveMigrationSequence,enforceConsistentStagingEvidence
} from '../scripts/services-phase40-consistent-staging-evidence.mjs';
import {buildAuditSql,validateLiveAuditOutput}
 from '../scripts/services-phase36-staging-live-db-proof.mjs';
import {SERVICES_REPLAY_FILES}
 from '../scripts/services-pg17-replay-plan.mjs';
import {REQUIRED_AUDITOR_ASSERTIONS}
 from '../scripts/services-phase37-auditor-privileges.mjs';
import {EXPOSED_ROUTINE_CHECKS}
 from '../scripts/services-phase38-executable-definer-guard.mjs';
import {PHASE39_FACTS}
 from '../scripts/services-phase39-definer-safety.mjs';

const ref='abcdefghijklmnopqrst';
const now=new Date('2026-11-23T21:40:00.000Z');
const allTrue=keys=>Object.fromEntries(keys.map(k=>[k,true]));
const names=SERVICES_REPLAY_FILES.map(file=>file.slice(15,-4));
const managed=()=>names.map((name,i)=>({
 name,version:String(20261122000000+i),
}));
const catalog=()=>({
 phase1_requests:true,
 phase12_customer_followup_queue:true,
 phase13_amendments:true,
 phase13_customer_queue:true,
 phase13_admin_queue:true,
 phase14_journal:true,
});
const identity=()=>({
 role:'services_staging_auditor',db:'postgres',
 server_time:'2026-11-23T21:40:00+00:00',
 auditor_privileges:allTrue(REQUIRED_AUDITOR_ASSERTIONS),
 routine_surface:allTrue(EXPOSED_ROUTINE_CHECKS),
 definer_hardening:allTrue(PHASE39_FACTS),
});
const rows=()=>[
 identity(),
 {managed_migrations:managed()},
 catalog(),
 {catalog_checks_passed:true,checks_evaluated:64,checks_failed:0,failed_check_ids:[]},
];
const output=arr=>arr.map(JSON.stringify).join('\n')+'\n';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('Phase40 accepts exactly four live proof rows and reports 13 source migrations',()=>{
 const data=rows();
 assert.deepEqual(validateStagingEnvelope(data),{
  contractVerified:true,requiredJsonRows:4,strictCatalogChecks:64,
 });
 const result=enforceConsistentStagingEvidence(data);
 assert.equal(result.namedServiceMigrationsVerified,13);
 assert.equal(result.actualManagedVersionOrderStrictlyIncreasing,true);
 assert.equal(result.phases13Before14ByRecordedVersion,true);
 assert.equal(result.sourceTimestampUsedAsDeploymentProof,false);
 assert.equal(result.migrationSqlContentAuthenticated,false);
 assert.equal(result.databaseWritePerformed,false);
});

test('Phase40 fails closed on incomplete or extra row and object fields',()=>{
 const original=rows();
 for(const bad of [
  [], original.slice(0,3), [...original,{}],
  [ {...original[0],unexpected:1}, ...original.slice(1)],
  [Object.fromEntries(Object.entries(original[0]).filter(([k])=>k!=='db')),...original.slice(1)],
  [original[0],{...original[1],unexpected:true},original[2],original[3]],
  [original[0],original[1],{...original[2],unknown:true},original[3]],
  [original[0],original[1],original[2],{...original[3],extra:true}],
 ])
  assert.throws(()=>validateStagingEnvelope(bad),
   /services_phase40_envelope_incomplete_or_unexpected/);
});

test('Phase40 rejects null/string/number replacements for the six catalog booleans',()=>{
 for(const k of Object.keys(catalog())){
  for(const v of [false,null,'true',1,0,undefined]){
   const data=rows();data[2][k]=v;
   if(v===false)assert.equal(validateStagingEnvelope(data).contractVerified,true);
   else assert.throws(()=>validateStagingEnvelope(data),/services_phase40_catalog_untyped/);
  }
 }
});

test('Phase40 rejects bool, string, float, null and negative values as fake 64/64 verdict',()=>{
 const cases=[
  ['catalog_checks_passed','true'],['catalog_checks_passed',1],
  ['checks_evaluated','64'],['checks_evaluated',64.1],
  ['checks_evaluated',true],['checks_evaluated',null],
  ['checks_failed','0'],['checks_failed',false],
  ['checks_failed',-1],['checks_failed',null],
  ['failed_check_ids',null],['failed_check_ids','[]'],
  ['failed_check_ids',['something']],
 ];
 for(const [k,v] of cases){
  const data=rows();data[3][k]=v;
  assert.throws(()=>validateStagingEnvelope(data),
   /services_phase40_catalog_verdict_not_exact/,k+'='+String(v));
 }
});

test('Phase40 rejects actual managed history with Phase 13/14 reversed even when objects exist',()=>{
 const data=rows();
 const [amend,journal]=data[1].managed_migrations.slice(11);
 [amend.version,journal.version]=[journal.version,amend.version];
 assert.throws(()=>verifyLiveMigrationSequence(data[1].managed_migrations),
  /services_phase40_service_history_wrong_dependency_order/);
 assert.throws(()=>validateLiveAuditOutput(output(data),{ref},now),
  /services_phase36_inconsistent_live_evidence/);
});

test('Phase40 rejects an earlier dependency reordered, not merely a Phase13/14 swap',()=>{
 const data=rows();
 [data[1].managed_migrations[3].version,data[1].managed_migrations[4].version]=
 [data[1].managed_migrations[4].version,data[1].managed_migrations[3].version];
 assert.throws(()=>verifyLiveMigrationSequence(data[1].managed_migrations),
  /services_phase40_service_history_wrong_dependency_order/);
});

test('Phase40 checks managed VERSION numbers, not source timestamps or JSON array order',()=>{
 const data=rows();
 data[1].managed_migrations.reverse();
 assert.equal(verifyLiveMigrationSequence(data[1].managed_migrations)
   .actualManagedVersionOrderStrictlyIncreasing,true);
 // Version collisions are not tolerated even with distinct names.
 const collide=managed();collide[12].version=collide[11].version;
 assert.throws(()=>verifyLiveMigrationSequence(collide),
  /services_phase40_managed_history_invalid/);
 const wrongVersion=managed();wrongVersion[12].version='2026-11-23';
 assert.throws(()=>verifyLiveMigrationSequence(wrongVersion),
  /services_phase40_managed_history_invalid/);
});

test('Phase40 handles unrelated interleaved managed names without assuming source filename versions',()=>{
 const data=managed();
 const extra=[{name:'unrelated_other_pillar',version:'20261123900000'}];
 assert.equal(verifyLiveMigrationSequence([...extra,...data])
  .namedServiceMigrationsVerified,13);
 const noLast=managed().slice(0,-1);
 assert.throws(()=>verifyLiveMigrationSequence(noLast),
  /services_phase40_managed_history_incomplete/);
 const missingName=managed();missingName[12].name='different_name';
 assert.throws(()=>verifyLiveMigrationSequence(missingName),
  /services_phase40_service_history_missing_names/);
});

test('Phase40 accepts only actual 64/64 and chronological live version history in full gate',()=>{
 const result=validateLiveAuditOutput(output(rows()),{ref},now);
 assert.equal(result.accepted,true);
 assert.equal(result.remoteHistoryDependencyOrderVerified,true);
 assert.equal(result.phase13Before14ByRealManagedVersion,true);
 assert.equal(result.readOnlyRepeatableReadSnapshot,true);
 assert.equal(result.strictLiveEvidenceEnvelope,true);
 for(const [key,value] of [
  ['checks_evaluated','64'],['checks_failed','0'],
  ['catalog_checks_passed','true'],['failed_check_ids',[]],
 ]){
  const data=rows();data[3][key]=value;
  if(key==='failed_check_ids')data[3][key]=null;
  assert.throws(()=>validateLiveAuditOutput(output(data),{ref},now),
    /services_phase36_/);
 }
});

test('Phase40 builds one read-only repeatable-read SQL transaction across history and catalog',async()=>{
 const markers=await read('docs/sql/eternyx/services-phase35-readonly-schema-markers.sql');
 const verdict=await read('docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql');
 const sql=buildAuditSql(markers,verdict);
 assert.equal((sql.match(/BEGIN TRANSACTION READ ONLY;/g)||[]).length,1);
 assert.equal((sql.match(/SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;/g)||[]).length,1);
 assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
 assert.ok(sql.indexOf('BEGIN TRANSACTION READ ONLY;')<
  sql.indexOf('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;'));
 assert.ok(sql.indexOf('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;')<
  sql.indexOf('SELECT row_to_json(i)::text'));
 assert.ok(sql.indexOf('supabase_migrations.schema_migrations')<
  sql.indexOf('SELECT row_to_json(c)::text'));
 assert.ok(sql.indexOf('SELECT row_to_json(c)::text')<
  sql.indexOf('SELECT row_to_json(v)::text'));
});

test('Phase40 integration is included in Services PG17 tests and cannot enable deployment',async()=>{
 const wf=await read('.github/workflows/services-pg17-disposable-replay.yml');
 assert.match(wf,/tests\/services-phase40-consistent-evidence\.test\.mjs/);
 assert.match(wf,/scripts\/services-phase40-consistent-staging-evidence\.mjs/);
 assert.match(wf,/--network none/);
 const staging=await read('.github/workflows/services-staging-acceptance.yml');
 assert.match(staging,/READ_ONLY_STAGING_ACCEPTANCE/);
 assert.match(staging,/services-phase36-staging-live-db-proof\.mjs/);
 assert.match(staging,/environment: services-staging/);
 assert.doesNotMatch(staging,/supabase db push|migration repair/);
});

test('Phase40 documents ordering, snapshot guarantees, limitations and real staging blocker',async()=>{
 const doc=await read('docs/ETERNYX_SERVICES_CONSISTENT_EVIDENCE_PHASE40.md');
 assert.match(doc,/Phase 13 before Phase 14/);
 assert.match(doc,/REPEATABLE READ/);
 assert.match(doc,/actual managed migration versions/);
 assert.match(doc,/No new migration/);
 assert.match(doc,/not production-ready/i);
 assert.match(doc,/real-account staging/i);
});
