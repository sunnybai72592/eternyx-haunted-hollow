// Docker Phase 43 — read-only, bounded fault-window and local receipt review.
// Reuses the REAL signed-agent recovery forensic scan and receipt fences.
// Neither local journal acknowledgement nor a received JSON "ack" authenticates
// a remote server. This module does not run Docker, request permits or unlock.
import {createHash} from "node:crypto";
import {requireSignedReceiptReplayClear}
 from "./dockerSignedReceiptReplayFence.mjs";
import {requireSignedReceiptAcknowledgedEvidence}
 from "./dockerSignedReceiptAcknowledgedFence.mjs";

const HASH=/^[0-9a-f]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha=s=>createHash("sha256").update(s).digest("hex");
const iso=v=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const safe=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).join("|")===keys.join("|");
const INITIAL=["reserved"];
const UNKNOWN=["reserved","attempted"];
const GUARD=["reserved","guard_denied"];
const COMPLETED=["reserved","attempted","completed"];
const FAILED=["reserved","attempted","failed"];
const ACK_GUARD=[...GUARD,"receipt_accepted"];
const ACK_COMPLETED=[...COMPLETED,"receipt_accepted"];
const ACK_FAILED=[...FAILED,"receipt_accepted"];
const STAGES=[
 ["reserved_pre_attempt",INITIAL],
 ["attempted_outcome_unknown",UNKNOWN],
 ["guard_denied_unacknowledged",GUARD],
 ["completed_unacknowledged",COMPLETED],
 ["failed_terminal_ambiguous",FAILED],
 ["guard_denied_locally_acknowledged",ACK_GUARD],
 ["completed_locally_acknowledged",ACK_COMPLETED],
 ["failed_legacy_locally_acknowledged",ACK_FAILED]
];
const UNSAFE=["attempted_outcome_unknown","failed_terminal_ambiguous",
 "failed_legacy_locally_acknowledged"];
const IDENTITY=["agentSha256","claimSha256","containerSha256","operation"];
const BODY=["schema",...IDENTITY,"stage","claimEventSha256","claimFileSha256",
 "inventorySha256","inspectedAt","exactOriginalPrivateInventoryVerified",
 "completeSameContainerHistoryChecked","localReceiptReplayFenceSatisfied",
 "localAcknowledgmentHistoryValidated","unknownAttemptHeld",
 "manualHumanReconciliationRequired","localDockerOperationExecutedByReviewer",
 "remoteReceiptIndependentlyVerified","remotePermitRevocationVerified",
 "crashInjectionIndependentlyWitnessed","physicalHostIsolationProven",
 "automaticDockerRetryAuthorized","automaticReceiptResendAuthorized",
 "recoveryLocksAutomaticallyReleased","stagingDockerExecutionAuthorized",
 "productionDeploymentAuthorized"];
const FIELDS=[...BODY,"reportSha256"];
const PAIR_BODY=["schema","beforeSha256","afterSha256",
 ...IDENTITY,"observedTransition","originalStateHistoryConsistent",
 "unknownHoldPreserved","locallyAcknowledgedOnly",
 "serverReceiptIndependentlyAuthenticated",
 "permitRevocationIndependentlyProven","crashInjectionIndependentlyWitnessed",
 "dockerMutationExecutedByReviewer","automaticDockerRetryAuthorized",
 "receiptResendAuthorized","stagingExecutionAuthorized","productionDeploymentAuthorized"];
const PAIR=[...PAIR_BODY,"comparisonSha256"];
const expectedKeys=["agentId","claimId","containerId","operation"];

