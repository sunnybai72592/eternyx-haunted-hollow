import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  verifyAuditTarget,buildAuditSql,validateLiveAuditOutput
} from '../scripts/services-phase36-staging-live-db-proof.mjs';
import {SERVICES_REPLAY_FILES} from '../scripts/services-pg17-replay-plan.mjs';

const ref='abcdefghijklmnopqrst';
const now=new Date('2026-11-23T20:40:00.000Z');
const read=(path)=>readFile(new URL('../'+path,import.meta.url),'utf8');
const env=()=>({
 SERVICES_PREFLIGHT_CONFIRM:'READ_ONLY_STAGING_ACCEPTANCE',
 SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF:ref,
 SERVICES_PREFLIGHT_URL:'https://'+ref+'.supabase.co',
 SERVICES_STAGING_AUDIT_POOLER_HOST:'aws-0-us-east-1.pooler.supabase.com',
 SERVICES_STAGING_AUDIT_DB_PASSWORD:'very-long-synthetic-auditor-password',
 SERVICES_STAGING_RELEASE_EVIDENCE:JSON.stringify({
  schema:'eternyx-services-staging-operator-evidence-v1',
  projectRef:ref,capturedAt:'2026-11-23T20:35:00Z',
  database:{sqlRoundTripConfirmed:true,connectionStableForManualChecks:true},
  catalog:{catalog_checks_passed:true,checks_evaluated:64,checks_failed:0,failed_check_ids:[]},
  operatorMigrationReview:{
   actualManagedHistoryInspected:true,
   allThirteenServicesSourcesReconciled:true,
   elevenHistoricalCollisionVersionsReviewed:true,
   phase13BeforePhase14Verified:true,noHistoryRewrites:true,
   independentCatalogCompared:true,
   unresolvedServiceSchemaGaps:0,
   unresolvedServiceMigrationAmbiguities:0,
  },
 }),
});
const liveHistory=()=>SERVICES_REPLAY_FILES.map((file,i)=>({
  version:'202611'+String(22000000+i).padStart(8,'0'),
  name:file.slice(15,-4),
}));
const fullCatalog=()=>({
 phase1_requests:true,phase12_customer_followup_queue:true,
 phase13_amendments:true,phase13_customer_queue:true,
 phase13_admin_queue:true,phase14_journal:true,
});
const outputs=(history=liveHistory(),catalog=fullCatalog(),verdict=null)=>[
 {role:'services_staging_auditor',db:'postgres',server_time:'2026-11-23T20:40:00+00:00'},
 {managed_migrations:history},
 catalog,
 verdict??{catalog_checks_passed:true,checks_evaluated:64,checks_failed:0,failed_check_ids:[]},
].map(JSON.stringify).join('\n')+'\n';

test('Phase 36 permits only a protected nonproduction project and exact session-pooler host',()=>{
 const target=verifyAuditTarget(env(),now);
 assert.equal(target.ref,ref);
 assert.equal(target.host,'aws-0-us-east-1.pooler.supabase.com');
 assert.equal(target.user,'services_staging_auditor.'+ref);
 assert.equal(target.password,'very-long-synthetic-auditor-password');
 const bad=[
  {SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF:'wcncuarekaofmfurbtbh',
   SERVICES_PREFLIGHT_URL:'https://wcncuarekaofmfurbtbh.supabase.co'},
  {SERVICES_PREFLIGHT_URL:'https://'+ref+'.supabase.co.evil.example'},
  {SERVICES_PREFLIGHT_URL:'https://'+ref+'.supabase.co/path'},
  {SERVICES_STAGING_AUDIT_POOLER_HOST:'db.wcncuarekaofmfurbtbh.supabase.co'},
  {SERVICES_STAGING_AUDIT_POOLER_HOST:'aws-0-us-east-1.pooler.supabase.com:6543'},
  {SERVICES_STAGING_AUDIT_POOLER_HOST:'aws-0-us-east-1.pooler.supabase.com.evil'},
  {SERVICES_STAGING_AUDIT_POOLER_HOST:'https://aws-0-us-east-1.pooler.supabase.com'},
  {SERVICES_STAGING_AUDIT_DB_PASSWORD:''},
  {SERVICES_STAGING_AUDIT_DB_PASSWORD:'short'},
  {SERVICES_STAGING_AUDIT_DB_PASSWORD:'bad\npassword'},
  {SERVICES_PREFLIGHT_CONFIRM:'NOT_APPROVED'},
 ];
 for(const mutation of bad)
  assert.throws(()=>verifyAuditTarget({...env(),...mutation},now),/services_phase36_/);
});

