import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyServicesStagingEvidence } from '../scripts/services-staging-release-evidence.mjs';

const now = new Date('2026-11-23T20:00:00.000Z');
const ref = 'abcdefghijklmnopqrst';
const validSnapshot = () => ({
  schema:'eternyx-services-staging-operator-evidence-v1',
  projectRef:ref,
  capturedAt:'2026-11-23T19:55:00Z',
  database:{sqlRoundTripConfirmed:true,connectionStableForManualChecks:true},
  catalog:{catalog_checks_passed:true,checks_evaluated:64,checks_failed:0,failed_check_ids:[]},
  operatorMigrationReview:{
    actualManagedHistoryInspected:true,
    allThirteenServicesSourcesReconciled:true,
    elevenHistoricalCollisionVersionsReviewed:true,
    phase13BeforePhase14Verified:true,
    noHistoryRewrites:true,
    independentCatalogCompared:true,
    unresolvedServiceSchemaGaps:0,
    unresolvedServiceMigrationAmbiguities:0,
  },
});
const env=(snapshot=validSnapshot())=>({
  SERVICES_PREFLIGHT_CONFIRM:'READ_ONLY_STAGING_ACCEPTANCE',
  SERVICES_PREFLIGHT_URL:'https://'+ref+'.supabase.co',
  SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF:ref,
  SERVICES_STAGING_RELEASE_EVIDENCE:JSON.stringify(snapshot),
});
const fails=(e,pattern=/services_staging_evidence_/)=>
  assert.throws(()=>verifyServicesStagingEvidence(e,now),pattern);
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('accepts only complete recent nonproduction evidence without claiming deployment',()=>{
  const r=verifyServicesStagingEvidence(env(),now);
  assert.equal(r.accepted,true);
  assert.equal(r.stagingTargetMatched,true);
  assert.equal(r.catalogEvidenceDeclared,true);
  assert.equal(r.historyAndCollisionReviewDeclared,true);
  assert.equal(r.evidenceKind,'operator_supplied_not_independently_authenticated');
  assert.equal(r.remoteMigrationsDeployedByGate,false);
  assert.equal(r.liveRealAccountAcceptancePassed,false);
  assert.equal(r.productionDeploymentAuthorized,false);
  assert.equal(JSON.stringify(r).includes(ref),false);
});

test('denies production target, mismatched origin, missing acknowledgment and target forgery',()=>{
  const prod='wcncuarekaofmfurbtbh';
  fails({...env(),SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF:prod,
    SERVICES_PREFLIGHT_URL:'https://'+prod+'.supabase.co'},/target_not_staging/);
  fails({...env(),SERVICES_PREFLIGHT_URL:'https://'+ref+'.supabase.co.evil.example'},/url_target_mismatch/);
  fails({...env(),SERVICES_PREFLIGHT_URL:'https://'+ref+'.supabase.co/extra'},/url_target_mismatch/);
  fails({...env(),SERVICES_PREFLIGHT_CONFIRM:'NOT_APPROVED'},/approval_missing/);
  fails({...env(),SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF:'short'},/target_not_staging/);
  fails(env({...validSnapshot(),projectRef:'zzzzzzzzzzzzzzzzzzzz'}),/foreign_or_invalid_snapshot/);
});

test('rejects absent, malformed, oversized and hostile JSON without echoing source',()=>{
  fails({...env(),SERVICES_STAGING_RELEASE_EVIDENCE:''},/missing_or_oversized_snapshot/);
  fails({...env(),SERVICES_STAGING_RELEASE_EVIDENCE:'{secret:xxx}'},/invalid_snapshot_json/);
  fails({...env(),SERVICES_STAGING_RELEASE_EVIDENCE:'x'.repeat(15000)},/missing_or_oversized_snapshot/);
  fails(env([]),/foreign_or_invalid_snapshot/);
  fails(env({...validSnapshot(),schema:'bad'}),/foreign_or_invalid_snapshot/);
});

