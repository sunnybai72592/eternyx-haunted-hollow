#!/usr/bin/env node
/**
 * No-network Services 1–14 Postgres 17 replay planner.
 *
 * This produces an exact allowlisted file sequence for a brand-new
 * disposable, network-isolated CI PostgreSQL instance. It cannot deploy
 * to any Supabase project or authorize database migration in staging.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditRepository } from './services-migration-source-guard.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SERVICES_REPLAY_FILES=Object.freeze([
  '20261122201000_service_requests.sql',
  '20261122213000_service_request_activity.sql',
  '20261122223000_service_scope_triage.sql',
  '20261122234000_services_delivery_gate.sql',
  '20261122235500_service_admin_attention_queue.sql',
  '20261123000500_service_write_rate_limits.sql',
  '20261123003000_service_review_planner.sql',
  '20261123011500_service_triage_history.sql',
  '20261123014500_service_request_checkpoints.sql',
  '20261123023000_service_clarifications.sql',
  '20261123031500_service_clarification_followthrough.sql',
  '20261123040000_service_brief_amendments.sql',
  '20261123050000_service_request_journal.sql',
]);
const MIGRATION=/^20\d{12}_service[a-z0-9_-]*\.sql$/;
export function validateServicesReplay(files=SERVICES_REPLAY_FILES) {
  if(!Array.isArray(files)||files.length!==13||
     files.some(f=>typeof f!=='string'||!MIGRATION.test(f))||
     new Set(files).size!==files.length)throw Error('invalid_services_replay_manifest');
  if(files[0]!=='20261122201000_service_requests.sql' ||
     files.at(-2)!=='20261123040000_service_brief_amendments.sql' ||
     files.at(-1)!=='20261123050000_service_request_journal.sql')
     throw Error('invalid_services_replay_bounds');
  if(files.some((f,i)=>i>0 && files[i-1].slice(0,14)>=f.slice(0,14)))
     throw Error('services_replay_not_ordered');
  return true;
}
export async function planServicesReplay(root=ROOT){
  validateServicesReplay();
  const source=await auditRepository(root);
  if(source.sourceSafetyPassed!==true ||
     source.productionDeploymentAuthorized!==false ||
     source.verifiedAppliedMigrationHistory!==false)
     throw Error('source_integrity_or_history_unverified');
  for(const file of SERVICES_REPLAY_FILES){
    const sql=await readFile(path.join(root,'supabase/migrations',file),'utf8');
    if(!sql.trim()||!/\b(?:CREATE|ALTER|GRANT|REVOKE)\b/i.test(sql))
      throw Error('missing_nonempty_service_migration');
  }
  return {
    schema:'eternyx-services-disposable-pg17-replay-v1',
    mode:'unlinked_network_isolated_pg17_only',
    files:SERVICES_REPLAY_FILES,
    migrationCount:SERVICES_REPLAY_FILES.length,
    sourceIntegrityPassed:true,
    historyCollisionsAcknowledged:source.collisionVersionCount,
    remoteDatabaseConnected:false,
    deployedSchemaVerified:false,
    operatorStagingAuthorized:false,
    productionDeploymentAuthorized:false,
  };
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked) {
  planServicesReplay().then(report=>{
    if(process.argv.length===3&&process.argv[2]==='--list') {
      process.stdout.write(report.files.map(f=>'supabase/migrations/'+f).join('\n')+'\n');
    } else if(process.argv.length===3&&process.argv[2]==='--check'){
      process.stdout.write(JSON.stringify(report)+'\n');
    } else throw Error('invalid_arguments');
  }).catch(()=>{
    process.stderr.write('Disposable Services replay plan validation failed\n');
    process.exitCode=1;
  });
}