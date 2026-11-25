import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtempSync,rmSync,writeFileSync,readFileSync,
 chmodSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {lockLabAgent,reserveLabClaim,appendLabEvent}
 from "../src/lib/dockerLabRecovery.mjs";
import {lockLabContainer} from "../src/lib/dockerLabContainerLock.mjs";
import {auditSignedAgentRecoveryDirectory}
 from "../src/lib/dockerStrictRecoveryInventory.mjs";
import {
 evaluateDockerFaultRecoverySnapshot,compareDockerFaultRecoverySnapshots,
 validateDockerFaultReviewPins,DOCKER_FAULT_STAGES,
 DOCKER_FAULT_EXPECTED_KEYS
} from "../src/lib/dockerStagingFaultRecoveryReview.mjs";

const TARGET="a".repeat(64),OTHER="b".repeat(64);
const fixture=fn=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-phase43-"));
 try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}
};
function initial(dir,containerId=TARGET,operation="stop"){
 const pins={agentId:randomUUID(),claimId:randomUUID(),containerId,operation};
 lockLabAgent(pins.agentId,dir);
 reserveLabClaim(pins,dir);
 const unlock=lockLabContainer(pins,dir);
 return {pins,unlock};
}
function advance(dir,p,stage,unlock){
 if(stage==="reserved_pre_attempt")return;
 if(["attempted_outcome_unknown","completed_unacknowledged",
  "failed_terminal_ambiguous","completed_locally_acknowledged",
  "failed_legacy_locally_acknowledged"].includes(stage))
  appendLabEvent(p.claimId,"attempted",dir);
 if(["guard_denied_unacknowledged","guard_denied_locally_acknowledged"].includes(stage)){
  appendLabEvent(p.claimId,"guard_denied",dir);unlock();
 }else if(["completed_unacknowledged","completed_locally_acknowledged"].includes(stage)){
  appendLabEvent(p.claimId,"completed",dir);unlock();
 }else if(["failed_terminal_ambiguous","failed_legacy_locally_acknowledged"].includes(stage)){
  appendLabEvent(p.claimId,"failed",dir);unlock();
 }
 if(stage.endsWith("_locally_acknowledged"))
  appendLabEvent(p.claimId,"receipt_accepted",dir);
}
function sample(dir,pins,stage,ms=Date.now()){
 return evaluateDockerFaultRecoverySnapshot(
  auditSignedAgentRecoveryDirectory(dir),pins,{
   expectedStage:stage,now:new Date(ms)
  });
}
test("all eight actual original crash/receipt journal windows classify correctly, without execution authority",()=>fixture(dir=>{
 assert.equal(DOCKER_FAULT_STAGES.length,8);
 for(const stage of DOCKER_FAULT_STAGES){
  const inner=mkdtempSync(join(tmpdir(),"eternyx-phase43-window-"));
  try{
   const {pins,unlock}=initial(inner);
   advance(inner,pins,stage,unlock);
   const r=sample(inner,pins,stage);
   assert.equal(r.stage,stage);
   assert.equal(r.exactOriginalPrivateInventoryVerified,true);
   assert.equal(r.completeSameContainerHistoryChecked,true);
   assert.equal(r.manualHumanReconciliationRequired,true);
   assert.equal(r.unknownAttemptHeld,stage==="attempted_outcome_unknown");
   assert.equal(r.localReceiptReplayFenceSatisfied,
    ["completed_unacknowledged","guard_denied_unacknowledged"].includes(stage));
   assert.equal(r.localAcknowledgmentHistoryValidated,
    ["completed_locally_acknowledged","guard_denied_locally_acknowledged"].includes(stage));
   assert.match(r.reportSha256,/^[a-f0-9]{64}$/);
   for(const k of ["localDockerOperationExecutedByReviewer",
    "remoteReceiptIndependentlyVerified","remotePermitRevocationVerified",
    "crashInjectionIndependentlyWitnessed","physicalHostIsolationProven",
    "automaticDockerRetryAuthorized","automaticReceiptResendAuthorized",
    "recoveryLocksAutomaticallyReleased","stagingDockerExecutionAuthorized",
    "productionDeploymentAuthorized"])
    assert.equal(r[k],false,k);
   assert.equal(Object.isFrozen(r),true);
   assert.doesNotMatch(JSON.stringify(r),new RegExp(pins.containerId));
  }finally{rmSync(inner,{recursive:true,force:true});}
 }
}));
test("UNKNOWN preserves original target lock and blocks both manual confirmation and automatic resend",()=>fixture(dir=>{
 const {pins}=initial(dir);
 appendLabEvent(pins.claimId,"attempted",dir);
 const r=sample(dir,pins,"attempted_outcome_unknown");
 assert.equal(r.unknownAttemptHeld,true);
 assert.equal(r.localReceiptReplayFenceSatisfied,false);
 assert.equal(r.automaticDockerRetryAuthorized,false);
 assert.equal(r.automaticReceiptResendAuthorized,false);
 const path=join(dir,"container-"+TARGET+".lock");
 assert.match(readFileSync(path,"utf8"),/active/);
}));
test("unmodified UNKNOWN remains a durable hold between two independently pinned inspections",()=>fixture(dir=>{
 const {pins}=initial(dir);appendLabEvent(pins.claimId,"attempted",dir);
 const now=Date.now();
 const a=sample(dir,pins,"attempted_outcome_unknown",now-5000);
 const b=sample(dir,pins,"attempted_outcome_unknown",now-1000);
 const result=compareDockerFaultRecoverySnapshots(a,b,pins,new Date(now));
 assert.equal(result.observedTransition,"unchanged_hold_preserved");
 assert.equal(result.unknownHoldPreserved,true);
 assert.equal(result.serverReceiptIndependentlyAuthenticated,false);
 assert.equal(result.automaticDockerRetryAuthorized,false);
 assert.equal(result.receiptResendAuthorized,false);
}));
test("a real original fsynced UNKNOWN -> completed terminal is locally observed, not a verified engine action",()=>fixture(dir=>{
 const {pins,unlock}=initial(dir);appendLabEvent(pins.claimId,"attempted",dir);
 const now=Date.now(),a=sample(dir,pins,"attempted_outcome_unknown",now-4000);
 appendLabEvent(pins.claimId,"completed",dir);unlock();
 const b=sample(dir,pins,"completed_unacknowledged",now-2000);
 const r=compareDockerFaultRecoverySnapshots(a,b,pins,new Date(now));
 assert.equal(r.observedTransition,"durable_local_history_advanced");
 assert.equal(r.originalStateHistoryConsistent,true);
 assert.equal(r.locallyAcknowledgedOnly,false);
 assert.equal(r.permitRevocationIndependentlyProven,false);
 assert.equal(r.serverReceiptIndependentlyAuthenticated,false);
}));
test("terminal -> receipt_accepted is only local audit evidence; not authenticated remote server acknowledgement",()=>fixture(dir=>{
 const {pins,unlock}=initial(dir);
 appendLabEvent(pins.claimId,"attempted",dir);
 appendLabEvent(pins.claimId,"completed",dir);unlock();
 const now=Date.now(),a=sample(dir,pins,"completed_unacknowledged",now-4000);
 appendLabEvent(pins.claimId,"receipt_accepted",dir);
 const b=sample(dir,pins,"completed_locally_acknowledged",now-2000);
 const r=compareDockerFaultRecoverySnapshots(a,b,pins,new Date(now));
 assert.equal(r.locallyAcknowledgedOnly,true);
 assert.equal(r.serverReceiptIndependentlyAuthenticated,false);
 assert.equal(r.receiptResendAuthorized,false);
 assert.equal(r.productionDeploymentAuthorized,false);
}));
test("pre-attempt guard denial can be locally acknowledged without proving permit revocation",()=>fixture(dir=>{
 const {pins,unlock}=initial(dir);
 const now=Date.now(),a=sample(dir,pins,"reserved_pre_attempt",now-6000);
 appendLabEvent(pins.claimId,"guard_denied",dir);unlock();
 const b=sample(dir,pins,"guard_denied_unacknowledged",now-4000);
 assert.equal(compareDockerFaultRecoverySnapshots(a,b,pins,new Date(now)).permitRevocationIndependentlyProven,false);
 appendLabEvent(pins.claimId,"receipt_accepted",dir);
 const c=sample(dir,pins,"guard_denied_locally_acknowledged",now-2000);
 assert.equal(compareDockerFaultRecoverySnapshots(b,c,pins,new Date(now)).locallyAcknowledgedOnly,true);
}));
test("legacy failed + local receipt_accepted stays ambiguous and never becomes a verified successful operation",()=>fixture(dir=>{
 const {pins,unlock}=initial(dir);
 appendLabEvent(pins.claimId,"attempted",dir);
 appendLabEvent(pins.claimId,"failed",dir);unlock();
 const now=Date.now(),a=sample(dir,pins,"failed_terminal_ambiguous",now-4000);
 appendLabEvent(pins.claimId,"receipt_accepted",dir);
 const b=sample(dir,pins,"failed_legacy_locally_acknowledged",now-2000);
 const r=compareDockerFaultRecoverySnapshots(a,b,pins,new Date(now));
 assert.equal(r.locallyAcknowledgedOnly,false);
 assert.equal(r.automaticDockerRetryAuthorized,false);
 assert.equal(r.stagingExecutionAuthorized,false);
}));
test("wrong expected fault window, removed exclusive lock or foreign agent claim is denied",()=>fixture(dir=>{
 const {pins}=initial(dir);
 const history=auditSignedAgentRecoveryDirectory(dir);
 assert.throws(()=>evaluateDockerFaultRecoverySnapshot(history,pins,{
  expectedStage:"completed_unacknowledged"
 }),/differs/);
 for(const bad of [{...pins,agentId:randomUUID()},
  {...pins,containerId:OTHER},{...pins,claimId:randomUUID()},
  {...pins,operation:"restart"}]){
  assert.throws(()=>evaluateDockerFaultRecoverySnapshot(history,bad));
 }
 const forged={...history,
  containerLocks:[],containerLockCount:0,totalLockCount:history.lockCount,
  fileCount:history.fileCount-1,
  claims:history.claims.map(c=>({...c,containerLockPresent:false}))};
 assert.throws(()=>evaluateDockerFaultRecoverySnapshot(forged,pins),/target lock/);
}));
test("unresolved same-target sibling prevents a locally clean receipt claim",()=>fixture(dir=>{
 const first=initial(dir);
 const second={agentId:randomUUID(),claimId:randomUUID(),containerId:TARGET,operation:"stop"};
 lockLabAgent(second.agentId,dir);
 reserveLabClaim(second,dir);
 // Forensic audit still scans both original claim files; this is a synthetic
 // corrupt scenario with no second target lock, not a permissible real agent.
 assert.throws(()=>sample(dir,first.pins,"reserved_pre_attempt"),/Unresolved same-container/);
}));
test("same-target identity swaps, stale/tampered outcomes and backward transitions fail closed",()=>fixture(dir=>{
 const {pins,unlock}=initial(dir);
 const now=Date.now();
 const a=sample(dir,pins,"reserved_pre_attempt",now-6000);
 appendLabEvent(pins.claimId,"attempted",dir);
 const b=sample(dir,pins,"attempted_outcome_unknown",now-3000);
 const mods=[
  {stage:"completed_locally_acknowledged"},
  {productionDeploymentAuthorized:true},
  {localReceiptReplayFenceSatisfied:true},
  {unknownAttemptHeld:false},
  {claimFileSha256:"b".repeat(64)},
  {reportSha256:"b".repeat(64)},
  {operation:"start"},
  {extra:"injected"},
  {inspectedAt:"2010-01-01T00:00:00.000Z"}
 ];
 for(const x of mods)
  assert.throws(()=>compareDockerFaultRecoverySnapshots(a,{...b,...x},pins));
 assert.throws(()=>compareDockerFaultRecoverySnapshots(b,a,pins));
 assert.throws(()=>compareDockerFaultRecoverySnapshots(a,b,{
  ...pins,containerId:OTHER
 }));
 assert.equal(compareDockerFaultRecoverySnapshots(a,b,pins,new Date(now)).observedTransition,
  "durable_local_history_advanced");
}));
test("original malformed, symlinked or public recovery journal files are never repaired or used",()=>fixture(dir=>{
 const {pins}=initial(dir);
 const path=join(dir,"claim-"+pins.claimId+".jsonl");
 chmodSync(path,0o644);
 assert.throws(()=>sample(dir,pins,"reserved_pre_attempt"),/publicly readable/);
 chmodSync(path,0o600);
 writeFileSync(path,readFileSync(path,"utf8")+'{"event":"bogus"}\n');
 assert.throws(()=>sample(dir,pins,"reserved_pre_attempt"),/Invalid/);
}));
test("offline reviewer CLI checks only owner-private independent pins and canonical evidence",()=>fixture(dir=>{
 const {pins,unlock}=initial(dir);
 const now=Date.now(),a=sample(dir,pins,"reserved_pre_attempt",now-4000);
 appendLabEvent(pins.claimId,"guard_denied",dir);unlock();
 const b=sample(dir,pins,"guard_denied_unacknowledged",now-2000);
 const before=join(dir,"before.json"),after=join(dir,"after.json");
 const approved=join(dir,"pins.json");
 for(const [path,object] of [[before,a],[after,b],[approved,pins]])
  writeFileSync(path,JSON.stringify(object)+"\n",{mode:0o600});
 assert.deepEqual(Object.keys(pins),DOCKER_FAULT_EXPECTED_KEYS);
 const script=new URL("../scripts/docker-staging-fault-recovery-review.mjs",import.meta.url).pathname;
 const run=()=>spawnSync(process.execPath,[script,"compare",before,after,approved],{
  encoding:"utf8",timeout:7000
 });
 const ok=run();assert.equal(ok.status,0,ok.stderr);
 assert.equal(JSON.parse(ok.stdout).productionDeploymentAuthorized,false);
 chmodSync(approved,0o644);
 const bad=run();assert.notEqual(bad.status,0);assert.equal(bad.stdout,"");
 chmodSync(approved,0o600);
 symlinkSync(approved,join(dir,"pin-alias"));
 const alias=spawnSync(process.execPath,[script,"compare",before,after,join(dir,"pin-alias")],{
  encoding:"utf8",timeout:7000
 });
 assert.notEqual(alias.status,0);
 writeFileSync(after,JSON.stringify(b).replace(
  '"schema":"eternyx-docker-staging-fault-recovery-snapshot-v1"',
  '"schema":"eternyx-docker-staging-fault-recovery-snapshot-v1","schema":"eternyx-docker-staging-fault-recovery-snapshot-v1"')+"\n");
 assert.notEqual(run().status,0);
}));
test("real snapshot CLI refuses CI, privileged root or production execution flags before observing any journal",()=>{
 const s=new URL("../scripts/docker-staging-fault-recovery-review.mjs",import.meta.url).pathname;
 const result=spawnSync(process.execPath,[s,"snapshot","/tmp/does-not-exist",
  randomUUID(),randomUUID(),TARGET,"stop","attempted_outcome_unknown"],{
  encoding:"utf8",timeout:7000,
  env:{...process.env,CI:"true",ETERNYX_REMOTE_LAB_ENABLED:"true"}
 });
 assert.notEqual(result.status,0);assert.equal(result.stdout,"");
 assert.match(result.stderr,/Read-only Docker fault recovery evidence refused/);
 const source=readFileSync(s,"utf8");
 assert.match(source,/auditSignedAgentRecoveryDirectory\(args\[1\]\)/);
 assert.match(source,/const before=auditSignedAgentRecoveryDirectory/);
 assert.match(source,/const after=auditSignedAgentRecoveryDirectory/);
 assert.doesNotMatch(source,/spawnSync\s*\(/);
 assert.doesNotMatch(source,/\bfetch\s*\(/);
 assert.doesNotMatch(source,/\bappendLabEvent\s*\(/);
 assert.doesNotMatch(source,/\bunlinkSync\s*\(/);
});
