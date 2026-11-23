import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {buildDockerHostNetworkEvidence,validateHostRouteEvidence} from "../src/lib/dockerHostNetworkEvidence.mjs";
const H="a".repeat(64),C="b".repeat(40),TIME="2026-11-23T16:00:00.000Z";
const R4=JSON.stringify([{dst:"10.52.0.0/16",dev:"isolated0",protocol:"kernel"}]);
const R6=JSON.stringify([{dst:"fe80::/64",dev:"isolated0",protocol:"kernel"}]);
const observation=()=>({
 schema:"eternyx-docker-host-readonly-observation-v1",
 scope:"operator_initiated_local_unix_socket_read_only",
 observedAt:TIME,daemonIdentitySha256:H,
 socketEndpointSha256:H,imageSha256:H,containerId:H,
 managedContainerPolicySha256:H,journalClaimsChecked:0,
 realDockerEngineReadOnlyContacted:true,daemonRootlessObserved:true,
 swarmInactiveObserved:true,managedTargetChecksPassed:true,
 networkNoneObserved:true,pinnedImageMatchesObserved:true,
 stableTwoInspections:true,unresolvedClaimsObserved:false,
 remoteLabExecutionEnabled:false,labContainerMutationPerformed:false,
 actualRemoteSignedDispatchTested:false,independentHostAttestation:false,
 externalNetworkIsolationProved:false,stagingDockerExecutionAuthorized:false,
 productionDeploymentAuthorized:false
});
const params=()=>({
 observation:observation(),
 firstRoutes:{v4:R4,v6:R6},secondRoutes:{v4:R4,v6:R6},
 forwardingV4:"0",forwardingV6:"0",commitSha:C,expectedCommitSha:C,
 gitDirty:false,now:TIME
});
test("accept only two stable rootless-host route observations with no default gateways",()=>{
 const report=buildDockerHostNetworkEvidence(params());
 assert.equal(report.realDockerEngineReadOnlyContacted,true);
 assert.equal(report.noDefaultRoutesObserved,true);
 assert.equal(report.kernelForwardingDisabledObserved,true);
 assert.equal(report.stableRouteSnapshots,true);
 assert.match(report.routeSnapshotSha256,/^[a-f0-9]{64}$/);
 assert.equal(report.externalNetworkIsolationProved,false);
 assert.equal(report.independentHostAttestation,false);
 assert.equal(report.stagingDockerExecutionAuthorized,false);
 assert.equal(report.productionDeploymentAuthorized,false);
 assert.equal(report.controlledCrashRecoveryTestPerformed,false);
 assert.equal(report.labContainerMutationPerformed,false);
});
test("default IPv4 and IPv6 gateways fail closed, including noncanonical defaults",()=>{
 for(const [a,b] of [
  ['[{"dst":"default","gateway":"192.0.2.1"}]',R6],
  ['[{"dst":"0.0.0.0/0"}]',R6],
  [R4,'[{"dst":"::/0"}]'],
  [R4,'[{"dst":"default","dev":"eth1"}]']
 ])assert.throws(()=>validateHostRouteEvidence(a,b),/Default gateway/);
});
test("incomplete, huge, or malformed Linux routing snapshots do not qualify",()=>{
 for(const sample of ["", "invalid", "{}", "[null]", '[{"dst":123}]',
  JSON.stringify(Array(257).fill({dst:"10.0.0.0/8"})),
  " ".repeat(65537)])
  assert.throws(()=>validateHostRouteEvidence(sample,R6));
});
test("time, Git source, and local forwarding must be exact and pinned",()=>{
 for(const changed of [
  {forwardingV4:"1"}, {forwardingV6:"1"},
  {gitDirty:true}, {commitSha:"c".repeat(40)},
  {expectedCommitSha:"unreviewed"},
  {now:"2026-11-23T16:02:01.000Z"}
 ])assert.throws(()=>buildDockerHostNetworkEvidence({...params(),...changed}));
});
test("network route drift is rejected even without an external route",()=>{
 const p=params();p.secondRoutes.v4='[{"dst":"10.55.0.0/16","dev":"isolated0"}]';
 assert.throws(()=>buildDockerHostNetworkEvidence(p),/changed/);
});
test("Docker inspection cannot be turned into physical attestation or dispatch approval",()=>{
 for(const [key,value] of [
  ["realDockerEngineReadOnlyContacted",false],
  ["daemonRootlessObserved",false],["networkNoneObserved",false],
  ["stableTwoInspections",false],["unresolvedClaimsObserved",true],
  ["remoteLabExecutionEnabled",true],["labContainerMutationPerformed",true],
  ["independentHostAttestation",true],["externalNetworkIsolationProved",true],
  ["stagingDockerExecutionAuthorized",true],["productionDeploymentAuthorized",true],
  ["actualRemoteSignedDispatchTested",true],["managedContainerPolicySha256","invalid"]
 ]){
  const p=params();p.observation[key]=value;
  assert.throws(()=>buildDockerHostNetworkEvidence(p),key);
 }
});
test("operator CLI refuses missing real-host approval without Docker access",()=>{
 const script=fileURLToPath(new URL("../scripts/docker-host-network-evidence.mjs",import.meta.url));
 const env={...process.env,
  ETERNYX_DOCKER_HOST_NETWORK_APPROVAL:"",
  ETERNYX_DOCKER_HOST_READONLY_APPROVAL:"",
  ETERNYX_DOCKER_APPROVED_COMMIT_SHA:C
 };
 const result=spawnSync(process.execPath,[script,"--inspect"],{
  env,encoding:"utf8",timeout:10000
 });
 assert.equal(result.status,1);
 assert.equal(result.stdout,"");
 assert.match(result.stderr,/Real isolated Docker host network evidence refused/);
});