function inventorySafe(i){
 if(i?.schema!=="eternyx-docker-signed-agent-strict-recovery-inventory-v1"||
    i.completeInventoryVerified!==true||i.stableDoubleReadVerified!==true||
    !HASH.test(i.inventorySha256||"")||
    !Number.isSafeInteger(i.fileCount)||i.fileCount<1||i.fileCount>100||
    !Array.isArray(i.claims)||!Array.isArray(i.locks)||
    !Array.isArray(i.containerLocks)||!Array.isArray(i.blocked)||
    i.claimCount!==i.claims.length||i.lockCount!==i.locks.length||
    i.containerLockCount!==i.containerLocks.length||
    i.totalLockCount!==i.lockCount+i.containerLockCount||
    i.fileCount!==i.claimCount+i.totalLockCount||
    i.safeToRetryClaimAutomatically!==false||
    i.lockSafeToClearAutomatically!==false||
    i.containerLockSafeToClearAutomatically!==false||
    i.uncertainOutcomeAuthorizedForReceipt!==false||
    i.remoteReceiptAcknowledgementVerified!==false||
    i.productionDeploymentAuthorized!==false)
  throw Error("Fault review needs the complete original private signed-agent forensic inventory.");
 return i;
}
export function validateDockerFaultReviewPins(pins){
 if(!safe(pins,expectedKeys)||!UUID.test(pins.agentId||"")||
    !UUID.test(pins.claimId||"")||!HASH.test(pins.containerId||"")||
    !["start","stop","restart"].includes(pins.operation))
  throw Error("Independent exact agent, claim, target and operation approvals required.");
 return pins;
}
function stageOf(events){
 const label=STAGES.find(([_,e])=>JSON.stringify(e)===JSON.stringify(events))?.[0];
 if(!label)throw Error("Original claim has an unknown/ambiguous event transition.");
 return label;
}
function findClaim(i,pins){
 const matches=i.claims.filter(c=>c.claimId===pins.claimId);
 if(matches.length!==1)throw Error("Fault evidence requires exactly one original claim.");
 const c=matches[0];
 if(c.agentId!==pins.agentId||c.containerId!==pins.containerId||
    c.operation!==pins.operation||!HASH.test(c.fileSha256||"")||
    !Array.isArray(c.events))
  throw Error("Fault claim identity or original private file differs from approved pins.");
 // Another UNKNOWN/failed/unacknowledged claim for the SAME target must never
 // be ignored merely because the selected claim looks terminal or acknowledged.
 for(const sibling of i.claims){
  if(sibling.claimId===pins.claimId||sibling.containerId!==pins.containerId)continue;
  if(!UUID.test(sibling.claimId||"")||!HASH.test(sibling.fileSha256||"")||
     sibling.outcome===null||sibling.outcome==="failed"||
     sibling.acknowledged!==true||sibling.attentionRequired!==false)
   throw Error("Unresolved same-container historical fault holds all reconciliation.");
 }
 if(i.blocked.some(b=>b.reason==="lock_without_claim_or_preclaim_process"&&
    b.agentId!==pins.agentId))
  throw Error("Unknown signed agent lock requires separate incident review.");
 return c;
}
/** Classifies the real, already audited journal. This NEVER authorizes receipt
 * replay: a positive original local fence is only evidence for human triage. */
