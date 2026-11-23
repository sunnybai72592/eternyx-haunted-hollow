// Phase 25: offline, strict forensic correlation of an actually produced one-use
// disposable Docker stop. Checks claims, private file digests and original pins;
// never resolves an attempted/no-outcome journal or authorizes receipt replay.
const HEX=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const exact=(o,keys)=>o&&typeof o==="object"&&!Array.isArray(o)&&
 Object.keys(o).sort().join(",")===keys.slice().sort().join(",");
const falseFields=[
 "actualSignedAgentInterrupted","originalSignedDispatchTested","serverReceiptVerified",
 "automaticRetryAuthorized","productionDeploymentAuthorized","stagingDockerExecutionAuthorized"
];
const trueFields=[
 "recordedAttemptedWithoutOutcome","workerSIGKILLObserved","stopCLIReportedReturn",
 "realPinnedDockerContainerObservedExited","duplicateClaimDenied","staleLockPreserved",
 "rootlessLiveHostInspectedBeforeAndAfter","rootlessHostPolicyAndRoutesStable",
 "independentHumanReviewRequired"
];
const reportKeys=[
 "schema","recordedAt","sourceCommitSha","containerId","imageSha256",
 "daemonIdentitySha256","socketEndpointSha256","policySha256",
 "routeSnapshotSha256","permitId","permitRecordSha256",
 "journalSha256","lockSha256","claimId","agentId",
 ...trueFields,...falseFields
];
const permitKeys=[
 "schema","permitId","containerId","approvedCommit","runDir","agentId","claimId","usedAt"
];
const claimKeys=[
 "agentId","claimId","operation","containerId","events","outcome",
 "attempted","acknowledged","attentionRequired"
];
const independentKeys=[
 "originalSourceCommitSha","currentReviewCommitSha","daemonIdentitySha256",
 "socketEndpointSha256","containerId","imageSha256","policySha256","routeSnapshotSha256",
 "permitId"
];
function time(v,now,window){
 if(typeof v!=="string")throw Error("Missing canonical forensic observation time.");
 const ms=Date.parse(v);
 if(!Number.isFinite(ms)||new Date(ms).toISOString()!==v||
    ms>now+300000||ms<now-window)
  throw Error("Untrusted, stale or future-dated forensic observation.");
 return ms;
}
export function validateLiveStopForensicPins(pins){
 if(!exact(pins,independentKeys)||!SHA.test(pins.originalSourceCommitSha||"")||
   !SHA.test(pins.currentReviewCommitSha||"")||
   !UUID.test(pins.permitId||"")||
   independentKeys.slice(2,8).some(k=>!HEX.test(pins[k]||"")))
  throw Error("Exact independently supplied original/current commit and host pins required.");
 return pins;
}
export function reconcileLiveStopCrashArtifacts({
 report,permit,claim,hashes,pins,runDir,now=Date.now()
}){
 validateLiveStopForensicPins(pins);
 if(!Number.isFinite(now)||typeof runDir!=="string"||
    !runDir.startsWith("/")||runDir.includes("\0")||
    !exact(hashes,["permitRecordSha256","journalSha256","lockSha256"])||
    !Object.values(hashes).every(h=>HEX.test(h)))
  throw Error("Malformed forensic archive evidence.");
 if(!exact(report,reportKeys)||
    report.schema!=="eternyx-docker-live-disposable-stop-worker-sigkill-v1"||
    report.sourceCommitSha!==pins.originalSourceCommitSha||
    report.containerId!==pins.containerId||
    report.imageSha256!==pins.imageSha256||
    report.daemonIdentitySha256!==pins.daemonIdentitySha256||
    report.socketEndpointSha256!==pins.socketEndpointSha256||
    report.policySha256!==pins.policySha256||
    report.routeSnapshotSha256!==pins.routeSnapshotSha256||
    report.permitId!==pins.permitId||
    !UUID.test(report.claimId||"")||!UUID.test(report.agentId||"")||
    !HEX.test(report.permitRecordSha256||"")||
    !HEX.test(report.journalSha256||"")||!HEX.test(report.lockSha256||"")||
    trueFields.some(k=>report[k]!==true)||
    falseFields.some(k=>report[k]!==false))
  throw Error("Original live-stop report contradicts isolated disposable crash boundaries.");
 if(hashes.permitRecordSha256!==report.permitRecordSha256||
    hashes.journalSha256!==report.journalSha256||
    hashes.lockSha256!==report.lockSha256)
  throw Error("Original permit, journal or lock bytes have changed.");
 const reportTime=time(report.recordedAt,now,7*86400000);
 if(!exact(permit,permitKeys)||
    permit.schema!=="eternyx-one-time-disposable-docker-stop-permit-v1"||
    permit.permitId!==pins.permitId||
    permit.containerId!==pins.containerId||
    permit.approvedCommit!==pins.originalSourceCommitSha||
    permit.runDir!==runDir||
    permit.agentId!==report.agentId||
    permit.claimId!==report.claimId)
  throw Error("One-use original permit does not bind this exact claim and source.");
 const permitTime=time(permit.usedAt,now,7*86400000);
 if(permitTime>reportTime)
  throw Error("Permit was created after the asserted stopped-container observation.");
 if(!exact(claim,claimKeys)||claim.agentId!==report.agentId||
    claim.claimId!==report.claimId||claim.containerId!==pins.containerId||
    claim.operation!=="stop"||claim.outcome!==null||
    claim.attempted!==true||claim.acknowledged!==false||
    claim.attentionRequired!==true||
    JSON.stringify(claim.events)!=='["reserved","attempted"]')
  throw Error("Fsynced attempted claim has been changed or incorrectly acknowledged.");
 return {
  schema:"eternyx-docker-live-stop-forensic-correlation-v1",
  status:"same_claim_evidence_correlated_unresolved",
  originalSourceCommitSha:pins.originalSourceCommitSha,
  currentReviewCommitSha:pins.currentReviewCommitSha,
  daemonIdentitySha256:pins.daemonIdentitySha256,
  socketEndpointSha256:pins.socketEndpointSha256,
  containerId:pins.containerId,
  imageSha256:pins.imageSha256,
  managedPolicySha256:pins.policySha256,
  routeSnapshotSha256:pins.routeSnapshotSha256,
  permitId:pins.permitId,claimId:report.claimId,agentId:report.agentId,
  permitRecordSha256:hashes.permitRecordSha256,
  originalJournalSha256:hashes.journalSha256,
  originalLockSha256:hashes.lockSha256,
  reportedAt:report.recordedAt,
  permitPrecedesReport:true,
  originalRawFilesMatched:true,
  originalAttemptedJournalStillUnresolved:true,
  originalStaleLockRetained:true,
  originallyReportedWorkerSigkill:true,
  originalStopCLIReportedReturned:true,
  originalContainerExitedReported:true,
  independentDockerStopCausalityProven:false,
  independentlyWitnessedPhysicalIsolation:false,
  originalSignedAgentCrashProven:false,
  cloudSignedReceiptProven:false,
  appendTerminalOutcomeAuthorized:false,
  receiptReplayAuthorized:false,
  clearStaleLockAuthorized:false,
  automaticMutationRetryAuthorized:false,
  stagingDockerExecutionAuthorized:false,
  productionDeploymentAuthorized:false,
  independentHumanReviewRequired:true
 };
}
