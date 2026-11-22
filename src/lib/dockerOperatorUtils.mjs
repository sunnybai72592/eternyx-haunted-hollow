// ETERNYX: pure validators for real, trusted-operator Docker actions.
export const DOCKER_ID = /^[a-f0-9]{64}$/;
export const MANAGED_LABEL = "io.eternyx.operator.managed";
export const SCOPE_LABEL = "io.eternyx.operator.scope";
const mutations = new Set(["start", "stop", "restart"]);
const one = new Set(["inspect", "stats", "logs"]);
export function parseOperatorArgs(args) {
  if (args.length === 0 || args.length === 1 && args[0] === "--help") return { action: "help" };
  const [action,id,flag,confirmation] = args;
  if (["list","images"].includes(action) && args.length === 1) return { action };
  if ((one.has(action) || mutations.has(action)) && DOCKER_ID.test(id || "")) {
    if (args.length === 2) return { action, id, confirmed: false };
    if (mutations.has(action) && args.length === 4 && flag === "--confirm" && confirmation === id) return { action, id, confirmed: true };
  }
  throw new Error("Unsupported operation, flags or ID. Supply a complete 64-character lowercase container ID.");
}
export function isLocalEndpoint(endpoint) {
  return typeof endpoint === "string" && (/^unix:\/\/\/[^ \r\n]+$/.test(endpoint) || /^npipe:\/\/\/\/\.\/pipe\/[^ \r\n]+$/i.test(endpoint));
}
export function jsonRows(data, maximum = 100) {
  if (typeof data !== "string" || data.length > 524288) throw new Error("Oversized Docker response.");
  if (!data.trim()) return [];
  const lines=data.trim().split(/\r?\n/);
  if (lines.length > maximum) throw new Error("Docker response has too many entries.");
  return lines.map(line => {
    let value;
    try { value=JSON.parse(line); } catch { throw new Error("Invalid Docker JSON row."); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Docker inventory object.");
    return value;
  });
}
const safe = (x,n=160) => typeof x === "string" ? x.slice(0,n) : "";
export function safeList(rows) {
  return rows.map(x=>({id:safe(x.ID,64),name:safe(x.Names),image:safe(x.Image),state:safe(x.State,35),status:safe(x.Status)}));
}
export function safeImages(rows) {
  return rows.map(x=>({id:safe(x.ID,100),repository:safe(x.Repository),tag:safe(x.Tag,100),size:safe(x.Size,60)}));
}
export function safeStats(rows) {
  return rows.map(x=>({id:safe(x.ID,64),cpu:safe(x.CPUPerc,24),memory:safe(x.MemUsage,80),memoryPercent:safe(x.MemPerc,24),network:safe(x.NetIO,80),pids:safe(x.PIDs,24)}));
}
export function safeInspect(obj) {
  return {id:safe(obj.Id,64),name:safe(obj.Name),image:safe(obj.Config?.Image),state:safe(obj.State?.Status,35),health:safe(obj.State?.Health?.Status,35),readOnly:obj.HostConfig?.ReadonlyRootfs===true,managed:obj.Config?.Labels?.[MANAGED_LABEL]==="true"};
}
export function verifyManagedTarget(obj,id) {
  const deny=(reason)=>{throw new Error("Docker lifecycle denied: "+reason);};
  if (!DOCKER_ID.test(id) || obj?.Id!==id) deny("container identity mismatch");
  if (obj.Config?.Labels?.[MANAGED_LABEL]!=="true" || obj.Config?.Labels?.[SCOPE_LABEL]!=="local-workbench") deny("target lacks required local lab labels");
  const c=obj.Config || {}, h=obj.HostConfig || {};
  if (h.Privileged!==false || h.ReadonlyRootfs!==true) deny("privileged or writable-root target");
  if (h.NetworkMode!=="none") deny("networked container is not a restricted local lab");
  if (h.Binds?.length || obj.Mounts?.length || Object.keys(h.PortBindings||{}).length) deny("mounts or published ports");
  if (["PidMode","IpcMode","CgroupnsMode","UsernsMode","UTSMode"].some(key=>h[key]==="host")) deny("host namespace");
  if (h.CapAdd?.length || h.Devices?.length || h.DeviceRequests?.length) deny("devices or added privileges");
  if (!h.CapDrop?.includes("ALL") || !h.SecurityOpt?.some(x=>x==="no-new-privileges" || x==="no-new-privileges:true")) deny("missing hardening options");
  if (!/^[1-9]\d*(?::\d+)?$/.test(c.User||"")) deny("missing numeric non-root user");
  if (!Number.isSafeInteger(h.PidsLimit) || h.PidsLimit<=0 || !Number.isSafeInteger(h.Memory) || h.Memory<=0) deny("missing resource limits");
  if (h.RestartPolicy?.Name && h.RestartPolicy.Name!=="no") deny("automatic restarts prohibited");
  return { id, name:safe(obj.Name) };
}
