import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gitBlobSha,validateRolloutManifest,compareFreshStagingHistory,verifyPinnedRollout} from '../scripts/services-phase45-pinned-rollout.mjs';

const load=async()=>JSON.parse(await readFile(new URL('../scripts/services-phase45-rollout-manifest.json',import.meta.url),'utf8'));
test('Phase45 verifies the exact foundation and thirteen reviewed Git blobs',async()=>{
 const r=await verifyPinnedRollout();
 assert.equal(r.sourceBlobsVerified,14);
 assert.equal(r.foundationFirst,true);
 assert.equal(r.sourceServicesMigrations,13);
 assert.equal(r.steps.at(-2).managedName,'service_brief_amendments');
 assert.equal(r.steps.at(-1).managedName,'service_request_journal');
 assert.ok(r.steps.every(s=>s.managedVersionAssigned===false));
 assert.equal(r.currentRemoteHistoryVerified,false);
 assert.equal(r.stagingDeploymentAuthorized,false);
 assert.equal(r.productionDeploymentAuthorized,false);
});
test('Phase45 rejects reordered steps, path substitution, extra operations and changed approval boundary',async()=>{
 const m=await load();
 for(const alter of [
  x=>x.steps.reverse(),
  x=>x.steps[0].sourcePath='supabase/migrations/unsafe.sql',
  x=>x.steps.push(x.steps[0]),
  x=>x.steps[1].managedName='different_service',
  x=>x.steps[0].managedVersion='20261124130000',
  x=>x.productionDeploymentAuthorized=true,
  x=>x.requiresSeparateExplicitStagingApproval=false,
 ]){const copy=structuredClone(m);alter(copy);assert.throws(()=>validateRolloutManifest(copy),/services_phase45_/);}
});
test('Phase45 rejects mismatched source blob and computes Git framing, not text-only hash',async()=>{
 assert.equal(gitBlobSha(Buffer.alloc(0)),'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
 const m=await load();m.steps[0].gitBlobSha='0'.repeat(40);
 await assert.rejects(verifyPinnedRollout(undefined,m),/source_blob_drift_step_1/);
});
test('Phase45 blocks new, removed, changed-version and already-applied migration history',async()=>{
 const m=await load(),base=m.observedExistingHistory;
 assert.equal(base.length,9);
 assert.equal(compareFreshStagingHistory(m,[...base].reverse()).state,'reviewed_history_matches_only');
 const newer={version:'20261124130001',name:'other_pillar_change'};
 const added=compareFreshStagingHistory(m,[...base,newer]);
 assert.equal(added.addedCount,1);
 assert.equal(added.state,'blocked_history_changed_review_again');
 assert.equal(compareFreshStagingHistory(m,base.slice(1)).removedCount,1);
 const changed=structuredClone(base);changed[0].version='20261124130002';
 assert.equal(compareFreshStagingHistory(m,changed).state,'blocked_history_changed_review_again');
 const overlap=compareFreshStagingHistory(m,[...base,{...newer,name:m.steps[0].managedName}]);
 assert.equal(overlap.plannedNameOverlapCount,1);
 assert.equal(overlap.remoteDeploymentAuthorized,false);
 assert.throws(()=>compareFreshStagingHistory(m,[...base,base[0]]),/invalid_history_entry/);
 assert.throws(()=>compareFreshStagingHistory(m,[...base,{...newer,name:'../unsafe'}]),/invalid_history_entry/);
});
test('Phase45 rehearses with staging default ACLs intact and exact 64-check catalog verdict',async()=>{
 const wf=await readFile(new URL('../.github/workflows/services-pg17-disposable-replay.yml',import.meta.url),'utf8');
 assert.match(wf,/services-phase45-pinned-rollout\.mjs --check/);
 assert.match(wf,/services-phase45-staging-default-acl-assert\.sql/);
 assert.match(wf,/services-phase45-catalog\.txt/);
 assert.doesNotMatch(wf,/ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES/);
 assert.match(wf,/--network none/);
 assert.match(wf,/test "\$index44" -eq 13/);
});
