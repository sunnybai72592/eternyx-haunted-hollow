import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,rmSync,writeFileSync,chmodSync,symlinkSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {auditSignedAgentRecoveryDirectory} from "../src/lib/dockerStrictRecoveryInventory.mjs";
import {lockLabAgent,reserveLabClaim,appendLabEvent} from "../src/lib/dockerLabRecovery.mjs";
import {fingerprintLabContainer} from "../src/lib/dockerLabPolicyDrift.mjs";
import {
 evaluateDockerStagingLifecycleCapture,verifyDockerStagingLifecyclePair,
 STAGING_LIFECYCLE_EXPECTED_KEYS
} from "../src/lib/dockerStagingLifecycleEvidence.mjs";
const SHA=x=>createHash("sha256").update(x).digest("hex");
const ID="a".repeat(64),IMAGE="f".repeat(64),C="phase41-rootless-isolated";
const HOST="unix:///run/user/1001/docker.sock",DAEMON="phase41-pinned-daemon";
const mk=fn=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-lifecycle-phase41-"));
 try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}
};
function target(op="stop",stage="before"){
 const started="2026-11-23T11:00:00.000Z",newStart="2026-11-23T11:04:00.000Z";
 const oldFinish="0001-01-01T00:00:00Z",newFinish="2026-11-23T11:04:00.000Z";
 const beforeRunning=op!=="start";
 const running=stage==="before"?beforeRunning:op!=="stop";
 const status=running?"running":"exited";
 const startAt=stage==="after"&&op!=="stop"?newStart:started;
 const finishAt=stage==="after"&&op==="stop"?newFinish:oldFinish;
 const pid=running?(stage==="after"?5656:4545):0;
 return {
  Id:ID,Name:"/do-not-export-raw-inspect",Image:"sha256:"+IMAGE,
  Config:{Image:"example.invalid/app@sha256:"+IMAGE,User:"10001:10001",
   Env:["TEST_SECRET=DO_NOT_PRINT"],Labels:{
    "io.eternyx.operator.managed":"true",
    "io.eternyx.operator.scope":"local-workbench"}},
  HostConfig:{
   Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",
   Binds:[],PortBindings:{},CapAdd:[],Devices:[],DeviceRequests:[],
   CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],
   Memory:134217728,PidsLimit:64,RestartPolicy:{Name:"no"},
   PidMode:"",IpcMode:"",CgroupnsMode:"",UsernsMode:"",UTSMode:""
  },
  RestartCount:stage==="after"&&op==="restart"?1:0,
  Mounts:[],NetworkSettings:{Networks:{none:{}},Ports:{}},
  State:{Running:running,Status:status,StartedAt:startAt,FinishedAt:finishAt,
   Pid:pid,ExitCode:0,Paused:false,Restarting:false,Dead:false}
 };
}
function data(dir,op="stop",stage="before"){
 const t=target(op,stage),pins={
  context:C,host:HOST,socketPath:"/run/user/1001/docker.sock",
  daemonIdSha256:SHA("ETERNYX_DOCKER_HOST_DAEMON_ID_V1\n"+DAEMON),
  imageSha256:IMAGE,policySha256:fingerprintLabContainer(t,ID).policySha256
 };
 const info={ID:DAEMON,SecurityOptions:["name=rootless","name=seccomp,profile=builtin"],
  Swarm:{LocalNodeState:"inactive"}};
 const history=auditSignedAgentRecoveryDirectory(dir);
 return {pins,contextBefore:C,contextAfter:C,endpointBefore:HOST,endpointAfter:HOST,
  infoBefore:info,infoAfter:structuredClone(info),
  targetBefore:t,targetAfter:structuredClone(t),
  containerId:ID,operation:op,phase:stage,
  inventoryBefore:history,inventoryAfter:history,
  cli:{hashVerified:true,rootOwned:true,symlinkFree:true,sha256:"1".repeat(64)},
  config:{completeTreeVerified:true,rootOwned:true,onlyOneLocalContext:true,
   context:C,endpoint:HOST,sha256:"2".repeat(64)}
 };
}
function pair(dir,op="stop",now=new Date()){
 const before=evaluateDockerStagingLifecycleCapture(
  data(dir,op,"before"),new Date(now.valueOf()-120000));
 const after=evaluateDockerStagingLifecycleCapture(
  data(dir,op,"after"),new Date(now.valueOf()-60000));
 const approved={};
 for(const key of STAGING_LIFECYCLE_EXPECTED_KEYS)
  approved[key]=before[key];
 return {before,after,approved};
}
test("all three separately authorized lifecycle types yield internally consistent read-only transition evidence",()=>mk(dir=>{
 for(const op of ["stop","start","restart"]){
  const p=pair(dir,op);
  const got=verifyDockerStagingLifecyclePair(p.before,p.after,p.approved);
  assert.equal(got.operation,op);
  assert.equal(got.reportedLifecycleTransitionConsistent,true);
  assert.equal(got.hardenedNetworkObservationUnchanged,true);
  assert.equal(got.originalSnapshotsSelfConsistent,true);
  assert.equal(got.independentlyMatchedPins,true);
  for(const k of ["independentlyVerifiedHostIdentity","physicalIsolationProven",
    "executedActionAttributionProven","signedPermitAndRevocationVerified",
    "crashRecoveryDrillProven","receiptReconciliationProven",
    "reviewerWitnessSignatureVerified","stagingExecutionAuthorized",
    "productionDeploymentAuthorized"])
   assert.equal(got[k],false,k);
  assert.match(got.comparisonSha256,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(got),/DO_NOT_PRINT|phase41-pinned-daemon|\/run\/user/);
  assert.equal(Object.isFrozen(got),true);
 }
}));
test("both captures contain no raw container JSON, host PID, env secrets or socket",()=>mk(dir=>{
 const {before,after}=pair(dir);
 for(const p of [before,after]){
  assert.equal(p.doubleReadOnlyObservationVerified,true);
  assert.equal(p.dockerMutationExecutedByObserver,false);
  assert.equal(p.productionDeploymentAuthorized,false);
  assert.equal(p.independentHostIdentityProven,false);
  assert.equal(p.physicalIsolationIndependentlyProven,false);
  assert.match(p.observedState.pidSha256,/^[a-f0-9]{64}$/);
  assert.equal(typeof p.observedState.running,"boolean");
  assert.doesNotMatch(JSON.stringify(p),/DO_NOT_PRINT|phase41-pinned-daemon|do-not-export-raw-inspect|\/run\/user|5656|4545/);
 }
}));
test("post-state admission rejects an unperformed stop or start, while restart requires paired epoch evidence",()=>mk(dir=>{
 for(const op of ["stop","start"]){
  const bad=data(dir,op,"before");
  bad.phase="after";
  assert.throws(()=>evaluateDockerStagingLifecycleCapture(bad),/Post-staging observation/);
 }
 // A restart remains running on both sides: POST by itself cannot prove
 // restart. Only the independent before/after epoch comparison can.
 const restartBefore=data(dir,"restart","before");
 restartBefore.phase="after";
 const unproven=evaluateDockerStagingLifecycleCapture(restartBefore,new Date(Date.now()-60000));
 assert.equal(unproven.observedState.running,true);
 const p=pair(dir,"restart");
 assert.throws(()=>verifyDockerStagingLifecyclePair(
  p.before,unproven,p.approved),/start epoch|distinct lifecycle|reversed|stale|checksum|drift|transition/);
}));
test("double-read capture refuses changed runtime state even with the same container ID",()=>mk(dir=>{
 const base=data(dir),changed=structuredClone(base.targetAfter);
 changed.State.Pid+=1;
 assert.throws(()=>evaluateDockerStagingLifecycleCapture({
  ...base,targetAfter:changed
 }),/drifted/);
 changed.State.Pid=base.targetBefore.State.Pid;
 changed.State.StartedAt="2026-11-23T11:02:00.000Z";
 assert.throws(()=>evaluateDockerStagingLifecycleCapture({
  ...base,targetAfter:changed
 }),/drifted/);
}));
test("changed pinned daemon, endpoint, image, policy or exposed network refuses snapshots",()=>mk(dir=>{
 const base=data(dir);
 const bad=[
  {contextAfter:"default"},
  {endpointAfter:"tcp://127.0.0.1:2375"},
  {infoAfter:{...base.infoAfter,ID:"different-daemon"}},
  {config:{...base.config,context:"other"}},
  {cli:{...base.cli,hashVerified:false}},
  {pins:{...base.pins,policySha256:"b".repeat(64)}}
 ];
 for(const x of bad)
  assert.throws(()=>evaluateDockerStagingLifecycleCapture({...base,...x}));
 for(const mutate of [
  x=>{x.HostConfig.Privileged=true;},
  x=>{x.HostConfig.NetworkMode="bridge";},
  x=>{x.NetworkSettings.Networks={bridge:{}};},
  x=>{x.Image="sha256:"+"a".repeat(64);},
  x=>{x.Mounts=[{Source:"/proc"}];},
 ]){
  const t=structuredClone(base.targetBefore);
  mutate(t);
  assert.throws(()=>evaluateDockerStagingLifecycleCapture({
   ...base,targetBefore:t,targetAfter:structuredClone(t)
  }));
 }
}));
test("unresolved or failed recovery claims and retained locks refuse staging capture",()=>mk(dir=>{
 const agent="33333333-3333-4333-8333-333333333333";
 const claim="44444444-4444-4444-8444-444444444444";
 lockLabAgent(agent,dir);
 reserveLabClaim({agentId:agent,claimId:claim,containerId:ID,operation:"stop"},dir);
 assert.throws(()=>evaluateDockerStagingLifecycleCapture(data(dir)),/unresolved/);
 appendLabEvent(claim,"attempted",dir);
 assert.throws(()=>evaluateDockerStagingLifecycleCapture(data(dir)),/unresolved/);
 appendLabEvent(claim,"failed",dir);
 assert.throws(()=>evaluateDockerStagingLifecycleCapture(data(dir)),/unresolved/);
 appendLabEvent(claim,"receipt_accepted",dir);
 assert.throws(()=>evaluateDockerStagingLifecycleCapture(data(dir)),/unresolved/);
}));
test("separately approved hashes and operation cannot be taken from a modified capture",()=>mk(dir=>{
 const p=pair(dir);
 for(const key of STAGING_LIFECYCLE_EXPECTED_KEYS){
  const approved={...p.approved,[key]:
   key==="operation"?"restart":"a".repeat(64)};
  assert.throws(()=>verifyDockerStagingLifecyclePair(p.before,p.after,approved),
   /independently approved pin/);
 }
}));
test("tampering approval flags, state, timestamps, digest or extra fields refuses review",()=>mk(dir=>{
 const p=pair(dir),baseline=p.after;
 const changed=[
  {productionDeploymentAuthorized:true},
  {physicalIsolationIndependentlyProven:true},
  {signedPermitVerified:true},
  {originalPrivateRecoveryVerified:false},
  {observedState:{...baseline.observedState,paused:true}},
  {observedState:{...baseline.observedState,startedEpochSha256:"c".repeat(64)}},
  {observedNetworkSha256:"z"},
  {evidenceSha256:"b".repeat(64)},
  {inspectedAt:"2001-01-01T00:00:00.000Z"},
  {other:"injected"}
 ];
 for(const tweak of changed)
  assert.throws(()=>verifyDockerStagingLifecyclePair(
   p.before,{...baseline,...tweak},p.approved));
}));
test("reversed, identical, stale or >15-minute-separated reports cannot establish staging transition",()=>mk(dir=>{
 const p=pair(dir);
 assert.throws(()=>verifyDockerStagingLifecyclePair(p.after,p.before,p.approved));
 assert.throws(()=>verifyDockerStagingLifecyclePair(p.before,p.before,p.approved));
 const old=new Date(Date.now()-2*60*60000);
 const stale=pair(dir,"stop",old);
 assert.throws(()=>verifyDockerStagingLifecyclePair(
  stale.before,stale.after,stale.approved),/stale|incomplete/);
 const long=pair(dir);
 const late=evaluateDockerStagingLifecycleCapture(
  data(dir,"stop","after"),new Date(Date.now()+18*60000));
 assert.throws(()=>verifyDockerStagingLifecyclePair(
  long.before,late,long.approved),/stale|incomplete|reversed/);
}));
test("cross-container or daemon policy swaps are rejected even when stage flags match",()=>mk(dir=>{
 const p=pair(dir);
 const swaps=[
  {operatorTargetSha256:"a".repeat(64)},
  {approvedDaemonIdSha256:"b".repeat(64)},
  {approvedPolicySha256:"c".repeat(64)},
  {approvedConfigManifestSha256:"d".repeat(64)},
  {localHistorySha256:"e".repeat(64)}
 ];
 for(const item of swaps)assert.throws(()=>verifyDockerStagingLifecyclePair(
  p.before,{...p.after,...item},p.approved));
}));
test("a matching status without a changed start/finish epoch is not a real lifecycle observation",()=>mk(dir=>{
 const p=pair(dir);
 const bad={...p.after,observedState:{
  ...p.after.observedState,finishedEpochSha256:p.before.observedState.finishedEpochSha256
 }};
 assert.throws(()=>verifyDockerStagingLifecyclePair(p.before,bad,p.approved));
}));
test("offline reviewer CLI verifies canonical bounded files with independent owner-only pinned expectations",()=>mk(dir=>{
 const p=pair(dir),before=join(dir,"before.json"),after=join(dir,"after.json");
 const expected=join(dir,"approved.json");
 for(const [path,object] of [[before,p.before],[after,p.after],[expected,p.approved]])
  writeFileSync(path,JSON.stringify(object)+"\n",{mode:0o600});
 const bin=new URL("../scripts/docker-staging-lifecycle-review.mjs",import.meta.url).pathname;
 const run=()=>spawnSync(process.execPath,[bin,before,after,expected],{
  encoding:"utf8",timeout:9000,env:{...process.env,CI:"true"}
 });
 const r=run();
 assert.equal(r.status,0,r.stderr);
 assert.equal(JSON.parse(r.stdout).productionDeploymentAuthorized,false);
 chmodSync(expected,0o644);
 const bad=run();
 assert.notEqual(bad.status,0);
 assert.equal(bad.stdout,"");
 chmodSync(expected,0o600);
 const alias=join(dir,"approved-link.json");
 symlinkSync(expected,alias);
 const aliasRun=spawnSync(process.execPath,[bin,before,after,alias],{
  encoding:"utf8",timeout:9000
 });
 assert.notEqual(aliasRun.status,0);
 writeFileSync(after,JSON.stringify(p.after).replace(
  '"schema":"eternyx-docker-staging-lifecycle-capture-v1"',
  '"schema":"eternyx-docker-staging-lifecycle-capture-v1","schema":"eternyx-docker-staging-lifecycle-capture-v1"')+"\n");
 assert.notEqual(run().status,0);
}));
test("real operator host CLI adds capture mode WITHOUT new Docker mutation or signing shortcuts",()=>{
 const source=readFileSync(new URL("../scripts/docker-lab-host-preflight.mjs",import.meta.url),"utf8");
 const review=readFileSync(new URL("../scripts/docker-staging-lifecycle-review.mjs",import.meta.url),"utf8");
 assert.match(source,/args\[0\]==="--capture-lifecycle"/);
 assert.match(source,/const first=observe\(pins,containerId\)/);
 assert.match(source,/const second=observe\(pins,containerId\)/);
 const capture=source.indexOf("evaluateDockerStagingLifecycleCapture(");
 const first=source.indexOf("const first=observe(pins,containerId)");
 const second=source.indexOf("const second=observe(pins,containerId)");
 assert.ok(first>=0&&first<second&&second<capture);
 assert.match(source,/const report=evaluateSignedDockerHostReadOnly\(/);
 assert.match(source,/signDockerReadOnlyHostReport\(/);
 assert.match(source,/process\.env\.ETERNYX_REMOTE_LAB_ENABLED==="true"/);
 assert.match(source,/process\.getuid\(\)===0/);
 assert.doesNotMatch(review,/spawnSync\s*\(/);
 assert.doesNotMatch(review,/\bfetch\s*\(/);
 assert.doesNotMatch(review,/\bappendLabEvent\s*\(/);
 assert.doesNotMatch(review,/\breserveLabClaim\s*\(/);
 const bin=new URL("../scripts/docker-lab-host-preflight.mjs",import.meta.url).pathname;
 const result=spawnSync(process.execPath,[
  bin,"--capture-lifecycle","before",ID,"stop"
 ],{encoding:"utf8",timeout:9000,env:{...process.env,CI:"true",
  ETERNYX_REMOTE_LAB_ENABLED:"",DOCKER_REMOTE_LAB_ENABLED:""}});
 assert.notEqual(result.status,0);
 assert.equal(result.stdout,"");
 assert.match(result.stderr,/non-root, separately approved Linux operator outside CI/);
});
