import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SERVICES_REPLAY_FILES} from '../scripts/services-pg17-replay-plan.mjs';
import {
 SERVICES_INVENTORY_MARKERS,validateInventoryTarget,buildInventorySql,
 analyzeServicesInventory
} from '../scripts/services-phase42-staging-inventory.mjs';
import {
 validateRegisteredStagingTarget,validateRegisteredProject
} from '../scripts/services-phase41-registered-staging-project.mjs';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const REF='abcdefghijklmnopqrst';
const PROD='wcncuarekaofmfurbtbh';
const files=SERVICES_REPLAY_FILES.map(x=>x.slice(15,-4));
const env=()=>({
 SERVICES_PREFLIGHT_CONFIRM:'READ_ONLY_STAGING_INVENTORY',
 SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF:REF,
 SERVICES_PREFLIGHT_URL:'https://'+REF+'.supabase.co',
 SERVICES_STAGING_AUDIT_POOLER_HOST:'aws-0-us-east-1.pooler.supabase.com',
 SERVICES_STAGING_AUDIT_DB_PASSWORD:'fake-inventory-auditor-password',
});
const markers=(value=false)=>Object.fromEntries(
 SERVICES_INVENTORY_MARKERS.map(k=>[k,value]));
const allMigrations=()=>files.map((name,i)=>({
 version:String(20261123060000+i),name,
}));
const unrelated=()=>[
 {version:'20261123215132',name:'pentest_engagement_management_staging_baseline'},
 {version:'20261123215141',name:'pentest_evidence_and_audit_staging_baseline'},
 {version:'20261123215211',name:'security_case_indexed_ledger_staging_v1'},
];
const output=(catalog=markers(),list=unrelated())=>
 [catalog,{managed_migrations:list}].map(JSON.stringify).join('\n')+'\n';

test('Phase42 reproduces actual observed staging class: zero Services migrations and zero markers',()=>{
 const report=analyzeServicesInventory(output());
 assert.equal(report.schema,'eternyx-services-phase42-staging-inventory-v1');
 assert.equal(report.status,'awaiting_services_staging_deployment');
 assert.equal(report.serviceMigrationsExpected,13);
 assert.equal(report.serviceNamesObserved,0);
 assert.deepEqual(report.missingSourceDefinedServiceNames,files);
 assert.equal(report.independentSchemaMarkersObserved,0);
 assert.deepEqual(report.schemaMarkersAbsent,SERVICES_INVENTORY_MARKERS);
 assert.equal(report.otherManagedMigrationsObserved,3);
 assert.equal(report.recordedServiceOrderVerified,false);
 assert.equal(report.fullSecurityCatalog64Passed,false);
 assert.equal(report.serviceSchemaContentAuthenticated,false);
 assert.equal(report.realAccountStagingPassed,false);
 assert.equal(report.productionDeploymentAuthorized,false);
 assert.equal(report.liveDatabaseWritePerformed,false);
 assert.equal(JSON.stringify(report).includes(REF),false);
 assert.equal(JSON.stringify(report).includes(PROD),false);
});

test('Phase42 never equates partial foundation or partial phase13 schema with readiness',()=>{
 const names=allMigrations().slice(0,11);
 const catalog=markers();catalog.phase1_requests=true;
 catalog.phase12_customer_followup_queue=true;
 const partial=analyzeServicesInventory(output(catalog,names));
 assert.equal(partial.status,'partial_or_inconsistent_services_staging_schema');
 assert.equal(partial.serviceNamesObserved,11);
 assert.equal(partial.independentSchemaMarkersObserved,2);
 assert.equal(partial.missingSourceDefinedServiceNames.length,2);
 assert.equal(partial.manualCollisionReconciliationRequired,true);
 assert.equal(partial.recordedServiceOrderVerified,false);
 const mismatch=analyzeServicesInventory(output(markers(true),unrelated()));
 assert.equal(mismatch.status,'partial_or_inconsistent_services_staging_schema');
 assert.equal(mismatch.serviceNamesObserved,0);
 assert.equal(mismatch.independentSchemaMarkersObserved,6);
});

