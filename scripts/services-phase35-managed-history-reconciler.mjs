#!/usr/bin/env node
/**
 * Services Phase 35: reconcile an operator-captured COMPLETE managed migration
 * history with a separate READ-ONLY schema snapshot. No Supabase client,
 * network request, SQL execution, migration repair, or deployment capability.
 */
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SERVICES_REPLAY_FILES,validateServicesReplay,planServicesReplay} from './services-pg17-replay-plan.mjs';

const PRODUCTION_REF='wcncuarekaofmfurbtbh';
const SCHEMA='eternyx-services-phase35-readonly-evidence-v1';
const REF=/^[a-z]{20}$/;
const VERSION=/^20\d{12}$/;
const NAME=/^[a-z][a-z0-9_]{2,100}$/;
const MAX_AGE_MS=24*60*60*1000;
const MAX_FUTURE_SKEW_MS=5*60*1000;
const KEYS=Object.freeze([
  'phase1_requests','phase12_customer_followup_queue',
  'phase13_amendments','phase13_customer_queue',
  'phase13_admin_queue','phase14_journal',
]);
const fail=code=>{throw Error('services_phase35_'+code)};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const sorted=(xs)=>[...xs].sort((a,b)=>a.localeCompare(b));

function validateCapture(evidence,now){
  if(!obj(evidence)||evidence.schema!==SCHEMA||
    !REF.test(evidence.projectRef)||typeof evidence.projectRef!=='string'||
    typeof evidence.capturedAt!=='string'||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(evidence.capturedAt)||
    evidence.historyComplete!==true||
    !Array.isArray(evidence.managedMigrations)||
    !obj(evidence.catalog))fail('evidence_invalid');
  const elapsed=now.getTime()-Date.parse(evidence.capturedAt);
  if(!Number.isFinite(elapsed)||elapsed>MAX_AGE_MS||
    elapsed< -MAX_FUTURE_SKEW_MS)fail('evidence_stale');
  if(Object.keys(evidence.catalog).length!==KEYS.length||
     KEYS.some(k=>typeof evidence.catalog[k]!=='boolean'))fail('catalog_incomplete');
  if(evidence.managedMigrations.length>2000)fail('history_oversized');
  const versions=new Set(),names=new Set();
  for(const m of evidence.managedMigrations){
    if(!obj(m)||typeof m.version!=='string'||!VERSION.test(m.version)||
       typeof m.name!=='string'||(m.name!==''&&!NAME.test(m.name))||
       versions.has(m.version)||(m.name!==''&&names.has(m.name)))fail('history_invalid');
    versions.add(m.version);
    if(m.name!=='')names.add(m.name);
  }
  return names;
}

export function reconcileServicesHistory(evidence,now=new Date()){
  validateServicesReplay();
  const names=validateCapture(evidence,now);
  const base=SERVICES_REPLAY_FILES.map((file,index)=>{
    const name=file.slice(15,-4);
    return {sequence:index+1,name,sourceFilename:file,
      managedHistoryByName:names.has(name)?'present':'absent',
      // Crucially, history timestamp != the source filename timestamp.
      sourceTimestampIsManagedVersionEvidence:false};
  });
  const catalog=evidence.catalog;
  const firstEleven=base.slice(0,11);
  const unexpectedMissing=firstEleven.filter(x=>x.managedHistoryByName!=='present');
  const p13=base[11],p14=base[12];
  const objects13=['phase13_amendments','phase13_customer_queue','phase13_admin_queue'];
  const present13=objects13.filter(k=>catalog[k]);
  const p13History=p13.managedHistoryByName==='present';
  const p14History=p14.managedHistoryByName==='present';
  const status=(history,seen,total)=>{
    if(seen>0&&seen<total)return 'partial_schema_manual_investigation_required';
    if(history&&seen===total)return 'history_name_and_objects_present_not_sql_content_proof';
    if(history&&seen===0)return 'history_present_but_schema_missing_blocked';
    if(!history&&seen===total)return 'schema_present_but_history_name_missing_blocked';
    if(!history&&seen===0)return 'not_in_named_history_and_objects_absent';
    return 'schema_history_disagreement_blocked';
  };
  const phase13Status=status(p13History,present13.length,3);
  const phase14Status=status(p14History,catalog.phase14_journal?1:0,1);
  const foundationMissing=!catalog.phase1_requests||!catalog.phase12_customer_followup_queue||
     unexpectedMissing.length>0;
  const gapMatchesMissingHistory= !foundationMissing &&
     phase13Status==='not_in_named_history_and_objects_absent' &&
     phase14Status==='not_in_named_history_and_objects_absent';
  const report={
    schema:'eternyx-services-phase35-readonly-reconciliation-v1',
    evidenceKind:'operator_captured_two_independent_readonly_sources_not_authenticated',
    targetClass:evidence.projectRef===PRODUCTION_REF?'linked_production_readonly':'unverified_nonproduction_reference',
    historyEntryCount:evidence.managedMigrations.length,
    historyNamesOnly:true,
    repositoryVersionsComparedByTimestamp:false,
    sourceManifestCount:base.length,
    sourceSequence:base,
    observedFoundation:{
      requestTablePresent:catalog.phase1_requests,
      followupQueuePresent:catalog.phase12_customer_followup_queue,
      allFirstElevenNamedMigrationsObserved:unexpectedMissing.length===0,
      missingNamedFoundations:unexpectedMissing.map(x=>x.name),
    },
    phase13:{
      name:p13.name,
      historyNameObserved:p13History,
      catalogObjectsObserved:present13.length,
      catalogObjectsExpected:3,
      status:phase13Status,
    },
    phase14:{
      name:p14.name,
      historyNameObserved:p14History,
      catalogObjectsObserved:catalog.phase14_journal?1:0,
      catalogObjectsExpected:1,
      status:phase14Status,
      dependsOnPhase13:true,
    },
    missingTwoSourceMigrationsWithNoObservedObjects:gapMatchesMissingHistory,
    actionableNext:foundationMissing?
      'BLOCKED: inspect earlier named migration and catalog discrepancies before planning phases 13/14':
      gapMatchesMissingHistory?
      'BLOCKED: investigate and prepare a separate reviewed staging-only phase13-then-phase14 change after provisioning staging; never deploy on this evidence':
      'BLOCKED: resolve partial/mismatched history and schema independently before any staged change',
    stagingProjectIndependentlyVerified:false,
    phase27CatalogPassed:false,
    realAccountStagingPassed:false,
    automaticSqlGenerated:false,
    databaseConnectionPerformed:false,
    remoteMigrationPerformed:false,
    productionDeploymentAuthorized:false,
    stagingDeploymentAuthorized:false,
    operatorSignoffProvided:false,
  };
  return report;
}

export async function inspectServicesHistoryEvidence(raw,now=new Date()){
  const plan=await planServicesReplay();
  if(plan.sourceIntegrityPassed!==true ||
     plan.migrationCount!==13 || plan.productionDeploymentAuthorized!==false)
     fail('source_guard_failed');
  return reconcileServicesHistory(raw,now);
}

const invoked=process.argv[1]&&
 path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{
  if(process.argv.length!==3 || process.argv[2].startsWith('-'))fail('arguments_invalid');
  const raw=await readFile(process.argv[2],'utf8');
  if(raw.length>250_000)fail('capture_oversized');
  const report=await inspectServicesHistoryEvidence(JSON.parse(raw));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch{
  // Never echo filenames, raw user-supplied JSON, project references or rows.
  process.stderr.write('BLOCKED: Services Phase 35 read-only history reconciliation unavailable\n');
  process.exitCode=1;
 }
}
