// Host-only pinned permit guard. Does not execute Docker or contact a server.
// Every field of the claimed job must match a 15-second signed permit.
import {verify} from "node:crypto";
import {parseLabPermit,labPermitMessage,bytesFromBase64url} from "../../supabase/functions/_shared/docker-command-contract.mjs";

export function verifyPinnedDockerLabPermit(envelope,expected,pinnedServerKey,now=Date.now()){
 if(!envelope||typeof envelope!=="object"||!expected||
   typeof expected!=="object"||!Number.isFinite(now))
   throw Error("Invalid lab permit verification inputs.");
 const permit=parseLabPermit(envelope.permit);
 if(!permit)throw Error("Invalid lab permit contract.");
 const ids=["agentId","claimId","requestId","operation","containerId"];
 if(!ids.every(k=>typeof expected[k]==="string"&&permit[k]===expected[k]))
   throw Error("Lab permit does not match requested job.");
 if(Date.parse(permit.expiresAt)<=now||Date.parse(permit.issuedAt)>now+5000)
   throw Error("Lab permit is expired or issued in the future.");
 const sig=bytesFromBase64url(envelope.signature,64);
 if(!pinnedServerKey||!verify(null,Buffer.from(labPermitMessage(permit)),
     pinnedServerKey,Buffer.from(sig)))
   throw Error("Server-signed lab permit verification failed.");
 return permit;
}