test('rejects stale, badly formatted or future-dated SQL evidence',()=>{
  fails(env({...validSnapshot(),capturedAt:'2026-11-22T18:00:00Z'}),/stale_or_future_snapshot/);
  fails(env({...validSnapshot(),capturedAt:'2026-11-23T20:06:00Z'}),/stale_or_future_snapshot/);
  fails(env({...validSnapshot(),capturedAt:'not-a-date'}),/missing_utc_capture_time/);
  fails(env({...validSnapshot(),capturedAt:'2026-11-23T19:50:00+00:00'}),/missing_utc_capture_time/);
});

test('rejects unavailable SQL and failed catalog gates',()=>{
  const input=validSnapshot();
  fails(env({...input,database:{...input.database,sqlRoundTripConfirmed:false}}),/sql_connection_not_verified/);
  fails(env({...input,database:{...input.database,connectionStableForManualChecks:false}}),/sql_connection_not_verified/);
  for(const catalog of [
    {...input.catalog,catalog_checks_passed:false},
    {...input.catalog,checks_evaluated:63},
    {...input.catalog,checks_failed:1},
    {...input.catalog,failed_check_ids:['object/service_request_journal/exists_and_kind']},
    {...input.catalog,failed_check_ids:null},
  ]) fails(env({...input,catalog}),/catalog_not_verified/);
});

test('rejects unreconciled history, collisions, and missing Services objects',()=>{
  const original=validSnapshot();
  for(const [field,value] of [
    ['actualManagedHistoryInspected',false],
    ['allThirteenServicesSourcesReconciled',false],
    ['elevenHistoricalCollisionVersionsReviewed',false],
    ['phase13BeforePhase14Verified',false],
    ['noHistoryRewrites',false],
    ['independentCatalogCompared',false],
    ['unresolvedServiceSchemaGaps',1],
    ['unresolvedServiceMigrationAmbiguities',1],
  ]) fails(env({...original,operatorMigrationReview:{...original.operatorMigrationReview,[field]:value}}),
    /migration_history_not_reconciled/);
  fails(env({...original,operatorMigrationReview:null}),/migration_history_not_reconciled/);
});

test('preflight runs before npm install and any real account sign-in',async()=>{
  const workflow=await read('.github/workflows/services-staging-acceptance.yml');
  const evidence=workflow.indexOf('node scripts/services-staging-release-evidence.mjs');
  const source=workflow.indexOf('node scripts/services-migration-source-guard.mjs');
  const install=workflow.indexOf('run: npm ci');
  const signin=workflow.indexOf('run: npm run services:staging:acceptance');
  assert.ok(source>0 && evidence>source && install>evidence && signin>install);
  assert.match(workflow,/environment: services-staging/);
  assert.match(workflow,/vars\.SERVICES_STAGING_RELEASE_EVIDENCE/);
  assert.match(workflow,/permissions:\s*contents: read/);
  assert.doesNotMatch(workflow,/on:\s*\n\s*push:|\bapply_migration\b|supabase db push/);
  const gate=await read('scripts/services-staging-release-evidence.mjs');
  assert.doesNotMatch(gate,/createClient\(|execute_sql|apply_migration|https\.request|fetch\(/);
  assert.match(gate,/operator_supplied_not_independently_authenticated/);
});

test('operator docs distinguish JSON attestation from independent real staging proof',async()=>{
  const d=await read('docs/ETERNYX_SERVICES_STAGING_EVIDENCE_PHASE31.md');
  assert.match(d,/only the Eternyx project|one project/i);
  assert.match(d,/Phase 13 before Phase 14/);
  assert.match(d,/64 catalog checks/);
  assert.match(d,/real-account staging/i);
  assert.match(d,/not production-ready/i);
  assert.match(d,/no new migration/i);
  assert.match(d,/NOT cryptographic evidence/i);
});
