// Fail-closed admission for the actual signed Docker agent's complete local
// recovery history. Requires a freshly inspected, double-read, owner-private
// inventory under the exact container O_EXCL lock. Pure: never mutates files,
// contacts a network, trusts server claims for local history, or invokes Docker.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FULL=/^[a-f0-9]{64}$/;
const HASH=/^[a-f0-9]{64}$/;

export function requireSignedContainerHistoryClear(
 inventory,{agentId,claimId,containerId,phase}
){
 if(!UUID.test(agentId||"")||!UUID.test(claimId||"")||
    !FULL.test(containerId||"")||!["preclaim","premutation"].includes(phase))
  throw Error("Exact signed agent, claim, container and admission phase required.");
 if(!inventory||inventory.schema!=="eternyx-docker-signed-agent-strict-recovery-inventory-v1"||
    inventory.completeInventoryVerified!==true||
    inventory.stableDoubleReadVerified!==true||
    !HASH.test(inventory.inventorySha256||"")||
    !Array.isArray(inventory.claims)||!Array.isArray(inventory.locks)||
    !Array.isArray(inventory.containerLocks)||!Array.isArray(inventory.blocked)||
    !Number.isSafeInteger(inventory.fileCount)||inventory.fileCount>100||
    inventory.fileCount<0||
    inventory.claimCount!==inventory.claims.length||
    inventory.lockCount!==inventory.locks.length||
    inventory.containerLockCount!==inventory.containerLocks.length||
    inventory.totalLockCount!==inventory.lockCount+inventory.containerLockCount||
    inventory.fileCount!==inventory.claimCount+inventory.totalLockCount||
    inventory.safeToRetryClaimAutomatically!==false||
    inventory.containerLockSafeToClearAutomatically!==false||
    inventory.productionDeploymentAuthorized!==false)
  throw Error("Missing complete stable private Docker recovery history; no execution permitted.");

 // The O_EXCL container lock and the per-agent lock must be visible in the
 // same stable inventory. Otherwise another operator HOME or missing records
 // could cause the agent to act without demonstrable local exclusion.
 const owners=inventory.containerLocks.filter(l=>l.containerId===containerId);
 if(owners.length!==1||owners[0].agentId!==agentId||
    owners[0].claimId!==claimId||
    !HASH.test(owners[0].fileSha256||"")||
    inventory.locks.filter(l=>l.agentId===agentId).length!==1)
  throw Error("Exact original signed claim/agent container locks not found in stable local history.");

 // Unknown target of an unrelated orphan agent lock cannot be safely
 // attributed to another container: keep the whole host in manual review.
 if(inventory.blocked.some(b=>b?.reason==="lock_without_claim_or_preclaim_process"&&
    b.agentId!==agentId))
  throw Error("Unattributed local agent lock requires independent operator review.");

 const current=inventory.claims.filter(c=>c.claimId===claimId);
 if(phase==="preclaim"){
  if(current.length!==0)throw Error("Claim ID already exists in durable history; no second reservation.");
 }else{
  if(current.length!==1||current[0].agentId!==agentId||
     current[0].containerId!==containerId||
     current[0].outcome!==null||current[0].attempted!==true||
     current[0].acknowledged!==false||
     current[0].containerLockPresent!==true||
     current[0].lockPresent!==true||
     JSON.stringify(current[0].events)!==JSON.stringify(["reserved","attempted"]))
   throw Error("Current claim is not the original durable attempted-only record.");
 }

 // Legacy pre-Phase-30 claims can lack container locks. Their absence must
 // NEVER be interpreted as safety. Even terminal-but-unacknowledged results
 // block another start/stop/restart on the same exact container.
 for(const entry of inventory.claims){
  if(entry.containerId!==containerId||entry.claimId===claimId)continue;
  if(!UUID.test(entry.agentId||"")||!UUID.test(entry.claimId||"")||
     !HASH.test(entry.fileSha256||"")||
     entry.outcome===null||entry.acknowledged!==true||
     entry.attentionRequired!==false)
   throw Error("Older unresolved or unacknowledged Docker claim blocks the signed container.");
 }
 // Do not rely on the inventory's ordinary high-level disposition:
 // current O_EXCL locks and an attempted current claim necessarily require
 // manual recovery attention even while a legitimate guarded attempt runs.
 return {historyChecked:true,phase,containerId,claimId,
   previouslyUnresolvedSameContainer:false,
   recoveredLegacyClaimAutomatically:false,
   clearedAnyRecoveryLock:false,
   executionAuthorizedByHistoryAlone:false};
}
