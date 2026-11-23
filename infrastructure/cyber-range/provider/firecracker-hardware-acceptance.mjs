/**
 * Explicit, local-only KVM acceptance harness. NEVER used from the web app,
 * user RPC, worker, CI runner, or a cloud adapter.
 *
 * It verifies and exercises a pre-staged operator-owned Linux jailer,
 * boots a pinned offline guest through the real Unix Firecracker API,
 * attests its supervisor again, then explicitly stops the VM.
 *
 * No image downloads, namespace creation, public ports, Docker or cloud.
 */
import {lstat} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {probeOfflineGuest} from "./firecracker-guest-probe.mjs";
import {observeIndependentExpiry,requireLocalExpiryDrillApproval} from
  "./firecracker-expiry-drill.mjs";
import {setTimeout as sleep} from "node:timers/promises";
import {validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import {validateMicrovmManifest,assertNoUnverifiedHostedRuntime} from
  "./hosted-readiness.mjs";
import {buildHardenedJailerCommand} from "./firecracker-jailer-contract.mjs";
import {
  firecrackerApiSocket,bootJailedMicrovm,
} from "./firecracker-boot-controller.mjs";
import {
  SystemdMicrovmSupervisor,verifySupervisorHost,
  supervisedVmUnit,
} from "./firecracker-systemd-supervisor.mjs";

const JAIL_BASE="/srv/eternyx-firecracker";
const CONFIRM="I_APPROVE_LOCAL_OFFLINE_KVM_TEST";
const SHA=/^[a-f0-9]{64}$/;

export function requireLocalHardwareApproval({
  env=process.env,platform=process.platform,
  uid=(process.getuid?.()??-1),
}={}){
  if(platform!=="linux" || uid!==0 ||
     env.ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE!==CONFIRM ||
     env.ETERNYX_FIRECRACKER_HOST_EXECUTION!=="operator_approved" ||
     env.ETERNYX_RANGE_OPERATOR_ACK!=="LOCAL_ONLY_NO_PUBLIC_INGRESS") {
    throw Error("Dedicated Linux root operator hardware acceptance is not approved");
  }
  // Never turn on the web provider's hosted runtime as a side effect.
  assertNoUnverifiedHostedRuntime(env);
  return true;
}

export function approvedHardwareManifest({
  kernelSha256,rootfsSha256,
}={}){
  if(!SHA.test(kernelSha256)||!SHA.test(rootfsSha256))
    throw Error("Pinned offline guest SHA-256 digests are mandatory");
  const manifest={
    challengePack:"http-basics-v1",
    image:"eternyx-http-basics-v1",
    virtualization:"firecracker",
    kernelSha256,rootfsSha256,
    vcpus:1,memoryMiB:256,maxRuntimeSeconds:900,
    egressPolicy:"deny-all",metadataAccess:"blocked",
    networkIngress:"vsock-only",rootfsReadOnly:true,
    jailerEnabled:true,snapshotting:"disabled",
  };
  validateMicrovmManifest(manifest);
  return Object.freeze(manifest);
}

function verifyConfig({sessionId,manifest,uid,gid,jailerSha256,firecrackerSha256}={}){
  if(!validSessionId(sessionId)||!SHA.test(jailerSha256)||
     !SHA.test(firecrackerSha256))
    throw Error("Untrusted hardware acceptance identity or executable pins");
  validateMicrovmManifest(manifest);
  buildHardenedJailerCommand({sessionId,manifest,uid,gid});
  return true;
}

export async function auditOfflineHardwareHost({
  sessionId,manifest,uid,gid,jailerSha256,firecrackerSha256,
  hostCheck=verifySupervisorHost,
}={}){
  verifyConfig({sessionId,manifest,uid,gid,jailerSha256,firecrackerSha256});
  if(typeof hostCheck!=="function")throw Error("Invalid trusted host checker");
  const result=await hostCheck({
    sessionId,manifest,jailerSha256,firecrackerSha256,
    jailBase:JAIL_BASE,
  });
  if(result?.verified!==true||result.loopbackOnly!==true||
     result.pinnedHostExecutables!==true||
     result.pinnedGuestImages!==true||
     result.readyForPublicHostedLabs!==false)
    throw Error("Offline host acceptance preflight failed");
  return Object.freeze({
    audited:true,sessionId,offlineOnly:true,guestBooted:false,
    publicLabsEnabled:false,cloudProvisioningAllowed:false,
  });
}

/** Wait for the actual jailed Unix API socket with a bounded local deadline. */
export async function waitForJailedFirecrackerSocket({
  sessionId,jailBase=JAIL_BASE,lookup=lstat,
  pause=(ms,signal)=>sleep(ms,undefined,{signal}),
  signal,
}={}){
  const socket=firecrackerApiSocket(jailBase,sessionId);
  if(jailBase!==JAIL_BASE||typeof lookup!=="function"||
     typeof pause!=="function")throw Error("Untrusted local Firecracker socket probe");
  for(let attempt=0;attempt<30;attempt++){
    if(signal?.aborted)throw Error("Offline guest acceptance was cancelled");
    try{
      const stat=await lookup(socket);
      if(!stat.isSocket())throw Error("Firecracker API socket path was not a socket");
      return socket;
    }catch(e){
      if(e?.code!=="ENOENT")throw e;
    }
    await pause(150,signal);
  }
  throw Error("Jailed Firecracker API socket never became available");
}

/**
 * Explicit, operator-invoked acceptance only. An external systemd service
 * retains a 900s kill deadline even if the Node process exits.
 *
 * No automatic CI invocation, no cloud and no public network. Even success
 * means only an offline local guest boot plus verified teardown, not a
 * production-ready multi-tenant service or real provider bill hard cap.
 */
export async function runOfflineHardwareAcceptance({
  sessionId,manifest,uid,gid,jailerSha256,firecrackerSha256,
  supervisor=new SystemdMicrovmSupervisor(),
  approval={},audit=auditOfflineHardwareHost,
  socketReady=waitForJailedFirecrackerSocket,
  boot=bootJailedMicrovm,
  pause=(ms,signal)=>sleep(ms,undefined,{signal}),
  guestProbeEnabled=false,expiryDrill=false,
  guestProbe=probeOfflineGuest,observeExpiry=observeIndependentExpiry,
  now=()=>performance.now(),
  signal,
}={}){
  verifyConfig({sessionId,manifest,uid,gid,jailerSha256,firecrackerSha256});
  requireLocalHardwareApproval(approval);
  if(guestProbeEnabled!==true&&guestProbeEnabled!==false ||
     expiryDrill!==true&&expiryDrill!==false)
    throw Error("Invalid optional offline acceptance mode");
  if(expiryDrill)requireLocalExpiryDrillApproval(approval);
  if((guestProbeEnabled&&typeof guestProbe!=="function") ||
     (expiryDrill&&(typeof observeExpiry!=="function"||
      typeof supervisor?.verifyTimedOut!=="function")) ||
      typeof now!=="function")
    throw Error("Missing trusted offline guest and expiry verifier");
  if(typeof supervisor?.launchJailer!=="function" ||
     typeof supervisor.attest!=="function" ||
     typeof supervisor.terminate!=="function" ||
     typeof supervisor.verifyDead!=="function" ||
     typeof supervisor.armTimeout!=="function" ||
     typeof audit!=="function" || typeof socketReady!=="function" ||
     typeof boot!=="function" || typeof pause!=="function")
    throw Error("Independent offline KVM supervisor is required");
  if(signal?.aborted)throw Error("Offline KVM acceptance was cancelled");

  // Read-only preflight is intentionally performed before any host mutation.
  await audit({sessionId,manifest,uid,gid,jailerSha256,firecrackerSha256});
  if(signal?.aborted)throw Error("Offline KVM acceptance was cancelled");

  let launched=false;
  let evidence;
  let error;
  try{
    const wallStartMs=now();
    const status=await supervisor.launchJailer({
      sessionId,manifest,uid,gid,jailerSha256,firecrackerSha256,
      retainTimeoutResult:expiryDrill,
    });
    // A service may exist even when its receipt is malformed. Any resolved
    // launch must receive unconditional kill and death verification.
    launched=true;
    if(status?.launched!==true||status.localOnly!==true ||
       status.guestNotBooted!==true ||status.cloudProvisioningAllowed!==false)
      throw Error("Untrusted jailed service launch receipt");
    await socketReady({sessionId,jailBase:JAIL_BASE,signal});
    if(signal?.aborted)throw Error("Offline KVM acceptance was cancelled");
    const bootStatus=await boot({
      sessionId,manifest,jailBase:JAIL_BASE,guardian:supervisor,
    });
    if(bootStatus?.started!==true ||bootStatus.networkInterfaces!==0 ||
       bootStatus.cloudProvisioningAllowed!==false ||
       bootStatus.readyForPublicHostedLabs!==false)
      throw Error("Firecracker offline guest boot did not pass acceptance");
    if(signal?.aborted)throw Error("Offline KVM acceptance was cancelled");
    const live=await supervisor.attest(sessionId);
    if(live?.jailed!==true||live.hostNetworkDenied!==true||
       live.externalWatchdogArmed!==true||live.cgroupEnforced!==true||
       live.cloudProvisioningAllowed!==false)
      throw Error("Live jailed guest lost host isolation attestation");
    // A bounded observation phase tests the guest is still supervised AFTER
    // InstanceStart; it is not a 900s watchdog expiry test.
    await pause(1000,signal);
    if(signal?.aborted)throw Error("Offline KVM acceptance was cancelled");
    // A successful InstanceStart followed immediately by a dead service is
    // not a usable guest. Re-attest after the observation interval as well.
    const observed=await supervisor.attest(sessionId);
    if(observed?.jailed!==true||observed.hostNetworkDenied!==true||
       observed.externalWatchdogArmed!==true||observed.cgroupEnforced!==true||
       observed.cloudProvisioningAllowed!==false)
      throw Error("Offline guest stopped or lost isolation during observation");
    if(guestProbeEnabled){
      const proof=await guestProbe({sessionId,guardian:supervisor,signal});
      if(proof?.guestServiceFunctional!==true ||
         proof.challengeResponseVerified!==true||
         proof.localVsockOnly!==true)
        throw Error("Offline guest service did not respond correctly");
    }
    if(expiryDrill){
      const expiry=await observeExpiry({
        sessionId,supervisor,wallStartMs,signal,now,
      });
      if(expiry?.expiryDrillVerified!==true ||
         expiry.systemdTimeoutResultVerified!==true ||
         expiry.noCgroupDescendants!==true)
        throw Error("Independent systemd watchdog expiry was not proven");
    }
    evidence={
      accepted:true,sessionId,unit:supervisedVmUnit(sessionId),
      bootApiAccepted:true,offlineNetnsAttested:true,
      independentDeadlineSeconds:900,
      localKvmGuestObserved:true,publicLabsEnabled:false,
      cloudProvisioningAllowed:false,providerHardLimitVerified:false,
      ...(guestProbeEnabled?{
        guestServiceFunctional:true,guestChallengeResponseVerified:true,
      }:{}),
      ...(expiryDrill?{
        full900SecondExpiryObserved:true,systemdTimeoutResultVerified:true,
        noCgroupDescendants:true,
      }:{}),
    };
  }catch(e){
    error=e;
  }finally{
    if(launched){
      try{
        await supervisor.terminate(sessionId);
        if(await supervisor.verifyDead(sessionId)!==true)
          throw Error("VM service descendants remain alive");
      }catch{
        // Never report accepted when cleanup cannot be confirmed.
        throw Error("KVM acceptance teardown unproven; immediate operator intervention required");
      }
    }
  }
  if(error)throw Error("Offline KVM hardware acceptance failed; jailed VM cleanup verified");
  return Object.freeze({...evidence,teardownVerified:true});
}
