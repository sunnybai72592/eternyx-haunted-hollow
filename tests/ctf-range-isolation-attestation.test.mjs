import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  verifyRuntimeIsolation, admitHostLab, auditHostIsolation,
  MAX_HOST_LABS,MAX_HOST_RESERVED_MEMORY_BYTES,MAX_HOST_RESERVED_NANO_CPUS,
} from "../infrastructure/cyber-range/provider/isolation-policy.mjs";
import {
  createHostRangeRelay,verifyInternalGatewayAddress,
} from "../infrastructure/cyber-range/provider/host-relay.mjs";

const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const session="123e4567-e89b-42d3-a456-426614174001";
const other="223e4567-e89b-42d3-a456-426614174001";
const project="cr-"+session.replaceAll("-","");
const nets=[project+"_local_target_only",project+"_gateway_ingress_only"];
const MiB=1024*1024;
const token="c".repeat(64);
const privateIp="172.22.0.3";
const subnet="172.22.0.0/16";
const containerId="a".repeat(64);
const destination={
  ip:privateIp,subnet,network:nets[1],project,containerId,
};
function container(service) {
  const target=service==="http-range";
  const memory=(target?128:64)*MiB;
  return {
    Id:(target?"a":"b").repeat(64),
    Created:"2026-11-22T12:00:00Z",
    Config:{
      Labels:{
        "com.docker.compose.project":project,
        "com.docker.compose.service":service,
        "org.eternyx.range.managed":"v1",
        "org.eternyx.range.ttl_seconds":"900",
      },
      User:"10001:10001",
      Env:target?["PORT=8080"]:["RANGE_MANAGED_MODE=required","ETERNYX_MANAGED_GATEWAY_TOKEN="+token],
    },
    State:{Running:true},
    HostConfig:{
      Privileged:false,ReadonlyRootfs:true,RestartPolicy:{Name:"no"},
      Memory:memory,MemorySwap:memory,NanoCpus:target?400_000_000:250_000_000,
      PidsLimit:target?48:32,PublishAllPorts:false,CapDrop:["ALL"],
      CapAdd:[],SecurityOpt:["no-new-privileges:true"],
      Binds:null,Devices:[],ExtraHosts:null,NetworkMode:target?nets[0]:nets[1],
      PidMode:"",IpcMode:"private",UsernsMode:"",PortBindings:{},
      Tmpfs:target?{"/tmp":"rw,noexec,nosuid,nodev,size=16m,mode=1777"}:null,
    },
    Mounts:[],
    NetworkSettings:{
      Networks:Object.fromEntries((target?[nets[0]]:nets).map(name=>[name,{}])),
      Ports:target?{"8080/tcp":null}:{"8081/tcp":null},
    },
  };
}
const pair=()=>[container("http-range"),container("gateway")];
const networks=()=>nets.map(name=>({Name:name,Internal:true,Driver:"bridge",
  IPAM:{Config:[{Subnet:subnet}]}}));

test("two internal-only containers have no Docker-published port or routable network",()=>{
  assert.deepEqual(verifyRuntimeIsolation(session,pair(),networks()),{
    project,passed:true,services:2,publishedDockerPorts:0,internalNetworks:2,
    reservedMemoryBytes:192*MiB,reservedNanoCpus:650_000_000,
    totalPidsLimit:80,hostIngressRequired:true,
  });
});

test("strict live attestation rejects missing service, label, and third unexpected container",()=>{
  assert.throws(()=>verifyRuntimeIsolation(session,pair().slice(0,1),networks()),/attestation/);
  assert.throws(()=>verifyRuntimeIsolation(other,pair(),networks()),/attestation/);
  const v=pair();v[1].Config.Labels["com.docker.compose.service"]="ingress";
  assert.throws(()=>verifyRuntimeIsolation(session,v,networks()));
  const v2=pair();v2.push(container("gateway"));
  assert.throws(()=>verifyRuntimeIsolation(session,v2,networks()),/attestation/);
  const v3=pair();v3[0].State.Running=false;
  assert.throws(()=>verifyRuntimeIsolation(session,v3,networks()),/attestation/);
});

