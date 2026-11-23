import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {fingerprintLabContainer} from "../src/lib/dockerLabPolicyDrift.mjs";
import {
 validateSignedAgentEnginePins,validateSignedAgentSocket,
 validateSignedAgentEngineObserved,validateSignedAgentTarget
} from "../src/lib/dockerSignedAgentEngineGate.mjs";

const digest=x=>createHash("sha256").update(x).digest("hex");
const ID="a".repeat(64),IMAGE="f".repeat(64);
const NAME="rootless-approved";
const ENDPOINT="unix:///run/user/1001/docker.sock";
const DAEMON="standalone-rootless-engine";
const daemonSha=digest("ETERNYX_DOCKER_HOST_DAEMON_ID_V1\n"+DAEMON);
const env=()=>({
 ETERNYX_DOCKER_AGENT_CONTEXT:NAME,
 ETERNYX_DOCKER_AGENT_ENDPOINT:ENDPOINT,
 ETERNYX_DOCKER_AGENT_DAEMON_SHA256:daemonSha,
 ETERNYX_DOCKER_AGENT_IMAGE_SHA256:IMAGE,
 ETERNYX_DOCKER_AGENT_POLICY_SHA256:"0".repeat(64),
 ETERNYX_REMOTE_LAB_ENABLED:"true"
});
function inspect(status="running"){
 return {
  Id:ID,Name:"/approved-test-container",Image:"sha256:"+IMAGE,
  Config:{
   Image:"example.invalid/isolated@sha256:"+IMAGE,User:"10001:10001",
   Labels:{"io.eternyx.operator.managed":"true","io.eternyx.operator.scope":"local-workbench"}
  },
  HostConfig:{
   Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",
   Binds:[],PortBindings:{},CapAdd:[],Devices:[],DeviceRequests:[],
   CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],
   Memory:134217728,PidsLimit:64,RestartPolicy:{Name:"no"},
   PidMode:"",IpcMode:"",CgroupnsMode:"",UsernsMode:"",UTSMode:""
  },
  Mounts:[],NetworkSettings:{Networks:{none:{}},Ports:{}},
  State:{Running:status==="running",Status:status,StartedAt:"2026-11-23T00:00:00Z"}
 };
}
function pins(){
 const one=inspect();
 return {
  context:NAME,host:ENDPOINT,socketPath:"/run/user/1001/docker.sock",
  daemonIdSha256:daemonSha,imageSha256:IMAGE,
  policySha256:fingerprintLabContainer(one,ID).policySha256
 };
}
const info=()=>({
 ID:DAEMON,SecurityOptions:["name=rootless","name=seccomp,profile=builtin"],
 Swarm:{LocalNodeState:"inactive"}
});
test("signed agent needs independent pins for rootless context, local socket, daemon, image and policy",()=>{
 const r=validateSignedAgentEnginePins(env());
 assert.equal(r.context,NAME);assert.equal(r.socketPath,"/run/user/1001/docker.sock");
 for(const patch of [
  {ETERNYX_DOCKER_AGENT_CONTEXT:"remote/host"},
  {ETERNYX_DOCKER_AGENT_ENDPOINT:"tcp://127.0.0.1:2375"},
  {ETERNYX_DOCKER_AGENT_ENDPOINT:"ssh://server"},
  {ETERNYX_DOCKER_AGENT_ENDPOINT:"npipe:////./pipe/docker_engine"},
  {ETERNYX_DOCKER_AGENT_ENDPOINT:"unix:///run/user/1001/../docker.sock"},
  {ETERNYX_DOCKER_AGENT_ENDPOINT:"unix:///run/user/1001/%2e%2e/docker.sock"},
  {ETERNYX_DOCKER_AGENT_ENDPOINT:"unix:///run/user//docker.sock"},
  {ETERNYX_DOCKER_AGENT_DAEMON_SHA256:"a".repeat(63)},
  {ETERNYX_DOCKER_AGENT_IMAGE_SHA256:"a".repeat(63)},
  {ETERNYX_DOCKER_AGENT_POLICY_SHA256:"a".repeat(63)}
 ])assert.throws(()=>validateSignedAgentEnginePins({...env(),...patch}),undefined,JSON.stringify(patch));
});
test("Docker CLI override paths are denied even when the override points at a Unix socket",()=>{
 for(const key of ["DOCKER_HOST","DOCKER_CONTEXT","DOCKER_CONFIG","DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH","DOCKER_API_VERSION","DOCKER_TLS","DOCKER_TLS_CERTDIR"]){
  assert.throws(()=>validateSignedAgentEnginePins({...env(),[key]:ENDPOINT}),undefined,key);
 }
});
test("operator socket must be real, owned and not world-writable",()=>{
 const valid={uid:1001,mode:0o140600,isSocket:()=>true,isSymbolicLink:()=>false};
 assert.equal(validateSignedAgentSocket(valid,1001),true);
 for(const bad of [
  {...valid,uid:0},
  {...valid,mode:0o140666},
  {...valid,isSocket:()=>false},
  {...valid,isSymbolicLink:()=>true},
  {...valid,isSymbolicLink:undefined}
 ])assert.throws(()=>validateSignedAgentSocket(bad,1001));
});
test("rootless daemon and inactive swarm require the independently pinned daemon identity",()=>{
 const p=pins();
 assert.equal(validateSignedAgentEngineObserved({pins:p,context:NAME,endpoint:ENDPOINT,info:info()}),true);
 for(const x of [
  {context:"other",endpoint:ENDPOINT,info:info()},
  {context:NAME,endpoint:"unix:///tmp/other.sock",info:info()},
  {context:NAME,endpoint:ENDPOINT,info:{...info(),ID:"swapped-daemon"}},
  {context:NAME,endpoint:ENDPOINT,info:{...info(),SecurityOptions:[]}},
  {context:NAME,endpoint:ENDPOINT,info:{...info(),Swarm:{LocalNodeState:"active"}}},
  {context:NAME,endpoint:ENDPOINT,info:{...info(),Swarm:{LocalNodeState:"pending"}}}
 ])assert.throws(()=>validateSignedAgentEngineObserved({pins:p,...x}));
});
test("a real hardened managed container with matching image and policy can be safely classified before and after",()=>{
 const p=pins();
 assert.equal(validateSignedAgentTarget(inspect("running"),ID,"stop",p).status,"running");
 assert.equal(validateSignedAgentTarget(inspect("running"),ID,"restart",p).status,"running");
 assert.equal(validateSignedAgentTarget(inspect("exited"),ID,"start",p).status,"exited");
 assert.equal(validateSignedAgentTarget(inspect("created"),ID,"start",p).status,"created");
 assert.equal(validateSignedAgentTarget(inspect("exited"),ID,"stop",p,{stage:"after"}).status,"exited");
 assert.equal(validateSignedAgentTarget(inspect("running"),ID,"start",p,{stage:"after"}).status,"running");
});
test("wrong initial state or operation is never allowed to reach Docker mutation",()=>{
 const p=pins();
 for(const [operation,state] of [
  ["stop","exited"],["stop","created"],["restart","exited"],
  ["start","running"],["shell","running"]
 ])assert.throws(()=>validateSignedAgentTarget(inspect(state),ID,operation,p));
});
test("pinned image or hardening-policy change fails despite valid Docker labels",()=>{
 const p=pins();
 for(const change of [
  obj=>{obj.Image="sha256:"+"e".repeat(64);},
  obj=>{obj.HostConfig.Memory+=1;},
  obj=>{obj.HostConfig.Privileged=true;},
  obj=>{obj.HostConfig.ReadonlyRootfs=false;},
  obj=>{obj.HostConfig.NetworkMode="bridge";},
  obj=>{obj.HostConfig.CapDrop=[];},
  obj=>{obj.Config.User="0";},
  obj=>{obj.HostConfig.Binds=["/etc:/etc"];},
  obj=>{obj.Config.Labels["io.eternyx.operator.managed"]="false";},
  obj=>{obj.NetworkSettings.Networks={"bridge":{}};},
  obj=>{obj.NetworkSettings.Ports={"8000/tcp":[{HostPort:"8000"}]};}
 ]){
  const obj=inspect();change(obj);
  assert.throws(()=>validateSignedAgentTarget(obj,ID,"stop",p));
 }
});
test("live signed agent wires rootless gate before claim mutation and repeats before actual Docker stop",()=>{
 const s=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 const preflight=s.indexOf("const context=executeLab?localContext():null");
 const claim=s.indexOf('reserveLabClaim({agentId,claimId:permit.claimId');
 const verifyTarget=s.indexOf('validateSignedAgentTarget(before,permit.containerId');
 const attempted=s.indexOf('appendLabEvent(permit.claimId,"attempted")');
 const secondContext=s.indexOf("if(localContext()!==context)");
 const mutation=s.indexOf('docker(["--context",context,"container",permit.operation,permit.containerId]');
 const post=s.indexOf('validateSignedAgentTarget(after,permit.containerId');
 const postcondition=s.indexOf("labPostcondition(permit.operation,before,after)");
 assert.ok(preflight>=0&&preflight<claim);
 assert.ok(claim<verifyTarget&&verifyTarget<attempted&&attempted<secondContext&&secondContext<mutation);
 assert.ok(mutation<post&&post<postcondition);
 assert.match(s,/validateSignedAgentEngineObserved/);
 assert.match(s,/validateSignedAgentSocket/);
 assert.match(s,/process\.getuid\(\)===0/);
 assert.match(s,/agent locked pending independent human review/);
 assert.match(s,/const context=executeLab\?localContext\(\):null/);
 assert.match(s,/const retryReceipt=/);
 assert.doesNotMatch(s,/shell:true/);
});
test("unauthorized signed agent still refuses before any Docker operation",()=>{
 const agent=fileURLToPath(new URL("../scripts/docker-lab-agent.mjs",import.meta.url));
 const result=spawnSync(process.execPath,[
  agent,"33333333-3333-4333-8333-333333333333",
  "/no-secret.pem","/no-pub.key","--execute-lab"
 ],{encoding:"utf8",timeout:12000,env:{...process.env,ETERNYX_REMOTE_LAB_ENABLED:""}});
 assert.equal(result.stdout,"");
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/disabled by default/);
});
