import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  verifyRuntimeIsolation, admitHostLab, auditHostIsolation,
  MAX_HOST_LABS, MAX_HOST_RESERVED_MEMORY_BYTES, MAX_HOST_RESERVED_NANO_CPUS,
} from "../infrastructure/cyber-range/provider/isolation-policy.mjs";

const read = p => readFile(new URL("../" + p, import.meta.url),"utf8");
const a = "123e4567-e89b-42d3-a456-426614174001";
const b = "223e4567-e89b-42d3-a456-426614174001";
const project = "cr-" + a.replaceAll("-", "");
const targetNet = project + "_local_target_only";
const gatewayNet = project + "_localhost_ingress";
const MIB = 1024 * 1024;

function container(service) {
  const target = service === "http-range";
  const memory = (target ? 128 : 64) * MIB;
  const bindings = target ? {} :
    { "8081/tcp": [{HostIp:"127.0.0.1",HostPort:""}] };
  return {
    Id: (target ? "a" : "b").repeat(64),
    Created:"2026-11-22T12:00:00.000000Z",
    Config:{
      Labels:{
        "com.docker.compose.project":project,
        "com.docker.compose.service":service,
        "org.eternyx.range.managed":"v1",
        "org.eternyx.range.ttl_seconds":"900",
      },
      User:"10001:10001",
      Env: target ? ["PORT=8080","RANGE_MAX_AGE_SECONDS=900"]
        : ["RANGE_MANAGED_MODE=required","ETERNYX_MANAGED_GATEWAY_TOKEN=privately-set"],
    },
    State:{ Running:true },
    HostConfig:{
      Privileged:false,ReadonlyRootfs:true,
      RestartPolicy:{Name:"no"},Memory:memory,MemorySwap:memory,
      NanoCpus:target?400_000_000:250_000_000,
      PidsLimit:target?48:32,PublishAllPorts:false,
      CapDrop:["ALL"],CapAdd:[],
      SecurityOpt:["no-new-privileges:true"],
      Binds:null,Devices:[],ExtraHosts:null,NetworkMode:target?targetNet:gatewayNet,
      PidMode:"",IpcMode:"private",UsernsMode:"",
      PortBindings:bindings,
      Tmpfs:target?{"/tmp":"rw,noexec,nosuid,nodev,size=16m,mode=1777"}:null,
    },
    Mounts:[],
    NetworkSettings:{
      Networks:target ? {[targetNet]:{}} : {[targetNet]:{},[gatewayNet]:{}},
      Ports:target ? {"8080/tcp":null}
        : {"8081/tcp":[{HostIp:"127.0.0.1",HostPort:"32772"}]},
    },
  };
}
const net = () => [
  {Name:targetNet,Internal:true,Driver:"bridge"},
  {Name:gatewayNet,Internal:false,Driver:"bridge"},
];
const ok = () => [container("http-range"),container("gateway")];
const copy = item => structuredClone(item);

test("valid inspected Docker instance passes without exporting credentials",()=>{
  const result = verifyRuntimeIsolation(a,ok(),net());
  assert.deepEqual(result,{
    project,passed:true,services:2,exposedTargetPorts:0,loopbackGatewayPorts:1,
    reservedMemoryBytes:192*MIB,reservedNanoCpus:650_000_000,
    totalPidsLimit:80,targetInternalNetwork:true,
  });
  assert.equal(JSON.stringify(result).includes("privately-set"),false);
  assert.equal(JSON.stringify(result).includes("PORT=8080"),false);
});

test("rejects arbitrary project, missing service, nonrunning container and forged labels",()=>{
  assert.throws(()=>verifyRuntimeIsolation(b,ok(),net()),/attestation failed/);
  assert.throws(()=>verifyRuntimeIsolation(a,[container("gateway")],net()),/attestation failed/);
  let x=ok();x[0].State.Running=false;
  assert.throws(()=>verifyRuntimeIsolation(a,x,net()),/attestation failed/);
  x=ok();x[0].Config.Labels["org.eternyx.range.managed"]="unknown";
  assert.throws(()=>verifyRuntimeIsolation(a,x,net()),/cleanup refused/);
  x=ok();x[0].Config.Labels["com.docker.compose.project"]="other";
  assert.throws(()=>verifyRuntimeIsolation(a,x,net()));
});

