/**
 * Inspect-based verification for the local/staging HTTP practice range.
 * This is NOT approved isolation for hostile public multi-tenant workloads.
 *
 * Vulnerable target -> private internal bridge -> authenticated gateway
 * -> separate internal bridge -> narrow relay -> loopback host publishing.
 * Only the fixed-destination relay has an external Docker bridge.
 */
import { projectForSession, validSessionId } from "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import { verifyManagedContainer } from "./orphan-watchdog.mjs";

const MIB = 1024 * 1024;
export const MAX_HOST_LABS = 3;
export const MAX_HOST_RESERVED_MEMORY_BYTES = 672 * MIB;
export const MAX_HOST_RESERVED_NANO_CPUS = 2_250_000_000;
const RESOURCE = Object.freeze({
  "http-range": { memory: 128 * MIB, pids: 48, nanoCpus: 400_000_000 },
  gateway: { memory: 64 * MIB, pids: 32, nanoCpus: 250_000_000 },
  ingress: { memory: 32 * MIB, pids: 24, nanoCpus: 100_000_000 },
});
const INVALID = "Managed range isolation attestation failed";
const privateSecret = /^(?:ETERNYX_MANAGED_GATEWAY_TOKEN|CTF_RANGE_WORKER_TOKEN|SUPABASE_[A-Z0-9_]*|RANGE_PROVIDER_API_URL)=/;

export function verifyRuntimeIsolation(sessionId, containers, networks) {
  if (!validSessionId(sessionId) || !Array.isArray(containers) ||
      containers.length !== 3 || !Array.isArray(networks) || networks.length !== 3) {
    throw new Error(INVALID);
  }
  const project = projectForSession(sessionId);
  const targetNetwork = project + "_local_target_only";
  const relayNetwork = project + "_gateway_ingress_only";
  const hostNetwork = project + "_localhost_ingress";
  const expectedNetworks = {
    "http-range": [targetNetwork],
    gateway: [targetNetwork, relayNetwork].sort(),
    ingress: [relayNetwork, hostNetwork].sort(),
  };
  const byService = new Map();

  for (const item of containers) {
    const verified = verifyManagedContainer(item);
    const service = verified.service;
    if (verified.project !== project || byService.has(service)) throw new Error(INVALID);
    byService.set(service,item);
    const host = item.HostConfig;
    const config = item.Config;
    const state = item.State;
    const net = item.NetworkSettings;
    const expected = RESOURCE[service];
    if (!host || !config || !state || !net || !expected ||
        state.Running !== true ||
        config.User !== "10001:10001" ||
        host.Privileged !== false ||
        host.ReadonlyRootfs !== true ||
        host.RestartPolicy?.Name !== "no" ||
        host.Memory !== expected.memory ||
        host.MemorySwap !== expected.memory ||
        host.NanoCpus !== expected.nanoCpus ||
        host.PidsLimit !== expected.pids ||
        host.PublishAllPorts !== false ||
        !Array.isArray(host.CapDrop) || !host.CapDrop.includes("ALL") ||
        (Array.isArray(host.CapAdd) && host.CapAdd.length > 0) ||
        !Array.isArray(host.SecurityOpt) ||
        !host.SecurityOpt.some(v => v === "no-new-privileges:true" || v === "no-new-privileges") ||
        host.SecurityOpt.some(v => typeof v === "string" &&
          /(?:unconfined|privileged|seccomp=disable)/i.test(v)) ||
        (Array.isArray(item.Mounts) && item.Mounts.length > 0) ||
        (Array.isArray(host.Binds) && host.Binds.length > 0) ||
        (Array.isArray(host.Devices) && host.Devices.length > 0) ||
        (Array.isArray(host.ExtraHosts) && host.ExtraHosts.length > 0) ||
        host.PidMode === "host" || host.IpcMode === "host" ||
        host.NetworkMode === "host" || host.UsernsMode === "host" ||
        !net.Networks || typeof net.Networks !== "object") {
      throw new Error(INVALID);
    }
    const joined = Object.keys(net.Networks).sort();
    const permitted = expectedNetworks[service];
    if (joined.length !== permitted.length ||
        joined.some((n,i)=>n !== permitted[i])) throw new Error(INVALID);

    const bindings=host.PortBindings??{};
    if (service !== "ingress") {
      if (Object.keys(bindings).length ||
          Object.values(net.Ports??{}).some(x=>Array.isArray(x) && x.length)) {
        throw new Error(INVALID);
      }
    } else {
      if (Object.keys(bindings).length !== 1 ||
          !Array.isArray(bindings["8081/tcp"]) ||
          bindings["8081/tcp"].length !== 1 ||
          bindings["8081/tcp"][0].HostIp !== "127.0.0.1") {
        throw new Error(INVALID);
      }
      const published=net.Ports?.["8081/tcp"];
      if (!Array.isArray(published) || published.length !== 1 ||
          published[0].HostIp !== "127.0.0.1" ||
          !/^[0-9]{4,5}$/.test(published[0].HostPort) ||
          Number(published[0].HostPort) > 65535 ||
          Object.entries(net.Ports??{}).some(([key,val])=>
            key !== "8081/tcp" && Array.isArray(val) && val.length > 0)) {
        throw new Error(INVALID);
      }
    }
    if (service !== "gateway" &&
        Array.isArray(config.Env) && config.Env.some(v=>privateSecret.test(v))) {
      throw new Error(INVALID);
    }
    if (service === "http-range") {
      const temp=host.Tmpfs??{};
      if (Object.keys(temp).length !== 1 ||
          typeof temp["/tmp"] !== "string" ||
          !["noexec","nosuid","nodev","size=16m"].every(k=>
            temp["/tmp"].split(",").includes(k))) throw new Error(INVALID);
    }
    if (service === "gateway" &&
        (!Array.isArray(config.Env) ||
         !config.Env.some(v=>/^ETERNYX_MANAGED_GATEWAY_TOKEN=[0-9a-f]{64}$/.test(v)))) {
      throw new Error(INVALID);
    }
  }
  for(const name of ["http-range","gateway","ingress"]){
    if(!byService.has(name)) throw new Error(INVALID);
  }
  const byName=new Map();
  for(const network of networks){
    if(!network || typeof network.Name!=="string" || byName.has(network.Name)){
      throw new Error(INVALID);
    }
    byName.set(network.Name,network);
  }
  if (byName.size !== 3 ||
      byName.get(targetNetwork)?.Internal !== true ||
      byName.get(targetNetwork)?.Driver !== "bridge" ||
      byName.get(relayNetwork)?.Internal !== true ||
      byName.get(relayNetwork)?.Driver !== "bridge" ||
      byName.get(hostNetwork)?.Internal !== false ||
      byName.get(hostNetwork)?.Driver !== "bridge") throw new Error(INVALID);

  return Object.freeze({
    project, passed:true, services:3, exposedTargetPorts:0,
    exposedGatewayPorts:0, loopbackRelayPorts:1,
    reservedMemoryBytes:224*MIB, reservedNanoCpus:750_000_000,
    totalPidsLimit:104, privateGatewayNetworks:true,
  });
}

