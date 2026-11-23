/** Phase 2T: owner-only, authenticated audit packages built from database metadata.
 * This module cannot certify release, deployment, uptime or cryptographic proof.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS=new Set(["open","investigating","resolved"]);
const KINDS=new Set(["incident_origin","completed_run","schedule_state","quarantine_receipt"]);
const DECISIONS=new Set(["needs_attention","reviewed_for_manual_release_checklist"]);
const STAGES=new Set(["draft","reviewed","closed"]);
const safeNumber=x=>Number.isSafeInteger(x)&&x>=0;
const time=x=>typeof x==="string"&&x.length<=45&&Number.isFinite(Date.parse(x))&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(x);
const eventCounters=["capturedEvidenceCount","acknowledgedSteps","plannedSteps",
  "incidentEventCount","planEventCount","closureDecisionCount",
  "reopenDecisionCount","auditLedgerCount","auditProjectionCount"];
function snapshotProjection(s,incidentId,evidence){
  if(!s||typeof s!=="object"||Array.isArray(s)||
     s.source!=="owner_case_ledger_consistency"||
     s.incidentId!==incidentId||!STATUS.has(s.incidentStatus)||
     !safeNumber(s.incidentRevision)||s.incidentRevision<1||
     s.evidenceId!==evidence.id||s.evidenceKind!==evidence.kind||
     !time(s.evidenceCapturedAt)||
     Date.parse(s.evidenceCapturedAt)!==Date.parse(evidence.capturedAt)||
     s.consistent!==true||!Array.isArray(s.findings)||s.findings.length!==0||
     s.hasPlan!==true&&s.hasPlan!==false||
     (s.hasPlan?(!STAGES.has(s.planStage)||!safeNumber(s.planRevision)||
       s.planRevision<1):(s.planStage!==null||s.planRevision!==null))||
     !eventCounters.every(k=>safeNumber(s[k]))||
     s.capturedEvidenceCount<1||
     s.acknowledgedSteps>s.plannedSteps||
     s.auditLedgerCount!==s.auditProjectionCount||
     s.cryptographicIntegrityVerified!==false||
     s.workerLivenessVerified!==false||s.releaseDeployed!==false){
    throw Error("Audit package contains unverified or inconsistent source metadata.");
  }
  return {source:"owner_case_ledger_consistency",
    incidentId:s.incidentId,incidentStatus:s.incidentStatus,
    incidentRevision:s.incidentRevision,consistent:true,findings:[],
    hasPlan:s.hasPlan,planStage:s.planStage,planRevision:s.planRevision,
    ...Object.fromEntries(eventCounters.map(k=>[k,s[k]])),
    evidenceId:s.evidenceId,evidenceKind:s.evidenceKind,
    evidenceCapturedAt:s.evidenceCapturedAt,
    cryptographicIntegrityVerified:false,workerLivenessVerified:false,
    releaseDeployed:false};
}
export function verifiedAuditPackageInbox(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     raw.source!=="authenticated_server"||
     raw.packageSource!=="owner_audit_packages_metadata"||
     !UUID.test(raw.incidentId)||!STATUS.has(raw.incidentStatus)||
     !safeNumber(raw.incidentRevision)||raw.incidentRevision<1||
     typeof raw.caseConsistent!=="boolean"||
     !Array.isArray(raw.evidence)||raw.evidence.length>8||
     !Array.isArray(raw.packages)||raw.packages.length>8||
     !safeNumber(raw.packageCount)||raw.packageCount!==raw.packages.length||
     !time(raw.capturedAt)||
     raw.rawInputsIncluded!==false||raw.rawOutputsIncluded!==false||
     raw.releaseVerified!==false||raw.cryptographicProof!==false||
     raw.externalExecutionTriggered!==false){
     throw Error("Unverified owner audit package inbox.");
  }
  const evidence=raw.evidence.map(e=>{
    if(!e||typeof e!=="object"||Array.isArray(e)||
       !UUID.test(e.id)||!KINDS.has(e.kind)||!time(e.capturedAt)){
       throw Error("Unverified captured evidence receipt.");
    }
    return {id:e.id,kind:e.kind,capturedAt:e.capturedAt};
  });
  if(new Set(evidence.map(x=>x.id)).size!==evidence.length){
    throw Error("Duplicated evidence receipts.");
  }
  const packages=raw.packages.map(p=>{
    if(!p||typeof p!=="object"||Array.isArray(p)||
       !UUID.test(p.id)||p.incidentId!==raw.incidentId||
       !UUID.test(p.evidenceId)||!time(p.capturedAt)||
       !safeNumber(p.incidentRevision)||p.incidentRevision<1||
       typeof p.current!=="boolean"||
       !safeNumber(p.reviewCount)||p.reviewCount>8||
       !Array.isArray(p.reviews)||p.reviews.length!==p.reviewCount){
       throw Error("Invalid stored audit package.");
    }
    const e=evidence.find(x=>x.id===p.evidenceId);
    if(!e)throw Error("Package refers to an unknown owner evidence receipt.");
    const snapshot=snapshotProjection(p.snapshot,raw.incidentId,e);
    if(snapshot.incidentRevision!==p.incidentRevision){
      throw Error("Package metadata revision does not match its immutable snapshot.");
    }
    if(p.current&&(
       !raw.caseConsistent||
       snapshot.incidentRevision!==raw.incidentRevision||
       snapshot.incidentStatus!==raw.incidentStatus)){
      throw Error("Stale package was marked current.");
    }
    const reviews=p.reviews.map(r=>{
      if(!r||typeof r!=="object"||Array.isArray(r)||
         !UUID.test(r.id)||!safeNumber(r.sequence)||r.sequence<1||
         !DECISIONS.has(r.decision)||
         typeof r.note!=="string"||
         r.note.trim().length<12||r.note.trim().length>500||
         typeof r.acknowledged_source!=="boolean"||
         typeof r.acknowledged_no_deployment!=="boolean"||
         typeof r.acknowledged_no_crypto_proof!=="boolean"||
         !time(r.created_at)||
         (r.decision==="reviewed_for_manual_release_checklist"&&
          (!r.acknowledged_source||!r.acknowledged_no_deployment||
           !r.acknowledged_no_crypto_proof))){
         throw Error("Unverified human audit review.");
      }
      return {id:r.id,sequence:r.sequence,
        decision:r.decision,note:r.note,createdAt:r.created_at,
        acknowledgedSource:r.acknowledged_source,
        acknowledgedNoDeployment:r.acknowledged_no_deployment,
        acknowledgedNoCryptoProof:r.acknowledged_no_crypto_proof};
    });
    if(new Set(reviews.map(x=>x.id)).size!==reviews.length ||
       reviews.some((r,i)=>i>0&&r.sequence>=reviews[i-1].sequence)){
      throw Error("Stored audit reviews are not in descending order.");
    }
    return {id:p.id,incidentId:p.incidentId,
      incidentRevision:p.incidentRevision,evidenceId:p.evidenceId,
      capturedAt:p.capturedAt,current:p.current,
      snapshot,reviewCount:p.reviewCount,reviews};
  });
  if(new Set(packages.map(x=>x.id)).size!==packages.length||
     packages.some((p,i)=>i>0&&
       Date.parse(p.capturedAt)>Date.parse(packages[i-1].capturedAt))){
    throw Error("Duplicate or out-of-order audit packages.");
  }
  return {schema:"eternyx-owner-audit-package-inbox-v1",
    source:"authenticated_server",packageSource:"owner_audit_packages_metadata",
    incidentId:raw.incidentId,incidentStatus:raw.incidentStatus,
    incidentRevision:raw.incidentRevision,caseConsistent:raw.caseConsistent,
    evidence,packages,packageCount:raw.packageCount,capturedAt:raw.capturedAt,
    rawInputsIncluded:false,rawOutputsIncluded:false,
    releaseVerified:false,cryptographicProof:false,
    externalExecutionTriggered:false};
}
export function auditPackageSafeExport(input){
  const inbox=verifiedAuditPackageInbox(input);
  return {schema:"eternyx-owner-audit-packages-export-v1",
    source:"authenticated_server",packageSource:"owner_audit_packages_metadata",
    incidentId:inbox.incidentId,
    incidentStatusAtRead:inbox.incidentStatus,
    caseConsistentAtRead:inbox.caseConsistent,
    incidentRevisionAtRead:inbox.incidentRevision,
    capturedAt:inbox.capturedAt,
    packages:inbox.packages.map(p=>({
      id:p.id,incidentRevision:p.incidentRevision,
      capturedAt:p.capturedAt,evidenceId:p.evidenceId,
      currentAtRead:p.current,snapshot:p.snapshot,
      reviews:p.reviews.map(r=>({
        id:r.id,decision:r.decision,createdAt:r.createdAt,
        acknowledgedSource:r.acknowledgedSource,
        acknowledgedNoDeployment:r.acknowledgedNoDeployment,
        acknowledgedNoCryptoProof:r.acknowledgedNoCryptoProof,
      })),
    })),
    releaseVerified:false,cryptographicProof:false,
    externalExecutionTriggered:false};
}
const quote=value=>{
 let s=String(value??"");
 if(/^\s*[=+\-@\t\r\n]/.test(s))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
};
export function auditPackageCsv(input){
  const exp=auditPackageSafeExport(input);
  const rows=[["packageId","incidentRevision","capturedAt","evidenceId",
    "statusAtCapture","currentAtRead","reviewCount","latestManualDecision",
    "releaseVerified","cryptographicProof"]];
  for(const p of exp.packages){
    rows.push([p.id,p.incidentRevision,p.capturedAt,p.evidenceId,
      p.snapshot.incidentStatus,p.currentAtRead,p.reviews.length,
      p.reviews[0]?.decision??"",false,false]);
  }
  return "\ufeff"+rows.map(r=>r.map(quote).join(",")).join("\r\n")+"\r\n";
}