test('Phase 36 runs EXACT reviewed Phase 27 and Phase 35 SQL in ONE read-only transaction',async()=>{
 const a=await read('docs/sql/eternyx/services-phase35-readonly-schema-markers.sql');
 const b=await read('docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql');
 const sql=buildAuditSql(a,b);
 assert.match(sql,/BEGIN TRANSACTION READ ONLY;/);
 assert.match(sql,/SET LOCAL statement_timeout = '12000ms'/);
 assert.match(sql,/FROM supabase_migrations\.schema_migrations/);
 assert.match(sql,/json_agg\(json_build_object\('version'/);
 assert.match(sql,/catalog_checks_passed/);
 assert.match(sql,/to_regclass\('public\.service_brief_amendments'\)/);
 assert.match(sql,/SELECT row_to_json\(c\)::text FROM/);
 assert.match(sql,/SELECT row_to_json\(v\)::text FROM/);
 assert.match(sql,/^COMMIT;$/m);
 assert.equal((sql.match(/BEGIN TRANSACTION READ ONLY;/g)||[]).length,1);
 assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
 assert.doesNotMatch(sql,/\b(?:CREATE TABLE|DROP TABLE|INSERT INTO|DELETE FROM|UPDATE public)\b/i);
});

test('Phase 36 refuses altered marker SQL, injected commands, and modified verdict logic',async()=>{
 const a=await read('docs/sql/eternyx/services-phase35-readonly-schema-markers.sql');
 const b=await read('docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql');
 for(const bad of [
  a+' DROP TABLE public.service_requests;',
  a.replace(/SELECT\s+to_regclass/,'DELETE FROM public.service_requests'),
  a.replace(/phase13_amendments/,'unexpected_key'),
 ])
  assert.throws(()=>buildAuditSql(bad,b),/services_phase36_/);
 assert.throws(()=>buildAuditSql(a,b+'; DROP TABLE x;'),/services_phase36_/);
});

test('Phase 36 accepts complete 13 named migrations and actual 64/64 positive catalog',()=>{
 const proof=validateLiveAuditOutput(outputs(),{ref},now);
 assert.equal(proof.accepted,true);
 assert.equal(proof.liveCatalogChecksEvaluated,64);
 assert.equal(proof.liveCatalogChecksFailed,0);
 assert.equal(proof.remoteHistoryByNameObserved,true);
 assert.equal(proof.sqlTransactionReadOnly,true);
 for(const key of [
  'stagingProjectIndependentlyRegisteredByManagementApi',
  'sourceContentProvenByLiveQuery',
  'historicalCollisionFilesAuthenticated',
  'realAccountStagingPassed',
  'productionDeploymentAuthorized','remoteMigrationPerformed',
 ]) assert.equal(proof[key],false);
 assert.equal(JSON.stringify(proof).includes(ref),false);
});

test('Phase 36 independently rejects Phase 13/14 history, catalog and partial-schema gaps',()=>{
 const minus13=liveHistory().slice(0,11);
 assert.throws(()=>validateLiveAuditOutput(outputs(minus13),{ref},now),
  /services_phase36_history_or_schema_missing/);
 const partial=fullCatalog();partial.phase13_amendments=false;
 assert.throws(()=>validateLiveAuditOutput(outputs(liveHistory(),partial),{ref},now),
  /services_phase36_history_or_schema_missing/);
 const missing=fullCatalog();missing.phase14_journal=false;
 assert.throws(()=>validateLiveAuditOutput(outputs(liveHistory(),missing),{ref},now),
  /services_phase36_history_or_schema_missing/);
 const older=fullCatalog();older.phase12_customer_followup_queue=false;
 assert.throws(()=>validateLiveAuditOutput(outputs(liveHistory(),older),{ref},now),
  /services_phase36_history_or_schema_missing/);
});

test('Phase 36 fails closed on fake auditor role, time, verdict, incomplete history or malformed response',()=>{
 const valid=outputs();
 const badRole=valid.replace('"role":"services_staging_auditor"','"role":"postgres"');
 assert.throws(()=>validateLiveAuditOutput(badRole,{ref},now),
  /services_phase36_incorrect_auditor_role/);
 const badTime=valid.replace('2026-11-23T20:40:00+00:00','2026-11-21T20:40:00+00:00');
 assert.throws(()=>validateLiveAuditOutput(badTime,{ref},now),
  /services_phase36_database_clock_invalid/);
 const fail64=outputs(liveHistory(),fullCatalog(),
  {catalog_checks_passed:true,checks_evaluated:63,checks_failed:0,failed_check_ids:[]});
 assert.throws(()=>validateLiveAuditOutput(fail64,{ref},now),
  /services_phase36_live_catalog_not_passed/);
 const failCheck=outputs(liveHistory(),fullCatalog(),
  {catalog_checks_passed:false,checks_evaluated:64,checks_failed:1,failed_check_ids:['x']});
 assert.throws(()=>validateLiveAuditOutput(failCheck,{ref},now),
  /services_phase36_live_catalog_not_passed/);
 assert.throws(()=>validateLiveAuditOutput('{}',{ref},now),
  /services_phase36_output_not_four_json_rows/);
 assert.throws(()=>validateLiveAuditOutput('x\nx\nx\nx',{ref},now),
  /services_phase36_output_invalid_json/);
 assert.throws(()=>validateLiveAuditOutput('x'.repeat(250001),{ref},now),
  /services_phase36_output_oversized/);
});

test('Phase 36 entrypoint pins psql arguments without shell, enforces verified TLS and masks failures',async()=>{
 const code=await read('scripts/services-phase36-staging-live-db-proof.mjs');
 assert.match(code,/spawnSync\('psql'/);
 assert.match(code,/'-p','5432'/);
 assert.match(code,/'-U',target\.user/);
 assert.match(code,/PGSSLMODE:'verify-full'/);
 assert.match(code,/PGPASSWORD:target\.password/);
 assert.match(code,/PGOPTIONS:'-c default_transaction_read_only=on/);
 assert.match(code,/PGCONNECT_TIMEOUT:'8'/);
 assert.match(code,/PGSSLROOTCERT:'\/etc\/ssl\/certs\/ca-certificates\.crt'/);
 assert.match(code,/if\(child\.error\|\|child\.signal\|\|child\.status!==0\)fail\('database_probe_failed'\)/);
 assert.doesNotMatch(code,/shell:\s*true|execSync\(|exec\(|apply_migration|supabase db push|console\.log\(child\.stderr/);
});

test('Phase 36 workflow performs DB proof before npm install or ANY Auth sign-in',async()=>{
 const wf=await read('.github/workflows/services-staging-acceptance.yml');
 const evidence=wf.indexOf('node scripts/services-staging-release-evidence.mjs');
 const proof=wf.indexOf('node scripts/services-phase36-staging-live-db-proof.mjs');
 const install=wf.indexOf('run: npm ci');
 const signin=wf.indexOf('npm run services:staging:acceptance');
 assert.ok(evidence>0&&proof>evidence&&install>proof&&signin>install);
 assert.match(wf,/environment: services-staging/);
 assert.match(wf,/secrets\.SERVICES_STAGING_AUDIT_DB_PASSWORD/);
 assert.match(wf,/vars\.SERVICES_STAGING_AUDIT_POOLER_HOST/);
 assert.match(wf,/permissions:\s*contents: read/);
 assert.doesNotMatch(wf,/supabase\s+db\s+push|supabase\s+migration\s+repair/);
});

test('Phase 36 documentation disallows production and explains least-privilege staging setup',async()=>{
 const doc=await read('docs/ETERNYX_SERVICES_LIVE_STAGING_PROOF_PHASE36.md');
 assert.match(doc,/dedicated read-only/i);
 assert.match(doc,/Phase 13 before Phase 14/);
 assert.match(doc,/not production-ready/i);
 assert.match(doc,/real-account staging/i);
 assert.match(doc,/no new migration/i);
 assert.match(doc,/separate staging project/i);
});
