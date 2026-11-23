// Confirm that an agent's already-acknowledged local statement is supported
// by the entire stable, owner-private recovery inventory. NO Docker calls,
// network, lock clearing, execution authorization or independent execution
// attestation. The signed outcome is only the agent's reported observation.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const FULL=/^[a-f0-9]{64}$/;
export function requireSignedReceiptAcknowledgedEvidence(inventory,{
 agentId,claimId,containerId,outcome
}){
 if(!UUID.test(agentId||"")||!UUID.test(claimId||"")||
    !FULL.test(containerId||"")||!["completed","guard_denied"].includes(outcome))
  throw Error("Invalid signed receipt accepted-evidence identity.");
 if(!inventory||inventory.schema!=="eternyx-docker-signed-agent-strict-recovery-inventory-v1"||
    inventory.completeInventoryVerified!==true||
    inventory.stableDoubleReadVerified!==true||
    !FULL.test(inventory.inventorySha256||"")||
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
    inventory.productionDeploymentAuthorized!==false)
  throw Error("Acknowledged receipt cannot be confirmed without a complete stable local inventory.");
 const records=inventory.claims.filter(x=>x.claimId===claimId);
 if(records.length!==1)throw Error("No unique acknowledged claim in local recovery evidence.");
 const current=records[0];
 const events=outcome==="completed"
  ?["reserved","attempted","completed","receipt_accepted"]
  :["reserved","guard_denied","receipt_accepted"];
 if(current.agentId!==agentId||current.containerId!==containerId||
    current.outcome!==outcome||current.acknowledged!==true||
    current.attentionRequired!==false||current.lockPresent!==true||
    !FULL.test(current.fileSha256||"")||
    JSON.stringify(current.events)!==JSON.stringify(events)||
    current.attempted!==(outcome==="completed")||
    inventory.locks.filter(x=>x.agentId===agentId).length!==1||
    inventory.containerLocks.some(x=>x.containerId===containerId))
  throw Error("Accepted receipt record or original lock evidence is inconsistent.");

 for(const entry of inventory.claims){
  if(entry.claimId===claimId||entry.containerId!==containerId)continue;
  if(entry.outcome===null||entry.outcome==="failed"||
     entry.acknowledged!==true||entry.attentionRequired!==false)
   throw Error("Unresolved same-container history prevents accepted receipt claim.");
 }
 if(inventory.blocked.some(x=>
    (x.reason==="lock_without_claim_or_preclaim_process"&&x.agentId!==agentId)||
    x.claimId===claimId||
    x.containerId===containerId))
  throw Error("An unresolved recovery finding prevents accepted receipt confirmation.");
 return Object.freeze({
  agentId,claimId,containerId,outcome,
  fileSha256:current.fileSha256,
  locallyAcknowledged:true,
  independentlyVerified:false,
  actualDockerExecutionProven:false,
  dockerExecutedAgain:false,
  recoveredUnknownAutomatically:false
 });
}