test("enforces no privilege escalation, nonroot and isolated PID/IPC",()=>{
  const mutate=[
    x=>{x.HostConfig.Privileged=true;},
    x=>{x.HostConfig.ReadonlyRootfs=false;},
    x=>{x.HostConfig.CapDrop=[];},
    x=>{x.HostConfig.CapAdd=["NET_ADMIN"];},
    x=>{x.HostConfig.SecurityOpt=[];},
    x=>{x.HostConfig.SecurityOpt=["no-new-privileges:true","seccomp=unconfined"];},
    x=>{x.HostConfig.PidMode="host";},
    x=>{x.HostConfig.IpcMode="host";},
    x=>{x.HostConfig.UsernsMode="host";},
    x=>{x.Config.User="root";},
    x=>{x.HostConfig.RestartPolicy.Name="always";},
  ];
  for(const change of mutate){
    const instances=ok();change(instances[0]);
    assert.throws(()=>verifyRuntimeIsolation(a,instances,net()),/attestation failed/);
  }
});

test("rejects unbounded CPU, memory, swap, process count and host file mounts",()=>{
  const mutate=[
    x=>{x.HostConfig.Memory=0;},
    x=>{x.HostConfig.MemorySwap=-1;},
    x=>{x.HostConfig.Memory=256*MIB;},
    x=>{x.HostConfig.NanoCpus=0;},
    x=>{x.HostConfig.PidsLimit=0;},
    x=>{x.Mounts=[{Type:"bind",Source:"/var/run/docker.sock"}];},
    x=>{x.HostConfig.Binds=["/etc:/host"];},
    x=>{x.HostConfig.Devices=[{}];},
    x=>{x.HostConfig.ExtraHosts=["169.254.169.254:169.254.169.254"];},
    x=>{x.HostConfig.Tmpfs={"/tmp":"rw,size=200m"};},
  ];
  for(const change of mutate){
    const instances=ok();change(instances[0]);
    assert.throws(()=>verifyRuntimeIsolation(a,instances,net()),/attestation failed/);
  }
});

test("gateway must publish exactly one private loopback port, target none",()=>{
  const mutate=[
    x=>{x.HostConfig.PortBindings={"8080/tcp":[{HostIp:"0.0.0.0",HostPort:"9000"}]};},
    x=>{x.NetworkSettings.Ports={"8080/tcp":[{HostIp:"0.0.0.0",HostPort:"9000"}]};},
  ];
  for(const change of mutate){
    const instances=ok();change(instances[0]);
    assert.throws(()=>verifyRuntimeIsolation(a,instances,net()),/attestation failed/);
  }
  const gateways=[
    x=>{x.HostConfig.PortBindings["8081/tcp"][0].HostIp="0.0.0.0";},
    x=>{x.NetworkSettings.Ports["8081/tcp"][0].HostIp="0.0.0.0";},
    x=>{x.NetworkSettings.Ports["8081/tcp"][0].HostPort="99999";},
    x=>{x.HostConfig.PortBindings["9000/tcp"]=[{HostIp:"127.0.0.1",HostPort:""}];},
  ];
  for(const change of gateways){
    const instances=ok();change(instances[1]);
    assert.throws(()=>verifyRuntimeIsolation(a,instances,net()),/attestation failed/);
  }
});

test("prevents target network drift, gateway extra networks and noninternal target network",()=>{
  let instances=ok();
  instances[0].NetworkSettings.Networks[gatewayNet]={};
  assert.throws(()=>verifyRuntimeIsolation(a,instances,net()),/attestation failed/);
  instances=ok();
  instances[1].NetworkSettings.Networks["bridge"]={};
  assert.throws(()=>verifyRuntimeIsolation(a,instances,net()),/attestation failed/);
  const alteredNet=net();alteredNet[0].Internal=false;
  assert.throws(()=>verifyRuntimeIsolation(a,ok(),alteredNet),/attestation failed/);
  const missingNet=[net()[1]];
  assert.throws(()=>verifyRuntimeIsolation(a,ok(),missingNet),/attestation failed/);
});

