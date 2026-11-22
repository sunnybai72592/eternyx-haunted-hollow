import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  verifyRuntimeIsolation, admitHostLab, auditHostIsolation,
  MAX_HOST_LABS, MAX_HOST_RESERVED_MEMORY_BYTES, MAX_HOST_RESERVED_NANO_CPUS,
} from "../infrastructure/cyber-range/provider/isolation-policy.mjs";
import { createLocalRelay } from "../infrastructure/cyber-range/relay/server.mjs";

const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const session="123e4567-e89b-42d3-a456-426614174001";
const other="223e4567-e89b-42d3-a456-426614174001";
const project="cr-"+session.replaceAll("-","");
const nets={
  target: project+"_local_target_only",
  middle: project+"_gateway_ingress_only",
  host: project+"_localhost_ingress",
};
const MiB=1024*1024;
const token="a".repeat(64);

function container(service){
  const target=service==="http-range",gateway=service==="gateway";
  const memory=(target?128:gateway?64:32)*MiB;
  const connected=target?[nets.target]:gateway?[nets.target,nets.middle]:[nets.middle,nets.host];
  return {
    Id:(target?"a":gateway?"b":"c").repeat(64),
    Created:"2026-11-22T12:00:00Z",
    Config:{
      Labels:{
        "com.docker.compose.project":project,
        "com.docker.compose.service":service,
        "org.eternyx.range.managed":"v1",
        "org.eternyx.range.ttl_seconds":"900",
      },
      User:"10001:10001",
      Env:target?["PORT=8080"]:
        gateway?["RANGE_MANAGED_MODE=required","ETERNYX_MANAGED_GATEWAY_TOKEN="+token]:
        ["RANGE_MAX_AGE_SECONDS=900"],
    },
    State:{Running:true},
    HostConfig:{
      Privileged:false,ReadonlyRootfs:true,
      RestartPolicy:{Name:"no"},
      Memory:memory,MemorySwap:memory,
      NanoCpus:target?400_000_000:gateway?250_000_000:100_000_000,
      PidsLimit:target?48:gateway?32:24,
      PublishAllPorts:false,
      CapDrop:["ALL"],CapAdd:[],
      SecurityOpt:["no-new-privileges:true"],
      Binds:null,Devices:[],ExtraHosts:null,
      NetworkMode:connected.at(-1),PidMode:"",IpcMode:"private",UsernsMode:"",
      PortBindings:service==="ingress"?{"8081/tcp":[{HostIp:"127.0.0.1",HostPort:""}]}:{},
      Tmpfs:target?{"/tmp":"rw,noexec,nosuid,nodev,size=16m,mode=1777"}:null,
    },
    Mounts:[],
    NetworkSettings:{
      Networks:Object.fromEntries(connected.map(name=>[name,{}])),
      Ports:service==="ingress"?{"8081/tcp":[{HostIp:"127.0.0.1",HostPort:"32775"}]}:
        target?{"8080/tcp":null}:{"8081/tcp":null},
    },
  };
}
const containers=()=>["http-range","gateway","ingress"].map(container);
const networks=()=>[
  {Name:nets.target,Internal:true,Driver:"bridge"},
  {Name:nets.middle,Internal:true,Driver:"bridge"},
  {Name:nets.host,Internal:false,Driver:"bridge"},
];

test("three-service live Docker attestation reports only sanitized isolation facts",()=>{
  assert.deepEqual(verifyRuntimeIsolation(session,containers(),networks()),{
    project,passed:true,services:3,exposedTargetPorts:0,exposedGatewayPorts:0,
    loopbackRelayPorts:1,reservedMemoryBytes:224*MiB,
    reservedNanoCpus:750_000_000,totalPidsLimit:104,privateGatewayNetworks:true,
  });
  assert.equal(JSON.stringify(verifyRuntimeIsolation(session,containers(),networks())).includes(token),false);
});

test("all three services mandatory, with no unknown service or forged project labels",()=>{
  assert.throws(()=>verifyRuntimeIsolation(session,containers().slice(0,2),networks()),/attestation/);
  assert.throws(()=>verifyRuntimeIsolation(other,containers(),networks()),/attestation/);
  const a=containers();a[1].Config.Labels["com.docker.compose.service"]="bogus";
  assert.throws(()=>verifyRuntimeIsolation(session,a,networks()));
  const b=containers();b[0].State.Running=false;
  assert.throws(()=>verifyRuntimeIsolation(session,b,networks()),/attestation/);
});

