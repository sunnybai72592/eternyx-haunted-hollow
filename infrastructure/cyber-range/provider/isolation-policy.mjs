/**
 * Strict, operator-local runtime isolation attestation for the managed HTTP
 * practice range. This is NOT a multi-tenant container escape guarantee:
 * untrusted public workloads require a separately audited VM/microVM boundary.
 *
 * All user-visible errors are constant/sanitized: never print Docker inspect
 * output, environment secrets, target content, or arbitrary host paths.
 */
import { projectForSession, validSessionId } from "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import { verifyManagedContainer } from "./orphan-watchdog.mjs";

const MIB = 1024 * 1024;
export const MAX_HOST_LABS = 3;
export const MAX_HOST_RESERVED_MEMORY_BYTES = 576 * MIB;
export const MAX_HOST_RESERVED_NANO_CPUS = 1_950_000_000;
const RESOURCE = Object.freeze({
  "http-range": { memory: 128 * MIB, pids: 48, nanoCpus: 400_000_000 },
  gateway: { memory: 64 * MIB, pids: 32, nanoCpus: 250_000_000 },
});
const INVALID = "Managed range isolation attestation failed";

export function verifyRuntimeIsolation(sessionId, containers, networks) {
  if (!validSessionId(sessionId) ||
      !Array.isArray(containers) || containers.length !== 2 ||
      !Array.isArray(networks) || networks.length !== 2) {
    throw new Error(INVALID);
  }
  const project = projectForSession(sessionId);
  const targetNetwork = project + "_local_target_only";
  const ingressNetwork = project + "_localhost_ingress";
  const byService = new Map();

  for (const item of containers) {
    const verified = verifyManagedContainer(item);
    if (verified.project !== project || byService.has(verified.service)) throw new Error(INVALID);
    byService.set(verified.service, item);

    const host = item.HostConfig;
    const config = item.Config;
    const state = item.State;
    const net = item.NetworkSettings;
    const expected = RESOURCE[verified.service];
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
        !Array.isArray(host.CapDrop) ||
        !host.CapDrop.includes("ALL") ||
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

    const attached = Object.keys(net.Networks).sort();
    const allowed = verified.service === "http-range"
      ? [targetNetwork] : [targetNetwork, ingressNetwork].sort();
    if (attached.length !== allowed.length ||
        attached.some((name,i)=>name !== allowed[i])) throw new Error(INVALID);

    const bindings = host.PortBindings ?? {};
    if (verified.service === "http-range") {
      if (Object.keys(bindings).length > 0) throw new Error(INVALID);
      if (Object.values(net.Ports ?? {}).some(v=>Array.isArray(v) && v.length > 0)) {
        throw new Error(INVALID);
      }
      if (Array.isArray(config.Env) && config.Env.some(v=>
        /^(?:ETERNYX_MANAGED_GATEWAY_TOKEN|CTF_RANGE_WORKER_TOKEN|SUPABASE_[A-Z0-9_]*|RANGE_PROVIDER_API_URL)=/.test(v))) {
        throw new Error(INVALID);
      }
      const tmpfs = host.Tmpfs ?? {};
      if (Object.keys(tmpfs).length !== 1 || typeof tmpfs["/tmp"] !== "string" ||
          !["noexec", "nosuid", "nodev", "size=16m"].every(flag=>
            tmpfs["/tmp"].split(",").includes(flag))) {
        throw new Error(INVALID);
      }
    } else {
      if (Object.keys(bindings).length !== 1 || !Array.isArray(bindings["8081/tcp"]) ||
          bindings["8081/tcp"].length !== 1 ||
          bindings["8081/tcp"][0].HostIp !== "127.0.0.1") throw new Error(INVALID);
      const published = net.Ports?.["8081/tcp"];
      if (!Array.isArray(published) || published.length !== 1 ||
          published[0].HostIp !== "127.0.0.1" ||
          !/^[0-9]{4,5}$/.test(published[0].HostPort) ||
          Number(published[0].HostPort) > 65535 ||
          Object.entries(net.Ports ?? {}).some(([key,v]) =>
            key !== "8081/tcp" && Array.isArray(v) && v.length > 0)) {
        throw new Error(INVALID);
      }
    }
  }
  if (!byService.has("http-range") || !byService.has("gateway")) throw new Error(INVALID);
  const byName = new Map();
  for (const n of networks) {
    if (!n || typeof n.Name !== "string" || byName.has(n.Name)) throw new Error(INVALID);
    byName.set(n.Name, n);
  }
  if (byName.size !== 2 ||
      byName.get(targetNetwork)?.Internal !== true ||
      byName.get(targetNetwork)?.Driver !== "bridge" ||
      byName.get(ingressNetwork)?.Driver !== "bridge") {
    throw new Error(INVALID);
  }
  // Ingress network egress is NOT blocked by this policy. Never claim this
  // is sufficient for running hostile internet-facing multi-tenant targets.
  return Object.freeze({
    project, passed: true,
    services: 2, exposedTargetPorts: 0, loopbackGatewayPorts: 1,
    reservedMemoryBytes: RESOURCE["http-range"].memory + RESOURCE.gateway.memory,
    reservedNanoCpus: RESOURCE["http-range"].nanoCpus + RESOURCE.gateway.nanoCpus,
    totalPidsLimit: RESOURCE["http-range"].pids + RESOURCE.gateway.pids,
    targetInternalNetwork: true,
  });
}

export function admitHostLab({ existingProjects, sessionId }) {
  if (!validSessionId(sessionId) || !Array.isArray(existingProjects) ||
      existingProjects.some(p=>typeof p !== "string" || !/^cr-[0-9a-f]{32}$/.test(p)) ||
      new Set(existingProjects).size !== existingProjects.length ||
      existingProjects.includes(projectForSession(sessionId))) {
    throw new Error("Invalid or duplicate managed range reservation");
  }
  const after = existingProjects.length + 1;
  if (after > MAX_HOST_LABS ||
      after * (192 * MIB) > MAX_HOST_RESERVED_MEMORY_BYTES ||
      after * 650_000_000 > MAX_HOST_RESERVED_NANO_CPUS) {
    throw new Error("Local range host resource admission limit reached");
  }
  return { admitted: true, reservedLabsAfter: after,
    reservedMemoryBytesAfter: after * 192 * MIB,
    reservedNanoCpusAfter: after * 650_000_000 };
}

export async function auditHostIsolation(runtime) {
  if (!runtime || typeof runtime.listVerifiedManagedProjects !== "function" ||
      typeof runtime.attest !== "function") {
    throw new Error("Invalid local Docker audit runtime");
  }
  const records = await runtime.listVerifiedManagedProjects();
  const projects = [...new Set(records.map(c=>
    verifyManagedContainer(c).project))].sort();
  const results = [];
  for (const project of projects) {
    const validated = verifyManagedContainer(records.find(c=>
      c.Config.Labels["com.docker.compose.project"] === project));
    try {
      await runtime.attest(validated.sessionId);
      results.push({ project, passed: true });
    } catch {
      results.push({ project, passed: false, reason: "runtime_isolation_drift" });
    }
  }
  return { inspectedProjects: projects.length,
    passed: results.filter(x=>x.passed).length,
    drifted: results.filter(x=>!x.passed).length, results };
}
