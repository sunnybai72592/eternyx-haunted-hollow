/** Owner-only Phase 2U audit handoff responses.
 * A handoff is a HUMAN ATTESTATION requiring separate CI, deployment and
 * worker verification; it must never be represented as a release permit.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses=new Set(["open","investigating","resolved"]);
const decisions=new Set(["needs_attention","reviewed_for_manual_release_checklist"]);
const reasons=new Set(["evidence_missing","source_ledger_inconsistent","source_changed",
  "no_manual_review","latest_review_needs_attention",
  "review_limitations_missing","current_owner_review"]);
const stamp=x=>typeof x==="string"&&x.length<=45&&Number.isFinite(Date.parse(x))&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(x);
const absentOrUuid=x=>x===null||typeof x==="string"&&uuid.test(x);
const absentOrStamp=x=>x===null||stamp(x);
const isCount=x=>Number.isSafeInteger(x)&&x>=0;
export function verifiedHandoffAssessment(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    raw.source!=="authenticated_server"||
    raw.handoffSource!=="owner_audit_handoff_metadata"||
    !uuid.test(raw.incidentId)||!statuses.has(raw.incidentStatus)||
    !Number.isSafeInteger(raw.incidentRevision)||raw.incidentRevision<1||
    typeof raw.caseConsistent!=="boolean"||
    !isCount(raw.totalPackages)||raw.totalPackages>8||
    !Array.isArray(raw.packages)||raw.packages.length!==raw.totalPackages||
    !isCount(raw.eligibleForManualHandoffCount)||
    !isCount(raw.currentManualHandoffCount)||!stamp(raw.generatedAt)||
    raw.ownerAttestationOnly!==true||raw.twoPersonReviewed!==false||
    raw.ciVerified!==false||raw.deploymentVerified!==false||
    raw.workerVerified!==false||raw.cryptographicProof!==false||
    raw.externalExecutionTriggered!==false){
    throw Error("Unverified private manual handoff assessment.");
  }
  let eligible=0,current=0;
  const packages=raw.packages.map((p,i)=>{
    if(!p||typeof p!=="object"||Array.isArray(p)||
      !uuid.test(p.packageId)||!uuid.test(p.evidenceId)||
      !stamp(p.capturedAt)||!Number.isSafeInteger(p.incidentRevision)||
      p.incidentRevision<1||
      typeof p.sourceSnapshotCurrent!=="boolean"||
      typeof p.evidenceExists!=="boolean"||
      !absentOrUuid(p.latestReviewId)||
      (p.latestReviewDecision!==null&&!decisions.has(p.latestReviewDecision))||
      !absentOrStamp(p.latestReviewAt)||
      !absentOrUuid(p.latestHandoffId)||
      !absentOrUuid(p.latestHandoffReviewId)||
      !absentOrStamp(p.latestHandoffAt)||
      typeof p.eligibleForManualHandoff!=="boolean"||
      typeof p.manualHandoffCurrent!=="boolean"||
      !reasons.has(p.freshnessReason)||
      (p.latestReviewId===null)!==(p.latestReviewDecision===null)||
      (p.latestReviewId===null)!==(p.latestReviewAt===null)||
      (p.latestHandoffId===null)!==(p.latestHandoffReviewId===null)||
      (p.latestHandoffId===null)!==(p.latestHandoffAt===null)){
      throw Error("Inconsistent stored handoff package metadata.");
    }
    // Readiness must be supported by actual source/review state. A positive
    // decision without its required acknowledgments may still be rejected by
    // the SQL function, so never infer readiness solely from the label.
    const sourceReady=p.sourceSnapshotCurrent&&p.evidenceExists&&raw.caseConsistent&&
      p.incidentRevision===raw.incidentRevision;
    const reviewReady=sourceReady&&p.latestReviewId!==null&&
      p.latestReviewDecision==="reviewed_for_manual_release_checklist";
    if(p.eligibleForManualHandoff&&!reviewReady||
      p.manualHandoffCurrent&&(!p.eligibleForManualHandoff||
        p.latestHandoffId===null||
        p.latestHandoffReviewId!==p.latestReviewId||
        p.incidentRevision!==raw.incidentRevision)){
      throw Error("Handoff status is not supported by its persisted review and receipt.");
    }
    // Match the database's ordered CASE expression rather than accepting
    // arbitrary "green" labels with otherwise contradictory data.
    const reason=!p.evidenceExists?"evidence_missing":
      !raw.caseConsistent?"source_ledger_inconsistent":
      !sourceReady?"source_changed":
      p.latestReviewId===null?"no_manual_review":
      p.latestReviewDecision==="needs_attention"?"latest_review_needs_attention":
      !p.eligibleForManualHandoff?"review_limitations_missing":
      "current_owner_review";
    if(p.freshnessReason!==reason||
      p.sourceSnapshotCurrent&&(!raw.caseConsistent||
        p.incidentRevision!==raw.incidentRevision)||
      Date.parse(p.capturedAt)>Date.parse(raw.generatedAt)||
      p.latestReviewAt!==null&&(
        Date.parse(p.latestReviewAt)<Date.parse(p.capturedAt)||
        Date.parse(p.latestReviewAt)>Date.parse(raw.generatedAt))||
      p.latestHandoffAt!==null&&(
        Date.parse(p.latestHandoffAt)<Date.parse(p.capturedAt)||
        Date.parse(p.latestHandoffAt)>Date.parse(raw.generatedAt))){
      throw Error("Handoff reason or chronology contradicts stored source records.");
    }
    if(i>0&&Date.parse(p.capturedAt)>Date.parse(raw.packages[i-1].capturedAt)){
      throw Error("Audit packages are not in descending creation order.");
    }
    if(p.eligibleForManualHandoff)eligible++;
    if(p.manualHandoffCurrent)current++;
    return {
      packageId:p.packageId,incidentRevision:p.incidentRevision,
      evidenceId:p.evidenceId,capturedAt:p.capturedAt,
      sourceSnapshotCurrent:p.sourceSnapshotCurrent,evidenceExists:p.evidenceExists,
      latestReviewId:p.latestReviewId,latestReviewDecision:p.latestReviewDecision,
      latestReviewAt:p.latestReviewAt,
      eligibleForManualHandoff:p.eligibleForManualHandoff,
      latestHandoffId:p.latestHandoffId,
      latestHandoffReviewId:p.latestHandoffReviewId,
      latestHandoffAt:p.latestHandoffAt,
      manualHandoffCurrent:p.manualHandoffCurrent,freshnessReason:p.freshnessReason,
    };
  });
  if(new Set(packages.map(p=>p.packageId)).size!==packages.length||
    current!==raw.currentManualHandoffCount||
    eligible!==raw.eligibleForManualHandoffCount){
    throw Error("Handoff summary counters disagree with actual owner packages.");
  }
  return {
    schema:"eternyx-owner-handoff-assessment-v1",
    source:"authenticated_server",handoffSource:"owner_audit_handoff_metadata",
    incidentId:raw.incidentId,incidentStatus:raw.incidentStatus,
    incidentRevision:raw.incidentRevision,caseConsistent:raw.caseConsistent,
    totalPackages:raw.totalPackages,packages,
    eligibleForManualHandoffCount:eligible,
    currentManualHandoffCount:current,generatedAt:raw.generatedAt,
    ownerAttestationOnly:true,twoPersonReviewed:false,
    ciVerified:false,deploymentVerified:false,workerVerified:false,
    cryptographicProof:false,externalExecutionTriggered:false,
  };
}
export function verifiedHandoffHistory(raw,expectedPackageId){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    raw.source!=="authenticated_server"||
    raw.handoffSource!=="owner_handoff_receipt_history"||
    raw.packageId!==expectedPackageId||!uuid.test(raw.packageId)||
    !uuid.test(raw.incidentId)||!isCount(raw.total)||raw.total>4||
    !Array.isArray(raw.rows)||raw.rows.length!==raw.total||
    raw.ownerAttestationOnly!==true||raw.releaseVerified!==false||
    raw.externalExecutionTriggered!==false){
    throw Error("Unverified owner handoff receipt history.");
  }
  const rows=raw.rows.map((r,i)=>{
    if(!r||typeof r!=="object"||Array.isArray(r)||
      !uuid.test(r.id)||!uuid.test(r.review_id)||
      !Number.isSafeInteger(r.sequence)||r.sequence<1||
      !Number.isSafeInteger(r.incident_revision)||r.incident_revision<1||
      !stamp(r.created_at)||typeof r.note!=="string"||
      r.note.trim().length<12||r.note.trim().length>500||
      r.acknowledged_owner_review!==true||
      r.acknowledged_ci_unverified!==true||
      r.acknowledged_deployment_unverified!==true||
      r.acknowledged_worker_unverified!==true||
      i>0&&(r.sequence>=raw.rows[i-1].sequence||
        Date.parse(r.created_at)>Date.parse(raw.rows[i-1].created_at))){
      throw Error("Invalid immutable handoff receipt.");
    }
    return {id:r.id,reviewId:r.review_id,sequence:r.sequence,
      incidentRevision:r.incident_revision,note:r.note,
      createdAt:r.created_at,
      acknowledgedOwnerReview:true,acknowledgedCiUnverified:true,
      acknowledgedDeploymentUnverified:true,acknowledgedWorkerUnverified:true};
  });
  if(new Set(rows.map(r=>r.id)).size!==rows.length){
    throw Error("Duplicate handoff receipts.");
  }
  return {schema:"eternyx-owner-handoff-history-v1",
    source:"authenticated_server",handoffSource:"owner_handoff_receipt_history",
    incidentId:raw.incidentId,packageId:raw.packageId,total:raw.total,rows,
    ownerAttestationOnly:true,releaseVerified:false,
    externalExecutionTriggered:false};
}
function csvCell(value){
  let s=String(value??"");
  if(/^\s*[=+\-@\t\r\n]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
export function handoffAssessmentCsv(input){
  const safe=verifiedHandoffAssessment(input);
  const rows=[
    ["packageId","incidentRevision","capturedAt","evidenceId","sourceSnapshotCurrent",
      "latestReviewDecision","eligibleForManualHandoff","manualHandoffCurrent",
      "freshnessReason","ciVerified","deploymentVerified","workerVerified"],
    ...safe.packages.map(p=>[
      p.packageId,p.incidentRevision,p.capturedAt,p.evidenceId,
      p.sourceSnapshotCurrent,p.latestReviewDecision??"",
      p.eligibleForManualHandoff,p.manualHandoffCurrent,p.freshnessReason,
      false,false,false,
    ]),
  ];
  return "\ufeff"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n")+"\r\n";
}
export function handoffAssessmentJson(input){
  return JSON.stringify(verifiedHandoffAssessment(input),null,2);
}
export function handoffHistoryExport(input,packageId){
  const safe=verifiedHandoffHistory(input,packageId);
  return JSON.stringify({
    schema:"eternyx-owner-handoff-history-export-v1",
    source:safe.source,packageId:safe.packageId,
    rows:safe.rows.map(r=>({
      id:r.id,reviewId:r.reviewId,incidentRevision:r.incidentRevision,
      createdAt:r.createdAt,
      acknowledgedOwnerReview:true,acknowledgedCiUnverified:true,
      acknowledgedDeploymentUnverified:true,acknowledgedWorkerUnverified:true,
    })),
    ownerAttestationOnly:true,releaseVerified:false,
    externalExecutionTriggered:false,
  },null,2);
}

/**
 * One last authenticated read must agree with the owner's previously
 * inspected package BEFORE asking them to confirm a new receipt. The SQL
 * write then repeats the source/review checks atomically under its row lock.
 * No network access, deployment claim, or workflow execution happens here.
 */