export function evaluateDockerFaultRecoverySnapshot(i,pins,{now=new Date(),expectedStage=null}={}){
 const ms=now instanceof Date?now.valueOf():NaN;
 if(!Number.isFinite(ms))throw Error("Invalid fault review UTC clock.");
 validateDockerFaultReviewPins(pins);inventorySafe(i);
 const c=findClaim(i,pins),stage=stageOf(c.events);
 if(expectedStage!==null&&expectedStage!==stage)
  throw Error("Claim's actual original event sequence differs from claimed crash window.");
 if(!!c.attempted!==c.events.includes("attempted")||
    c.acknowledged!==c.events.includes("receipt_accepted")||
    c.attentionRequired===c.acknowledged||
    c.outcome!==(c.events.includes("completed")?"completed":
     c.events.includes("failed")?"failed":
     c.events.includes("guard_denied")?"guard_denied":null))
  throw Error("Fault claim state contradicts original ordered events.");
 if(!i.locks.some(l=>l.agentId===pins.agentId)||
    i.locks.filter(l=>l.agentId===pins.agentId).length!==1||
    c.lockPresent!==true)
  throw Error("Original invocation-owned agent recovery lock missing.");
 const containerLock=i.containerLocks.filter(l=>l.containerId===pins.containerId);
 if(["reserved_pre_attempt","attempted_outcome_unknown"].includes(stage)){
  if(containerLock.length!==1||containerLock[0].claimId!==pins.claimId||
     containerLock[0].agentId!==pins.agentId||c.containerLockPresent!==true)
   throw Error("Pending/unknown Docker operation must retain its exact exclusive target lock.");
 }else if(containerLock.length!==0||c.containerLockPresent!==false)
  throw Error("Terminal or acknowledged claim retains an unresolved container lock.");
 const isAck=stage.endsWith("_locally_acknowledged");
 const locallyValidAck=stage==="completed_locally_acknowledged"||
   stage==="guard_denied_locally_acknowledged";
 const canPreflightReceipt=stage==="completed_unacknowledged"||
   stage==="guard_denied_unacknowledged";
 if(canPreflightReceipt){
  const fence=requireSignedReceiptReplayClear(i,{
   agentId:pins.agentId,claimId:pins.claimId,phase:"before_send"
  });
  if(fence.outcome!==c.outcome||fence.containerId!==pins.containerId||
     fence.fileSha256!==c.fileSha256||fence.dockerExecuted!==false)
   throw Error("Original terminal receipt-only fence is not stable.");
 }
 if(locallyValidAck){
  const ack=requireSignedReceiptAcknowledgedEvidence(i,{
   agentId:pins.agentId,claimId:pins.claimId,
   containerId:pins.containerId,outcome:c.outcome
  });
  if(ack.fileSha256!==c.fileSha256||!ack.locallyAcknowledged||
     ack.independentlyVerified!==false)
   throw Error("Original local acknowledgement history is inconsistent.");
 }
 const payload={
  schema:"eternyx-docker-staging-fault-recovery-snapshot-v1",
  agentSha256:sha("ETERNYX_FAULT_AGENT_V1\n"+pins.agentId),
  claimSha256:sha("ETERNYX_FAULT_CLAIM_V1\n"+pins.claimId),
  containerSha256:sha("ETERNYX_DOCKER_HOST_TARGET_V1\n"+pins.containerId),
  operation:pins.operation,stage,
  claimEventSha256:sha("ETERNYX_FAULT_EVENTS_V1\n"+JSON.stringify(c.events)),
  claimFileSha256:c.fileSha256,inventorySha256:i.inventorySha256,
  inspectedAt:new Date(ms).toISOString(),
  exactOriginalPrivateInventoryVerified:true,
  completeSameContainerHistoryChecked:true,
  localReceiptReplayFenceSatisfied:canPreflightReceipt,
  localAcknowledgmentHistoryValidated:locallyValidAck,
  unknownAttemptHeld:stage==="attempted_outcome_unknown",
  manualHumanReconciliationRequired:true,
  localDockerOperationExecutedByReviewer:false,
  remoteReceiptIndependentlyVerified:false,
  remotePermitRevocationVerified:false,
  crashInjectionIndependentlyWitnessed:false,
  physicalHostIsolationProven:false,
  automaticDockerRetryAuthorized:false,
  automaticReceiptResendAuthorized:false,
  recoveryLocksAutomaticallyReleased:false,
  stagingDockerExecutionAuthorized:false,productionDeploymentAuthorized:false
 };
 return Object.freeze({...payload,
  reportSha256:sha("ETERNYX_DOCKER_FAULT_SNAPSHOT_V1\n"+JSON.stringify(payload))});
}
function checkSnapshot(s,now){
 if(!safe(s,FIELDS)||s.schema!=="eternyx-docker-staging-fault-recovery-snapshot-v1"||
    !IDENTITY.slice(0,3).every(k=>HASH.test(s[k]||""))||
    !["start","stop","restart"].includes(s.operation)||
    !STAGES.some(([name,events])=>name===s.stage&&
     sha("ETERNYX_FAULT_EVENTS_V1\n"+JSON.stringify(events))===s.claimEventSha256)||
    ![s.claimFileSha256,s.inventorySha256,s.reportSha256].every(v=>HASH.test(v||""))||
    !iso(s.inspectedAt)||Date.parse(s.inspectedAt)>now+120000||
    now-Date.parse(s.inspectedAt)>3600000||
    !s.exactOriginalPrivateInventoryVerified||
    !s.completeSameContainerHistoryChecked||
    s.localReceiptReplayFenceSatisfied!==
      ["completed_unacknowledged","guard_denied_unacknowledged"].includes(s.stage)||
    s.localAcknowledgmentHistoryValidated!==
      ["completed_locally_acknowledged","guard_denied_locally_acknowledged"].includes(s.stage)||
    s.unknownAttemptHeld!==(s.stage==="attempted_outcome_unknown")||
    s.manualHumanReconciliationRequired!==true||
    !["localDockerOperationExecutedByReviewer","remoteReceiptIndependentlyVerified",
      "remotePermitRevocationVerified","crashInjectionIndependentlyWitnessed",
      "physicalHostIsolationProven","automaticDockerRetryAuthorized",
      "automaticReceiptResendAuthorized","recoveryLocksAutomaticallyReleased",
      "stagingDockerExecutionAuthorized","productionDeploymentAuthorized"]
      .every(k=>s[k]===false))
  throw Error("Unsafe or expired staging fault evidence; no recovery may be authorized.");
 const body={};for(const key of BODY)body[key]=s[key];
 if(sha("ETERNYX_DOCKER_FAULT_SNAPSHOT_V1\n"+JSON.stringify(body))!==s.reportSha256)
  throw Error("Fault report original SHA-256 fingerprint differs.");
 return s;
}
const next=new Map([
 ["reserved_pre_attempt",["attempted_outcome_unknown","guard_denied_unacknowledged"]],
 ["attempted_outcome_unknown",["completed_unacknowledged","failed_terminal_ambiguous"]],
 ["guard_denied_unacknowledged",["guard_denied_locally_acknowledged"]],
 ["completed_unacknowledged",["completed_locally_acknowledged"]],
 ["failed_terminal_ambiguous",["failed_legacy_locally_acknowledged"]]
]);
/** Compare two independently pinned ORIGINAL local observations, no remote
 * acknowledgement, permit revocation, physical crash proof or recovery action. */
