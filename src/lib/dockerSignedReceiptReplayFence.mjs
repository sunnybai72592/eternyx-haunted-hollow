// Phase 33: receipt-only admission for a durable signed-agent terminal.
// The strict inventory must be freshly built by auditSignedAgentRecoveryDirectory.
// This pure fence NEVER invokes Docker, clears locks, writes to disk, or sends
// remote receipts. Existing legacy "failed" outcomes are ambiguous and held.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FULL=/^[a-f0-9]{64}$/;
const HASH=/^[a-f0-9]{64}$/;

export function requireSignedReceiptReplayClear(inventory,{
 agentId,claimId,phase,originalFileSha256=null
}){
 if(!UUID.test(agentId||"")||!UUID.test(claimId||"")||
    !["before_send","before_ack"].includes(phase)||
    (phase==="before_ack"&&!HASH.test(originalFileSha256||""))||
    (phase==="before_send"&&originalFileSha256!==null))
  throw Error("Exact receipt replay identity, phase and evidence fingerprint required.");
 if(!inventory||inventory.schema!=="eternyx-docker-signed-agent-strict-recovery-inventory-v1"||
    inventory.completeInventoryVerified!==true||
    inventory.stableDoubleReadVerified!==true||
    !HASH.test(inventory.inventorySha256||"")||
    !Number.isSafeInteger(inventory.fileCount)||inventory.fileCount<0||
    inventory.fileCount>100||
    !Array.isArray(inventory.claims)||!Array.isArray(inventory.locks)||
    !Array.isArray(inventory.containerLocks)||!Array.isArray(inventory.blocked)||
    inventory.claimCount!==inventory.claims.length||
    inventory.lockCount!==inventory.locks.length||
    inventory.containerLockCount!==inventory.containerLocks.length||
    inventory.totalLockCount!==inventory.lockCount+inventory.containerLockCount||
    inventory.fileCount!==inventory.claimCount+inventory.totalLockCount||
    inventory.safeToRetryClaimAutomatically!==false||
    inventory.uncertainOutcomeAuthorizedForReceipt!==false||
    inventory.lockSafeToClearAutomatically!==false||
    inventory.productionDeploymentAuthorized!==false)
  throw Error("Receipt replay denied: incomplete or unsafe private forensic inventory.");

 const records=inventory.claims.filter(c=>c.claimId===claimId);
 if(records.length!==1)throw Error("Receipt replay denied: no unique exact local claim.");
 const current=records[0];
 if(current.agentId!==agentId||!FULL.test(current.containerId||"")||
    !HASH.test(current.fileSha256||"")||
    current.acknowledged!==false||current.attentionRequired!==true||
    current.lockPresent!==true||
    (current.outcome!=="completed"&&current.outcome!=="guard_denied")||
    JSON.stringify(current.events)!==JSON.stringify(current.outcome==="completed"
      ?["reserved","attempted","completed"]
      :["reserved","guard_denied"])||
    current.attempted!==(current.outcome==="completed"))
  throw Error("Receipt replay denied: terminal evidence is ambiguous or not original.");

 // The invocation itself owns one O_EXCL per-agent lock. No target lock may
 // remain from an unfinished or partially released operation for this target.
 if(inventory.locks.filter(l=>l.agentId===agentId).length!==1||
    inventory.containerLocks.some(l=>l.containerId===current.containerId))
  throw Error("Receipt replay denied: incomplete lock release or agent ownership.");

 // Historical same-container holds (including reported_failed with a receipt)
 // must not be converted into a claim that this result can be replayed safely.
 for(const entry of inventory.claims){
  if(entry.claimId===claimId||entry.containerId!==current.containerId)continue;
  if(!UUID.test(entry.claimId||"")||!HASH.test(entry.fileSha256||"")||
     entry.outcome===null||entry.outcome==="failed"||
     entry.acknowledged!==true||entry.attentionRequired!==false)
   throw Error("Receipt replay denied: unresolved history for the same container.");
 }
 if(inventory.blocked.some(b=>
    (b.reason==="lock_without_claim_or_preclaim_process"&&b.agentId!==agentId)||
    (b.containerId===current.containerId&&b.claimId!==claimId)||
    (b.claimId===claimId&&b.reason!=="terminal_receipt_not_acknowledged")))
  throw Error("Receipt replay denied: unreconciled local recovery lock or claim.");

 if(phase==="before_ack"&&current.fileSha256!==originalFileSha256)
  throw Error("Receipt replay denied: original terminal journal changed during delivery.");

 return Object.freeze({
  claimId,agentId,containerId:current.containerId,outcome:current.outcome,
  fileSha256:current.fileSha256,phase,historyChecked:true,
  independentlyVerified:false,dockerExecuted:false,
  unknownAttemptReplayed:false,locksAutomaticallyReleased:false
 });
}
