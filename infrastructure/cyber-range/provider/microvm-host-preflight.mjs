/**
 * Non-destructive Firecracker host capability probe. It reads OS state; it
 * never downloads a binary, starts a virtual machine or opens cloud accounts.
 *
 * KVM and jailer existence do NOT prove isolation, network firewall control,
 * hypervisor version safety, image provenance, or operational readiness.
 */
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const isAvailable=async(path,mode)=>{
  try { await access(path,mode);return true; }
  catch { return false; }
};

export function evaluateMicrovmHostCapabilities(caps) {
  const keys=["archSupported","cgroupV2Available","cpuVirtAvailable",
    "firecrackerExecutable","jailerExecutable","kvmReadWrite",
    "linuxHost"].sort();
  if(!caps||typeof caps!=="object"||Array.isArray(caps)||
     Object.keys(caps).sort().join("\0")!==keys.join("\0")||
     !Object.values(caps).every(v=>typeof v==="boolean")) {
    throw Error("Invalid microVM host capability snapshot");
  }
  const basicHostSupported=Object.values(caps).every(Boolean);
  return Object.freeze({
    ...caps,basicHostSupported,
    sandboxAttested:false,
    networkEgressPolicyAttested:false,
    providerCostEnforcementAttested:false,
    readyForPublicHostedLabs:false,
  });
}

export async function inspectLocalMicrovmHost({
  platform=process.platform,arch=process.arch,
  files={readFile,access},
}={}) {
  if(!files||typeof files.readFile!=="function"||typeof files.access!=="function")
    throw Error("Invalid read-only host probe");
  async function present(path,mode) {
    try{await files.access(path,mode);return true;}
    catch{return false;}
  }
  async function read(path) {
    try{return await files.readFile(path,"utf8");}
    catch{return "";}
  }
  const cpus=await read("/proc/cpuinfo");
  const cgroups=await read("/sys/fs/cgroup/cgroup.controllers");
  return evaluateMicrovmHostCapabilities({
    linuxHost:platform==="linux",
    archSupported:["x64","arm64"].includes(arch),
    cpuVirtAvailable:/(^|\n)\s*flags\s*:[^\n]*\b(vmx|svm)\b/m.test(cpus) ||
      /(^|\n)\s*Features\s*:[^\n]*\bvirt\b/m.test(cpus),
    kvmReadWrite:await present("/dev/kvm",constants.R_OK|constants.W_OK),
    cgroupV2Available:cgroups.trim().length>0,
    firecrackerExecutable:await present("/usr/local/bin/firecracker",constants.X_OK),
    jailerExecutable:await present("/usr/local/bin/jailer",constants.X_OK),
  });
}
