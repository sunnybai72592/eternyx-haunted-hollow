/**
 * Offline Firecracker boot controller for an OPERATOR-SUPERVISED jailed VM.
 * The API requests below are real Firecracker API calls over a Unix socket.
 *
 * Does not spawn the jailer, set up cgroups, create cloud instances, publish
 * TCP, install guest images or provide a public cyber range. A separate,
 * independently supervised local host process MUST supply the verified jailer
 * socket and a kill path which survives controller crashes.
 */
import {createHash} from "node:crypto";
import {constants} from "node:fs";
import {open,lstat} from "node:fs/promises";
import {join,resolve,isAbsolute} from "node:path";
import {request as httpRequest} from "node:http";
import {projectForSession,validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import {validateMicrovmManifest} from "./hosted-readiness.mjs";

const API=[
  "/machine-config","/boot-source","/drives/rootfs","/vsock","/actions"
];
const BOOT_ARGS="root=/dev/vda ro init=/sbin/init panic=1 reboot=k quiet 8250.nr_uarts=0";
const MiB=1024*1024;
const CHROOT_FILES={
  kernel:{name:"vmlinux.bin",maxBytes:64*MiB,hash:"kernelSha256"},
  root:{name:"rootfs.ext4",maxBytes:256*MiB,hash:"rootfsSha256"},
};
const failure="MicroVM operator isolation or Firecracker boot verification failed";
const allTrue=x=>x && typeof x==="object" &&
  x.jailed===true && x.supervisorOwned===true &&
  x.hostNetworkDenied===true && x.metadataDenied===true &&
  x.externalWatchdogArmed===true && x.cgroupEnforced===true &&
  x.cloudProvisioningAllowed===false;

export function firecrackerBootPlan(sessionId,manifest){
  if(!validSessionId(sessionId))throw Error("Invalid microVM session");
  validateMicrovmManifest(manifest);
  const digest=createHash("sha256").update(sessionId).digest();
  const cid=(digest.readUInt32BE(0)%2147483644)+3;
  return Object.freeze({
    id:projectForSession(sessionId),guestCid:cid,
    requests:Object.freeze([
      {path:"/machine-config",body:{
        vcpu_count:1,mem_size_mib:256,smt:false,track_dirty_pages:false,
      }},
      {path:"/boot-source",body:{
        kernel_image_path:"/vmlinux.bin",
        boot_args:BOOT_ARGS,
      }},
      {path:"/drives/rootfs",body:{
        drive_id:"rootfs",path_on_host:"/rootfs.ext4",
        is_root_device:true,is_read_only:true,
      }},
      {path:"/vsock",body:{guest_cid:cid,uds_path:"/v.sock"}},
      {path:"/actions",body:{action_type:"InstanceStart"}},
    ]),
    noNetworkInterfaces:true,noMetadataService:true,
    noSnapshots:true,exposedHostPorts:0,externalWatchdogRequired:true,
    maxRuntimeSeconds:900,cloudProvisioningAllowed:false,
  });
}

export function jailedRootPath(jailBase,sessionId){
  if(!validSessionId(sessionId) || typeof jailBase!=="string" ||
     !isAbsolute(jailBase) || resolve(jailBase)!==jailBase ||
     jailBase.includes("\0") || jailBase==="/"){
    throw Error("Invalid trusted jailed root directory");
  }
  return join(jailBase,"firecracker",projectForSession(sessionId),"root");
}

async function shaFile(path,maxBytes){
  // O_NOFOLLOW refuses symlinks to host-owned files. Require stable,
  // immutable, single-link regular image files with bounded sizes.
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await handle.stat();
    if(!before.isFile()||before.nlink!==1||
       before.size<1||before.size>maxBytes||
       (before.mode&0o222)!==0){
      throw Error("MicroVM boot image is mutable or unsafe");
    }
    const hash=createHash("sha256");
    for await(const chunk of handle.createReadStream({autoClose:false})){
      hash.update(chunk);
    }
    const after=await handle.stat();
    if(after.ino!==before.ino || after.dev!==before.dev ||
       after.size!==before.size || after.mtimeMs!==before.mtimeMs ||
       after.ctimeMs!==before.ctimeMs)throw Error("MicroVM boot image changed while verifying");
    return hash.digest("hex");
  }finally{await handle.close();}
}

export async function verifyJailedBootImages({jailBase,sessionId,manifest}={}){
  firecrackerBootPlan(sessionId,manifest);
  const root=jailedRootPath(jailBase,sessionId);
  const dir=await lstat(root);
  if(!dir.isDirectory() || (dir.mode&0o022)!==0)
    throw Error("Untrusted mutable microVM jail root");
  const digests={};
  for(const [key,spec] of Object.entries(CHROOT_FILES)){
    const path=join(root,spec.name);
    digests[key]=await shaFile(path,spec.maxBytes);
    if(digests[key]!==manifest[spec.hash])
      throw Error("MicroVM image SHA-256 pin mismatch");
  }
  return Object.freeze({sessionId,kernelVerified:true,rootfsVerified:true});
}

export function firecrackerApiSocket(jailBase,sessionId){
  return join(jailedRootPath(jailBase,sessionId),"run","firecracker.socket");
}

