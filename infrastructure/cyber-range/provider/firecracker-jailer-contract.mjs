/**
 * Pure, non-executing Firecracker jailer argument contract.
 * An independently privileged Linux host supervisor must prepare per-VM
 * network namespace, uid/gid, pinned binaries, chroot resources and cgroups.
 * This module NEVER spawns the jailer or configures a host network.
 */
import {projectForSession,validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import {validateMicrovmManifest} from "./hosted-readiness.mjs";

export function buildHardenedJailerCommand({
  sessionId,manifest,uid,gid,
  binary="/usr/local/bin/jailer",
  firecracker="/usr/local/bin/firecracker",
  jailBase="/srv/eternyx-firecracker",
}={}){
  if(!validSessionId(sessionId) ||
     !Number.isSafeInteger(uid)||uid<20000||uid>60000||
     !Number.isSafeInteger(gid)||gid<20000||gid>60000||
     binary!=="/usr/local/bin/jailer" ||
     firecracker!=="/usr/local/bin/firecracker" ||
     jailBase!=="/srv/eternyx-firecracker"){
    throw Error("Untrusted Firecracker jailer execution contract");
  }
  validateMicrovmManifest(manifest);
  const id=projectForSession(sessionId);
  const args=[
    "--id",id,"--exec-file",firecracker,
    "--uid",String(uid),"--gid",String(gid),
    "--chroot-base-dir",jailBase,
    "--netns","/run/netns/eternyx-"+id,
    "--cgroup-version","2",
    "--cgroup","memory.max=402653184",
    "--cgroup","pids.max=64",
    "--cgroup","cpu.max=100000 100000",
    "--resource-limit","fsize=16777216",
    "--resource-limit","no-file=256",
    "--new-pid-ns",
    "--","--api-sock","/run/firecracker.socket",
  ];
  return Object.freeze({
    binary,args:Object.freeze(args),sessionId,
    noDaemonize:true,uniqueUidGidMustBeEnforcedByHost:true,
    preparedNamespaceRequired:true,
    pinnedJailerBinaryMustBeVerifiedByHost:true,
    watchdogMustSurviveOperatorExit:true,
    spawnsProcess:false,cloudProvisioningAllowed:false,
  });
}
