import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {fingerprintLabContainer} from "../src/lib/dockerLabPolicyDrift.mjs";
import {assertSignedAgentPreMutationUnchanged,validateSignedAgentLifecycleEvidence}
 from "../src/lib/dockerSignedAgentLastMomentGate.mjs";

const ID="a".repeat(64),IMAGE="f".repeat(64);
const now="2026-11-23T11:00:00.000Z",later="2026-11-23T11:00:04.000Z";
function inspect(status="running"){
 return {
  Id:ID,Image:"sha256:"+IMAGE,Name:"/disposable-operator-container",
  Config:{Image:"example.invalid/isolated@sha256:"+IMAGE,User:"10001:10001",
   Labels:{"io.eternyx.operator.managed":"true",
    "io.eternyx.operator.scope":"local-workbench"}},
  HostConfig:{
   Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",
   Binds:[],PortBindings:{},CapAdd:[],Devices:[],DeviceRequests:[],
   CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],
   Memory:134217728,PidsLimit:64,RestartPolicy:{Name:"no"},
   PidMode:"",IpcMode:"",CgroupnsMode:"",UsernsMode:"",UTSMode:""
  },
  RestartCount:0,Mounts:[],NetworkSettings:{Networks:{none:{}},Ports:{}},
  State:{Running:status==="running",Status:status,
   StartedAt:status==="created"?"0001-01-01T00:00:00Z":now,
   FinishedAt:"0001-01-01T00:00:00Z",
   Pid:status==="running"?1234:0,ExitCode:0,Paused:false,
   Restarting:false,Dead:false}
 };
}
const pins=()=>{
 const baseline=inspect();
 return {imageSha256:IMAGE,policySha256:fingerprintLabContainer(baseline,ID).policySha256};
};
test("one stable last-moment inspect is accepted for every valid initial operation",()=>{
 const p=pins();
 for(const [op,state] of [["stop","running"],["restart","running"],["start","exited"],["start","created"]]){
  const one=inspect(state),two=structuredClone(one);
  const result=assertSignedAgentPreMutationUnchanged(one,two,ID,op,p);
  assert.equal(result.sameContainerAndPolicy,true);
  assert.equal(result.sameLifecycle,true);
  assert.equal(result.sameNetworkIsolation,true);
  assert.equal(result.mutatingCommandExecuted,false);
 }
});
test("last-moment refusal detects independently restarted target despite same ID/image/policy and running state",()=>{
 const p=pins(),a=inspect("running"),b=structuredClone(a);
 b.State.StartedAt=later;
 assert.throws(()=>assertSignedAgentPreMutationUnchanged(a,b,ID,"stop",p),/changed/);
});
test("last-moment refusal detects state changes hidden behind identical running status",()=>{
 const p=pins(),a=inspect("running");
 for(const change of [
  x=>{x.State.Pid=4321;},
  x=>{x.State.FinishedAt=later;},
  x=>{x.State.ExitCode=11;},
  x=>{x.RestartCount=2;},
  x=>{x.State.Dead=true;},
  x=>{x.State.Paused=true;},
  x=>{x.State.Restarting=true;}
 ]){
  const b=structuredClone(a);change(b);
  assert.throws(()=>assertSignedAgentPreMutationUnchanged(a,b,ID,"restart",p));
 }
});
test("last-moment refusal detects changed network-none metadata, missing state or missing network evidence",()=>{
 const p=pins(),a=inspect("running");
 for(const change of [
  x=>{x.NetworkSettings.Networks={bridge:{}};},
  x=>{x.NetworkSettings.Ports={"8080/tcp":[{HostPort:"8080"}]};},
  x=>{x.NetworkSettings.Networks={};},
  x=>{delete x.NetworkSettings.Networks;},
  x=>{delete x.NetworkSettings.Ports;},
  x=>{delete x.State.FinishedAt;},
  x=>{delete x.State.StartedAt;},
  x=>{x.State.Running=false;x.State.Status="exited";}
 ]){
  const b=structuredClone(a);change(b);
  assert.throws(()=>assertSignedAgentPreMutationUnchanged(a,b,ID,"stop",p));
 }
});
test("post-mutation lifecycle verification needs new start epoch for start and restart",()=>{
 const before=inspect("exited"),after=inspect("running");
 after.State.StartedAt=later;
 assert.equal(validateSignedAgentLifecycleEvidence(before,after,"start").agentObservedLifecycleTransition,true);
 assert.equal(validateSignedAgentLifecycleEvidence(before,after,"start").independentExecutionCausalityProven,false);
 assert.throws(()=>validateSignedAgentLifecycleEvidence(before,inspect("running"),"start"),/start epoch/);
 const running=inspect("running"),restarted=structuredClone(running);
 restarted.State.StartedAt=later;
 assert.equal(validateSignedAgentLifecycleEvidence(running,restarted,"restart").agentObservedLifecycleTransition,true);
 assert.throws(()=>validateSignedAgentLifecycleEvidence(running,inspect("running"),"restart"),/restart epoch/);
});
test("post-mutation stop demands new FinishedAt, not only a reportedly exited container",()=>{
 const before=inspect("running"),after=inspect("exited");
 after.State.FinishedAt=later;
 assert.equal(validateSignedAgentLifecycleEvidence(before,after,"stop").agentObservedLifecycleTransition,true);
 assert.throws(()=>validateSignedAgentLifecycleEvidence(before,inspect("exited"),"stop"),/stop completion/);
 assert.throws(()=>validateSignedAgentLifecycleEvidence(before,inspect("running"),"stop"),/stop completion/);
});
test("invalid operation, absent timestamps and incomplete snapshots always fail closed",()=>{
 for(const op of ["exec","pause",""]){
  assert.throws(()=>validateSignedAgentLifecycleEvidence(inspect(),inspect(),op));
 }
 for(const key of ["StartedAt","FinishedAt"]){
  const before=inspect("running"),after=inspect("exited");
  delete before.State[key];
  assert.throws(()=>validateSignedAgentLifecycleEvidence(before,after,"stop"));
 }
});
test("actual signed agent must re-inspect after daemon gate and before single mutation and never sign unknown receipts",()=>{
 const s=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 const reserve=s.indexOf("reserveLabClaim({agentId,claimId:permit.claimId");
 const attempted=s.indexOf('appendLabEvent(permit.claimId,"attempted")');
 const lastContext=s.indexOf("if(localContext()!==context)");
 const justBefore=s.indexOf("const justBefore=JSON.parse(docker(");
 const compare=s.indexOf("assertSignedAgentPreMutationUnchanged(");
 const lastExpiry=s.indexOf("Signed permit expired during last-moment container reinspection");
 const mutation=s.indexOf('docker(["--context",context,"container",permit.operation,permit.containerId]');
 const postcondition=s.indexOf("labPostcondition(permit.operation,before,after)");
 const lifecycle=s.indexOf("validateSignedAgentLifecycleEvidence(before,after,permit.operation)");
 const complete=s.indexOf("postconditionConfirmed=true;");
 assert.ok(reserve>=0&&reserve<attempted&&attempted<lastContext&&
  lastContext<justBefore&&justBefore<compare&&compare<lastExpiry&&lastExpiry<mutation);
 assert.ok(mutation<postcondition&&postcondition<lifecycle&&lifecycle<complete);
 assert.match(s,/if\(!disposition\.outcome\)\{/);
 assert.match(s,/No terminal event or signed receipt/);
 assert.match(s,/retainRecoveryLock=true/);
 assert.match(s,/if\(!retainRecoveryLock\)unlock\(\)/);
 assert.match(s,/const context=executeLab\?localContext\(\):null/);
 assert.doesNotMatch(s,/shell:true/);
});
test("agent still refuses unauthorized execution without Docker or cloud side effects",()=>{
 const agent=fileURLToPath(new URL("../scripts/docker-lab-agent.mjs",import.meta.url));
 const r=spawnSync(process.execPath,[agent,"33333333-3333-4333-8333-333333333333",
 "/nonexistent/private.pem","/nonexistent/public.key","--execute-lab"],{
  encoding:"utf8",timeout:10000,env:{...process.env,ETERNYX_REMOTE_LAB_ENABLED:""}
 });
 assert.equal(r.status,1);
 assert.equal(r.stdout,"");
 assert.match(r.stderr,/disabled by default/);
});