test("target secrets never allowed; gateway credentials not returned in attestation",()=>{
  for(const key of ["ETERNYX_MANAGED_GATEWAY_TOKEN","SUPABASE_SERVICE_ROLE_KEY","CTF_RANGE_WORKER_TOKEN"]){
    const instances=ok();instances[0].Config.Env.push(key+"=secret");
    assert.throws(()=>verifyRuntimeIsolation(a,instances,net()),/attestation failed/);
  }
  const result=verifyRuntimeIsolation(a,ok(),net());
  assert.doesNotMatch(JSON.stringify(result),/privately-set|Bearer|secret/i);
});

test("local admission enforces three-lab, 576MiB, 1.95 vCPU reservation envelope",()=>{
  assert.equal(MAX_HOST_LABS,3);
  assert.equal(MAX_HOST_RESERVED_MEMORY_BYTES,576*MIB);
  assert.equal(MAX_HOST_RESERVED_NANO_CPUS,1_950_000_000);
  const other1="cr-"+b.replaceAll("-","");
  const c="323e4567-e89b-42d3-a456-426614174001";
  const other2="cr-"+c.replaceAll("-","");
  const other3="cr-"+"423e4567e89b42d3a456426614174001";
  assert.equal(admitHostLab({existingProjects:[],sessionId:a}).reservedLabsAfter,1);
  assert.equal(admitHostLab({existingProjects:[other1,other2],sessionId:a}).reservedLabsAfter,3);
  assert.throws(()=>admitHostLab({existingProjects:[other1,other2,other3],sessionId:a}),/admission limit/);
  assert.throws(()=>admitHostLab({existingProjects:[project],sessionId:a}),/duplicate/);
  assert.throws(()=>admitHostLab({existingProjects:[other1,other1],sessionId:a}),/duplicate/);
  assert.throws(()=>admitHostLab({existingProjects:["unknown"],sessionId:a}),/Invalid/);
});

test("read-only host audit detects drift without dumping raw inspection or tokens",async()=>{
  const target=container("http-range"),gateway=container("gateway");
  const inspections=[target,gateway];
  const runtime={
    async listVerifiedManagedProjects(){return inspections;},
    async attest(){return {passed:true};},
  };
  const good=await auditHostIsolation(runtime);
  assert.deepEqual(good,{
    inspectedProjects:1,passed:1,drifted:0,results:[{project,passed:true}],
  });
  runtime.attest=async()=>{throw Error("secret-in-host-config");};
  const bad=await auditHostIsolation(runtime);
  assert.deepEqual(bad,{
    inspectedProjects:1,passed:0,drifted:1,
    results:[{project,passed:false,reason:"runtime_isolation_drift"}],
  });
  assert.doesNotMatch(JSON.stringify(bad),/secret-in-host-config/);
});

test("actual Docker admission/audit implementation is integrated and read-only",async()=>{
  const code=await read("infrastructure/cyber-range/provider/docker-runtime.mjs");
  const cmd=await read("scripts/cyber-range-isolation-audit.mjs");
  const packageJson=JSON.parse(await read("package.json"));
  assert.match(code,/await this\.attest\(sessionId\)/);
  assert.match(code,/admitHostLab\(/);
  assert.match(code,/network", "inspect"/);
  assert.match(code,/async attest\(sessionId\)/);
  assert.match(cmd,/auditHostIsolation\(runtime\)/);
  assert.equal(packageJson.scripts["range:audit"],"node scripts/cyber-range-isolation-audit.mjs");
  assert.doesNotMatch(cmd,/\.stop\(|\.start\(|compose up|docker run/);
});