test('Phase42 only marks complete source names+six schema markers as eligible for the FULL audit',()=>{
 const list=[...unrelated(),...allMigrations()];
 const result=analyzeServicesInventory(output(markers(true),list));
 assert.equal(result.status,'eligible_for_protected_services_safety_audit');
 assert.equal(result.serviceNamesObserved,13);
 assert.equal(result.independentSchemaMarkersObserved,6);
 assert.equal(result.recordedServiceOrderVerified,true);
 assert.equal(result.otherManagedMigrationsObserved,3);
 assert.deepEqual(result.missingSourceDefinedServiceNames,[]);
 assert.equal(result.fullSecurityCatalog64Passed,false);
 assert.equal(result.realAccountStagingPassed,false);
 assert.equal(result.productionDeploymentAuthorized,false);
});

test('Phase42 rejects phase13-before14 order reversals even when all tables exist',()=>{
 const list=allMigrations();
 [list[11].version,list[12].version]=[list[12].version,list[11].version];
 const result=analyzeServicesInventory(output(markers(true),list));
 assert.equal(result.status,'partial_or_inconsistent_services_staging_schema');
 assert.equal(result.recordedServiceOrderVerified,false);
 assert.equal(result.manualCollisionReconciliationRequired,true);
});

test('Phase42 fails closed on malformed, duplicate or oversized history',()=>{
 const inputs=[
  [{version:'2026-11-23',name:'x'}],
  [{version:'20261123215132',name:'../../traversal'}],
  [{version:'20261123215132',name:'x',extra:true}],
  [{version:'20261123215132',name:'x'},{version:'20261123215132',name:'y'}],
  [{version:'20261123215132',name:'x'},{version:'20261123215133',name:'x'}],
  [{version:20261123215132,name:'x'}],
  [{version:'20261123215132',name:null}],
 ];
 for(const list of inputs)
  assert.throws(()=>analyzeServicesInventory(output(markers(),list)),
   /services_phase42_invalid_managed_history/);
 assert.throws(()=>analyzeServicesInventory(output(markers(),
  Array.from({length:2001},(_,i)=>({version:String(20261123000000+i),name:'name'+i})))),
  /services_phase42_managed_history_oversized/);
});

test('Phase42 rejects incomplete, additional and incorrectly typed metadata',()=>{
 for(const [catalog,list] of [
  [{...markers(),extra:true},unrelated()],
  [Object.fromEntries(Object.entries(markers()).slice(1)),unrelated()],
  [{...markers(),phase1_requests:'false'},unrelated()],
  [{...markers(),phase1_requests:null},unrelated()],
  [markers(),null],
 ]){
  assert.throws(()=>analyzeServicesInventory(output(catalog,list)),
   /services_phase42_catalog_or_history_incomplete/);
 }
 assert.throws(()=>analyzeServicesInventory('{}'),/services_phase42_output_shape_invalid/);
 assert.throws(()=>analyzeServicesInventory('invalid\ninvalid'),/services_phase42_output_json_invalid/);
 assert.throws(()=>analyzeServicesInventory('x'.repeat(250001)),/services_phase42_output_oversized/);
});

test('Phase42 fixed SQL uses a single READ ONLY, REPEATABLE READ snapshot',async()=>{
 const sql=buildInventorySql(await read('docs/sql/eternyx/services-phase35-readonly-schema-markers.sql'));
 assert.match(sql,/BEGIN TRANSACTION READ ONLY;/);
 assert.match(sql,/SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;/);
 assert.match(sql,/FROM supabase_migrations\.schema_migrations/);
 assert.match(sql,/AS phase13_amendments/);
 assert.match(sql,/AS phase14_journal/);
 assert.equal((sql.match(/BEGIN TRANSACTION READ ONLY;/g)||[]).length,1);
 assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|ALTER TABLE|CREATE TABLE|DELETE FROM|UPDATE public)\b/i);
 for(const bad of [
  "DELETE FROM public.service_requests;",
  "SELECT true AS phase1_requests; DROP TABLE public.service_requests;",
  "SELECT true;",
 ])
  assert.throws(()=>buildInventorySql(bad),/services_phase42_markers_source_not_safe/);
});

