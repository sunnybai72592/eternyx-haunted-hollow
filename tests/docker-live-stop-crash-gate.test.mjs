import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {fingerprintLabContainer} from "../src/lib/dockerLabPolicyDrift.mjs";
import {validateLiveStopContainer,validateLiveStopHostEvidence,
 validateLiveStopNoDrift} from "../src/lib/dockerLiveStopCrashGate.mjs";

const ID="a".repeat(64),IMAGE="b".repeat(64),DAEMON="c".repeat(64);
const SHA="d".repeat(40),SOCKET="e".repeat(64),ROUTE="f".repeat(64);
function target(){
 return {
  Id:ID,Image:"sha256:"+IMAGE,
  Config:{
   Image:"example.invalid/approved@sha256:"+IMAGE,
   User:"10001:10001",
   Labels:{"io.eternyx.operator.managed":"true",
           "io.eternyx.operator.scope":"local-workbench"}
  },
  HostConfig:{
   Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",
   Binds:[],PortBindings:{},CapAdd:[],CapDrop:["ALL"],Devices:[],DeviceRequests:[],
   SecurityOpt:["no-new-privileges"],PidsLimit:64,Memory:134217728,
   RestartPolicy:{Name:"no"},PidMode:"",IpcMode:"",CgroupnsMode:"",
   UsernsMode:"",UTSMode:""
  },
  Mounts:[],NetworkSettings:{Networks:{none:{}},Ports:{}},
  State:{Running:true,Status:"running",StartedAt:"2026-11-23T19:00:00.000Z"}
 };
}
const POLICY=fingerprintLabContainer(target(),ID).policySha256;
const pins={
 approvedSourceCommitSha:SHA,containerId:ID,daemonIdentitySha256:DAEMON,
 imageSha256:IMAGE,managedContainerPolicySha256:POLICY,
 socketEndpointSha256:SOCKET,routeSnapshotSha256:ROUTE
};
function evidence(){
 return {
  schema:"eternyx-docker-real-host-network-evidence-v1",
  scope:"operator_initiated_read_only_real_host",
  capturedAt:new Date().toISOString(),
  approvedSourceCommitSha:SHA,containerId:ID,daemonIdentitySha256:DAEMON,
  imageSha256:IMAGE,managedContainerPolicySha256:POLICY,
  socketEndpointSha256:SOCKET,routeSnapshotSha256:ROUTE,
  rootlessEngineObserved:true,stableRouteSnapshots:true,
  noDefaultRoutesObserved:true,kernelForwardingDisabledObserved:true,
  containerPolicyStableObserved:true,realDockerEngineReadOnlyContacted:true,
  journalClaimsChecked:0,independentOperatorSiteReviewRequired:true,
  externalNetworkIsolationProved:false,independentHostAttestation:false,
  hostNetworkReachabilityActivelyTested:false,controlledCrashRecoveryTestPerformed:false,
  remoteSignedDispatchTested:false,labContainerMutationPerformed:false,
  stagingDockerExecutionAuthorized:false,productionDeploymentAuthorized:false
 };
}
test("strict live-host gate accepts only fresh real-host read-only observation with all false authorization flags",()=>{
 assert.equal(validateLiveStopHostEvidence(evidence(),pins).containerId,ID);
 assert.equal(validateLiveStopNoDrift(evidence(),evidence()),true);
});
test("stale, wrong image/daemon/route, unacknowledged scope, and unauthorized flags are rejected",()=>{
 for(const changed of [
  {capturedAt:"2000-01-01T00:00:00.000Z"},
  {capturedAt:new Date(Date.now()+1000000).toISOString()},
  {rootlessEngineObserved:false},
  {containerId:"a".repeat(63)+"b"},
  {daemonIdentitySha256:"0".repeat(64)},
  {routeSnapshotSha256:"0".repeat(64)},
  {managedContainerPolicySha256:"0".repeat(64)},
  {independentOperatorSiteReviewRequired:false},
  {externalNetworkIsolationProved:true},
  {productionDeploymentAuthorized:true},
  {stagingDockerExecutionAuthorized:true},
  {labContainerMutationPerformed:true},
  {journalClaimsChecked:-1},
  {controlledCrashRecoveryTestPerformed:true}
 ])assert.throws(()=>validateLiveStopHostEvidence({...evidence(),...changed},pins));
});
test("actual disposable target must have managed labels, rootless security restrictions, pinned full ID, no network or mounts",()=>{
 assert.equal(validateLiveStopContainer(target(),pins,"running").status,"running");
 for(const change of [
  x=>x.Image="sha256:"+"0".repeat(64),
  x=>x.HostConfig.NetworkMode="bridge",
  x=>x.HostConfig.Privileged=true,
  x=>x.HostConfig.ReadonlyRootfs=false,
  x=>x.HostConfig.Binds=["/etc:/tmp"],
  x=>x.HostConfig.PortBindings={"80/tcp":[{HostPort:"80"}]},
  x=>x.HostConfig.CapDrop=[],
  x=>x.HostConfig.PidsLimit=0,
  x=>x.Config.User="root",
  x=>x.Config.Labels["io.eternyx.operator.scope"]="production",
  x=>x.Mounts=[{Type:"bind"}],
  x=>x.NetworkSettings.Networks={bridge:{}},
  x=>x.NetworkSettings.Ports={"80/tcp":[{HostPort:"80"}]},
  x=>{x.State.Running=false;x.State.Status="exited";},
 ]){
  const copy=structuredClone(target());change(copy);
  assert.throws(()=>validateLiveStopContainer(copy,pins,"running"));
 }
});
test("completed stop requires independently observed exited state and pinned policy",()=>{
 const after=target();after.State.Running=false;after.State.Status="exited";
 assert.equal(validateLiveStopContainer(after,pins,"stopped").status,"exited");
 assert.throws(()=>validateLiveStopContainer(target(),pins,"stopped"));
 after.HostConfig.Memory=500000000;
 assert.throws(()=>validateLiveStopContainer(after,pins,"stopped"));
});
test("host policy or journal inventory drift after crash must not produce acceptance",()=>{
 for(const change of [
  {routeSnapshotSha256:"0".repeat(64)},
  {daemonIdentitySha256:"0".repeat(64)},
  {containerId:"0".repeat(64)},
  {journalClaimsChecked:1},
  {managedContainerPolicySha256:"0".repeat(64)},
  {socketEndpointSha256:"0".repeat(64)}
 ])assert.throws(()=>validateLiveStopNoDrift(evidence(),{...evidence(),...change}));
});
test("operator CLI refuses unauthorized call before contacting Docker or touching journals",()=>{
 const script=fileURLToPath(new URL("../scripts/docker-host-live-stop-crash-drill.mjs",import.meta.url));
 const r=spawnSync(process.execPath,[script,"--one-disposable-stop"],{
  encoding:"utf8",timeout:15000,
  env:{...process.env,ETERNYX_DOCKER_LIVE_STOP_APPROVAL:"",
       ETERNYX_DOCKER_LIVE_STOP_PRIVATE_DIR:"/no/unsafe/path"}
 });
 assert.equal(r.status,1);
 assert.equal(r.stdout,"");
 assert.match(r.stderr,/One-shot disposable Docker stop\/crash drill refused/);
});
test("mutating child also rejects direct execution without isolated-host permit IPC",()=>{
 const worker=fileURLToPath(new URL("../scripts/docker-live-stop-crash-worker.mjs",import.meta.url));
 const r=spawnSync(process.execPath,[worker,"/tmp",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",ID,"0".repeat(64)],{
  encoding:"utf8",timeout:15000
 });
 assert.notEqual(r.status,0);
});
test("worker contains one explicit Docker stop, no start/restart or remote calls",()=>{
 const worker=fileURLToPath(new URL("../scripts/docker-live-stop-crash-worker.mjs",import.meta.url));
 const parent=fileURLToPath(new URL("../scripts/docker-host-live-stop-crash-drill.mjs",import.meta.url));
 const w=readFileSync(worker,"utf8"),p=readFileSync(parent,"utf8");
 assert.equal((w.match(/"container","stop"/g)||[]).length,1);
 assert.doesNotMatch(w,/"container","start"|"container","restart"|fetch\(/);
 assert.doesNotMatch(p,/"container","stop"|"container","start"|fetch\(/);
 assert.match(p,/approved-stop-permit-/);
 assert.match(p,/record\.outcome!==null/);
 assert.match(p,/automaticRetryAuthorized:false/);
 assert.match(p,/actualSignedAgentInterrupted:false/);
});
