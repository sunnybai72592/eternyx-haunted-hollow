import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reconcileServicesHistory,inspectServicesHistoryEvidence} from
 '../scripts/services-phase35-managed-history-reconciler.mjs';
import {SERVICES_REPLAY_FILES} from '../scripts/services-pg17-replay-plan.mjs';

const moment=new Date('2026-11-23T20:30:00.000Z');
const project='wcncuarekaofmfurbtbh';
const other='abcdefghijklmnopqrst';
const names=SERVICES_REPLAY_FILES.map(f=>f.slice(15,-4));
const evidence=(overrides={})=>({
 schema:'eternyx-services-phase35-readonly-evidence-v1',
 projectRef:project,
 capturedAt:'2026-11-23T20:25:00Z',
 historyComplete:true,
 managedMigrations:names.slice(0,11).map((name,i)=>({
  // Deliberately DO NOT match reviewed migration source filenames.
  version:String(20261122203001+i).padStart(14,'0'),
  name,
 })),
 catalog:{
  phase1_requests:true,phase12_customer_followup_queue:true,
  phase13_amendments:false,phase13_customer_queue:false,
  phase13_admin_queue:false,phase14_journal:false,
 },
 ...overrides
});
const blocked=(input,code)=>assert.throws(
 ()=>reconcileServicesHistory(input,moment),
 new RegExp('services_phase35_'+code)
);

test('Phase35 reconciles the actual 11 named foundations and precisely identifies missing phase 13/14',()=>{
 const r=reconcileServicesHistory(evidence(),moment);
 assert.equal(r.sourceManifestCount,13);
 assert.equal(r.historyEntryCount,11);
 assert.equal(r.targetClass,'linked_production_readonly');
 assert.equal(r.observedFoundation.allFirstElevenNamedMigrationsObserved,true);
 assert.equal(r.observedFoundation.requestTablePresent,true);
 assert.equal(r.observedFoundation.followupQueuePresent,true);
 assert.equal(r.phase13.name,'service_brief_amendments');
 assert.equal(r.phase14.name,'service_request_journal');
 assert.equal(r.phase13.status,'not_in_named_history_and_objects_absent');
 assert.equal(r.phase14.status,'not_in_named_history_and_objects_absent');
 assert.equal(r.phase13.catalogObjectsObserved,0);
 assert.equal(r.phase14.catalogObjectsObserved,0);
 assert.equal(r.missingTwoSourceMigrationsWithNoObservedObjects,true);
 assert.equal(r.phase14.dependsOnPhase13,true);
 assert.match(r.actionableNext,/reviewed staging-only phase13-then-phase14/);
 assert.equal(r.sourceSequence.at(-1).sourceFilename,'20261123050000_service_request_journal.sql');
 assert.ok(r.sourceSequence.every(x=>x.sourceTimestampIsManagedVersionEvidence===false));
 for(const flag of ['stagingDeploymentAuthorized','productionDeploymentAuthorized',
  'remoteMigrationPerformed','databaseConnectionPerformed','automaticSqlGenerated',
  'realAccountStagingPassed','operatorSignoffProvided'])assert.equal(r[flag],false);
 assert.equal(JSON.stringify(r).includes(project),false);
});

test('Phase35 treats names as evidence, never misleading same-version equivalence',()=>{
 const x=evidence();
 x.managedMigrations[0].version=names[0].slice(0,14); // not a version, deliberate invalid
 blocked(x,'history_invalid');
 const y=evidence();
 y.managedMigrations[0].version=SERVICES_REPLAY_FILES[0].slice(0,14);
 const r=reconcileServicesHistory(y,moment);
 assert.equal(r.sourceSequence[0].managedHistoryByName,'present');
 assert.equal(r.repositoryVersionsComparedByTimestamp,false);
 const z=evidence();
 z.managedMigrations[0].name='unrelated_migration';
 const q=reconcileServicesHistory(z,moment);
 assert.equal(q.observedFoundation.allFirstElevenNamedMigrationsObserved,false);
 assert.equal(q.missingTwoSourceMigrationsWithNoObservedObjects,false);
});

test('Phase35 identifies partial deployments, untracked schemas and named history without objects',()=>{
 const p=evidence();
 p.catalog.phase13_amendments=true;
 const r=reconcileServicesHistory(p,moment);
 assert.equal(r.phase13.status,'partial_schema_manual_investigation_required');
 assert.equal(r.missingTwoSourceMigrationsWithNoObservedObjects,false);
 const q=evidence();
 q.managedMigrations.push({version:'20261124000000',name:'service_brief_amendments'});
 assert.equal(reconcileServicesHistory(q,moment).phase13.status,
  'history_present_but_schema_missing_blocked');
 const t=evidence();
 t.catalog.phase13_amendments=true;
 t.catalog.phase13_customer_queue=true;
 t.catalog.phase13_admin_queue=true;
 assert.equal(reconcileServicesHistory(t,moment).phase13.status,
  'schema_present_but_history_name_missing_blocked');
 const v=evidence();
 v.managedMigrations.push({version:'20261124000000',name:'service_brief_amendments'});
 v.catalog.phase13_amendments=true;
 v.catalog.phase13_customer_queue=true;
 v.catalog.phase13_admin_queue=true;
 assert.equal(reconcileServicesHistory(v,moment).phase13.status,
  'history_name_and_objects_present_not_sql_content_proof');
 const u=evidence();
 u.catalog.phase14_journal=true;
 assert.equal(reconcileServicesHistory(u,moment).phase14.status,
  'schema_present_but_history_name_missing_blocked');
});

