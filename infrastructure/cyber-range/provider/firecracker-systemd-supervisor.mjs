/**
 * Trusted Linux operator-only systemd supervisor for an OFFLINE Firecracker
 * jailer. This is a real local process runner (no cloud SDK, no Docker,
 * no public listener) with systemd-owned timeout and cgroup lifecycle.
 *
 * It does NOT boot the guest: bootJailedMicrovm() handles actual Firecracker
 * API writes after this supervisor has verified the pre-existing jail.
 * NEVER expose its methods through a browser or user-controlled RPC.
 */
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {constants} from "node:fs";
import {lstat,open,readFile} from "node:fs/promises";
import {join} from "node:path";
import {projectForSession,validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import {buildHardenedJailerCommand} from "./firecracker-jailer-contract.mjs";
import {inspectLocalMicrovmHost} from "./microvm-host-preflight.mjs";
import {verifyJailedBootImages} from "./firecracker-boot-controller.mjs";
import {assertLocalLaunchAllowed} from "./local-kill-switch.mjs";

const EXACT_MAX_SECONDS=900;
const MAX_MEMORY=402653184;
const MAX_TASKS=64;
const SAFE_SHA=/^[a-f0-9]{64}$/;
const FAIL="Independent local microVM supervisor refused an unsafe host or service";
const UNIT_FIELDS=[
  "LoadState","ActiveState","SubState","MainPID","ControlGroup",
  "Transient","Type","KillMode","SendSIGKILL","RuntimeMaxUSec",
  "MemoryMax","TasksMax","CPUQuotaPerSecUSec","Description","ExecStart",
];
const HOST_BINARIES=["/usr/local/bin/jailer","/usr/local/bin/firecracker"];
export function supervisedVmUnit(sessionId){
  if(!validSessionId(sessionId))throw Error("Invalid supervised microVM session");
  return "eternyx-fc-"+projectForSession(sessionId)+".service";
}
export function supervisedNetns(sessionId){
  if(!validSessionId(sessionId))throw Error("Invalid microVM namespace");
  return "eternyx-"+projectForSession(sessionId);
}
export function supervisedUnitSpec(sessionId,manifest,uid,gid){
  const cmd=buildHardenedJailerCommand({sessionId,manifest,uid,gid});
  const unit=supervisedVmUnit(sessionId);
  return Object.freeze({unit,
    executable:"systemd-run",
    argv:Object.freeze([
      "--unit="+unit,"--collect","--service-type=exec",
      "--description=ETERNYX offline microVM "+projectForSession(sessionId),
      "--property=RuntimeMaxSec=900s",
      "--property=KillMode=control-group",
      "--property=SendSIGKILL=yes",
      "--property=TimeoutStopSec=5s",
      "--property=Restart=no",
      "--property=MemoryMax="+MAX_MEMORY,
      "--property=TasksMax="+MAX_TASKS,
      "--property=CPUQuota=100%",
      "--",cmd.binary,...cmd.args,
    ]),
    serviceMaxSeconds:EXACT_MAX_SECONDS,
    killEntireCgroup:true,spawnsPublicListener:false,
    cloudProvisioningAllowed:false,
  });
}
export function parseSystemdUnitShow(output){
  if(typeof output!=="string"||output.length>12_000)
    throw Error("Invalid systemd unit attestation payload");
  const out=Object.create(null);
  for(const line of output.trim().split("\n")){
    if(!line)continue;
    const at=line.indexOf("=");
    if(at<=0)throw Error("Malformed systemd unit properties");
    const name=line.slice(0,at),value=line.slice(at+1);
    if(!UNIT_FIELDS.includes(name)||Object.hasOwn(out,name))
      throw Error("Unexpected or duplicate systemd unit property");
    out[name]=value;
  }
  if(UNIT_FIELDS.some(k=>!Object.hasOwn(out,k)))
    throw Error("Incomplete systemd unit property inspection");
  return out;
}
function max900(value){
  return ["900000000","900000000us","900s","15min","15min 0s"].includes(value);
}
function quota100(value){
  return ["1s","1000000","1000000us","100%"].includes(value);
}
export function verifySystemdUnitProperties(sessionId,output,{allowStopped=false}={}){
  const unit=supervisedVmUnit(sessionId);
  const p=typeof output==="string"?parseSystemdUnitShow(output):output;
  if(!p||typeof p!=="object"||p.Transient!=="yes"||
     p.Description!=="ETERNYX offline microVM "+projectForSession(sessionId)||
     p.KillMode!=="control-group"||p.SendSIGKILL!=="yes"||
     !max900(p.RuntimeMaxUSec) ||
     p.MemoryMax!==String(MAX_MEMORY) ||
     p.TasksMax!==String(MAX_TASKS) ||
     !quota100(p.CPUQuotaPerSecUSec) ||
     p.Type!=="exec" ||
     typeof p.ExecStart!=="string" ||
     !p.ExecStart.includes("path=/usr/local/bin/jailer") ||
     !p.ExecStart.includes("--netns /run/netns/"+supervisedNetns(sessionId)) ||
     !p.ExecStart.includes("--chroot-base-dir /srv/eternyx-firecracker") ||
     !p.ExecStart.includes("--new-pid-ns")){
    throw Error("Systemd microVM unit lacks mandatory runtime hardening");
  }
  if(allowStopped && p.LoadState==="not-found" && p.MainPID==="0")
    return {active:false,unit,deadCandidate:true};
  if(p.LoadState!=="loaded" ||
     !["active","inactive","failed"].includes(p.ActiveState) ||
     !/^(0|[1-9]\d{0,9})$/.test(p.MainPID) ||
     (p.ControlGroup!=="" && !p.ControlGroup.endsWith("/"+unit))){
    throw Error("Systemd microVM identity or cgroup is unverified");
  }
  const active=p.ActiveState==="active" && p.SubState==="running" &&
    Number(p.MainPID)>1 &&
    p.ControlGroup.startsWith("/system.slice/");
  if(!allowStopped&&!active)
    throw Error("Jailed VM systemd unit is not running");
  if(allowStopped&&p.ActiveState!=="active"&&p.MainPID!=="0")
    throw Error("Stopped microVM still has an active main process");
  return {active,unit,mainPid:Number(p.MainPID),cgroup:p.ControlGroup,
    deadlineSeconds:EXACT_MAX_SECONDS};
}
export function verifyLoopbackOnlyNamespace(value){
  let links;
  try{links=typeof value==="string"?JSON.parse(value):value;}
  catch{throw Error("Unverifiable microVM network namespace");}
  if(!Array.isArray(links)||links.length!==1||
     links[0]?.ifname!=="lo" ||
     links[0]?.link_type!=="loopback" ||
     !Array.isArray(links[0].flags) ||
     !links[0].flags.includes("LOOPBACK")){
    throw Error("MicroVM namespace has a non-loopback network interface");
  }
  return true;
}
export function runSupervisorCommand(binary,args,{env=process.env}={}){
  if(!["systemd-run","systemctl","ip"].includes(binary)||
     !Array.isArray(args)||args.some(a=>typeof a!=="string"||
       a.length>256 || a.includes("\0"))){
    throw Error("Unapproved privileged microVM host invocation");
  }
  const sanitized={
    PATH:"/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME:"/root",
  };
  const result=spawnSync(binary,args,{
    shell:false,encoding:"utf8",timeout:10_000,maxBuffer:65_536,
    env:sanitized,stdio:["ignore","pipe","pipe"],
  });
  if(result.error||result.status!==0)
    throw Error("Trusted local microVM host command failed");
  return result.stdout.trim();
}
async function verifyFile(file,expectedSha){
  if(typeof expectedSha!=="string"||!SAFE_SHA.test(expectedSha))
    throw Error("Trusted host executable pin missing");
  const info=await lstat(file);
  if(!info.isFile()||info.uid!==0||info.nlink!==1||
     (info.mode&0o022)!==0||info.size<=0||info.size>80*1024*1024)
    throw Error("Untrusted or mutable host executable");
  const h=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await h.stat();
    const dig=createHash("sha256");
    for await (const chunk of h.createReadStream({autoClose:false}))
      dig.update(chunk);
    const after=await h.stat();
    if(before.ino!==after.ino||before.size!==after.size||
       before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||
       dig.digest("hex")!==expectedSha)
      throw Error("Pinned host executable changed");
  }finally{await h.close();}
}
/** Actual read-only host checks. Does not install anything. */
export async function verifySupervisorHost({
  sessionId,manifest,jailBase="/srv/eternyx-firecracker",
  jailerSha256,firecrackerSha256,
  readOnlyPreflight=inspectLocalMicrovmHost,
  exec=runSupervisorCommand,
}={}){
  if(jailBase!=="/srv/eternyx-firecracker")
    throw Error("Unapproved microVM jail base");
  const caps=await readOnlyPreflight();
  if(caps?.basicHostSupported!==true)
    throw Error("Linux KVM, jailer or cgroup prerequisites unavailable");
  // These immutable pins are operator-supplied, not taken from the learner.
  await verifyFile(HOST_BINARIES[0],jailerSha256);
  await verifyFile(HOST_BINARIES[1],firecrackerSha256);
  const namespace=supervisedNetns(sessionId);
  const path=join("/run/netns",namespace);
  const st=await lstat(path);
  if(!st.isFile()||st.uid!==0||(st.mode&0o022)!==0)
    throw Error("Untrusted network namespace bind mount");
  verifyLoopbackOnlyNamespace(exec("ip",["-j","-n",namespace,"link","show"]));
  await verifyJailedBootImages({sessionId,manifest,jailBase});
  return Object.freeze({
    verified:true,sessionId,loopbackOnly:true,pinnedHostExecutables:true,
    pinnedGuestImages:true,readyForPublicHostedLabs:false,
  });
}
export class SystemdMicrovmSupervisor {
  #execute;
  #preflight;
  #env;
  #platform;
  #uid;
  #fs;
  #launchGate;
  constructor({
    execute=runSupervisorCommand,
    preflight=verifySupervisorHost,
    env=process.env,platform=process.platform,
    uid=(process.getuid?.()??-1),files={readFile,lstat},
    launchGate=assertLocalLaunchAllowed,
  }={}){
    this.#execute=execute;
    this.#preflight=preflight;
    this.#env=env;
    this.#platform=platform;
    this.#uid=uid;
    this.#fs=files;
    this.#launchGate=launchGate;
  }
  #command(name,args){return this.#execute(name,args);}
  #read(sessionId){
    const name=supervisedVmUnit(sessionId);
    return this.#command("systemctl",[
      "show",name,...UNIT_FIELDS.map(p=>"-p"+p),
    ]);
  }
  async #loopback(sessionId){
    return verifyLoopbackOnlyNamespace(this.#command("ip",[
      "-j","-n",supervisedNetns(sessionId),"link","show",
    ]));
  }
  async launchJailer({sessionId,manifest,uid,gid,jailerSha256,
    firecrackerSha256}={}){
    if(this.#platform!=="linux"||this.#uid!==0 ||
       this.#env.ETERNYX_FIRECRACKER_HOST_EXECUTION!=="operator_approved" ||
       this.#env.ETERNYX_RANGE_OPERATOR_ACK!=="LOCAL_ONLY_NO_PUBLIC_INGRESS" ||
       this.#env.ETERNYX_RANGE_RUNTIME==="firecracker"){
      throw Error("Firecracker host launch requires separate local-only root opt-in");
    }
    // No existing public/production provider runtime is activated here.
    const plan=supervisedUnitSpec(sessionId,manifest,uid,gid);
    await this.#launchGate();
    const hostCheck=await this.#preflight({sessionId,manifest,
      jailerSha256,firecrackerSha256,exec:(...args)=>this.#command(...args)});
    if(hostCheck?.verified!==true||hostCheck.loopbackOnly!==true||
       hostCheck.pinnedHostExecutables!==true||hostCheck.pinnedGuestImages!==true||
       hostCheck.readyForPublicHostedLabs!==false)
      throw Error("Host preflight was not independently verified");
    await this.#loopback(sessionId);
    const prior=this.#read(sessionId);
    const props=parseSystemdUnitShow(prior);
    if(props.LoadState!=="not-found")
      throw Error("A previous or foreign VM unit requires operator review");
    await this.#launchGate();
    this.#command(plan.executable,plan.argv);
    try{
      await this.attest(sessionId);
      return Object.freeze({launched:true,unit:plan.unit,
        localOnly:true,guestNotBooted:true,cloudProvisioningAllowed:false});
    }catch{
      // Fail closed, never return success if a service started but cannot be
      // attested. Do not bypass the unit supervisor by PID guessing.
      await this.terminate(sessionId);
      if(await this.verifyDead(sessionId)!==true)
        throw Error("Unverified microVM process teardown");
      throw Error(FAIL);
    }
  }
  async attest(sessionId){
    const state=verifySystemdUnitProperties(sessionId,this.#read(sessionId));
    await this.#loopback(sessionId);
    // A transient systemd unit has an independently enforced lifetime even
    // if this Node process dies. We never rely on a JS setTimeout watchdog.
    return Object.freeze({
      jailed:state.active,supervisorOwned:state.active,
      hostNetworkDenied:true,metadataDenied:true,
      externalWatchdogArmed:state.deadlineSeconds===900,
      cgroupEnforced:true,cloudProvisioningAllowed:false,
    });
  }
  async armTimeout(sessionId,seconds){
    if(seconds!==900)throw Error("VM maximum lifetime cannot be changed");
    const state=await this.attest(sessionId);
    if(state.externalWatchdogArmed!==true)
      throw Error("Independent runtime maximum is not enforced");
    return Object.freeze({armed:true,maxSeconds:900});
  }
  async terminate(sessionId){
    const props=parseSystemdUnitShow(this.#read(sessionId));
    if(props.LoadState==="not-found")
      return {requested:false,unit:supervisedVmUnit(sessionId)};
    // Refuse to stop a foreign unit with a colliding name.
    verifySystemdUnitProperties(sessionId,props,{allowStopped:true});
    this.#command("systemctl",["stop",supervisedVmUnit(sessionId)]);
    return {requested:true,unit:supervisedVmUnit(sessionId)};
  }
  async verifyDead(sessionId){
    const raw=this.#read(sessionId),p=parseSystemdUnitShow(raw);
    if(p.LoadState!=="not-found"){
      const status=verifySystemdUnitProperties(sessionId,p,{allowStopped:true});
      if(status.active)return false;
    }
    // Never trust a stopped MainPID alone; verify the service cgroup has no
    // processes. Cgroup escape and a compromised privileged host are NOT
    // solved by this check and remain future audit gates.
    const path=join("/sys/fs/cgroup/system.slice",supervisedVmUnit(sessionId));
    try{
      const value=await this.#fs.readFile(join(path,"cgroup.procs"),"utf8");
      if(value.trim()!=="")return false;
    }catch(e){
      if(e?.code!=="ENOENT")throw Error("Cannot verify VM cgroup teardown");
    }
    return true;
  }
}