test("deny privilege escalation, root user, host namespace, added mounts or devices",()=>{
  const mutations=[
    c=>c.HostConfig.Privileged=true,
    c=>c.Config.User="root",
    c=>c.HostConfig.ReadonlyRootfs=false,
    c=>c.HostConfig.RestartPolicy.Name="always",
    c=>c.HostConfig.CapDrop=[],
    c=>c.HostConfig.CapAdd=["NET_ADMIN"],
    c=>c.HostConfig.SecurityOpt=[],
    c=>c.HostConfig.SecurityOpt=["no-new-privileges:true","seccomp=unconfined"],
    c=>c.HostConfig.PidMode="host",
    c=>c.HostConfig.IpcMode="host",
    c=>c.HostConfig.UsernsMode="host",
    c=>c.HostConfig.NetworkMode="host",
    c=>c.HostConfig.Binds=["/etc:/host"],
    c=>c.HostConfig.Devices=[{}],
    c=>c.HostConfig.ExtraHosts=["169.254.169.254:169.254.169.254"],
    c=>c.Mounts=[{Type:"bind",Source:"/var/run/docker.sock"}],
  ];
  for(const modify of mutations){
    const v=containers();modify(v[1]);
    assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
  }
});

test("deny unbounded memory, CPU, swap, process count and container policy drift",()=>{
  const changes=[
    c=>c.HostConfig.Memory=0,c=>c.HostConfig.MemorySwap=-1,
    c=>c.HostConfig.Memory=256*MiB,c=>c.HostConfig.NanoCpus=0,
    c=>c.HostConfig.PidsLimit=0,c=>c.HostConfig.PublishAllPorts=true,
  ];
  for(const alter of changes){
    for(let which=0;which<3;which++){
      const v=containers();alter(v[which]);
      assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
    }
  }
  const v=containers();v[0].HostConfig.Tmpfs={"/tmp":"rw,size=1g"};
  assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
});

test("target and authenticated gateway must never publish any host ports",()=>{
  for(let which=0;which<2;which++){
    const v=containers();
    v[which].HostConfig.PortBindings={"8081/tcp":[{HostIp:"127.0.0.1",HostPort:"5555"}]};
    assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
  }
  const v=containers();v[1].NetworkSettings.Ports["8081/tcp"]=[{HostIp:"127.0.0.1",HostPort:"8081"}];
  assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
});

test("only the relay may publish exactly one loopback-only port",()=>{
  const changes=[
    c=>c.HostConfig.PortBindings["8081/tcp"][0].HostIp="0.0.0.0",
    c=>c.NetworkSettings.Ports["8081/tcp"][0].HostIp="0.0.0.0",
    c=>c.NetworkSettings.Ports["8081/tcp"][0].HostPort="99999",
    c=>c.HostConfig.PortBindings["8888/tcp"]=[{HostIp:"127.0.0.1",HostPort:""}],
  ];
  for(const alter of changes){
    const v=containers();alter(v[2]);
    assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
  }
});

test("internal-only target, internal-only gateway and exact relayer network membership",()=>{
  const changes=[
    v=>v[0].NetworkSettings.Networks[nets.host]={},
    v=>v[1].NetworkSettings.Networks[nets.host]={},
    v=>v[2].NetworkSettings.Networks[nets.target]={},
    v=>delete v[1].NetworkSettings.Networks[nets.middle],
  ];
  for(const alter of changes){
    const v=containers();alter(v);
    assert.throws(()=>verifyRuntimeIsolation(session,v,networks()),/attestation/);
  }
  const n=networks();n[1].Internal=false;
  assert.throws(()=>verifyRuntimeIsolation(session,containers(),n),/attestation/);
  const n2=networks();n2[2].Internal=true;
  assert.throws(()=>verifyRuntimeIsolation(session,containers(),n2),/attestation/);
});

test("gateway token must exist only in gateway, never vulnerable target or relay",()=>{
  const v=containers();
  assert.ok(v[1].Config.Env.some(e=>e==="ETERNYX_MANAGED_GATEWAY_TOKEN="+token));
  for(const which of [0,2]){
    for(const key of ["SUPABASE_SERVICE_ROLE_KEY","CTF_RANGE_WORKER_TOKEN","ETERNYX_MANAGED_GATEWAY_TOKEN"]){
      const x=containers();x[which].Config.Env.push(key+"="+token);
      assert.throws(()=>verifyRuntimeIsolation(session,x,networks()),/attestation/);
    }
  }
  const missing=containers();missing[1].Config.Env=[];
  assert.throws(()=>verifyRuntimeIsolation(session,missing,networks()),/attestation/);
});

