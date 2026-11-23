/** Phase 2S: private keyset-page inspection of real owner incident ledgers.
 * Multi-request pagination is best-effort, NOT a transactional snapshot.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS=new Set(["open","investigating","resolved"]);
const STAGES=new Set(["draft","reviewed","closed"]);
const FINDINGS=new Set(["incident_event_chain_inconsistent","incident_status_mismatch",
  "incident_revision_mismatch","plan_revision_mismatch","plan_evidence_missing",
  "plan_step_attestation_mismatch","plan_stage_event_mismatch",
  "late_review_attestation","orphaned_governance_decisions",
  "audit_projection_count_mismatch"]);
const count=n=>Number.isSafeInteger(n)&&n>=0;
function iso(t){
  return typeof t==="string"&&t.length<=45&&Number.isFinite(Date.parse(t))&&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(t);
}
function cursor(value){
  if(value===null)return null;
  if(!value||typeof value!=="object"||Array.isArray(value)||
     !iso(value.beforeCreatedAt)||typeof value.beforeId!=="string"||
     !UUID.test(value.beforeId))throw Error("Invalid audit cursor.");
  return {beforeCreatedAt:value.beforeCreatedAt,beforeId:value.beforeId.toLowerCase()};
}
function compareCursor(a,b){
  const at=Date.parse(a.beforeCreatedAt),bt=Date.parse(b.beforeCreatedAt);
  // keyset ordering is creation time descending, then lowercase UUID descending
  if(at!==bt)return at>bt?1:-1;
  return a.beforeId.localeCompare(b.beforeId);
}
export function verifiedCaseCoveragePage(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     raw.source!=="authenticated_server"||
     raw.coverageSource!=="owner_case_coverage_page"||
     raw.ordering!=="created_at_desc_id_desc"||
     raw.scope!=="best_effort_multi_request_not_atomic_snapshot"||
     !iso(raw.checkedAt)||
     !count(raw.ownerCaseTotalAtRead)||
     !Number.isSafeInteger(raw.pageSize)||raw.pageSize<1||raw.pageSize>20||
     !count(raw.returned)||raw.returned>raw.pageSize||
     !Array.isArray(raw.rows)||raw.rows.length!==raw.returned||
     !count(raw.pageInconsistent)||!count(raw.pageHistoricalClosedAfterReopen)||
     !count(raw.pageCasesWithNoEvidence)||
     typeof raw.hasMore!=="boolean"||
     typeof raw.allOwnerCasesCheckedInSinglePage!=="boolean"||
     raw.transactionallyConsistentAcrossPages!==false||
     raw.cryptographicIntegrityVerified!==false||
     raw.workerLivenessVerified!==false||
     raw.automatedFailureDetection!==false||
     raw.externalExecutionTriggered!==false){
    throw Error("Audit coverage page is not verified source data.");
  }
  const requested=cursor(raw.requestedCursor);
  const next=cursor(raw.nextCursor);
  if((raw.hasMore&&!next)||(!raw.hasMore&&next)||
     (raw.hasMore&&raw.returned!==raw.pageSize)||
     (raw.hasMore&&raw.returned===0)||
     raw.allOwnerCasesCheckedInSinglePage!==(requested===null&&!raw.hasMore)){
    throw Error("Audit pagination and coverage indicators conflict.");
  }
  let previous=requested;
  let inconsistencies=0,historical=0,withoutEvidence=0;
  const seen=new Set();
  const rows=raw.rows.map(r=>{
    if(!r||typeof r!=="object"||Array.isArray(r)||
       typeof r.incidentId!=="string"||!UUID.test(r.incidentId)||
       !iso(r.createdAt)||!STATUS.has(r.status)||
       !Number.isSafeInteger(r.revision)||r.revision<1||
       typeof r.consistent!=="boolean"||
       !Array.isArray(r.findings)||r.findings.length>10||
       r.findings.some(v=>!FINDINGS.has(v))||
       r.consistent!==(r.findings.length===0)||
       typeof r.hasPlan!=="boolean"||
       (r.hasPlan?!STAGES.has(r.planStage):r.planStage!==null)||
       !count(r.evidenceCount)||
       typeof r.closureApprovalCurrent!=="boolean"||
       typeof r.reopenApprovalCurrent!=="boolean"||
       typeof r.historicalClosedPlanAfterReopen!=="boolean"){
      throw Error("Unexpected incident in coverage page.");
    }
    const key={beforeCreatedAt:r.createdAt,beforeId:r.incidentId.toLowerCase()};
    if(previous&&compareCursor(previous,key)<=0){
      throw Error("Owner case cursor is not descending.");
    }
    if(seen.has(key.beforeId))throw Error("Duplicate incident in coverage page.");
    seen.add(key.beforeId);previous=key;
    if(!r.consistent)inconsistencies++;
    if(r.historicalClosedPlanAfterReopen)historical++;
    if(r.evidenceCount===0)withoutEvidence++;
    return {incidentId:r.incidentId.toLowerCase(),createdAt:r.createdAt,
      status:r.status,revision:r.revision,consistent:r.consistent,
      findings:[...r.findings],hasPlan:r.hasPlan,planStage:r.planStage,
      evidenceCount:r.evidenceCount,
      closureApprovalCurrent:r.closureApprovalCurrent,
      reopenApprovalCurrent:r.reopenApprovalCurrent,
      historicalClosedPlanAfterReopen:r.historicalClosedPlanAfterReopen};
  });
  if(inconsistencies!==raw.pageInconsistent||
     historical!==raw.pageHistoricalClosedAfterReopen||
     withoutEvidence!==raw.pageCasesWithNoEvidence||
     (next&&rows.length&&compareCursor(next,{
       beforeCreatedAt:rows.at(-1).createdAt,beforeId:rows.at(-1).incidentId})!==0)){
    throw Error("Coverage page totals or next cursor do not match rows.");
  }
  return {
    schema:"eternyx-owner-case-coverage-v1",
    source:"authenticated_server",coverageSource:"owner_case_coverage_page",
    ordering:"created_at_desc_id_desc",
    scope:"best_effort_multi_request_not_atomic_snapshot",
    checkedAt:raw.checkedAt,ownerCaseTotalAtRead:raw.ownerCaseTotalAtRead,
    pageSize:raw.pageSize,returned:raw.returned,requestedCursor:requested,
    rows,hasMore:raw.hasMore,nextCursor:next,
    pageInconsistent:inconsistencies,
    pageHistoricalClosedAfterReopen:historical,
    pageCasesWithNoEvidence:withoutEvidence,
    allOwnerCasesCheckedInSinglePage:raw.allOwnerCasesCheckedInSinglePage,
    transactionallyConsistentAcrossPages:false,cryptographicIntegrityVerified:false,
    workerLivenessVerified:false,automatedFailureDetection:false,
    externalExecutionTriggered:false,
  };
}
export function appendCaseCoverage(current,page){
  const next=verifiedCaseCoveragePage(page);
  if(current===null){
    if(next.requestedCursor!==null)throw Error("First coverage page must not have a cursor.");
    return aggregate([next]);
  }
  if(current.schema!=="eternyx-coverage-aggregate-v1"||
     !Array.isArray(current.pages)||current.pages.length>=50||
     current.complete||!current.nextCursor||
     !next.requestedCursor||
     compareCursor(next.requestedCursor,current.nextCursor)!==0||
     current.pageSize!==next.pageSize){
    throw Error("Audit scan must continue from the exact prior cursor.");
  }
  if(next.rows.some(row=>current.rows.some(old=>old.incidentId===row.incidentId))){
    throw Error("Audit scan repeated an owner incident.");
  }
  return aggregate([...current.pages,next]);
}
function aggregate(pages){
  const rows=pages.flatMap(p=>p.rows);
  const inconsistent=rows.filter(x=>!x.consistent).length;
  const historical=rows.filter(x=>x.historicalClosedPlanAfterReopen).length;
  const withoutEvidence=rows.filter(x=>x.evidenceCount===0).length;
  const last=pages.at(-1);
  // This can finish a full keyset traversal but cannot prove one shared
  // database snapshot or that new cases weren't created during the scan.
  return {
    schema:"eternyx-coverage-aggregate-v1",
    pages,rows,pageSize:pages[0].pageSize,
    scanned:rows.length,inconsistent,historical,withoutEvidence,
    firstCheckedAt:pages[0].checkedAt,lastCheckedAt:last.checkedAt,
    ownerCaseTotalAtStart:pages[0].ownerCaseTotalAtRead,
    ownerCaseTotalAtLastRead:last.ownerCaseTotalAtRead,
    countChanged:pages[0].ownerCaseTotalAtRead!==last.ownerCaseTotalAtRead,
    complete:!last.hasMore,nextCursor:last.nextCursor,
    moreToScan:last.hasMore,transactionallyConsistentAcrossPages:false,
    cryptographicIntegrityVerified:false,workerLivenessVerified:false,
    externalExecutionTriggered:false,
  };
}
const quote=value=>{
  let s=String(value??"");
  if(/^\s*[=+\-@\t\r\n]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
};
export function caseCoverageCsv(coverage){
  if(!coverage||coverage.schema!=="eternyx-coverage-aggregate-v1"||
     !Array.isArray(coverage.pages)||coverage.pages.length<1||coverage.pages.length>50){
    throw Error("No verified coverage scan.");
  }
  const checked=coverage.pages.reduce((prev,page)=>appendCaseCoverage(prev,page),null);
  const rows=[
    ["scope","id","createdAt","status","consistent","findings","evidenceCount"],
    ...checked.rows.map(r=>[
      "inspected",r.incidentId,r.createdAt,r.status,
      r.consistent,r.findings.join("|"),r.evidenceCount,
    ]),
    ["scan","scanned","","","",checked.scanned,""],
    ["scan","moreToScan","","","",checked.moreToScan,""],
    ["scan","countChanged","","","",checked.countChanged,""],
    ["limitations","transactionallyConsistentAcrossPages","","","",false,""],
    ["limitations","cryptographicIntegrityVerified","","","",false,""],
    ["limitations","workerLivenessVerified","","","",false,""],
  ];
  return "\ufeff"+rows.map(r=>r.map(quote).join(",")).join("\r\n")+"\r\n";
}
