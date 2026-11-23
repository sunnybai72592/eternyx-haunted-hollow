import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest}
  from "../supabase/functions/_shared/automation-control-contract.mjs";
import {
  verifiedHandoffAssessment,verifiedHandoffHistory,
  handoffAssessmentCsv,handoffAssessmentJson,handoffHistoryExport,
} from "../src/lib/automationAuditHandoff.mjs";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const inc="11111111-1111-4111-8111-111111111111";
const pkg="22222222-2222-4222-8222-222222222222";
const review="33333333-3333-4333-8333-333333333333";
const handoff="44444444-4444-4444-8444-444444444444";
const evidence="55555555-5555-4555-8555-555555555555";
const request="66666666-6666-4666-8666-666666666666";
function assessment(){
  return {
    source:"authenticated_server",
    handoffSource:"owner_audit_handoff_metadata",
    incidentId:inc,incidentStatus:"investigating",incidentRevision:2,
    caseConsistent:true,totalPackages:1,
    packages:[{
      packageId:pkg,incidentRevision:2,evidenceId:evidence,
      capturedAt:"2026-11-23T13:00:00Z",
      sourceSnapshotCurrent:true,evidenceExists:true,
      latestReviewId:review,
      latestReviewDecision:"reviewed_for_manual_release_checklist",
      latestReviewAt:"2026-11-23T13:01:00Z",
      eligibleForManualHandoff:true,
      latestHandoffId:handoff,
      latestHandoffReviewId:review,
      latestHandoffAt:"2026-11-23T13:02:00Z",
      manualHandoffCurrent:true,
      freshnessReason:"current_owner_review",
    }],
    eligibleForManualHandoffCount:1,currentManualHandoffCount:1,
    generatedAt:"2026-11-23T13:03:00Z",
    ownerAttestationOnly:true,twoPersonReviewed:false,
    ciVerified:false,deploymentVerified:false,
    workerVerified:false,cryptographicProof:false,
    externalExecutionTriggered:false,
  };
}
function history(){
  return {
    source:"authenticated_server",
    handoffSource:"owner_handoff_receipt_history",
    packageId:pkg,incidentId:inc,total:1,
    rows:[{
      id:handoff,sequence:5,review_id:review,incident_revision:2,
      note:"Owner private manual review, customer secret must not export",
      acknowledged_owner_review:true,
      acknowledged_ci_unverified:true,
      acknowledged_deployment_unverified:true,
      acknowledged_worker_unverified:true,
      created_at:"2026-11-23T13:02:00Z",
    }],
    ownerAttestationOnly:true,releaseVerified:false,
    externalExecutionTriggered:false,
  };
}
test("handoff assessment/history/attestation request contracts reject forged owners, actions or missing acknowledgment",()=>{
  assert.equal(parseAutomationControlRequest({
    action:"incidentAuditHandoffAssessment",incidentId:inc}).ok,true);
  assert.equal(parseAutomationControlRequest({
    action:"incidentAuditHandoffHistory",packageId:pkg}).ok,true);
  const valid={
    action:"incidentAuditHandoffAttest",
    packageId:pkg,reviewId:review,incidentRevision:2,
    note:"Current owner review confirmed; external CI not verified",
    ackOwnerReview:true,ackCiUnverified:true,
    ackDeploymentUnverified:true,ackWorkerUnverified:true,
    requestKey:request,
  };
  assert.equal(parseAutomationControlRequest(valid).ok,true);
  for(const bad of [
    {action:"incidentAuditHandoffAssessment",incidentId:"invalid"},
    {action:"incidentAuditHandoffAssessment",incidentId:inc,ownerId:pkg},
    {action:"incidentAuditHandoffHistory",packageId:"invalid"},
    {action:"incidentAuditHandoffHistory",packageId:pkg,includeRawData:true},
    {...valid,packageId:"invalid"},
    {...valid,reviewId:"invalid"},
    {...valid,requestKey:"invalid"},
    {...valid,incidentRevision:0},
    {...valid,incidentRevision:2147483648},
    {...valid,note:"too short"},
    {...valid,note:"a".repeat(501)},
    {...valid,ackOwnerReview:false},
    {...valid,ackCiUnverified:false},
    {...valid,ackDeploymentUnverified:false},
    {...valid,ackWorkerUnverified:false},
    {...valid,ackCiUnverified:"true"},
    {...valid,actor:pkg},
    {...valid,deploy:true},
    {...valid,runWorkflow:true},
    {...valid,externalUrl:"http://localhost.invalid"},
    {...valid,rawEvidence:"secret"},
  ])assert.equal(parseAutomationControlRequest(bad).ok,false,JSON.stringify(bad));
});
test("real-format owner handoff assessment preserves version and explicitly denies deployment verification",()=>{
  const raw={...assessment(),hiddenAccessToken:"not_copy",
    packages:[{...assessment().packages[0],note:"do_not_copy"}]};
  const safe=verifiedHandoffAssessment(raw);
  assert.equal(safe.totalPackages,1);
  assert.equal(safe.eligibleForManualHandoffCount,1);
  assert.equal(safe.currentManualHandoffCount,1);
  assert.equal(safe.packages[0].manualHandoffCurrent,true);
  assert.equal(safe.ciVerified,false);
  assert.equal(safe.deploymentVerified,false);
  assert.equal(safe.twoPersonReviewed,false);
  const exported=handoffAssessmentJson(raw);
  const csv=handoffAssessmentCsv(raw);
  assert.ok(csv.startsWith("\ufeff"));
  assert.match(csv,/"ciVerified","deploymentVerified","workerVerified"/);
  for(const text of ["not_copy","do_not_copy","secret","hiddenAccessToken"]){
    assert.ok(!exported.includes(text),text);
    assert.ok(!csv.includes(text),text);
  }
});
test("stale source or superseding negative review revokes current owner handoff",()=>{
  const current=assessment();
  const stale={...current,incidentRevision:3,
    packages:[{
      ...current.packages[0],sourceSnapshotCurrent:false,
      eligibleForManualHandoff:false,manualHandoffCurrent:false,
      freshnessReason:"source_changed",
    }],
    eligibleForManualHandoffCount:0,currentManualHandoffCount:0,
  };
  assert.equal(verifiedHandoffAssessment(stale).currentManualHandoffCount,0);
  const concern={...current,
    packages:[{
      ...current.packages[0],
      latestReviewId:request,latestReviewDecision:"needs_attention",
      eligibleForManualHandoff:false,manualHandoffCurrent:false,
      freshnessReason:"latest_review_needs_attention",
    }],
    eligibleForManualHandoffCount:0,currentManualHandoffCount:0,
  };
  assert.equal(verifiedHandoffAssessment(concern).currentManualHandoffCount,0);
  const laterPositive={...current,
    packages:[{...current.packages[0],latestReviewId:request,
      manualHandoffCurrent:false}],
    currentManualHandoffCount:0};
  assert.equal(verifiedHandoffAssessment(laterPositive).currentManualHandoffCount,0);
});
test("fail closed on fabricated review lineage, fake coverage, worker uptime or CI claims",()=>{
  const current=assessment();
  for(const modified of [
    {...current,source:"mock"},
    {...current,handoffSource:"fake"},
    {...current,incidentId:"bad"},
    {...current,caseConsistent:false},
    {...current,totalPackages:9},
    {...current,eligibleForManualHandoffCount:0},
    {...current,currentManualHandoffCount:0},
    {...current,twoPersonReviewed:true},
    {...current,ciVerified:true},
    {...current,deploymentVerified:true},
    {...current,workerVerified:true},
    {...current,cryptographicProof:true},
    {...current,externalExecutionTriggered:true},
    {...current,packages:[{...current.packages[0],sourceSnapshotCurrent:false}]},
    {...current,packages:[{...current.packages[0],latestHandoffReviewId:request}]},
    {...current,packages:[{...current.packages[0],latestReviewDecision:"needs_attention"}]},
    {...current,packages:[{...current.packages[0],latestReviewId:null}]},
    {...current,packages:[{...current.packages[0],freshnessReason:"current_owner_review",
      eligibleForManualHandoff:false}]},
    {...current,packages:[{...current.packages[0],freshnessReason:"deployed_verified"}]},
    {...current,packages:[{...current.packages[0],incidentRevision:1}]},
    {...current,packages:[current.packages[0],current.packages[0]]},
  ])assert.throws(()=>verifiedHandoffAssessment(modified));
});
test("owner receipt notes stay private; downloaded receipt provenance excludes notes and secrets",()=>{
  const raw={...history(),backendSecret:"ignore",
    rows:[{...history().rows[0],privateFingerprint:"do_not_copy"}]};
  const checked=verifiedHandoffHistory(raw,pkg);
  assert.equal(checked.total,1);
  assert.match(checked.rows[0].note,/customer secret/);
  assert.equal(JSON.stringify(checked).includes("do_not_copy"),false);
  const exported=handoffHistoryExport(raw,pkg);
  assert.ok(!exported.includes("customer secret"));
  assert.ok(!exported.includes("privateFingerprint"));
  assert.match(exported,/"releaseVerified": false/);
  assert.throws(()=>verifiedHandoffHistory({...raw,releaseVerified:true},pkg));
  assert.throws(()=>verifiedHandoffHistory({...raw,packageId:inc},pkg));
  assert.throws(()=>verifiedHandoffHistory({...raw,rows:[
    {...raw.rows[0],acknowledged_ci_unverified:false}]},pkg));
});
test("database guards immutable handoff audit and has no execution, release or external deployment code",async()=>{
  const sql=await read("supabase/migrations/20261123170000_automation_audit_handoff.sql");
  for(const pat of [
    /CREATE TABLE public\.automation_case_audit_handoffs/,
    /GENERATED ALWAYS AS IDENTITY UNIQUE/,
    /CREATE OR REPLACE FUNCTION public\.automation_case_audit_handoff_assessment/,
    /CREATE OR REPLACE FUNCTION public\.automation_attest_case_audit_handoff/,
    /CREATE OR REPLACE FUNCTION public\.automation_case_audit_handoff_history/,
    /latest_review\.decision<>'reviewed_for_manual_release_checklist'/,
    /latest_review\.id<>p_review_id/,
    /projected IS DISTINCT FROM original\.snapshot/,
    /latest_manual_review_required/,
    /stale_handoff_source/,
    /stale_handoff_revision/,
    /handoff_limit/,
    /idempotency_conflict/,
    /pg_advisory_xact_lock/,
    /deploymentVerified',false/,
    /workerVerified',false/,
    /twoPersonReviewed',false/,
    /externalExecutionTriggered',false/,
    /ENABLE ROW LEVEL SECURITY/,
    /REVOKE ALL ON public\.automation_case_audit_handoffs FROM PUBLIC,anon,authenticated/,
  ])assert.match(sql,pat);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
  assert.doesNotMatch(sql,/automation_record_run\(|automation_toggle_schedule\(/);
  assert.doesNotMatch(sql,/https?:\/\//);
});
test("authenticated Edge and existing operator workspace mount complete, working nonexecuting handoff",async()=>{
  const edge=await read("supabase/functions/automation-control/index.ts");
  const ui=await read("src/components/AutomationAuditHandoffPanel.tsx");
  const parent=await read("src/components/AutomationAuditPackagePanel.tsx");
  for(const rpc of [
    "automation_case_audit_handoff_assessment",
    "automation_case_audit_handoff_history",
    "automation_attest_case_audit_handoff",
  ])assert.ok(edge.includes(rpc),rpc);
  assert.match(edge,/p_user_id:user\.id/);
  assert.match(edge,/handoffSource:data\.source/);
  assert.match(edge,/ownerAttestationOnly:true/);
  assert.match(ui,/Check current handoff readiness/);
  assert.match(ui,/Record owner handoff receipt/);
  assert.match(ui,/View private handoff receipts/);
  assert.match(ui,/Safe CSV/);
  assert.match(ui,/window\.confirm/);
  assert.match(ui,/independent release/);
  assert.match(parent,/<AutomationAuditHandoffPanel/);
});