export function verifyHandoffPreflight(previousRaw,currentRaw,packageId){
  if(typeof packageId!=="string"||!uuid.test(packageId)){
    throw Error("Select a genuine owner audit package.");
  }
  const previous=verifiedHandoffAssessment(previousRaw);
  const current=verifiedHandoffAssessment(currentRaw);
  const earlier=previous.packages.find(p=>p.packageId===packageId);
  const latest=current.packages.find(p=>p.packageId===packageId);
  if(previous.incidentId!==current.incidentId||
    Date.parse(current.generatedAt)<Date.parse(previous.generatedAt)||
    !earlier||!latest||!previous.caseConsistent||!current.caseConsistent||
    !earlier.eligibleForManualHandoff||!latest.eligibleForManualHandoff||
    earlier.manualHandoffCurrent||latest.manualHandoffCurrent||
    earlier.latestReviewId!==latest.latestReviewId||
    earlier.latestReviewDecision!==latest.latestReviewDecision||
    earlier.latestHandoffId!==latest.latestHandoffId||
    earlier.incidentRevision!==current.incidentRevision||
    previous.incidentRevision!==current.incidentRevision||
    earlier.evidenceId!==latest.evidenceId||
    earlier.capturedAt!==latest.capturedAt||
    !latest.sourceSnapshotCurrent){
    throw Error("Owner audit source, latest review or receipt changed. Inspect the refreshed assessment and reconfirm.");
  }
  return current;
}