function exactObject(v,keys){
  return v!==null&&typeof v==="object"&&!Array.isArray(v)&&
    Object.keys(v).sort().join("\0")===keys.sort().join("\0");
}
function allowedFirecrackerBody(path,body){
  switch(path){
    case "/machine-config":
      return exactObject(body,["vcpu_count","mem_size_mib","smt","track_dirty_pages"]) &&
        body.vcpu_count===1&&body.mem_size_mib===256&&
        body.smt===false&&body.track_dirty_pages===false;
    case "/boot-source":
      return exactObject(body,["kernel_image_path","boot_args"])&&
        body.kernel_image_path==="/vmlinux.bin"&&body.boot_args===BOOT_ARGS;
    case "/drives/rootfs":
      return exactObject(body,["drive_id","path_on_host","is_root_device","is_read_only"])&&
        body.drive_id==="rootfs"&&body.path_on_host==="/rootfs.ext4"&&
        body.is_root_device===true&&body.is_read_only===true;
    case "/vsock":
      return exactObject(body,["guest_cid","uds_path"])&&
        Number.isSafeInteger(body.guest_cid)&&body.guest_cid>=3&&
        body.guest_cid<=2147483647&&body.uds_path==="/v.sock";
    case "/actions":
      return exactObject(body,["action_type"])&&
        body.action_type==="InstanceStart";
    default:return false;
  }
}

/** Strict Firecracker API Unix-socket transport; no TCP or DNS fallback. */
export async function sendFirecrackerRequest({
  socketPath,path,body,timeoutMs=2500,
}={}){
  if(typeof socketPath!=="string" || !isAbsolute(socketPath) ||
     !socketPath.endsWith("/run/firecracker.socket") ||
     socketPath.includes("\0") ||
     !API.includes(path) || !allowedFirecrackerBody(path,body) ||
     !Number.isSafeInteger(timeoutMs) ||
     timeoutMs<100 || timeoutMs>5000 || !body ||
     typeof body!=="object" || Array.isArray(body)){
    throw Error("Invalid Firecracker operator API request");
  }
  const wire=JSON.stringify(body);
  if(Buffer.byteLength(wire)>2048)
    throw Error("Oversized Firecracker operator API request");
  const stat=await lstat(socketPath);
  if(!stat.isSocket())throw Error("Expected a jailed Unix API socket");
  return new Promise((resolve,reject)=>{
    const req=httpRequest({
      socketPath,path,method:"PUT",timeout:timeoutMs,
      headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(wire)},
      agent:false,
    },response=>{
      let used=0;
      response.on("data",chunk=>{
        used+=chunk.length;
        if(used>8192)req.destroy(Error("Firecracker API response too large"));
      });
      response.on("end",()=>{
        if(response.statusCode!==204)
          reject(Error("Firecracker API rejected restricted boot configuration"));
        else resolve({applied:true,path,status:204});
      });
      response.on("error",reject);
    });
    req.on("timeout",()=>req.destroy(Error("Firecracker API timed out")));
    req.on("error",()=>reject(Error("Firecracker jailed API connection failed")));
    req.end(wire);
  });
}

function checkSupervisor(guardian){
  return guardian && ["attest","armTimeout","terminate","verifyDead"]
    .every(k=>typeof guardian[k]==="function");
}

/**
 * Run the real VM configuration sequence ONLY against a previously launched
 * jailed, externally watched Firecracker instance. The independent operator
 * supervisor owns all PIDs, cgroups, namespaces and timeout enforcement.
 * Host and guest images are verified before even the first API write.
 */
export async function bootJailedMicrovm({
  sessionId,manifest,jailBase,guardian,
  send=sendFirecrackerRequest,
}={}){
  const plan=firecrackerBootPlan(sessionId,manifest);
  if(!checkSupervisor(guardian)||typeof send!=="function")
    throw Error("Independent VM teardown supervisor is mandatory");
  const state=await guardian.attest(sessionId);
  if(!allTrue(state))throw Error("Host jailer and independent kill controls unverified");
  let started=false;
  try{
    // The jailer is already live when the supervisor attests successfully.
    // Even a missing/changed image or failed watchdog arming must terminate
    // that service; otherwise it remains alive until its systemd deadline.
    await verifyJailedBootImages({jailBase,sessionId,manifest});
    const socket=firecrackerApiSocket(jailBase,sessionId);
    const armed=await guardian.armTimeout(sessionId,900);
    if(armed?.armed!==true || armed?.maxSeconds!==900)
      throw Error("Independent 900-second VM kill deadline is unavailable");
    for(const action of plan.requests){
      // Attest again before each configuration write; no user-supplied
      // endpoint, IP, VM size or launch action is ever accepted.
      if(!allTrue(await guardian.attest(sessionId)))
        throw Error("VM operator attestation changed");
      const result=await send({socketPath:socket,
        path:action.path,body:action.body,timeoutMs:2500});
      if(result?.applied!==true || result.status!==204)
        throw Error("Unverified Firecracker configuration response");
      if(action.path==="/actions")started=true;
    }
    return Object.freeze({started,sessionId,
      guestCid:plan.guestCid,networkInterfaces:0,
      noPublicIngress:true,externalWatchdogRequired:true,
      cloudProvisioningAllowed:false,readyForPublicHostedLabs:false});
  }catch{
    // Even a partly configured VM is dangerous if the start response was
    // lost. Do not try to guess whether it booted: force supervisor cleanup.
    try{
      await guardian.terminate(sessionId);
      if(await guardian.verifyDead(sessionId)!==true)throw Error("VM still alive");
    }catch{throw Error("MicroVM teardown not proven; operator intervention required");}
    throw Error(failure);
  }
}

export async function terminateJailedMicrovm({sessionId,guardian}={}){
  if(!validSessionId(sessionId)||!checkSupervisor(guardian))
    throw Error("Invalid microVM termination owner");
  await guardian.terminate(sessionId);
  if(await guardian.verifyDead(sessionId)!==true)
    throw Error("MicroVM teardown not proven; operator intervention required");
  return Object.freeze({sessionId,terminated:true});
}
