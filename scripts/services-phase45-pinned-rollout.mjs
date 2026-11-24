#!/usr/bin/env node
/** Offline review manifest verifier. No SQL execution, DB connection or
 * migration client. Never infer a managed version from a source filename. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SERVICES_REPLAY_FILES,planServicesReplay} from './services-pg17-replay-plan.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MANIFEST='scripts/services-phase45-rollout-manifest.json';
const FOUNDATION='scripts/sql/services-staging-trusted-admin-foundation-candidate.sql';
const FOUNDATION_NAME='services_staging_trusted_admin_foundation';
const EXPECTED=[FOUNDATION,...SERVICES_REPLAY_FILES.map(x=>'supabase/migrations/'+x)];
const VERSION=/^20\d{12}$/;
const NAME=/^[a-z0-9][a-z0-9_]{0,127}$/;
const SHA=/^[a-f0-9]{40}$/;
const fail=code=>{throw Error('services_phase45_'+code)};
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exactKeys=(v,keys)=>record(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));

export function gitBlobSha(bytes){
 if(!Buffer.isBuffer(bytes))fail('invalid_blob_bytes');
 return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
}

export function validateHistory(history){
 if(!Array.isArray(history)||history.length>2000)fail('invalid_history');
 const names=new Set(),versions=new Set();
 for(const e of history){
  if(!exactKeys(e,['version','name'])||typeof e.version!=='string'||
    !VERSION.test(e.version)||typeof e.name!=='string'||!NAME.test(e.name)||
    versions.has(e.version)||names.has(e.name))fail('invalid_history_entry');
  names.add(e.name);versions.add(e.version);
 }
 return history.slice().sort((a,b)=>a.version.localeCompare(b.version));
}

export function validateRolloutManifest(m){
 if(!exactKeys(m,['schema','targetClass','observedHistoryDate','observedExistingHistory','steps','requiresSeparateExplicitStagingApproval','productionDeploymentAuthorized'])||
    m.schema!=='eternyx-services-staging-rollout-review-v1'||
    m.targetClass!=='separate_registered_staging_only'||
    !/^\d{4}-\d{2}-\d{2}$/.test(m.observedHistoryDate)||
    m.requiresSeparateExplicitStagingApproval!==true||
    m.productionDeploymentAuthorized!==false||
    !Array.isArray(m.steps)||m.steps.length!==14)fail('invalid_manifest');
 const baseline=validateHistory(m.observedExistingHistory);
 const seen=new Set();
 for(const [i,s] of m.steps.entries()){
  const expectedName=i===0?FOUNDATION_NAME:SERVICES_REPLAY_FILES[i-1].slice(15,-4);
  if(!exactKeys(s,['step','sourcePath','gitBlobSha','managedName'])||
    s.step!==i+1||s.sourcePath!==EXPECTED[i]||s.managedName!==expectedName||
    typeof s.gitBlobSha!=='string'||!SHA.test(s.gitBlobSha)||
    seen.has(s.managedName))fail('invalid_step');
  seen.add(s.managedName);
 }
 if(baseline.some(e=>seen.has(e.name)))fail('observed_history_overlaps_rollout');
 return baseline;
}

// A freshly collected complete history must be compared to the reviewed
// snapshot. Any addition, disappearance or changed version requires review;
// never silently ignore a concurrent deployment from another pillar.
export function compareFreshStagingHistory(manifest,history){
 const baseline=validateRolloutManifest(manifest);
 const fresh=validateHistory(history);
 const baselineKeys=new Set(baseline.map(x=>x.version+':'+x.name));
 const freshKeys=new Set(fresh.map(x=>x.version+':'+x.name));
 const planned=new Set(manifest.steps.map(x=>x.managedName));
 const added=fresh.filter(x=>!baselineKeys.has(x.version+':'+x.name)).length;
 const removed=baseline.filter(x=>!freshKeys.has(x.version+':'+x.name)).length;
 const overlap=fresh.filter(x=>planned.has(x.name)).length;
 return {
  historyCount:fresh.length,addedCount:added,removedCount:removed,
  plannedNameOverlapCount:overlap,
  state:added===0&&removed===0&&overlap===0?
   'reviewed_history_matches_only':'blocked_history_changed_review_again',
  freshHistoryIndependentlyAuthenticated:false,
  remoteDeploymentAuthorized:false,
 };
}

export async function verifyPinnedRollout(root=ROOT,manifest){
 const m=manifest??JSON.parse(await readFile(path.join(root,MANIFEST),'utf8'));
 validateRolloutManifest(m);
 const prior=await planServicesReplay(root);
 if(prior.sourceIntegrityPassed!==true)fail('source_integrity_failed');
 for(const step of m.steps){
  const bytes=await readFile(path.join(root,step.sourcePath));
  if(bytes.length===0||gitBlobSha(bytes)!==step.gitBlobSha)fail('source_blob_drift_step_'+step.step);
 }
 return {
  schema:'eternyx-services-phase45-pinned-rollout-review-v1',
  sourceBlobsVerified:14,
  foundationFirst:true,
  sourceServicesMigrations:13,
  historicalCollisionBaselineCount:prior.historyCollisionsAcknowledged,
  observedExistingHistoryCount:m.observedExistingHistory.length,
  steps:m.steps.map(s=>({...s,managedVersionAssigned:false})),
  currentRemoteHistoryVerified:false,
  liveDatabaseConnected:false,
  migrationsApplied:false,
  stagingDeploymentAuthorized:false,
  productionDeploymentAuthorized:false,
 };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3||process.argv[2]!=='--check')fail('invalid_arguments');
  const r=await verifyPinnedRollout();
  process.stdout.write(JSON.stringify(r,null,2)+'\n');
 }catch(err){
  const code=err instanceof Error&&/^services_phase45_[a-z0-9_]+$/.test(err.message)?err.message:'services_phase45_review_failed';
  process.stderr.write('BLOCKED '+code+'\n');process.exitCode=1;
 }
}
