/**
 * Runtime attestations for the Linux operator-managed training range.
 * ALL lab Docker containers use internal bridges with ZERO published ports.
 * The only HTTP listener on the host belongs to the trusted Node operator.
 *
 * Docker internal networks alone are not a multi-tenant kernel isolation
 * guarantee; public hosted labs still require microVM/host isolation.
 */
import { projectForSession, validSessionId } from "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import { verifyManagedContainer } from "./orphan-watchdog.mjs";
const MIB=1024*1024;
export const MAX_HOST_LABS=3;
export const MAX_HOST_RESERVED_MEMORY_BYTES=576*MIB;
export const MAX_HOST_RESERVED_NANO_CPUS=1_950_000_000;
const RESOURCE=Object.freeze({
  "http-range":{memory:128*MIB,pids:48,nanoCpus:400_000_000},
  gateway:{memory:64*MIB,pids:32,nanoCpus:250_000_000},
});
const FAILURE="Managed range isolation attestation failed";
const secret=/^(?:ETERNYX_MANAGED_GATEWAY_TOKEN|CTF_RANGE_WORKER_TOKEN|SUPABASE_[A-Z0-9_]*|RANGE_PROVIDER_API_URL)=/;

export function verifyRuntimeIsolation(sessionId,containers,networks){
  if(!validSessionId(sessionId)||!Array.isArray(containers)||
      containers.length!==2||!Array.isArray(networks)||networks.length!==2)
    throw Error(FAILURE);
  const project=projectForSession(sessionId);
  const targetNet=project+"_local_target_only";
  const gatewayNet=project+"_gateway_ingress_only";
  const expectedNetworks={
    "http-range":[targetNet],
    gateway:[targetNet,gatewayNet].sort(),
  };
  const seen=new Set();
  for(const container of containers){
    const verified=verifyManagedContainer(container);
    const svc=verified.service;
    const host=container.HostConfig;
    const config=container.Config;
    const runtime=container.State;
    const net=container.NetworkSettings;
    const resource=RESOURCE[svc];
    if(verified.project!==project||!resource||seen.has(svc)||!host||
        !config||!runtime||!net||runtime.Running!==true||
        config.User!=="10001:10001"||
        host.Privileged!==false||host.ReadonlyRootfs!==true||
        host.RestartPolicy?.Name!=="no"||host.Memory!==resource.memory||
        host.MemorySwap!==resource.memory||host.NanoCpus!==resource.nanoCpus||
        host.PidsLimit!==resource.pids||host.PublishAllPorts!==false||
        !Array.isArray(host.CapDrop)||!host.CapDrop.includes("ALL")||
        (Array.isArray(host.CapAdd)&&host.CapAdd.length!==0)||
        !Array.isArray(host.SecurityOpt)||
        !host.SecurityOpt.some(x=>x==="no-new-privileges:true"||x==="no-new-privileges")||
        host.SecurityOpt.some(x=>typeof x==="string"&&
          /unconfined|privileged|seccomp=disable/i.test(x))||
        (Array.isArray(container.Mounts)&&container.Mounts.length!==0)||
        (Array.isArray(host.Binds)&&host.Binds.length!==0)||
        (Array.isArray(host.Devices)&&host.Devices.length!==0)||
        (Array.isArray(host.ExtraHosts)&&host.ExtraHosts.length!==0)||
        ["host"].includes(host.PidMode)||["host"].includes(host.IpcMode)||
        ["host"].includes(host.NetworkMode)||host.UsernsMode==="host"||
        !net.Networks||typeof net.Networks!=="object"){
      throw Error(FAILURE);
    }
    seen.add(svc);
    const joins=Object.keys(net.Networks).sort();
    const expected=expectedNetworks[svc];
    if(joins.length!==expected.length||joins.some((n,i)=>n!==expected[i]))
      throw Error(FAILURE);
    const bindings=host.PortBindings??{};
    if(Object.keys(bindings).length ||
       Object.values(net.Ports??{}).some(x=>Array.isArray(x)&&x.length>0))
      throw Error(FAILURE);
    if(svc!=="gateway"&&Array.isArray(config.Env)&&config.Env.some(v=>secret.test(v)))
      throw Error(FAILURE);
    if(svc==="gateway"&&(!Array.isArray(config.Env)||
       !config.Env.some(v=>/^ETERNYX_MANAGED_GATEWAY_TOKEN=[a-f0-9]{64}$/.test(v))))
      throw Error(FAILURE);
    if(svc==="http-range"){
      const tmp=host.Tmpfs??{};
      if(Object.keys(tmp).length!==1||typeof tmp["/tmp"]!=="string"||
         !["noexec","nosuid","nodev","size=16m"].every(x=>tmp["/tmp"].split(",").includes(x)))
        throw Error(FAILURE);
    }
  }
  if(!seen.has("http-range")||!seen.has("gateway"))throw Error(FAILURE);
  const byName=new Map();
  for(const n of networks){
    if(!n||typeof n.Name!=="string"||byName.has(n.Name))throw Error(FAILURE);
    byName.set(n.Name,n);
  }
  if(byName.size!==2||[targetNet,gatewayNet].some(name=>
    byName.get(name)?.Internal!==true||byName.get(name)?.Driver!=="bridge"))
    throw Error(FAILURE);
  return Object.freeze({
    project,passed:true,services:2,
    publishedDockerPorts:0,internalNetworks:2,
    reservedMemoryBytes:192*MIB,reservedNanoCpus:650_000_000,
    totalPidsLimit:80,hostIngressRequired:true,
  });
}

export function admitHostLab({existingProjects,sessionId}){
  if(!validSessionId(sessionId)||!Array.isArray(existingProjects)||
     existingProjects.some(p=>typeof p!=="string"||!/^cr-[0-9a-f]{32}$/.test(p))||
     new Set(existingProjects).size!==existingProjects.length||
     existingProjects.includes(projectForSession(sessionId)))
    throw Error("Invalid or duplicate managed range reservation");
  const next=existingProjects.length+1;
  if(next>MAX_HOST_LABS||next*192*MIB>MAX_HOST_RESERVED_MEMORY_BYTES||
     next*650_000_000>MAX_HOST_RESERVED_NANO_CPUS)
    throw Error("Local range host resource admission limit reached");
  return {admitted:true,reservedLabsAfter:next,
    reservedMemoryBytesAfter:next*192*MIB,
    reservedNanoCpusAfter:next*650_000_000};
}

export async function auditHostIsolation(runtime){
  if(!runtime||typeof runtime.listVerifiedManagedProjects!=="function"||
     typeof runtime.attest!=="function")throw Error("Invalid local Docker audit runtime");
  const records=await runtime.listVerifiedManagedProjects();
  const projects=[...new Set(records.map(c=>verifyManagedContainer(c).project))].sort();
  const results=[];
  for(const project of projects){
    const item=records.find(c=>c.Config.Labels["com.docker.compose.project"]===project);
    const validated=verifyManagedContainer(item);
    try{await runtime.attest(validated.sessionId);results.push({project,passed:true});}
    catch{results.push({project,passed:false,reason:"runtime_isolation_drift"});}
  }
  return {inspectedProjects:projects.length,
    passed:results.filter(x=>x.passed).length,
    drifted:results.filter(x=>!x.passed).length,results};
}
