import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest}
  from "../supabase/functions/_shared/automation-control-contract.mjs";
import {verifiedAuditPackageInbox,auditPackageSafeExport,auditPackageCsv}
  from "../src/lib/automationAuditPackages.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const incidentId="11111111-1111-4111-8111-111111111111";
const evidenceId="22222222-2222-4222-8222-222222222222";
const packageId="33333333-3333-4333-8333-333333333333";
const requestKey="44444444-4444-4444-8444-444444444444";
const reviewId="55555555-5555-4555-8555-555555555555";
const captured="2026-11-23T12:18:00Z";
const evidenceCaptured="2026-11-23T12:15:00Z";
function inbox(){
  return {
    source:"authenticated_server",packageSource:"owner_audit_packages_metadata",
    incidentId,incidentStatus:"investigating",incidentRevision:2,
    caseConsistent:true,
    evidence:[{id:evidenceId,kind:"incident_origin",capturedAt:evidenceCaptured}],
    packages:[{
      id:packageId,incidentId,incidentRevision:2,
      evidenceId,capturedAt:captured,current:true,
      reviewCount:1,reviews:[{
        id:reviewId,sequence:1,
        decision:"reviewed_for_manual_release_checklist",
        note:"Private owner review, must never export this specific secret",
        acknowledged_source:true,acknowledged_no_deployment:true,
        acknowledged_no_crypto_proof:true,
        created_at:"2026-11-23T12:19:00Z",
      }],
      snapshot:{
        source:"owner_case_ledger_consistency",incidentId,
        incidentStatus:"investigating",incidentRevision:2,
        consistent:true,findings:[],capturedEvidenceCount:1,
        hasPlan:false,planStage:null,planRevision:null,
        acknowledgedSteps:0,plannedSteps:0,
        incidentEventCount:2,planEventCount:0,
        closureDecisionCount:0,reopenDecisionCount:0,
        auditLedgerCount:3,auditProjectionCount:3,
        evidenceId,evidenceKind:"incident_origin",evidenceCapturedAt:evidenceCaptured,
        cryptographicIntegrityVerified:false,
        workerLivenessVerified:false,releaseDeployed:false,
      },
    }],
    packageCount:1,capturedAt:captured,
    rawInputsIncluded:false,rawOutputsIncluded:false,
    releaseVerified:false,cryptographicProof:false,
    externalExecutionTriggered:false,
  };
}
test("strict owner-only package creation/inbox contracts prevent forged evidence and extra actions",()=>{
  assert.equal(parseAutomationControlRequest({
    action:"incidentAuditPackageInbox",incidentId}).ok,true);
  assert.equal(parseAutomationControlRequest({
    action:"incidentAuditPackageCreate",incidentId,
    incidentRevision:2,evidenceId,requestKey}).ok,true);
  for(const request of [
    {action:"incidentAuditPackageInbox",incidentId:"not_uuid"},
    {action:"incidentAuditPackageInbox",incidentId,includeNotes:true},
    {action:"incidentAuditPackageInbox",incidentId,ownerId:evidenceId},
    {action:"incidentAuditPackageCreate",incidentId,
      incidentRevision:0,evidenceId,requestKey},
    {action:"incidentAuditPackageCreate",incidentId,
      incidentRevision:2,evidenceId:"bad",requestKey},
    {action:"incidentAuditPackageCreate",incidentId,
      incidentRevision:2,evidenceId,requestKey:"bad"},
    {action:"incidentAuditPackageCreate",incidentId,
      incidentRevision:2,evidenceId,requestKey,runNow:true},
    {action:"incidentAuditPackageCreate",incidentId,
      incidentRevision:2,evidenceId,requestKey,rawSnapshot:"hacked"},
  ])assert.equal(parseAutomationControlRequest(request).ok,false,JSON.stringify(request));
});
test("strict human review acknowledges non-deployment, source provenance and lack of cryptographic proof",()=>{
  const standard={
    action:"incidentAuditPackageReview",packageId,
    decision:"reviewed_for_manual_release_checklist",
    note:"Owner checked the real stored evidence receipt",
    acknowledgedSource:true,acknowledgedNoDeployment:true,
    acknowledgedNoCryptoProof:true,requestKey,
  };
  assert.equal(parseAutomationControlRequest(standard).ok,true);
  assert.equal(parseAutomationControlRequest({...standard,decision:"needs_attention",
    acknowledgedSource:false,acknowledgedNoDeployment:false,
    acknowledgedNoCryptoProof:false}).ok,true);
  for(const request of [
    {...standard,decision:"auto_release"},
    {...standard,decision:"execute"},
    {...standard,note:"too short"},
    {...standard,note:"a".repeat(501)},
    {...standard,packageId:"bad"},
    {...standard,requestKey:"bad"},
    {...standard,acknowledgedSource:false},
    {...standard,acknowledgedNoDeployment:false},
    {...standard,acknowledgedNoCryptoProof:false},
    {...standard,acknowledgedSource:"true"},
    {...standard,token:"secret"},
    {...standard,deploy:true},
    {...standard,webhookUrl:"https://localhost.invalid"},
  ])assert.equal(parseAutomationControlRequest(request).ok,false,JSON.stringify(request));
});
test("real metadata inbox validates source and only exposes private review notes in owner screen",()=>{
  const checked=verifiedAuditPackageInbox({
    ...inbox(),serverSecret:"do_not_copy",
    evidence:[{...inbox().evidence[0],rawInput:"do_not_copy"}],
    packages:[{...inbox().packages[0],
      snapshot:{...inbox().packages[0].snapshot,token:"do_not_copy"},
      reviews:[{...inbox().packages[0].reviews[0],requestKey:"do_not_copy"}]}],
  });
  assert.equal(checked.incidentRevision,2);
  assert.equal(checked.packageCount,1);
  assert.equal(checked.packages[0].current,true);
  assert.match(checked.packages[0].reviews[0].note,/Private owner review/);
  assert.equal(JSON.stringify(checked).includes("do_not_copy"),false);
  assert.equal(checked.releaseVerified,false);
  assert.equal(checked.cryptographicProof,false);
});
test("private JSON/CSV export contains only allowlisted facts and excludes all review notes",()=>{
  const raw=inbox();
  const exp=auditPackageSafeExport(raw);
  const json=JSON.stringify(exp);
  const csv=auditPackageCsv(raw);
  assert.equal(exp.packages[0].snapshot.incidentRevision,2);
  assert.equal(exp.packages[0].currentAtRead,true);
  assert.equal(exp.releaseVerified,false);
  for(const secret of ["Private owner review","specific secret","note","requestKey"]){
    assert.equal(json.includes(secret),false,secret);
    assert.equal(csv.includes(secret),false,secret);
  }
  assert.ok(csv.startsWith("\ufeff"));
  assert.match(csv,/"reviewed_for_manual_release_checklist"/);
  assert.match(csv,/"releaseVerified","cryptographicProof"/);
});
test("audit package source verifier rejects invented deployment, uptime, stale status and inconsistent ledgers",()=>{
  const valid=inbox();
  for(const modified of [
    {...valid,source:"client_mock"},
    {...valid,packageSource:"fake"},
    {...valid,incidentId:"bad"},
    {...valid,releaseVerified:true},
    {...valid,cryptographicProof:true},
    {...valid,rawInputsIncluded:true},
    {...valid,externalExecutionTriggered:true},
    {...valid,packageCount:5},
    {...valid,packages:[valid.packages[0],valid.packages[0]]},
    {...valid,evidence:[valid.evidence[0],valid.evidence[0]]},
    {...valid,packages:[{...valid.packages[0],incidentRevision:3}]},
    {...valid,packages:[{...valid.packages[0],evidenceId:packageId}]},
    {...valid,packages:[{...valid.packages[0],current:true,
      snapshot:{...valid.packages[0].snapshot,incidentStatus:"resolved"}}]},
    {...valid,packages:[{...valid.packages[0],snapshot:{
      ...valid.packages[0].snapshot,releaseDeployed:true}}]},
    {...valid,packages:[{...valid.packages[0],snapshot:{
      ...valid.packages[0].snapshot,auditProjectionCount:99}}]},
    {...valid,packages:[{...valid.packages[0],snapshot:{
      ...valid.packages[0].snapshot,consistent:false}}]},
    {...valid,packages:[{...valid.packages[0],reviews:[{
      ...valid.packages[0].reviews[0],acknowledged_no_crypto_proof:false}]}]},
  ])assert.throws(()=>verifiedAuditPackageInbox(modified));
});
test("stored out-of-date snapshots are factual and can remain visible for needs-attention review",()=>{
  const raw=inbox();
  const old={...raw,incidentRevision:3,
    incidentStatus:"resolved",
    packages:[{...raw.packages[0],current:false}]};
  const checked=verifiedAuditPackageInbox(old);
  assert.equal(checked.packages[0].current,false);
  assert.equal(checked.packages[0].snapshot.incidentRevision,2);
  assert.equal(checked.incidentRevision,3);
});
test("SQL is metadata-only and service-only; operator workbench has no execution or release interface",async()=>{
  const sql=await read("supabase/migrations/20261123160000_automation_evidence_packages.sql");
  const edge=await read("supabase/functions/automation-control/index.ts");
  const ui=await read("src/components/AutomationAuditPackagePanel.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  for(const re of [
    /CREATE TABLE public\.automation_case_audit_packages/,
    /CREATE TABLE public\.automation_case_audit_reviews/,
    /CREATE OR REPLACE FUNCTION public\.automation_case_audit_projection/,
    /CREATE OR REPLACE FUNCTION public\.automation_create_case_audit_package/,
    /CREATE OR REPLACE FUNCTION public\.automation_review_case_audit_package/,
    /CREATE OR REPLACE FUNCTION public\.automation_case_audit_package_inbox/,
    /automation_incident_lifecycle_check/,
    /audit_evidence_not_found/,
    /stale_audit_package/,
    /manual_limitations_not_acknowledged/,
    /audit_package_limit/,
    /audit_review_limit/,
    /pg_advisory_xact_lock/,
    /idempotency_conflict/,
    /REVOKE ALL ON public\.automation_case_audit_packages FROM PUBLIC,anon,authenticated/,
    /REVOKE ALL ON public\.automation_case_audit_reviews FROM PUBLIC,anon,authenticated/,
    /SECURITY INVOKER/,
  ])assert.match(sql,re);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
  assert.doesNotMatch(sql,/automation_record_run\(|automation_toggle_schedule\(/);
  for(const name of [
    "automation_case_audit_package_inbox",
    "automation_create_case_audit_package",
    "automation_review_case_audit_package",
  ])assert.ok(edge.includes(name),name);
  assert.match(edge,/p_user_id:user\.id/);
  assert.match(edge,/packageSource:data\.source/);
  assert.match(ui,/Capture private metadata-only package/);
  assert.match(ui,/Record human audit review/);
  assert.match(ui,/Safe CSV/);
  assert.match(ui,/manual release-readiness checklist/i);
  assert.match(ui,/window\.confirm/);
  assert.match(cloud,/<AutomationAuditPackagePanel/);
});
