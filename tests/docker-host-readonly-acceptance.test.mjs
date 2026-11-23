import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {
 validateDockerHostReadOnlyPins,validateDockerHostJournal,
 inspectDockerHostReadOnly
} from "../src/lib/dockerHostReadOnlyAcceptance.mjs";

const ID="a".repeat(64),IMAGE="f".repeat(64),CONTEXT="rootless-lab";
const ENDPOINT="unix:///run/user/1001/docker.sock";
const DAEMON_ID="synthetic-offline-daemon-identifier";
const hash=x=>createHash("sha256").update(x).digest("hex");
const PIN=Object.freeze({
 containerId:ID,expectedContext:CONTEXT,expectedEndpoint:ENDPOINT,
 expectedImageSha256:IMAGE,
 expectedDaemonIdSha256:hash("ETERNYX_DOCKER_HOST_DAEMON_ID_V1\n"+DAEMON_ID)
});
const environment=()=>({
 ETERNYX_REMOTE_LAB_ENABLED:"false",DOCKER_REMOTE_LAB_ENABLED:"false"
});
const socket=()=>({isSocket:()=>true,isSymbolicLink:()=>false,uid:1001,mode:0o140600});
function inspect(){
 return {
  Id:ID,Image:"sha256:"+IMAGE,Name:"/safe-isolated-synthetic",
  Config:{
   Image:"example.invalid/lab@sha256:"+IMAGE,User:"10001:10001",
   Labels:{"io.eternyx.operator.managed":"true",
    "io.eternyx.operator.scope":"local-workbench"},
   Env:["PRIVATE_PASSWORD=this-must-never-appear","AUTH_TOKEN=synthetic-secret"]
  },
  HostConfig:{
   Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",
   Binds:[],PortBindings:{},CapAdd:[],Devices:[],DeviceRequests:[],
   CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],
   Memory:134217728,PidsLimit:64,RestartPolicy:{Name:"no"},
   PidMode:"",IpcMode:"",CgroupnsMode:"",UsernsMode:"",UTSMode:""
  },
  Mounts:[],NetworkSettings:{Networks:{none:{}},Ports:{}},
  State:{Running:false,Status:"exited",StartedAt:"2026-11-21T00:00:00Z"}
 };
}
const info=()=>({
 ID:DAEMON_ID,ServerVersion:"29.0.0",
 SecurityOptions:["name=rootless","name=seccomp,profile=builtin"],
 Swarm:{LocalNodeState:"inactive"}
});
function driver({context=CONTEXT,endpoint=ENDPOINT,daemon=info(),
 first=inspect(),second=first,journal=[],socketStat=socket()}={}){
 const calls=[];
 const execDocker=async args=>{
  calls.push(args);
  const key=args.join(" ");
  if(key==="context show")return context+"\n";
  if(key.startsWith("context inspect "))return JSON.stringify(endpoint)+"\n";
  if(key.includes(" info "))return JSON.stringify(daemon);
  if(key.includes(" container inspect "))return JSON.stringify(calls.filter(x=>x.includes("container")).length===1?first:second);
  throw Error("No other Docker CLI command is permitted by the fixture");
 };
 return {
  options:{
   env:environment(),execDocker,socketStat:()=>socketStat,
   journalEntries:()=>journal,uid:1001,
   observedAt:()=>"2026-11-23T16:00:00.000Z"
  },calls
 };
}
test("strict pinned host preflight accepts only five exact independently known values",()=>{
 const v=validateDockerHostReadOnlyPins(PIN,environment());
 assert.equal(v.expectedContext,CONTEXT);
 assert.equal(v.socketPath,"/run/user/1001/docker.sock");
 for(const changed of [
  {...PIN,containerId:"short"},
  {...PIN,expectedContext:"remote/context"},
  {...PIN,expectedEndpoint:"tcp://127.0.0.1:2375"},
  {...PIN,expectedEndpoint:"npipe:////./pipe/docker_engine"},
  {...PIN,expectedEndpoint:"unix:///run/user/1001/../docker.sock"},
  {...PIN,expectedEndpoint:"unix:///run/user/1001/%2e%2e/docker.sock"},
  {...PIN,expectedImageSha256:"f".repeat(63)},
  {...PIN,expectedDaemonIdSha256:"unknown"},
  {...PIN,productionHost:"somewhere"}
 ])assert.throws(()=>validateDockerHostReadOnlyPins(changed,environment()));
});
test("Docker environment overrides and execution opt-ins are denied before any Engine access",()=>{
 for(const env of [
  {DOCKER_HOST:"tcp://localhost:2375"},{DOCKER_HOST:ENDPOINT},
  {DOCKER_CONTEXT:CONTEXT},{DOCKER_CONFIG:"/tmp/overrides"},
  {DOCKER_TLS_VERIFY:"1"},{DOCKER_CERT_PATH:"/tmp/keys"},
  {DOCKER_API_VERSION:"1.12"},{ETERNYX_REMOTE_LAB_ENABLED:"true"},
  {DOCKER_REMOTE_LAB_ENABLED:"true"}
 ])assert.throws(()=>validateDockerHostReadOnlyPins(PIN,env));
});
test("real command-shaped read-only host observation checks rootless daemon, two inspects and sanitized evidence",async()=>{
 const fixture=driver();
 const result=await inspectDockerHostReadOnly(PIN,fixture.options);
 assert.equal(fixture.calls.length,5);
 assert.deepEqual(fixture.calls[0],["context","show"]);
 assert.deepEqual(fixture.calls[1],["context","inspect",CONTEXT,
  "--format","{{json .Endpoints.docker.Host}}"]);
 assert.deepEqual(fixture.calls[2],["--context",CONTEXT,"info","--format","{{json .}}"]);
 const last=["--context",CONTEXT,"container","inspect","--format","{{json .}}",ID];
 assert.deepEqual(fixture.calls[3],last);
 assert.deepEqual(fixture.calls[4],last);
 assert.equal(result.realDockerEngineReadOnlyContacted,true);
 assert.equal(result.managedTargetChecksPassed,true);
 assert.equal(result.daemonRootlessObserved,true);
 assert.equal(result.stableTwoInspections,true);
 assert.equal(result.pinnedImageMatchesObserved,true);
 assert.equal(result.journalClaimsChecked,0);
 assert.equal(result.labContainerMutationPerformed,false);
 assert.equal(result.remoteLabExecutionEnabled,false);
 assert.equal(result.actualRemoteSignedDispatchTested,false);
 assert.equal(result.independentHostAttestation,false);
 assert.equal(result.externalNetworkIsolationProved,false);
 assert.equal(result.productionDeploymentAuthorized,false);
 assert.equal(result.stagingDockerExecutionAuthorized,false);
 assert.match(result.managedContainerPolicySha256,/^[a-f0-9]{64}$/);
 for(const secret of ["PRIVATE_PASSWORD","this-must-never-appear","AUTH_TOKEN",DAEMON_ID,ENDPOINT])
  assert.equal(JSON.stringify(result).includes(secret),false);
});
test("wrong local Docker context and daemon endpoint stop before inspecting containers",async()=>{
 for(const changed of [
  {context:"unreviewed-context"},
  {endpoint:"tcp://other-host:2375"},
  {endpoint:"unix:///tmp/a-different-socket.sock"}
 ]){
  const d=driver(changed);
  await assert.rejects(()=>inspectDockerHostReadOnly(PIN,d.options));
  assert.ok(d.calls.length<3);
 }
});
test("local Unix socket must be a real operator-owned socket, never symlink or world writable",async()=>{
 for(const changed of [
  {isSocket:()=>false,isSymbolicLink:()=>false,uid:1001,mode:0o100600},
  {isSocket:()=>true,isSymbolicLink:()=>true,uid:1001,mode:0o140600},
  {isSocket:()=>true,isSymbolicLink:()=>false,uid:0,mode:0o140600},
  {isSocket:()=>true,isSymbolicLink:()=>false,uid:1001,mode:0o140666}
 ]){
  const d=driver({socketStat:changed});
  await assert.rejects(()=>inspectDockerHostReadOnly(PIN,d.options));
  assert.equal(d.calls.length,0);
 }
});
test("an unpinned daemon or non-rootless/active Swarm engine fails closed",async()=>{
 for(const changed of [
  {ID:"different-daemon"},
  {SecurityOptions:["name=seccomp,profile=builtin"]},
  {Swarm:{LocalNodeState:"active"}},
  {SecurityOptions:null}
 ]){
  const d=driver({daemon:{...info(),...changed}});
  await assert.rejects(()=>inspectDockerHostReadOnly(PIN,d.options));
  assert.equal(d.calls.length,3);
 }
});
test("container must be operator-managed, rootless-safe, network-isolated and pinned by image",async()=>{
 const cases=[
  obj=>{obj.Config.Labels["io.eternyx.operator.managed"]="false";},
  obj=>{obj.HostConfig.Privileged=true;},
  obj=>{obj.HostConfig.ReadonlyRootfs=false;},
  obj=>{obj.HostConfig.NetworkMode="bridge";},
  obj=>{obj.HostConfig.CapDrop=[];},
  obj=>{obj.HostConfig.Binds=["/root:/root"];},
  obj=>{obj.NetworkSettings.Networks={"bridge":{}};},
  obj=>{obj.NetworkSettings.Ports={"8000/tcp":[{HostPort:"8000"}]};},
  obj=>{obj.Image="sha256:"+"c".repeat(64);},
  obj=>{obj.Config.User="0:0";},
  obj=>{obj.HostConfig.PidsLimit=0;}
 ];
 for(const change of cases){
  const x=inspect();change(x);
  const d=driver({first:x,second:x});
  await assert.rejects(()=>inspectDockerHostReadOnly(PIN,d.options));
  assert.equal(d.calls.length,4);
 }
});
test("changing image, resource limits or runtime state between two inspections is denied",async()=>{
 for(const change of [
  x=>{x.Image="sha256:"+"e".repeat(64);},
  x=>{x.HostConfig.Memory+=10;},
  x=>{x.State.Running=true;x.State.Status="running";},
  x=>{x.State.StartedAt="2026-11-23T16:00:00.000Z";},
  x=>{x.NetworkSettings.Networks.bridge={};}
 ]){
  const d=driver({first:inspect(),second:(()=>{const x=inspect();change(x);return x;})()});
  await assert.rejects(()=>inspectDockerHostReadOnly(PIN,d.options));
  assert.equal(d.calls.length,5);
 }
});
test("unresolved claims, corrupt journals and oversized scan block all Docker commands",async()=>{
 for(const records of [
  [{attentionRequired:true,acknowledged:false}],
  [{attentionRequired:true,acknowledged:true,error:"invalid_journal"}],
  Array(101).fill({attentionRequired:false,acknowledged:true})
 ]){
  assert.throws(()=>validateDockerHostJournal(records));
  const d=driver({journal:records});
  await assert.rejects(()=>inspectDockerHostReadOnly(PIN,d.options));
  assert.equal(d.calls.length,0);
 }
 const one=[{attentionRequired:false,acknowledged:true}];
 assert.equal(validateDockerHostJournal(one),1);
});
test("operator CLI preflight never calls Docker and requires separate human approval",()=>{
 const cli=fileURLToPath(new URL("../scripts/docker-host-readonly-acceptance.mjs",import.meta.url));
 const settings={...process.env,
  ETERNYX_DOCKER_HOST_READONLY_APPROVAL:"I_APPROVE_LOCAL_DOCKER_INSPECTION",
  ETERNYX_DOCKER_HOST_CONTAINER_ID:ID,
  ETERNYX_DOCKER_HOST_CONTEXT:CONTEXT,
  ETERNYX_DOCKER_HOST_ENDPOINT:ENDPOINT,
  ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256:PIN.expectedDaemonIdSha256,
  ETERNYX_DOCKER_HOST_IMAGE_SHA256:IMAGE,
  ETERNYX_REMOTE_LAB_ENABLED:"false",DOCKER_REMOTE_LAB_ENABLED:"false"
 };
 for(const key of ["DOCKER_HOST","DOCKER_CONTEXT","DOCKER_CONFIG","DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH","DOCKER_API_VERSION","DOCKER_TLS","DOCKER_TLS_CERTDIR"])
  delete settings[key];
 const run=(change={})=>spawnSync(process.execPath,[cli,"--preflight"],{
  encoding:"utf8",timeout:10000,env:{...settings,...change}
 });
 const result=run();
 if(process.platform==="win32")assert.equal(result.status,1);
 else{
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).dockerEngineContacted,false);
  assert.equal(run({ETERNYX_DOCKER_HOST_READONLY_APPROVAL:""}).status,1);
  assert.equal(run({DOCKER_CONTEXT:"untrusted"}).status,1);
  assert.equal(run({ETERNYX_DOCKER_HOST_ENDPOINT:"ssh://remote.example"}).status,1);
 }
});
test("no automatic job or network/remote/Docker mutation is introduced",()=>{
 const workflow=readFileSync(new URL("../.github/workflows/docker-host-readonly-safety.yml",import.meta.url),"utf8");
 const script=readFileSync(new URL("../scripts/docker-host-readonly-acceptance.mjs",import.meta.url),"utf8");
 const module=readFileSync(new URL("../src/lib/dockerHostReadOnlyAcceptance.mjs",import.meta.url),"utf8");
 assert.match(workflow,/node --test tests\/docker-host-readonly-acceptance\.test\.mjs/);
 assert.doesNotMatch(workflow,/docker (?:run|start|stop|restart|exec|create)/);
 assert.doesNotMatch(script,/docker\.sock\b|fetch\(|supabase functions deploy/);
 assert.doesNotMatch(module,/fetch\(|supabase functions deploy/);
 assert.match(module,/independentHostAttestation:false/);
 assert.match(module,/productionDeploymentAuthorized:false/);
});
