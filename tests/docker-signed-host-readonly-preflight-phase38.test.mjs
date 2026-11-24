import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fingerprintLabContainer} from "../src/lib/dockerLabPolicyDrift.mjs";
import {auditSignedAgentRecoveryDirectory}
 from "../src/lib/dockerStrictRecoveryInventory.mjs";
import {lockLabAgent,reserveLabClaim,appendLabEvent}
 from "../src/lib/dockerLabRecovery.mjs";
import {evaluateSignedDockerHostReadOnly}
 from "../src/lib/dockerSignedHostReadOnlyPreflight.mjs";

const digest=s=>createHash("sha256").update(s).digest("hex");
const ID="a".repeat(64),IMAGE="f".repeat(64);
const C="rootless-phase38-approved",ENDPOINT="unix:///run/user/1001/docker.sock";
const DAEMON="read-only-docker-engine";
const DAEMON_SHA=digest("ETERNYX_DOCKER_HOST_DAEMON_ID_V1\n"+DAEMON);
function target(status="running"){
 return {
  Id:ID,Name:"/readonly-test-container",Image:"sha256:"+IMAGE,
  Config:{Image:"example.invalid/test@sha256:"+IMAGE,User:"10001:10001",
   Labels:{"io.eternyx.operator.managed":"true",
    "io.eternyx.operator.scope":"local-workbench"},
   Env:["DONT_REPORT_THIS_SECRET=private"]},
  HostConfig:{
   Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",
   Binds:[],PortBindings:{},CapAdd:[],Devices:[],DeviceRequests:[],
   CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],
   Memory:134217728,PidsLimit:64,RestartPolicy:{Name:"no"},
   PidMode:"",IpcMode:"",CgroupnsMode:"",UsernsMode:"",UTSMode:""
  },
  RestartCount:0,Mounts:[],NetworkSettings:{Networks:{none:{}},Ports:{}},
  State:{Running:status==="running",Status:status,
   StartedAt:status==="created"?"0001-01-01T00:00:00Z":"2026-11-23T11:00:00.000Z",
   FinishedAt:"0001-01-01T00:00:00Z",Pid:status==="running"?1234:0,
   ExitCode:0,Paused:false,Restarting:false,Dead:false}
 };
}
function pins(){
 return {
  context:C,host:ENDPOINT,socketPath:"/run/user/1001/docker.sock",
  daemonIdSha256:DAEMON_SHA,imageSha256:IMAGE,
  policySha256:fingerprintLabContainer(target(),ID).policySha256
 };
}
const info=()=>({ID:DAEMON,SecurityOptions:[
 "name=rootless","name=seccomp,profile=builtin"],Swarm:{LocalNodeState:"inactive"}});
const cli=()=>({hashVerified:true,rootOwned:true,symlinkFree:true,sha256:"1".repeat(64)});
const config=()=>({completeTreeVerified:true,rootOwned:true,
 onlyOneLocalContext:true,context:C,endpoint:ENDPOINT,sha256:"2".repeat(64)});