export function compareDockerFaultRecoverySnapshots(before,after,expected,now=new Date()){
 const ms=now instanceof Date?now.valueOf():NaN;
 if(!Number.isFinite(ms))throw Error("Invalid independent fault-review clock.");
 checkSnapshot(before,ms);checkSnapshot(after,ms);
 validateDockerFaultReviewPins(expected);
 if(before.agentSha256!==sha("ETERNYX_FAULT_AGENT_V1\n"+expected.agentId)||
    before.claimSha256!==sha("ETERNYX_FAULT_CLAIM_V1\n"+expected.claimId)||
    before.containerSha256!==sha("ETERNYX_DOCKER_HOST_TARGET_V1\n"+expected.containerId)||
    before.operation!==expected.operation)
  throw Error("Fault evidence must match original independently approved agent/claim/target.");
 for(const k of IDENTITY)if(before[k]!==after[k])
  throw Error("Fault state changed signed-agent identity between inspections.");
 const t1=Date.parse(before.inspectedAt),t2=Date.parse(after.inspectedAt);
 if(t2<=t1||t2-t1>15*60000)
  throw Error("Fault snapshots reversed, identical-time, or outside drill window.");
 let transition;
 if(before.stage===after.stage&&
    ["reserved_pre_attempt","attempted_outcome_unknown"].includes(before.stage)&&
    before.claimFileSha256===after.claimFileSha256&&
    before.claimEventSha256===after.claimEventSha256&&
    before.inventorySha256===after.inventorySha256)
  transition="unchanged_hold_preserved";
 else if(next.get(before.stage)?.includes(after.stage)&&
    before.claimFileSha256!==after.claimFileSha256&&
    before.claimEventSha256!==after.claimEventSha256)
  transition="durable_local_history_advanced";
 else
  throw Error("Fault outcome was invented, reverted, replayed or advanced without original durable evidence.");
 if(UNSAFE.includes(before.stage)||UNSAFE.includes(after.stage)){
  // Keep a hard hold even if a legacy "failed" journal eventually gained a
  // local receipt-accepted line; no automatic retry or receipt reconstruction.
 }
 const payload={
  schema:"eternyx-docker-staging-fault-recovery-comparison-v1",
  beforeSha256:before.reportSha256,afterSha256:after.reportSha256,
  ...Object.fromEntries(IDENTITY.map(k=>[k,before[k]])),
  observedTransition:transition,
  originalStateHistoryConsistent:true,
  unknownHoldPreserved:before.stage==="attempted_outcome_unknown"&&
    transition==="unchanged_hold_preserved",
  locallyAcknowledgedOnly:after.localAcknowledgmentHistoryValidated,
  serverReceiptIndependentlyAuthenticated:false,
  permitRevocationIndependentlyProven:false,
  crashInjectionIndependentlyWitnessed:false,
  dockerMutationExecutedByReviewer:false,
  automaticDockerRetryAuthorized:false,
  receiptResendAuthorized:false,
  stagingExecutionAuthorized:false,productionDeploymentAuthorized:false
 };
 return Object.freeze({...payload,
  comparisonSha256:sha("ETERNYX_DOCKER_FAULT_COMPARE_V1\n"+JSON.stringify(payload))});
}
export const DOCKER_FAULT_EXPECTED_KEYS=Object.freeze(expectedKeys.slice());
export const DOCKER_FAULT_STAGES=Object.freeze(STAGES.map(x=>x[0]));