test("root/privileged/mounted/docker socket/host namespace drift is refused",()=>{
  const mutate=[
    v=>v.HostConfig.Privileged=true,
    v=>v.Config.User="root",
    v=>v.HostConfig.ReadonlyRootfs=false,
    v=>v.HostConfig.RestartPolicy.Name="always",
    v=>v.HostConfig.CapDrop=[],
    v=>v.HostConfig.CapAdd=["NET_ADMIN"],
    v=>v.HostConfig.SecurityOpt=[],
    v=>v.HostConfig.SecurityOpt=["no-new-privileges:true","seccomp=unconfined"],
    v=>v.HostConfig.PidMode="host",
    v=>v.HostConfig.IpcMode="host",
    v=>v.HostConfig.UsernsMode="host",
    v=>v.HostConfig.NetworkMode="host",
    v=>v.HostConfig.Binds=["/etc:/etc-host"],
    v=>v.Mounts=[{Source:"/var/run/docker.sock"}],
    v=>v.HostConfig.Devices=[{}],
    v=>v.HostConfig.ExtraHosts=["metadata.local:169.254.169.254"],
  ];
  for(const mutation of mutate){
    const v=pair();mutation(v[1]);
    assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
  }
});

test("CPU/memory/swap/PID limits and tmpfs protection fail closed on drift",()=>{
  for(const mutate of [
    v=>v.HostConfig.Memory=0,
    v=>v.HostConfig.Memory=256*MiB,
    v=>v.HostConfig.MemorySwap=-1,
    v=>v.HostConfig.NanoCpus=0,
    v=>v.HostConfig.PidsLimit=0,
    v=>v.HostConfig.PublishAllPorts=true,
  ]){
    for(let service=0;service<2;service++){
      const v=pair();mutate(v[service]);
      assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
    }
  }
  const v=pair();v[0].HostConfig.Tmpfs={"/tmp":"rw,size=1g"};
  assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
});

test("publishing ANY target or gateway host port is refused",()=>{
  for(let i=0;i<2;i++){
    const v=pair();v[i].HostConfig.PortBindings={"8081/tcp":[{HostIp:"127.0.0.1",HostPort:"8888"}]};
    assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
    const other=pair();other[i].NetworkSettings.Ports["8081/tcp"]=[{HostIp:"0.0.0.0",HostPort:"8888"}];
    assert.throws(()=>verifyRuntimeIsolation(session,other,networks()),/attestation/);
  }
});

test("both bridges must be Docker internal and memberships exact",()=>{
  const v=pair();v[1].NetworkSettings.Networks["public"]={};
  assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
  const n=networks();n[1].Internal=false;
  assert.throws(()=>verifyRuntimeIsolation(session,pair(),n),/attestation/);
  const n2=networks();n2[0].Internal=false;
  assert.throws(()=>verifyRuntimeIsolation(session,pair(),n2),/attestation/);
  const v2=pair();v2[0].NetworkSettings.Networks[nets[1]]={};
  assert.throws(()=>verifyRuntimeIsolation(session,v2,networks()),/attestation/);
});

test("target cannot receive gateway bearer, worker token or Supabase keys",()=>{
  for(const key of ["ETERNYX_MANAGED_GATEWAY_TOKEN","CTF_RANGE_WORKER_TOKEN","SUPABASE_SERVICE_ROLE_KEY"]){
    const v=pair();v[0].Config.Env.push(key+"="+token);
    assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
  }
  const missing=pair();missing[1].Config.Env=[];
  assert.throws(()=>verifyRuntimeIsolation(session,missing,networks()),/attestation/);
  assert.doesNotMatch(JSON.stringify(verifyRuntimeIsolation(session,pair(),networks())),new RegExp(token));
});

test("host admission keeps three-lab 576MiB / 1.95 vCPU envelope",()=>{
  assert.equal(MAX_HOST_LABS,3);
  assert.equal(MAX_HOST_RESERVED_MEMORY_BYTES,576*MiB);
  assert.equal(MAX_HOST_RESERVED_NANO_CPUS,1_950_000_000);
  const p1="cr-"+other.replaceAll("-","");
  const p2="cr-323e4567e89b42d3a456426614174001";
  const p3="cr-423e4567e89b42d3a456426614174001";
  assert.equal(admitHostLab({existingProjects:[],sessionId:session}).reservedMemoryBytesAfter,192*MiB);
  assert.equal(admitHostLab({existingProjects:[p1,p2],sessionId:session}).reservedNanoCpusAfter,1_950_000_000);
  assert.throws(()=>admitHostLab({existingProjects:[p1,p2,p3],sessionId:session}),/limit/);
  assert.throws(()=>admitHostLab({existingProjects:[project],sessionId:session}),/duplicate/);
});

