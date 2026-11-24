import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, requiredChecks } from '../scripts/security-wave26-release-assessment.mjs';
const now=Date.parse('2026-11-24T14:30:00Z');
const receipt=(phase,at)=>({schema:'eternyx-wave26-gateway-observation-v2',project:'mhodwvypfbxafamkrgsk',phase,observedAt:new Date(at).toISOString(),checks:requiredChecks(phase),checkCount:requiredChecks(phase).length,syntheticFixturesRetained:true,productionAuthorized:false,independentlyAttested:false});
const pre=()=>receipt('pre-cutover',now-60000),post=()=>receipt('post-cutover',now-30000);
test('complete fresh ordered reports never authorize production',()=>{
 const result=assess(pre(),post(),now);
 assert.equal(result.stagingReportsComplete,true);assert.equal(result.productionAuthorized,false);
 assert.equal(result.independentlyAttested,false);assert.ok(result.remainingGates.includes('backup-restore'));
});
test('missing, duplicated, invented and substituted checks block assessment',()=>{
 for(const checks of [[],[...post().checks.slice(1),post().checks[1]],[...post().checks.slice(1),'invented'],pre().checks]){
  const result=assess(pre(),{...post(),checks,checkCount:checks.length},now);
  assert.equal(result.stagingReportsComplete,false);assert.ok(result.blockers.includes('post-cutover-check-set'));
 }
});
test('wrong project, phase, schema, or unauthorized claim blocks assessment',()=>{
 for(const delta of [{project:'wcncuarekaofmfurbtbh'},{phase:'pre-cutover'},{schema:'old'},{productionAuthorized:true},{independentlyAttested:true}]){
  assert.equal(assess(pre(),{...post(),...delta},now).stagingReportsComplete,false);
 }
});
test('stale, future, reversed and missing receipts fail closed',()=>{
 assert.equal(assess(receipt('pre-cutover',now-86400001),post(),now).stagingReportsComplete,false);
 assert.equal(assess(pre(),receipt('post-cutover',now+60001),now).stagingReportsComplete,false);
 assert.equal(assess(pre(),receipt('post-cutover',now-90000),now).stagingReportsComplete,false);
 assert.equal(assess(null,post(),now).stagingReportsComplete,false);
});
