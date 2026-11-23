/** Validate server-derived, owner-only case integrity/readiness projections.
 * No raw incident notes, private workflow payloads, secrets or request UUIDs
 * may enter JSON or spreadsheet exports.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses=new Set(["open","investigating","resolved"]);
const stages=new Set(["draft","reviewed","closed"]);
const findings=new Set([
  "incident_event_chain_inconsistent","incident_status_mismatch",
  "incident_revision_mismatch","plan_revision_mismatch",
  "plan_evidence_missing","plan_step_attestation_mismatch",
  "plan_stage_event_mismatch","late_review_attestation",
  "orphaned_governance_decisions","audit_projection_count_mismatch",
]);
const isCounter=n=>Number.isSafeInteger(n)&&n>=0;
const commonFalse=[
  "cryptographicIntegrityVerified","workerLivenessVerified",
  "externalExecutionTriggered",
];
const integrityCounters=[
  "incidentRevision","incidentEventCount","capturedEvidenceCount",
  "plannedSteps","acknowledgedSteps","planEventCount",
  "closureDecisionCount","reopenDecisionCount","auditLedgerCount",
  "auditProjectionCount",
];
const readinessCounters=[
  "totalOwnerCases","currentOpen","currentInvestigating","currentResolved",
  "currentHighUnresolved","currentUnresolvedOlder24h",
  "currentUnresolvedWithEvidence","currentUnresolvedWithoutEvidence",
  "planDraft","planReviewed","planClosed","recentSampleLimit",
  "recentCasesScanned","inconsistentCasesInRecentSample",
  "historicallyClosedPlansInRecentSample",
];
export function verifiedCaseIntegrity(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     raw.source!=="authenticated_server"||
     raw.integritySource!=="owner_case_ledger_consistency"||
     typeof raw.incidentId!=="string"||!uuid.test(raw.incidentId)||
     !statuses.has(raw.incidentStatus)||
     raw.latestIncidentEventStatus!==null&&
       !statuses.has(raw.latestIncidentEventStatus)){
    throw Error("Unverified incident lifecycle source.");
  }
  if(commonFalse.some(k=>raw[k]!==false)||
     raw.automatedDetectionEnabled!==false||
     !integrityCounters.every(k=>isCounter(raw[k]))||
     raw.incidentRevision<1||
     typeof raw.hasPlan!=="boolean"||
     typeof raw.consistent!=="boolean"||
     typeof raw.closureApprovalCurrent!=="boolean"||
     typeof raw.reopenApprovalCurrent!=="boolean"||
     typeof raw.historicalClosedPlanAfterReopen!=="boolean"||
     !Array.isArray(raw.findings)||raw.findings.length>10||
     raw.findings.some(k=>!findings.has(k))||
     (raw.consistent!== (raw.findings.length===0))||
     (raw.hasPlan?(
       !stages.has(raw.planStage)||!isCounter(raw.planRevision)||
       raw.planRevision<1):(
       raw.planStage!==null||raw.planRevision!==null||
       raw.plannedSteps!==0||raw.acknowledgedSteps!==0||
       raw.planEventCount!==0))){
    throw Error("Incident lifecycle metrics were not verified.");
  }
  return {
    schema:"eternyx-incident-integrity-v1",
    source:"authenticated_server",integritySource:"owner_case_ledger_consistency",
    incidentId:raw.incidentId,
    incidentStatus:raw.incidentStatus,
    latestIncidentEventStatus:raw.latestIncidentEventStatus,
    ...Object.fromEntries(integrityCounters.map(k=>[k,raw[k]])),
    hasPlan:raw.hasPlan,planStage:raw.planStage,planRevision:raw.planRevision,
    consistent:raw.consistent,findings:[...raw.findings],
    closureApprovalCurrent:raw.closureApprovalCurrent,
    reopenApprovalCurrent:raw.reopenApprovalCurrent,
    historicalClosedPlanAfterReopen:raw.historicalClosedPlanAfterReopen,
    automatedDetectionEnabled:false,cryptographicIntegrityVerified:false,
    workerLivenessVerified:false,externalExecutionTriggered:false,
  };
}
export function verifiedCaseReadiness(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     raw.source!=="authenticated_server"||
     raw.readinessSource!=="owner_actual_case_readiness"||
     typeof raw.generatedAt!=="string"||
     !Number.isFinite(Date.parse(raw.generatedAt))||
     commonFalse.some(k=>raw[k]!==false)||
     raw.automaticFailuresMeasured!==false||
     !readinessCounters.every(k=>isCounter(raw[k]))||
     raw.recentSampleLimit!==30||
     raw.recentCasesScanned>30||
     !Array.isArray(raw.recentCases)||
     raw.recentCases.length!==raw.recentCasesScanned||
     raw.currentOpen+raw.currentInvestigating+raw.currentResolved!==raw.totalOwnerCases||
     raw.currentUnresolvedWithEvidence+raw.currentUnresolvedWithoutEvidence!==
       raw.currentOpen+raw.currentInvestigating||
     raw.currentHighUnresolved>raw.currentOpen+raw.currentInvestigating||
     raw.currentUnresolvedOlder24h>raw.currentOpen+raw.currentInvestigating||
     raw.recentSampleTruncated!==(raw.totalOwnerCases>raw.recentCasesScanned)||
     raw.allCasesIntegrityChecked!==(raw.totalOwnerCases<=raw.recentCasesScanned)){
    throw Error("Operational readiness totals could not be verified.");
  }
  let observedInconsistent=0,observedHistorical=0;
  const rows=raw.recentCases.map(x=>{
    if(!x||typeof x!=="object"||Array.isArray(x)||
      typeof x.incidentId!=="string"||!uuid.test(x.incidentId)||
      !statuses.has(x.status)||typeof x.consistent!=="boolean"||
      typeof x.hasPlan!=="boolean"||
      (x.hasPlan?!stages.has(x.planStage):x.planStage!==null)||
      !isCounter(x.evidenceCount)||
      typeof x.closureApprovalCurrent!=="boolean"||
      typeof x.reopenApprovalCurrent!=="boolean"||
      typeof x.historicalClosedPlanAfterReopen!=="boolean"||
      !Array.isArray(x.findings)||x.findings.length>10||
      x.findings.some(v=>!findings.has(v))||
      x.consistent!==(x.findings.length===0)){
      throw Error("Invalid recent-case readiness row.");
    }
    if(!x.consistent)observedInconsistent++;
    if(x.historicalClosedPlanAfterReopen)observedHistorical++;
    return {incidentId:x.incidentId,status:x.status,
      consistent:x.consistent,findings:[...x.findings],
      hasPlan:x.hasPlan,planStage:x.planStage,evidenceCount:x.evidenceCount,
      closureApprovalCurrent:x.closureApprovalCurrent,
      reopenApprovalCurrent:x.reopenApprovalCurrent,
      historicalClosedPlanAfterReopen:x.historicalClosedPlanAfterReopen};
  });
  if(observedInconsistent!==raw.inconsistentCasesInRecentSample||
     observedHistorical!==raw.historicallyClosedPlansInRecentSample||
     new Set(rows.map(x=>x.incidentId)).size!==rows.length){
    throw Error("Recent-case readiness totals disagree with actual rows.");
  }
  return {schema:"eternyx-incident-readiness-v1",
    source:"authenticated_server",readinessSource:"owner_actual_case_readiness",
    generatedAt:raw.generatedAt,
    ...Object.fromEntries(readinessCounters.map(k=>[k,raw[k]])),
    recentSampleTruncated:raw.recentSampleTruncated,
    allCasesIntegrityChecked:raw.allCasesIntegrityChecked,
    recentCases:rows,
    cryptographicIntegrityVerified:false,automaticFailuresMeasured:false,
    workerLivenessVerified:false,externalExecutionTriggered:false};
}
function cell(value){
  let s=String(value??"");
  if(/^\s*[=+\-@\t\r\n]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
export function readinessCsv(value){
  const report=verifiedCaseReadiness(value);
  const rows=[
    ["scope","id","status","consistent","findings","evidence","planStage"],
    ...report.recentCases.map(r=>[
      "recent_case",r.incidentId,r.status,r.consistent,r.findings.join("|"),
      r.evidenceCount,r.planStage??"none",
    ]),
    ...readinessCounters.map(k=>["owner_total",k,"",true,"",report[k],""]),
    ["limitations","allCasesIntegrityChecked","",report.allCasesIntegrityChecked,"","",""],
    ["limitations","cryptographicIntegrityVerified","",false,"","",""],
    ["limitations","workerLivenessVerified","",false,"","",""],
  ];
  return "\ufeff"+rows.map(row=>row.map(cell).join(",")).join("\r\n")+"\r\n";
}