export function admitHostLab({ existingProjects, sessionId }){
  if(!validSessionId(sessionId) || !Array.isArray(existingProjects) ||
     existingProjects.some(p=>typeof p!=="string" || !/^cr-[0-9a-f]{32}$/.test(p)) ||
     new Set(existingProjects).size !== existingProjects.length ||
     existingProjects.includes(projectForSession(sessionId))){
    throw new Error("Invalid or duplicate managed range reservation");
  }
  const after=existingProjects.length+1;
  if(after>MAX_HOST_LABS || after*(224*MIB)>MAX_HOST_RESERVED_MEMORY_BYTES ||
     after*750_000_000>MAX_HOST_RESERVED_NANO_CPUS){
    throw new Error("Local range host resource admission limit reached");
  }
  return { admitted:true, reservedLabsAfter:after,
    reservedMemoryBytesAfter:after*224*MIB,
    reservedNanoCpusAfter:after*750_000_000 };
}

export async function auditHostIsolation(runtime){
  if(!runtime || typeof runtime.listVerifiedManagedProjects!=="function" ||
     typeof runtime.attest!=="function")throw new Error("Invalid local Docker audit runtime");
  const records=await runtime.listVerifiedManagedProjects();
  const projects=[...new Set(records.map(c=>verifyManagedContainer(c).project))].sort();
  const results=[];
  for(const project of projects){
    const validated=verifyManagedContainer(records.find(c=>
      c.Config.Labels["com.docker.compose.project"]===project));
    try{
      await runtime.attest(validated.sessionId);
      results.push({project,passed:true});
    }catch{
      results.push({project,passed:false,reason:"runtime_isolation_drift"});
    }
  }
  return {inspectedProjects:projects.length,
    passed:results.filter(x=>x.passed).length,
    drifted:results.filter(x=>!x.passed).length,results};
}