test('Phase35 blocks missing earlier history and missing source schema independently',()=>{
 const h=evidence();
 h.managedMigrations=h.managedMigrations.slice(1);
 const x=reconcileServicesHistory(h,moment);
 assert.equal(x.observedFoundation.allFirstElevenNamedMigrationsObserved,false);
 assert.equal(x.observedFoundation.missingNamedFoundations[0],'service_requests');
 assert.match(x.actionableNext,/earlier named migration/);
 const b=evidence();
 b.catalog.phase12_customer_followup_queue=false;
 assert.equal(reconcileServicesHistory(b,moment).missingTwoSourceMigrationsWithNoObservedObjects,false);
});

test('Phase35 rejects partial, stale, foreign, duplicate, malformed and unverifiable captures',()=>{
 blocked(evidence({historyComplete:false}),'evidence_invalid');
 blocked(evidence({capturedAt:'2026-11-22T18:00:00Z'}),'evidence_stale');
 blocked(evidence({capturedAt:'2026-11-23T20:36:00Z'}),'evidence_stale');
 blocked(evidence({capturedAt:'tomorrow'}),'evidence_invalid');
 blocked(evidence({projectRef:'not-a-project'}),'evidence_invalid');
 blocked(evidence({catalog:{phase13_amendments:false}}),'catalog_incomplete');
 blocked(evidence({catalog:{...evidence().catalog,phase13_admin_queue:null}}),'catalog_incomplete');
 blocked(evidence({catalog:{...evidence().catalog,customerEmail:'not allowed'}}),'catalog_incomplete');
 blocked(evidence({managedMigrations:[{version:'xyz',name:'service_requests'}]}),'history_invalid');
 const repeated=evidence();
 repeated.managedMigrations.push({...repeated.managedMigrations[0]});
 blocked(repeated,'history_invalid');
 const repeatedName=evidence();
 repeatedName.managedMigrations.push({version:'20261124000000',name:'service_requests'});
 blocked(repeatedName,'history_invalid');
});

test('Phase35 accepts real legacy UUID-style migration names and unnamed history entries',()=>{
 const input=evidence();
 input.managedMigrations.push(
  {version:'20261113183501',name:'aa6dd177-9260-4ee3-9940-8bd2800a649e'},
  {version:'20250828011356',name:''});
 const r=reconcileServicesHistory(input,moment);
 assert.equal(r.historyEntryCount,13);
 assert.equal(r.missingTwoSourceMigrationsWithNoObservedObjects,true);
});

test('Phase35 six-marker SQL stays strictly SELECT-only and touches no business rows',async()=>{
 const sql=await readFile(new URL('../docs/sql/eternyx/services-phase35-readonly-schema-markers.sql',import.meta.url),'utf8');
 const active=sql.replace(/--[^\\r\\n]*/g,'');
 assert.match(active,/^\\s*SELECT\\s+/i);
 assert.doesNotMatch(active,/\\b(?:INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|GRANT|REVOKE|COPY|EXECUTE|DO|CALL)\\b/i);
 assert.doesNotMatch(active,/\\b(?:FROM|JOIN)\\s+(?:public|auth)\\./i);
 for(const key of ['phase1_requests','phase12_customer_followup_queue','phase13_amendments','phase13_customer_queue','phase13_admin_queue','phase14_journal']) assert.ok(sql.includes(key));
});

test('Phase35 accepts nonproduction reference ONLY as unverified and never authorizes deployment',()=>{
 const r=reconcileServicesHistory(evidence({projectRef:other}),moment);
 assert.equal(r.targetClass,'unverified_nonproduction_reference');
 assert.equal(r.stagingProjectIndependentlyVerified,false);
 assert.equal(r.stagingDeploymentAuthorized,false);
 assert.equal(r.phase27CatalogPassed,false);
});

test('Phase35 actual CLI source plan enforces prior SQL and collision-integrity audit',async()=>{
 const r=await inspectServicesHistoryEvidence(evidence(),moment);
 assert.equal(r.sourceSequence.length,13);
 assert.equal(r.stagingDeploymentAuthorized,false);
 const script=await readFile(new URL('../scripts/services-phase35-managed-history-reconciler.mjs',import.meta.url),'utf8');
 assert.match(script,/planServicesReplay\(\)/);
 assert.match(script,/reconcileServicesHistory/);
 assert.doesNotMatch(script,/createClient\(|execute_sql|apply_migration|fetch\(|https\.request|child_process/);
 assert.match(script,/operator_captured_two_independent_readonly_sources_not_authenticated/);
});

test('Phase35 docs require managed names and actual catalog before staging and block production',async()=>{
 const notes=await readFile(new URL('../docs/ETERNYX_SERVICES_HISTORY_RECONCILIATION_PHASE35.md',import.meta.url),'utf8');
 assert.match(notes,/11 named Services migrations/i);
 assert.match(notes,/four absent Phase 13\/14 objects/i);
 assert.match(notes,/Phase 13 before Phase 14/);
 assert.match(notes,/not production-ready/i);
 assert.match(notes,/no new migration/i);
 assert.match(notes,/real-account staging/i);
 assert.match(notes,/version mismatch/i);
});