test("verified gateway upstream must be private, on Docker internal subnet and exact project",()=>{
  assert.deepEqual(verifyInternalGatewayAddress(destination),{
    ip:privateIp,network:nets[1],containerId,
  });
  for(const changed of [
    {ip:"169.254.169.254"},{ip:"8.8.8.8"},{ip:"127.0.0.1"},
    {ip:"172.23.1.2"},{ip:"172.22.0.0"},{ip:"172.22.255.255"},
    {ip:"172.22.0.03"},{ip:"172.22.0.300"},
    {subnet:"0.0.0.0/0"},{subnet:"172.22.0.0/1"},
    {subnet:"172.22.0.0/31"},{project:"cr-"+other.replaceAll("-","")},
    {network:"public"},{containerId:"fake"},
  ]){
    assert.throws(()=>verifyInternalGatewayAddress({...destination,...changed}));
  }
});

test("host relay accepts only localhost, token and fixed paths with verified private destination",async(t)=>{
  const received=[];let verifications=0;
  const relay=createHostRangeRelay({
    sessionId:session,token,
    verifyUpstream:async()=>{verifications++;return {ip:privateIp};},
    requestFetch:async(url,options)=>{
      received.push({url:String(url),host:options.headers.host,method:options.method});
      return new Response('{"flag":"synthetic"}',{status:200,
        headers:{"content-type":"application/json"}});
    },
  });
  const port=await relay.listen();
  t.after(()=>relay.close());
  const send=async(path,headers={})=>fetch("http://127.0.0.1:"+port+path,{
    headers,redirect:"manual",signal:AbortSignal.timeout(1800),
  });
  assert.equal((await send("/api/rooms")).status,401);
  assert.equal((await send("/api/rooms",{authorization:"Bearer "+"d".repeat(64)})).status,401);
  assert.equal((await send("/missing",{authorization:"Bearer "+token})).status,404);
  assert.equal((await send("/api/tickets?ticket=102",{authorization:"Bearer "+token})).status,200);
  assert.equal((await send("/api/rooms",{authorization:"Bearer "+token})).status,200);
  assert.equal(verifications,2);
  assert.deepEqual(received.map(x=>x.url),[
    "http://172.22.0.3:8081/api/tickets?ticket=102",
    "http://172.22.0.3:8081/api/rooms",
  ]);
  assert.ok(received.every(x=>x.host==="gateway:8081"));
});

test("host proxy fails closed if Docker gateway identity changes mid-session",async(t)=>{
  const relay=createHostRangeRelay({sessionId:session,token,
    verifyUpstream:async()=>{throw Error("Docker identity changed")},
    requestFetch:()=>{throw Error("Must never forward")},
  });
  const port=await relay.listen();
  t.after(()=>relay.close());
  const response=await fetch("http://127.0.0.1:"+port+"/api/tickets",{
    headers:{authorization:"Bearer "+token},
  });
  assert.equal(response.status,503);
  assert.doesNotMatch(await response.text(),/Docker identity/);
});

test("host audit sanitizes Docker errors without returning tokens",async()=>{
  const v=pair(),runtime={
    async listVerifiedManagedProjects(){return v},
    async attest(){return {passed:true}},
  };
  assert.equal((await auditHostIsolation(runtime)).drifted,0);
  runtime.attest=async()=>{throw Error("private-docker-token")};
  const result=await auditHostIsolation(runtime);
  assert.equal(result.drifted,1);
  assert.doesNotMatch(JSON.stringify(result),/private-docker-token/);
});

test("managed Docker and smoke tests wire zero published ports to host relay",async()=>{
  const compose=await read("infrastructure/cyber-range/compose.managed.yaml");
  const docker=await read("infrastructure/cyber-range/provider/docker-runtime.mjs");
  const workflow=await read(".github/workflows/managed-cyber-range-smoke.yml");
  assert.equal((compose.match(/org\.eternyx\.range\.managed: "v1"/g)||[]).length,2);
  assert.match(compose,/local_target_only:\s+internal: true/);
  assert.match(compose,/gateway_ingress_only:\s+internal: true/);
  assert.doesNotMatch(compose,/\bports:\s*\n\s*-\s*["']?127\.0\.0\.1/);
  assert.doesNotMatch(compose,/\blocalhost_ingress:/);
  assert.match(docker,/createHostRangeRelay/);
  assert.match(docker,/trustedGatewayDestination/);
  assert.match(docker,/process\.platform !== "linux"/);
  assert.match(workflow,/host-only ingress/i);
  assert.doesNotMatch(compose,/docker\.sock|privileged:\s*true|network_mode:\s*host/);
});
