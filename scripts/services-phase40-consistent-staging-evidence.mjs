#!/usr/bin/env node
/**
 * Phase40: reject contradictory named history, inconsistent proof envelopes,
 * and weak 64-check verdicts before staging real-user Auth.
 * No network, remote SQL, database changes, CLI actions, or user records.
 */
import {SERVICES_REPLAY_FILES} from './services-pg17-replay-plan.mjs';

const fail=(x)=>{throw Error('services_phase40_'+x)};
const object=(x)=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exactKeys=(x,keys)=>object(x)&&
 Object.keys(x).length===keys.length&&
 keys.every(key=>Object.hasOwn(x,key));
const sourceNames=Object.freeze(SERVICES_REPLAY_FILES.map(file=>file.slice(15,-4)));
const MIGRATION_VERSION=/^20\d{12}$/;

export const ENVELOPE_IDENTITY_KEYS=Object.freeze([
 'role','db','server_time','auditor_privileges','routine_surface','definer_hardening',
]);
export const ENVELOPE_CATALOG_KEYS=Object.freeze([
 'phase1_requests','phase12_customer_followup_queue',
 'phase13_amendments','phase13_customer_queue','phase13_admin_queue',
 'phase14_journal',
]);
export const VERDICT_KEYS=Object.freeze([
 'catalog_checks_passed','checks_evaluated','checks_failed','failed_check_ids',
]);

export function validateStagingEnvelope(rows){
 if(!Array.isArray(rows)||rows.length!==4||
   !exactKeys(rows[0],ENVELOPE_IDENTITY_KEYS)||
   !exactKeys(rows[1],['managed_migrations'])||
   !exactKeys(rows[2],ENVELOPE_CATALOG_KEYS)||
   !exactKeys(rows[3],VERDICT_KEYS))
   fail('envelope_incomplete_or_unexpected');
 if(!ENVELOPE_CATALOG_KEYS.every(key=>typeof rows[2][key]==='boolean'))
   fail('catalog_untyped');
 if(!Array.isArray(rows[1].managed_migrations))
   fail('history_untyped');
 if(rows[3].catalog_checks_passed!==true||
   rows[3].checks_evaluated!==64||
   rows[3].checks_failed!==0||
   !Array.isArray(rows[3].failed_check_ids)||
   rows[3].failed_check_ids.length!==0)
   fail('catalog_verdict_not_exact');
 return {contractVerified:true,requiredJsonRows:4,strictCatalogChecks:64};
}

export function verifyLiveMigrationSequence(entries){
 if(!Array.isArray(entries)||entries.length<sourceNames.length||entries.length>2000)
   fail('managed_history_incomplete');
 const uniqueVersions=new Set(),uniqueNames=new Set(),byName=new Map();
 for(const entry of entries){
  if(!exactKeys(entry,['version','name'])||
    typeof entry.version!=='string'||!MIGRATION_VERSION.test(entry.version)||
    typeof entry.name!=='string'||!/^[a-z0-9_-]{0,128}$/.test(entry.name)||
    uniqueVersions.has(entry.version)||
    (entry.name!==''&&uniqueNames.has(entry.name)))
    fail('managed_history_invalid');
  uniqueVersions.add(entry.version);
  if(entry.name!=='')uniqueNames.add(entry.name);
  byName.set(entry.name,entry.version);
 }
 const versionList=sourceNames.map(name=>byName.get(name));
 if(versionList.some(x=>x===undefined))fail('service_history_missing_names');
 // Compare actual remote managed version order, not source filename times.
 for(let i=1;i<versionList.length;i++){
  if(versionList[i]<=versionList[i-1])
    fail('service_history_wrong_dependency_order');
 }
 return {
  namedServiceMigrationsVerified:sourceNames.length,
  actualManagedVersionOrderStrictlyIncreasing:true,
  phases13Before14ByRecordedVersion:true,
  sourceTimestampUsedAsDeploymentProof:false,
  migrationSqlContentAuthenticated:false,
  databaseWritePerformed:false,
 };
}

export function enforceConsistentStagingEvidence(rows){
 const contract=validateStagingEnvelope(rows);
 const order=verifyLiveMigrationSequence(rows[1].managed_migrations);
 return {...contract,...order};
}
