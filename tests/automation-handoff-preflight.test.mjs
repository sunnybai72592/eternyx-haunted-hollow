import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  verifiedHandoffAssessment,verifiedHandoffHistory,
  verifyHandoffPreflight,handoffAssessmentJson,handoffAssessmentCsv,
} from "../src/lib/automationAuditHandoff.mjs";

const incident="11111111-1111-4111-8111-111111111111";
const evidence="22222222-2222-4222-8222-222222222222";
const pkg="33333333-3333-4333-8333-333333333333";
const review="44444444-4444-4444-8444-444444444444";
const other="55555555-5555-4555-8555-555555555555";
const handoff="66666666-6666-4666-8666-666666666666";

function assessed(){
  return {
    source:"authenticated_server",handoffSource:"owner_audit_handoff_metadata",
    incidentId:incident,incidentStatus:"investigating",incidentRevision:2,
    caseConsistent:true,totalPackages:1,
    packages:[{
      packageId:pkg,evidenceId:evidence,incidentRevision:2,
      capturedAt:"2026-11-23T14:00:00Z",
      sourceSnapshotCurrent:true,evidenceExists:true,
      latestReviewId:review,latestReviewDecision:"reviewed_for_manual_release_checklist",
      latestReviewAt:"2026-11-23T14:01:00Z",
      eligibleForManualHandoff:true,
      latestHandoffId:null,latestHandoffReviewId:null,latestHandoffAt:null,
      manualHandoffCurrent:false,freshnessReason:"current_owner_review",
    }],
    eligibleForManualHandoffCount:1,currentManualHandoffCount:0,
    generatedAt:"2026-11-23T14:02:00Z",
    ownerAttestationOnly:true,twoPersonReviewed:false,
    ciVerified:false,deploymentVerified:false,workerVerified:false,
    cryptographicProof:false,externalExecutionTriggered:false,
  };
}
function next(current=assessed()){
  return {...current,generatedAt:"2026-11-23T14:03:00Z"};
}
function receiptHistory(){
  return {
    source:"authenticated_server",handoffSource:"owner_handoff_receipt_history",
    incidentId:incident,packageId:pkg,total:2,
    rows:[
      {id:handoff,sequence:2,review_id:review,incident_revision:2,
        note:"Owner manually checked evidence on current case",
        acknowledged_owner_review:true,acknowledged_ci_unverified:true,
        acknowledged_deployment_unverified:true,acknowledged_worker_unverified:true,
        created_at:"2026-11-23T14:05:00Z"},
      {id:other,sequence:1,review_id:review,incident_revision:2,
        note:"Earlier manual handoff without CI verification",
        acknowledged_owner_review:true,acknowledged_ci_unverified:true,
        acknowledged_deployment_unverified:true,acknowledged_worker_unverified:true,
        created_at:"2026-11-23T14:04:00Z"},
    ],
    ownerAttestationOnly:true,releaseVerified:false,externalExecutionTriggered:false,
  };
}
test("an unchanged authenticated owner source passes a fresh recheck",()=>{
  const result=verifyHandoffPreflight(assessed(),next(),pkg);
  assert.equal(result.incidentId,incident);
  assert.equal(result.packages[0].latestReviewId,review);
  assert.equal(result.currentManualHandoffCount,0);
  assert.equal(result.automaticRelease,undefined);
});
test("a changed case, owner source or review invalidates the pre-write consent",()=>{
  const old=assessed(),latest=next();
  const cases=[
    {...latest,incidentId:other},
    {...latest,incidentRevision:3,
      packages:[{...latest.packages[0],incidentRevision:2,
        sourceSnapshotCurrent:false,eligibleForManualHandoff:false,
        freshnessReason:"source_changed"}],
      eligibleForManualHandoffCount:0},
    {...latest,packages:[{...latest.packages[0],latestReviewId:other}]},
    {...latest,packages:[{...latest.packages[0],evidenceId:other}]},
    {...latest,packages:[{...latest.packages[0],capturedAt:"2026-11-23T13:59:00Z"}]},
    {...latest,packages:[{...latest.packages[0],latestReviewId:other,
      latestReviewDecision:"needs_attention",
      eligibleForManualHandoff:false,freshnessReason:"latest_review_needs_attention"}],
      eligibleForManualHandoffCount:0},
    {...latest,packages:[{...latest.packages[0],
      latestHandoffId:handoff,latestHandoffReviewId:review,
      latestHandoffAt:"2026-11-23T14:02:30Z",
      manualHandoffCurrent:true}],currentManualHandoffCount:1},
    {...latest,generatedAt:"2026-11-23T14:01:59Z"},
  ];
  for(const c of cases){
    assert.throws(()=>verifyHandoffPreflight(old,c,pkg),undefined,JSON.stringify(c));
  }
  assert.throws(()=>verifyHandoffPreflight(old,latest,other));
  assert.throws(()=>verifyHandoffPreflight(old,latest,"bad-id"));
});
test("do not create a second owner handoff when it already exists",()=>{
  const completed=next();
  completed.packages[0]={...completed.packages[0],
    latestHandoffId:handoff,latestHandoffReviewId:review,
    latestHandoffAt:"2026-11-23T14:02:30Z",
    manualHandoffCurrent:true};
  completed.currentManualHandoffCount=1;
  assert.throws(()=>verifyHandoffPreflight(completed,next(completed),pkg));
});
test("fail closed on orphaned receipt, contradictory reasons, revisions and impossible chronology",()=>{
  const valid=assessed();
  const impossible=[
    {...valid,packages:[{...valid.packages[0],manualHandoffCurrent:true}],
      currentManualHandoffCount:1},
    {...valid,packages:[{...valid.packages[0],freshnessReason:"source_changed"}]},
    {...valid,packages:[{...valid.packages[0],sourceSnapshotCurrent:false,
      freshnessReason:"current_owner_review",
      eligibleForManualHandoff:false}],eligibleForManualHandoffCount:0},
    {...valid,packages:[{...valid.packages[0],latestReviewAt:"2026-11-23T13:59:00Z"}]},
    {...valid,packages:[{...valid.packages[0],latestReviewAt:"2026-11-23T14:04:00Z"}]},
    {...valid,packages:[{...valid.packages[0],capturedAt:"2026-11-23T14:05:00Z"}]},
    {...valid,packages:[{...valid.packages[0],
      latestHandoffId:handoff,latestHandoffReviewId:review,
      latestHandoffAt:"2026-11-23T14:06:00Z"}]},
  ];
  for(const c of impossible)assert.throws(()=>verifiedHandoffAssessment(c));
});
test("handoff receipt history rejects timestamp inversions independently of sequence",()=>{
  const valid=receiptHistory();
  assert.equal(verifiedHandoffHistory(valid,pkg).total,2);
  assert.throws(()=>verifiedHandoffHistory({...valid,rows:[
    valid.rows[0],{...valid.rows[1],created_at:"2026-11-23T14:06:00Z"},
  ]},pkg));
});
test("export remains allowlisted with no private note or injected field",()=>{
  const value={...assessed(),hiddenSecret:"do-not-export",
    packages:[{...assessed().packages[0],privateNote:"do-not-export"}]};
  for(const output of [handoffAssessmentJson(value),handoffAssessmentCsv(value)]){
    assert.doesNotMatch(output,/do-not-export|hiddenSecret|privateNote/);
  }
});
test("operator UI uses a second authenticated check, incident scope, and never claims independent release",async()=>{
  const ui=await readFile(new URL("../src/components/AutomationAuditHandoffPanel.tsx",import.meta.url),"utf8");
  assert.match(ui,/verifyHandoffPreflight\(raw,latest,packageId\)/);
  assert.match(ui,/const latest=await call\("incidentAuditHandoffAssessment"/);
  assert.match(ui,/scope\.current\.version/);
  assert.match(ui,/matches\(version,packageId\)/);
  assert.match(ui,/history\.packageId===selected/);
  assert.match(ui,/!active\.manualHandoffCurrent/);
  assert.match(ui,/owner-only handoff/);
  assert.match(ui,/No external release checks are verified/);
  assert.doesNotMatch(ui,/automaticRelease:true|deploymentVerified:true/);
});