test('Phase42 requires explicit inventory consent and rejects the production ref',()=>{
 const valid=validateInventoryTarget(env());
 assert.equal(valid.ref,REF);
 assert.equal(valid.host,'aws-0-us-east-1.pooler.supabase.com');
 assert.equal(valid.user,'services_staging_auditor.'+REF);
 const bad=[
  {SERVICES_PREFLIGHT_CONFIRM:'NOT_APPROVED'},
  {SERVICES_PREFLIGHT_CONFIRM:'READ_ONLY_STAGING_ACCEPTANCE'},
  {SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF:PROD,
   SERVICES_PREFLIGHT_URL:'https://'+PROD+'.supabase.co'},
  {SERVICES_PREFLIGHT_URL:'https://'+REF+'.supabase.co.evil'},
  {SERVICES_STAGING_AUDIT_POOLER_HOST:'evil.pooler.supabase.com'},
  {SERVICES_STAGING_AUDIT_DB_PASSWORD:'short'},
 ];
 for(const patch of bad)
  assert.throws(()=>validateInventoryTarget({...env(),...patch}),
   /services_phase42_/);
});

test('Phase42 approval passes GET-only management identity check but not full acceptance',()=>{
 const vars={...env(),SERVICES_STAGING_MANAGEMENT_API_TOKEN:'sbp_long_fake_synthetic_test_secret',
  SERVICES_STAGING_EXPECTED_ORG_SLUG:'eternyx-staging-org',
  SERVICES_STAGING_EXPECTED_PROJECT_NAME:'Eternyx Staging'};
 const target=validateRegisteredStagingTarget(vars);
 assert.equal(target.ref,REF);
 const project={ref:REF,organization_slug:'eternyx-staging-org',
  name:'Eternyx Staging',status:'ACTIVE_HEALTHY',region:'us-east-1',
  database:{host:'db.'+REF+'.supabase.co'}};
 assert.equal(validateRegisteredProject(project,target).accepted,true);
 assert.throws(()=>validateInventoryTarget({...env(),
  SERVICES_PREFLIGHT_CONFIRM:'READ_ONLY_STAGING_ACCEPTANCE'}),
  /services_phase42_inventory_approval_missing/);
});

test('Phase42 workflow runs GET registration before SQL; no Auth or deployments',async()=>{
 const wf=await read('.github/workflows/services-staging-readonly-inventory.yml');
 assert.match(wf,/workflow_dispatch/);
 assert.match(wf,/environment: services-staging/);
 assert.match(wf,/READ_ONLY_STAGING_INVENTORY/);
 assert.match(wf,/permissions:\s*contents: read/);
 const source=wf.indexOf('services-migration-source-guard.mjs');
 const management=wf.indexOf('run: node scripts/services-phase41-registered-staging-project.mjs');
 const inventory=wf.indexOf('run: node scripts/services-phase42-staging-inventory.mjs');
 assert.ok(source>0&&management>source&&inventory>management);
 assert.match(wf,/secrets\.SERVICES_STAGING_AUDIT_DB_PASSWORD/);
 assert.match(wf,/secrets\.SERVICES_STAGING_MANAGEMENT_API_TOKEN/);
 assert.doesNotMatch(wf,/services:staging:acceptance|supabase db push|migration repair|auth\.signIn/);
 const main=await read('.github/workflows/services-staging-acceptance.yml');
 assert.match(main,/READ_ONLY_STAGING_ACCEPTANCE/);
 assert.match(main,/services-phase36-staging-live-db-proof/);
});

test('Phase42 source restricts psql, passwords and static error logs',async()=>{
 const src=await read('scripts/services-phase42-staging-inventory.mjs');
 assert.match(src,/spawnSync\('psql'/);
 assert.match(src,/'-p','5432'/);
 assert.match(src,/PGSSLMODE:'verify-full'/);
 assert.match(src,/PGOPTIONS:'-c default_transaction_read_only=on/);
 assert.match(src,/if\(child\.error\|\|child\.signal\|\|child\.status!==0\)/);
 assert.doesNotMatch(src,/shell:\s*true|execSync|console\.log\(child\.stderr|supabase db push/);
});
