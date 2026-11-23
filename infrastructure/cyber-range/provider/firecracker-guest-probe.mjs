/**
 * Optional OPERATOR-ONLY proof that a pinned offline guest service can respond
 * over Firecracker's local vsock UDS. Never a public web or hosted API.
 *
 * This is NOT a cryptographic attestation. A compromised host or listener can
 * impersonate the guest; external image provenance must be established apart.
 */
import {createHash,randomBytes} from "node:crypto";
import {lstat} from "node:fs/promises";
import {createConnection} from "node:net";
import {join} from "node:path";
import {validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import {jailedRootPath} from "./firecracker-boot-controller.mjs";

const BASE="/srv/eternyx-firecracker";
export const GUEST_PROBE_PORT=5501;
const PROTOCOL="eternyx-guest-smoke-v1";
const HEX=/^[a-f0-9]{64}$/;
const MAX_BYTES=1024;
const fullyIsolated=x=>x?.jailed===true && x?.supervisorOwned===true &&
  x?.hostNetworkDenied===true && x?.metadataDenied===true &&
  x?.externalWatchdogArmed===true && x?.cgroupEnforced===true &&
  x?.cloudProvisioningAllowed===false;

export function guestProbeDigest(sessionId,nonce){
  if(!validSessionId(sessionId)||!HEX.test(nonce))
    throw Error("Untrusted offline guest challenge");
  return createHash("sha256").update(
    PROTOCOL+"\n"+sessionId+"\n"+nonce,"utf8").digest("hex");
}
export function verifyGuestProbeResponse(value,{sessionId,nonce}={}){
  if(!value||typeof value!=="object"||Array.isArray(value)||
     Object.keys(value).sort().join("|")!==
     ["protocol","sessionId","nonce","digest","guestHealthy"].sort().join("|")||
     value.protocol!==PROTOCOL||value.sessionId!==sessionId||
     value.nonce!==nonce||value.guestHealthy!==true||
     value.digest!==guestProbeDigest(sessionId,nonce))
    throw Error("Untrusted guest response to fresh offline challenge");
  return true;
}

/** Transport only: strict CONNECT 5501 handshake followed by one JSON line. */
export function exchangeGuestProbe(socket,{sessionId,nonce,signal}={}){
  guestProbeDigest(sessionId,nonce);
  if(!socket||typeof socket.write!=="function"||
     typeof socket.setTimeout!=="function"||
     typeof socket.destroy!=="function"||
     typeof socket.on!=="function")
    throw Error("Invalid restricted local vsock transport");
  return new Promise((resolve,reject)=>{
    let finished=false,stage=0,buffer=Buffer.alloc(0);
    function complete(error,result){
      if(finished)return;
      finished=true;
      signal?.removeEventListener("abort",abort);
      socket.destroy();
      if(error)reject(Error("Offline guest probe failed or timed out"));
      else resolve(result);
    }
    function abort(){complete(true);}
    if(signal?.aborted){complete(true);return;}
    signal?.addEventListener("abort",abort,{once:true});
    socket.on("error",()=>complete(true));
    socket.on("timeout",()=>complete(true));
    socket.on("close",()=>{if(!finished)complete(true);});
    socket.on("connect",()=>socket.write("CONNECT "+GUEST_PROBE_PORT+"\n"));
    socket.on("data",chunk=>{
      if(finished)return;
      buffer=Buffer.concat([buffer,chunk]);
      if(buffer.length>MAX_BYTES){complete(true);return;}
      while(!finished){
        const index=buffer.indexOf(10);
        if(index<0)return;
        const line=buffer.subarray(0,index).toString("utf8");
        buffer=buffer.subarray(index+1);
        if(stage===0){
          if(!/^OK [1-9]\d{0,9}$/.test(line) ||
             Number(line.slice(3))>4294967295){
            complete(true);return;
          }
          stage=1;
          socket.write(JSON.stringify({protocol:PROTOCOL,sessionId,nonce})+"\n");
        }else if(stage===1){
          try{
            if(buffer.length!==0)throw Error("Unexpected bytes after guest proof");
            const parsed=JSON.parse(line);
            verifyGuestProbeResponse(parsed,{sessionId,nonce});
            complete(false,{guestServiceFunctional:true,
              challengeResponseVerified:true,localVsockOnly:true});
          }catch{complete(true);}
          return;
        }
      }
    });
    socket.setTimeout(5000);
  });
}

/** One-shot, explicitly invoked from an already attested local jailer. */
export async function probeOfflineGuest({
  sessionId,guardian,signal,lookup=lstat,
  dial=createConnection,entropy=randomBytes,
}={}){
  if(!validSessionId(sessionId)||typeof guardian?.attest!=="function"||
     typeof lookup!=="function"||typeof dial!=="function"||
     typeof entropy!=="function")
    throw Error("Offline guest probe requires an independent local supervisor");
  if(!fullyIsolated(await guardian.attest(sessionId)))
    throw Error("Untrusted supervisor before guest probe");
  const path=join(jailedRootPath(BASE,sessionId),"v.sock");
  const st=await lookup(path);
  if(!st?.isSocket?.())throw Error("Expected pinned local Firecracker vsock UDS");
  const nonce=entropy(32).toString("hex");
  guestProbeDigest(sessionId,nonce);
  if(signal?.aborted)throw Error("Guest probe cancelled");
  const socket=dial({path});
  const evidence=await exchangeGuestProbe(socket,{sessionId,nonce,signal});
  if(!fullyIsolated(await guardian.attest(sessionId)))
    throw Error("Host isolation changed during guest probe");
  return Object.freeze(evidence);
}