test("host admission caps three labs at 672 MiB and 2.25 vCPU",()=>{
  assert.equal(MAX_HOST_LABS,3);
  assert.equal(MAX_HOST_RESERVED_MEMORY_BYTES,672*MiB);
  assert.equal(MAX_HOST_RESERVED_NANO_CPUS,2_250_000_000);
  const p1="cr-"+other.replaceAll("-","");
  const p2="cr-323e4567e89b42d3a456426614174001";
  const p3="cr-423e4567e89b42d3a456426614174001";
  assert.equal(admitHostLab({existingProjects:[],sessionId:session}).reservedMemoryBytesAfter,224*MiB);
  assert.equal(admitHostLab({existingProjects:[p1,p2],sessionId:session}).reservedNanoCpusAfter,2_250_000_000);
  assert.throws(()=>admitHostLab({existingProjects:[p1,p2,p3],sessionId:session}),/admission/);
  assert.throws(()=>admitHostLab({existingProjects:[project],sessionId:session}),/duplicate/);
});

test("read-only audit reports project drift without returning raw Docker secrets",async()=>{
  const v=containers(),runtime={
    async listVerifiedManagedProjects(){return v},
    async attest(){return {passed:true}},
  };
  assert.deepEqual(await auditHostIsolation(runtime),{
    inspectedProjects:1,passed:1,drifted:0,results:[{project,passed:true}],
  });
  runtime.attest=async()=>{throw Error("private-value-not-for-log")};
  const state=await auditHostIsolation(runtime);
  assert.equal(state.drifted,1);
  assert.doesNotMatch(JSON.stringify(state),/private-value-not-for-log/);
});

async function requestRelay(relay,url,headers={}){
  const port=relay.address().port;
  return fetch("http://127.0.0.1:"+port+url,{
    headers,redirect:"manual",signal:AbortSignal.timeout(1500),
  });
}
test("relay forwards only fixed gateway URL and never acts as general SSRF proxy",async(t)=>{
  const requests=[];
  const server=createLocalRelay({fetchGateway:async(url,opts)=>{
    requests.push({url:url.toString(),headers:opts.headers});
    return new Response(JSON.stringify({ok:true}),{
      status:200,headers:{"content-type":"application/json"},
    });
  }});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(ok=>server.close(ok)));
  assert.equal((await requestRelay(server,"/api/tickets?ticket=102")).status,401);
  assert.equal((await requestRelay(server,"//evil.invalid")).status,400);
  assert.equal((await requestRelay(server,"/api/unknown",{"authorization":"Bearer "+token})).status,404);
  assert.equal((await requestRelay(server,"/api/tickets?ticket=102",{
    "authorization":"Bearer "+token,
  })).status,200);
  assert.deepEqual(requests.map(x=>x.url),["http://gateway:8081/api/tickets?ticket=102"]);
  assert.equal(requests[0].headers.authorization,"Bearer "+token);
});

test("Compose, Docker runtime, and isolated smoke test all use the three-service contract",async()=>{
  const compose=await read("infrastructure/cyber-range/compose.managed.yaml");
  const docker=await read("infrastructure/cyber-range/provider/docker-runtime.mjs");
  const workflow=await read(".github/workflows/managed-cyber-range-smoke.yml");
  const relay=await read("infrastructure/cyber-range/relay/server.mjs");
  const relayDocker=await read("infrastructure/cyber-range/relay/Dockerfile");
  assert.equal((compose.match(/org\.eternyx\.range\.managed: "v1"/g)||[]).length,3);
  assert.match(compose,/gateway_ingress_only:\s+internal: true/);
  assert.match(compose,/local_target_only:\s+internal: true/);
  assert.match(compose,/127\.0\.0\.1::8081/);
  assert.match(docker,/\["port", "ingress", "8081"\]/);
  assert.match(docker,/project \+ "_gateway_ingress_only"/);
  assert.match(workflow,/http:\/\/169\.254\.169\.254\/latest\/meta-data/);
  assert.match(relay,/const internalGateway = "http:\/\/gateway:8081"/);
  assert.match(relayDocker,/USER 10001:10001/);
  assert.doesNotMatch(compose,/docker\.sock|privileged:\s*true|network_mode:\s*host/);
});
