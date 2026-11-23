import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {validateDockerCrashTriageJournal,inspectDockerHostReadOnly}
 from "../src/lib/dockerHostReadOnlyAcceptance.mjs";
import {validateDockerHostRouteEvidence} from "../src/lib/dockerHostCrashRoute.mjs";
const ID="a".repeat(64),IMAGE="b".repeat(64),DAEMON="operator-crash-test-only";
const AGENT="33333333-3333-4333-8333-333333333333";
const CLAIM="44444444-4444-4444-8444-444444444444";
const endpoint="unix:///run/user/1001/docker.sock";
const sha=s=>createHash("sha256").update(s).digest("hex");
const pins={
 containerId:ID,expectedContext:"rootless-lab",expectedEndpoint:endpoint,
 expectedDaemonIdSha256:sha("ETERNYX_DOCKER_HOST_DAEMON_ID_V1\n"+DAEMON),
 expectedImageSha256:IMAGE
};
function claim(events=["reserved","attempted"]){
 return {
  agentId:AGENT,claimId:CLAIM,containerId:ID,operation:"stop",
  events,attempted:events.includes("attempted"),
  outcome:events.includes("completed")?"completed":
   events.includes("failed")?"failed":
   events.includes("guard_denied")?"guard_denied":null,
  acknowledged:false,attentionRequired:true
 };
}
const summary=c=>({
 agentId:c.agentId,claimId:c.claimId,operation:c.operation,
 outcome:c.outcome,attempted:c.attempted,
 acknowledged:c.acknowledged,attentionRequired:c.attentionRequired
});
function target(){
 return {
  Id:ID,Image:"sha256:"+IMAGE,Name:"/disposable-offline-test",
  Config:{Image:"example.invalid@sha256:"+IMAGE,User:"10001:10001",
   Labels:{"io.eternyx.operator.managed":"true",
     "io.eternyx.operator.scope":"local-workbench"}},
  HostConfig:{Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",
   Binds:[],PortBindings:{},CapAdd:[],CapDrop:["ALL"],
   Devices:[],DeviceRequests:[],SecurityOpt:["no-new-privileges:true"],
   Memory:134217728,PidsLimit:64,RestartPolicy:{Name:"no"},
   PidMode:"",IpcMode:"",CgroupnsMode:"",UsernsMode:"",UTSMode:""},
  Mounts:[],NetworkSettings:{Networks:{none:{}},Ports:{}},
  State:{Running:false,Status:"exited",StartedAt:"2026-11-23T16:00:00.000Z"}
 };
}
function driver(c=claim(),inventory=[summary(c)],current=target()){
 const calls=[];
 const execDocker=async args=>{
  calls.push(args);
  const a=args.join(" ");
  if(a==="context show")return "rootless-lab\n";
  if(a.startsWith("context inspect"))return JSON.stringify(endpoint);
  if(a.includes(" info "))return JSON.stringify({
   ID:DAEMON,SecurityOptions:["name=rootless"],Swarm:{LocalNodeState:"inactive"}
  });
  if(a.includes(" container inspect "))return JSON.stringify(current);
  throw Error("Unexpected Docker command.");
 };
 return {calls,options:{
  env:{ETERNYX_REMOTE_LAB_ENABLED:"false",DOCKER_REMOTE_LAB_ENABLED:"false"},
  execDocker,socketStat:()=>({
   isSocket:()=>true,isSymbolicLink:()=>false,uid:1001,mode:0o140600
  }),journalEntries:()=>inventory,
  uid:1001,observedAt:()=>"2026-11-23T16:00:00.000Z",
  recoveryTriage:c
 }};
}
test("exact one unresolved reserved journal can only enter read-only triage",async()=>{
 const d=driver(claim(["reserved"]));
 const report=await inspectDockerHostReadOnly(pins,d.options);
 assert.equal(d.calls.length,5);
 assert.equal(report.claimJournalStage,"reserved_only");
 assert.equal(report.observedContainerStatus,"exited");
 assert.equal(report.observedContainerRunning,false);
 assert.equal(report.unresolvedClaimsObserved,true);
 assert.equal(report.localMutationReexecuted,false);
 assert.equal(report.automaticRetryAuthorized,false);
 assert.equal(report.receiptOnlyReplayAuthorized,false);
 assert.equal(report.controlledCrashRecoveryTestPerformed,false);
 assert.equal(report.independentHostAttestation,false);
 assert.equal(report.productionDeploymentAuthorized,false);
 assert.equal(report.schema,"eternyx-docker-host-crash-triage-v1");
});
test("fsynced attempted claim is uncertain even when target now appears exited",async()=>{
 const d=driver();
 const report=await inspectDockerHostReadOnly(pins,d.options);
 assert.equal(report.claimJournalStage,"attempted_outcome_unknown");
 assert.equal(report.attemptedRecorded,true);
 assert.equal(report.recordedOutcome,null);
 assert.equal(report.mutationOutcomeIndependentlyVerified,false);
 assert.equal(d.calls.filter(a=>a.includes("container")).length,2);
 assert.ok(d.calls.every(a=>!a.includes("start")&&!a.includes("stop")&&!a.includes("restart")&&!a.includes("exec")));
});
test("terminal outcome without receipt does not authorize receipt replay",async()=>{
 for(const evt of ["completed","failed","guard_denied"]){
  const seq=evt==="guard_denied"?["reserved",evt]:["reserved","attempted",evt];
  const d=driver(claim(seq));
  const report=await inspectDockerHostReadOnly(pins,d.options);
  assert.equal(report.claimJournalStage,"terminal_unacknowledged");
  assert.equal(report.recordedOutcome,evt);
  assert.equal(report.receiptOnlyReplayAuthorized,false);
 }
});
test("all mismatched, corrupt, duplicate or extra unresolved claims fail before Docker contact",async()=>{
 const baseline=claim();
 const cases=[
  {claim:{...baseline,containerId:"c".repeat(64)},inventory:[summary(baseline)]},
  {claim:{...baseline,events:["reserved","completed"]},inventory:[summary(baseline)]},
  {claim:{...baseline,acknowledged:true},inventory:[summary(baseline)]},
  {claim:{...baseline,attempted:false},inventory:[summary(baseline)]},
  {claim:baseline,inventory:[]},
  {claim:baseline,inventory:[summary(baseline),summary(baseline)]},
  {claim:baseline,inventory:[summary(baseline),{...summary(baseline),claimId:"55555555-5555-4555-8555-555555555555"}]},
  {claim:baseline,inventory:[summary(baseline),{claimId:"x",error:"invalid_journal"}]},
  {claim:baseline,inventory:[{...summary(baseline),outcome:"completed"}]}
 ];
 for(const item of cases){
  const d=driver(item.claim,item.inventory);
  await assert.rejects(()=>inspectDockerHostReadOnly(pins,d.options));
  assert.equal(d.calls.length,0);
 }
});
test("normal acceptance still blocks unresolved claim even when triage exists",async()=>{
 const d=driver();delete d.options.recoveryTriage;
 await assert.rejects(()=>inspectDockerHostReadOnly(pins,d.options));
 assert.equal(d.calls.length,0);
});
test("wrong daemon, image, active network or drifting state still fail during triage",async()=>{
 const a=target();a.NetworkSettings.Networks={bridge:{}};
 const b=target();b.Image="sha256:"+"f".repeat(64);
 for(const changed of [a,b]){
  const d=driver(claim(),[summary(claim())],changed);
  await assert.rejects(()=>inspectDockerHostReadOnly(pins,d.options));
  assert.equal(d.calls.length,4);
 }
});
test("recovery host routes require no default gateway and disabled kernel forwarding",()=>{
 const v4='[{"dst":"10.0.0.0/8","dev":"isolated0"}]',v6='[{"dst":"fe80::/64","dev":"isolated0"}]';
 assert.match(validateDockerHostRouteEvidence({v4,v6},"0\n","0").routeSnapshotSha256,/^[a-f0-9]{64}$/);
 assert.throws(()=>validateDockerHostRouteEvidence({v4,v6},"1","0"));
 assert.throws(()=>validateDockerHostRouteEvidence({v4:'[{"dst":"default"}]',v6},"0","0"));
});
test("host CLI rejects unauthorized run without touching Docker",()=>{
 const script=fileURLToPath(new URL("../scripts/docker-host-crash-triage.mjs",import.meta.url));
 const r=spawnSync(process.execPath,[script,"--triage",CLAIM],{
  env:{...process.env,ETERNYX_DOCKER_HOST_CRASH_TRIAGE_APPROVAL:""},
  encoding:"utf8",timeout:10000
 });
 assert.equal(r.status,1);assert.equal(r.stdout,"");
 assert.match(r.stderr,/Read-only crash triage refused/);
});