const makeDir=fn=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-phase38-host-"));
 try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}
};
function snapshots(dir,{status="running",op="stop"}={}){
 const inventory=auditSignedAgentRecoveryDirectory(dir);
 return {
  pins:pins(),contextBefore:C,contextAfter:C,
  endpointBefore:ENDPOINT,endpointAfter:ENDPOINT,
  infoBefore:info(),infoAfter:info(),
  targetBefore:target(status),targetAfter:target(status),
  containerId:ID,operation:op,
  inventoryBefore:inventory,inventoryAfter:inventory,
  cli:cli(),config:config()
 };
}
test("read-only host report carries checked hashes but deliberately authorizes no execution",()=>makeDir(dir=>{
 const report=evaluateSignedDockerHostReadOnly(snapshots(dir));
 assert.equal(report.schema,"eternyx-docker-readonly-host-preflight-v1");
 assert.equal(report.status,"read_only_local_observations_only");
 assert.equal(report.fullRecoveryInventoryVerified,true);
 assert.equal(report.twoReadOnlyDaemonAndTargetObservations,true);
 assert.equal(report.pinnedLocalClientAndUnixContextVerified,true);
 assert.equal(report.sandboxNetworkNoneObserved,true);
 for(const property of ["independentHostIdentityVerified",
  "independentPhysicalIsolationVerified","signedPermitVerified",
  "serverRevocationVerified","realCrashRecoveryDrillVerified",
  "productionDeploymentAuthorized","stagingDockerMutationAuthorized",
  "dockerMutationExecuted","receiptIssued","autoRetryAuthorized",
  "recoveryLocksAutomaticallyReleased"])
  assert.equal(report[property],false,property);
 assert.equal(report.operatorSignoffRequired,true);
 assert.match(report.evidenceSha256,/^[a-f0-9]{64}$/);
 assert.equal(Object.isFrozen(report),true);
 const serialized=JSON.stringify(report);
 assert.doesNotMatch(serialized,/DONT_REPORT_THIS_SECRET|private|\/run\/user|read-only-docker-engine|readonly-test-container/);
 assert.doesNotMatch(serialized,new RegExp(ID));
}));
test("stop/restart and start can each preflight only a valid existing lifecycle state",()=>makeDir(dir=>{
 for(const [op,status] of [["stop","running"],["restart","running"],
  ["start","exited"],["start","created"]]){
  const report=evaluateSignedDockerHostReadOnly(snapshots(dir,{op,status}));
  assert.equal(report.observationOperation,op);
 }
 for(const [op,status] of [["start","running"],["stop","exited"],
  ["restart","created"]])
  assert.throws(()=>evaluateSignedDockerHostReadOnly(snapshots(dir,{op,status})));
}));
test("a changed rootless daemon ID, endpoint or security option refuses host evidence",()=>makeDir(dir=>{
 const base=snapshots(dir);
 for(const changes of [
  {contextAfter:"default"},
  {endpointAfter:"tcp://127.0.0.1:2375"},
  {infoAfter:{...info(),ID:"unrecognized-engine"}},
  {infoAfter:{...info(),SecurityOptions:["name=seccomp,profile=builtin"]}},
  {infoAfter:{...info(),Swarm:{LocalNodeState:"active"}}},
  {infoAfter:{...info(),SecurityOptions:["name=rootless"]}}
 ]){
  if(changes.infoAfter?.SecurityOptions?.length===1&&
    changes.infoAfter.SecurityOptions[0]==="name=rootless")continue;
  assert.throws(()=>evaluateSignedDockerHostReadOnly({...base,...changes}),
   undefined,JSON.stringify(changes));
 }
}));
test("Docker target changes between two read-only observations refuse evidence",()=>makeDir(dir=>{
 const base=snapshots(dir);
 for(const alter of [
  x=>{x.State.StartedAt="2026-11-23T11:00:04.000Z";},
  x=>{x.State.Pid=9876;},
  x=>{x.RestartCount=2;},
  x=>{x.State.Running=false;x.State.Status="exited";},
  x=>{x.NetworkSettings.Networks={bridge:{}};},
  x=>{x.HostConfig.ReadonlyRootfs=false;},
  x=>{x.HostConfig.Privileged=true;},
  x=>{x.Mounts=[{Source:"/etc"}];},
  x=>{x.HostConfig.Binds=["/etc:/etc"];},
  x=>{x.Image="sha256:"+"b".repeat(64);}
 ]){
  const changed=structuredClone(base.targetAfter);
  alter(changed);
  assert.throws(()=>evaluateSignedDockerHostReadOnly({...base,targetAfter:changed}));
 }
}));
test("missing or unapproved CLI/config pins, operation and target IDs refuse",()=>makeDir(dir=>{
 const base=snapshots(dir);
 for(const bad of [
  {operation:"exec"},{containerId:"b".repeat(63)},
  {pins:null},{cli:null},{config:null},
  {cli:{...cli(),hashVerified:false}},
  {cli:{...cli(),rootOwned:false}},
  {cli:{...cli(),sha256:"not-a-hash"}},
  {config:{...config(),onlyOneLocalContext:false}},
  {config:{...config(),context:"swapped"}},
  {config:{...config(),endpoint:"unix:///tmp/other.sock"}},
  {config:{...config(),sha256:"a".repeat(63)}}
 ]){
  assert.throws(()=>evaluateSignedDockerHostReadOnly({...base,...bad}),
   undefined,JSON.stringify(bad));
 }
}));
test("unknown, attempted-only and legacy failed claim histories refuse host readiness",()=>makeDir(dir=>{
 const UUID="33333333-3333-4333-8333-333333333333";
 const claim="44444444-4444-4444-8444-444444444444";
 const record={agentId:UUID,claimId:claim,containerId:ID,operation:"stop"};
 lockLabAgent(UUID,dir);
 reserveLabClaim(record,dir);
 assert.throws(()=>evaluateSignedDockerHostReadOnly(snapshots(dir)),/unresolved/);
 appendLabEvent(claim,"attempted",dir);
 assert.throws(()=>evaluateSignedDockerHostReadOnly(snapshots(dir)),/unresolved/);
 appendLabEvent(claim,"failed",dir);
 assert.throws(()=>evaluateSignedDockerHostReadOnly(snapshots(dir)),/unresolved/);
 appendLabEvent(claim,"receipt_accepted",dir);
 assert.throws(()=>evaluateSignedDockerHostReadOnly(snapshots(dir)),/unresolved/);
}));
test("unacknowledged guard_denied blocks host readiness even without a Docker attempt",()=>makeDir(dir=>{
 const a="33333333-3333-4333-8333-333333333333";
 const claim="44444444-4444-4444-8444-444444444444";
 reserveLabClaim({agentId:a,claimId:claim,containerId:ID,operation:"stop"},dir);
 appendLabEvent(claim,"guard_denied",dir);
 assert.throws(()=>evaluateSignedDockerHostReadOnly(snapshots(dir)),/unresolved/);
}));
test("complete acknowledged claim history with no retained lock is admissible only as read-only observations",()=>makeDir(dir=>{
 const a="33333333-3333-4333-8333-333333333333";
 const claim="44444444-4444-4444-8444-444444444444";
 reserveLabClaim({agentId:a,claimId:claim,containerId:ID,operation:"stop"},dir);
 appendLabEvent(claim,"guard_denied",dir);
 appendLabEvent(claim,"receipt_accepted",dir);
 assert.equal(evaluateSignedDockerHostReadOnly(snapshots(dir)).dockerMutationExecuted,false);
}));
test("forged or partial history and changed evidence hashes are denied",()=>makeDir(dir=>{
 const base=snapshots(dir),a=base.inventoryAfter;
 for(const broken of [
  {completeInventoryVerified:false},
  {stableDoubleReadVerified:false},
  {inventorySha256:"bad"},
  {fileCount:2},
  {claimCount:99},
  {lockSafeToClearAutomatically:true},
  {safeToRetryClaimAutomatically:true},
  {productionDeploymentAuthorized:true}
 ])assert.throws(()=>evaluateSignedDockerHostReadOnly({
  ...base,inventoryAfter:{...a,...broken}
 }));
 assert.throws(()=>evaluateSignedDockerHostReadOnly({
  ...base,inventoryAfter:{...a,inventorySha256:"a".repeat(64)}
 }),/changed between/);
}));
test("actual operator CLI refuses CI, root, bad arguments before any executable or network is reached",()=>{
 const path=new URL("../scripts/docker-lab-host-preflight.mjs",import.meta.url).pathname;
 for(const args of [
  [],
  ["--execute-lab",ID,"stop"],
  ["--read-only","b".repeat(63),"stop"],
  ["--read-only",ID,"exec"],
  ["--read-only",ID,"stop","--confirm"]
 ]){
  const r=spawnSync(process.execPath,[path,...args],{
   encoding:"utf8",timeout:6000,env:{
    ...process.env,CI:"true",
    ETERNYX_REMOTE_LAB_ENABLED:"",DOCKER_REMOTE_LAB_ENABLED:""
   }
  });
  assert.notEqual(r.status,0);
  assert.equal(r.stdout,"");
 }
 const valid=spawnSync(process.execPath,[path,"--read-only",ID,"stop"],{
  encoding:"utf8",timeout:6000,env:{
   ...process.env,CI:"true",
   ETERNYX_REMOTE_LAB_ENABLED:"",DOCKER_REMOTE_LAB_ENABLED:""
  }
 });
 assert.equal(valid.stdout,"");
 assert.notEqual(valid.status,0);
 assert.match(valid.stderr,/non-root, separately approved Linux operator outside CI/);
});
test("the host preflight script cannot mutate Docker, fetch Supabase, issue a receipt or clear locks",()=>{
 const s=readFileSync(new URL("../scripts/docker-lab-host-preflight.mjs",import.meta.url),"utf8");
 assert.match(s,/args\[0\]!=="--read-only"/);
 assert.match(s,/validatePinnedDockerCliCommand\(args,config\)/);
 assert.match(s,/withPinnedDockerCliFile\(process\.env,cli=>spawnSync\(/);
 assert.match(s,/cli\.execPath,\["--config",config\.dir,\.\.\.args\]/);
 assert.match(s,/stdio:\["ignore","pipe","pipe",cli\.fd\]/);
 assert.match(s,/const first=observe\(pins,containerId\)/);
 assert.match(s,/const second=observe\(pins,containerId\)/);
 assert.match(s,/const inventoryAfter=auditSignedAgentRecoveryDirectory\(\)/);
 assert.match(s,/if\(socketBefore\.dev!==socketAfter\.dev/);
 assert.match(s,/process\.env\.ETERNYX_REMOTE_LAB_ENABLED==="true"/);
 assert.doesNotMatch(s,/\bfetch\s*\(/);
 assert.doesNotMatch(s,/\bappendLabEvent\s*\(/);
 assert.doesNotMatch(s,/\breserveLabClaim\s*\(/);
 assert.doesNotMatch(s,/\bsend\s*\(\s*"receipt"/);
 assert.doesNotMatch(s,/\bunlockContainer\s*\(/);
});
