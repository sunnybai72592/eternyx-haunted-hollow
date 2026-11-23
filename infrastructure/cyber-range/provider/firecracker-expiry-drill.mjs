/**
 * Manual-only 900-second systemd expiry observation, never launched by CI.
 * Does not stop, kill or extend a VM. The supervising systemd unit must
 * independently expire; a controller stop is only used in the caller's
 * finally cleanup if needed.
 */
import {performance} from "node:perf_hooks";
import {setTimeout as sleep} from "node:timers/promises";
import {validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const LIVE_CHECK_MS=840_000;
const LAST_LIVE_MS=870_000;
const DEAD_NOT_BEFORE_MS=890_000;
const DEAD_DEADLINE_MS=935_000;

export function requireLocalExpiryDrillApproval({
  env=process.env,platform=process.platform,
  uid=process.getuid?.()??-1,
}={}){
  if(platform!=="linux"||uid!==0 ||
     env.ETERNYX_FIRECRACKER_EXPIRY_DRILL!==
       "I_APPROVE_LOCAL_900_SECOND_WATCHDOG_DRILL" ||
     env.ETERNYX_FIRECRACKER_HOST_EXECUTION!=="operator_approved" ||
     env.ETERNYX_RANGE_OPERATOR_ACK!=="LOCAL_ONLY_NO_PUBLIC_INGRESS")
    throw Error("Manual 900-second watchdog drill is not approved");
  return true;
}
function live(x){
  return x?.jailed===true&&x?.supervisorOwned===true&&
    x?.hostNetworkDenied===true&&x?.metadataDenied===true&&
    x?.externalWatchdogArmed===true&&x?.cgroupEnforced===true&&
    x?.cloudProvisioningAllowed===false;
}
/**
 * wallStartMs is measured before launchJailer, so elapsed time is an upper
 * bound for the unit runtime. Verify Result=timeout in systemd, not just
 * MainPID=0, before returning an accepted drill result.
 */
export async function observeIndependentExpiry({
  sessionId,supervisor,wallStartMs,
  now=()=>performance.now(),
  pause=(ms,signal)=>sleep(ms,undefined,{signal}),
  signal,
}={}){
  if(!validSessionId(sessionId)||typeof supervisor?.attest!=="function"||
     typeof supervisor?.verifyDead!=="function"||
     typeof supervisor?.verifyTimedOut!=="function"||
     typeof now!=="function"||typeof pause!=="function"||
     !Number.isFinite(wallStartMs))
    throw Error("Invalid independent expiry verifier");
  const elapsed=()=>now()-wallStartMs;
  async function waitUntil(target){
    while(elapsed()<target){
      if(signal?.aborted)throw Error("Watchdog drill cancelled");
      await pause(Math.min(20_000,target-elapsed()),signal);
    }
  }
  await waitUntil(LIVE_CHECK_MS);
  if(signal?.aborted||elapsed()>LAST_LIVE_MS ||
     await supervisor.verifyDead(sessionId) ||
     !live(await supervisor.attest(sessionId)))
    throw Error("MicroVM did not remain isolated and alive near watchdog expiry");
  while(elapsed()<=DEAD_DEADLINE_MS){
    if(signal?.aborted)throw Error("Watchdog drill cancelled");
    const dead=await supervisor.verifyDead(sessionId);
    if(dead){
      if(elapsed()<DEAD_NOT_BEFORE_MS||
         await supervisor.verifyTimedOut(sessionId)!==true)
        throw Error("MicroVM died without independently proven systemd timeout");
      return Object.freeze({expiryDrillVerified:true,
        systemdTimeoutResultVerified:true,
        noCgroupDescendants:true,publicLabsEnabled:false});
    }
    await pause(5000,signal);
  }
  throw Error("MicroVM outlived independent 900-second deadline");
}
