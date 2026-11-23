import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest}
  from "../supabase/functions/_shared/automation-control-contract.mjs";
import {verifiedCaseIntegrity,verifiedCaseReadiness,readinessCsv}
  from "../src/lib/automationCaseReadiness.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const id="11111111-1111-4111-8111-111111111111";
const id2="22222222-2222-4222-8222-222222222222";
const integrity={
  source:"authenticated_server",integritySource:"owner_case_ledger_consistency",
  incidentId:id,incidentStatus:"investigating",incidentRevision:4,
  latestIncidentEventStatus:"investigating",
  incidentEventCount:4,capturedEvidenceCount:1,
  hasPlan:true,planStage:"closed",planRevision:4,
  plannedSteps:1,acknowledgedSteps:1,planEventCount:3,
  closureDecisionCount:1,reopenDecisionCount:1,
  auditLedgerCount:10,auditProjectionCount:10,
  closureApprovalCurrent:false,reopenApprovalCurrent:false,
  historicalClosedPlanAfterReopen:true,
  consistent:true,findings:[],
  automatedDetectionEnabled:false,cryptographicIntegrityVerified:false,
  workerLivenessVerified:false,externalExecutionTriggered:false,
};
const readiness={
  source:"authenticated_server",readinessSource:"owner_actual_case_readiness",
  generatedAt:"2026-11-23T12:00:00Z",
  totalOwnerCases:2,currentOpen:1,currentInvestigating:1,
  currentResolved:0,currentHighUnresolved:1,currentUnresolvedOlder24h:0,
  currentUnresolvedWithEvidence:1,currentUnresolvedWithoutEvidence:1,
  planDraft:0,planReviewed:0,planClosed:1,
  recentSampleLimit:30,recentCasesScanned:2,recentSampleTruncated:false,
  inconsistentCasesInRecentSample:0,historicallyClosedPlansInRecentSample:1,
  allCasesIntegrityChecked:true,cryptographicIntegrityVerified:false,
  automaticFailuresMeasured:false,workerLivenessVerified:false,
  externalExecutionTriggered:false,
  recentCases:[
    {incidentId:id,status:"investigating",consistent:true,findings:[],
      hasPlan:true,planStage:"closed",evidenceCount:1,
      closureApprovalCurrent:false,reopenApprovalCurrent:false,
      historicalClosedPlanAfterReopen:true},
    {incidentId:id2,status:"open",consistent:true,findings:[],
      hasPlan:false,planStage:null,evidenceCount:0,
      closureApprovalCurrent:false,reopenApprovalCurrent:false,
      historicalClosedPlanAfterReopen:false},
  ],
};
test("strict owner lifecycle and readiness contracts reject arbitrary probing and writes",()=>{
  assert.equal(parseAutomationControlRequest({
    action:"incidentLifecycleCheck",incidentId:id}).ok,true);
  assert.equal(parseAutomationControlRequest({action:"incidentReadinessReport"}).ok,true);
  for(const req of [
    {action:"incidentLifecycleCheck",incidentId:"bad"},
    {action:"incidentLifecycleCheck",incidentId:id,ownerId:id2},
    {action:"incidentLifecycleCheck",incidentId:id,includeNotes:true},
    {action:"incidentLifecycleCheck",incidentId:id,execute:true},
    {action:"incidentReadinessReport",ownerId:id},
    {action:"incidentReadinessReport",limit:100000},
    {action:"incidentReadinessReport",checkWorker:true},
    {action:"incidentReadinessReport",runDiagnostics:true},
  ])assert.equal(parseAutomationControlRequest(req).ok,false,JSON.stringify(req));
});
test("case lifecycle sanitizer allows factual records and drops untrusted content",()=>{
  const checked=verifiedCaseIntegrity({
    ...integrity,notes:"confidential customer notes",
    rawWorkflow:"private payload",workerSecret:"token",
  });
  assert.equal(checked.incidentEventCount,4);
  assert.equal(checked.planRevision,4);
  assert.equal(checked.auditLedgerCount,10);
  assert.equal(checked.consistent,true);
  for(const secret of ["confidential","private payload","workerSecret","notes"]){
    assert.equal(JSON.stringify(checked).includes(secret),false,secret);
  }
  assert.equal(checked.cryptographicIntegrityVerified,false);
});
test("explicit integrity mismatch findings are retained but unsupported claims are denied",()=>{
  const altered={...integrity,consistent:false,
    findings:["incident_revision_mismatch"],incidentRevision:99};
  const safe=verifiedCaseIntegrity(altered);
  assert.equal(safe.consistent,false);
  assert.deepEqual(safe.findings,["incident_revision_mismatch"]);
  for(const input of [
    {...integrity,source:"client_mock"},
    {...integrity,integritySource:"unverified"},
    {...integrity,incidentId:"wrong"},
    {...integrity,incidentEventCount:-1},
    {...integrity,planRevision:0},
    {...integrity,consistent:true,findings:["incident_revision_mismatch"]},
    {...integrity,consistent:false,findings:[]},
    {...integrity,findings:["cryptographic_tamper_verified"]},
    {...integrity,cryptographicIntegrityVerified:true},
    {...integrity,workerLivenessVerified:true},
    {...integrity,externalExecutionTriggered:true},
    {...integrity,hasPlan:false,planStage:"closed"},
  ])assert.throws(()=>verifiedCaseIntegrity(input));
});
test("bounded readiness totals and sampled case data must reconcile",()=>{
  const safe=verifiedCaseReadiness(readiness);
  assert.equal(safe.totalOwnerCases,2);
  assert.equal(safe.recentCasesScanned,2);
  assert.equal(safe.recentSampleTruncated,false);
  assert.equal(safe.recentCases[0].historicalClosedPlanAfterReopen,true);
  const json=JSON.stringify(verifiedCaseReadiness({
    ...readiness,secrets:"private",
    recentCases:readiness.recentCases.map(r=>({...r,token:"hidden"})),
  }));
  assert.ok(!json.includes("private"));
  assert.ok(!json.includes("hidden"));
  assert.ok(readinessCsv(safe).startsWith("\ufeff"));
  assert.equal(readinessCsv(safe),readinessCsv(readiness));
  assert.match(readinessCsv(safe),/"limitations","workerLivenessVerified"/);
});
test("readiness refuses invented global integrity coverage and impossible totals",()=>{
  const sample=readiness.recentCases;
  for(const value of [
    {...readiness,source:"client_fake"},
    {...readiness,readinessSource:"test_data"},
    {...readiness,allCasesIntegrityChecked:false},
    {...readiness,recentSampleTruncated:true},
    {...readiness,currentResolved:5},
    {...readiness,currentUnresolvedWithEvidence:2},
    {...readiness,currentHighUnresolved:3},
    {...readiness,planClosed:-1},
    {...readiness,generatedAt:"invalid"},
    {...readiness,recentCasesScanned:31},
    {...readiness,recentSampleLimit:500},
    {...readiness,inconsistentCasesInRecentSample:2},
    {...readiness,historicallyClosedPlansInRecentSample:0},
    {...readiness,recentCases:[sample[0],sample[0]]},
    {...readiness,recentCases:[{...sample[0],consistent:false},sample[1]]},
    {...readiness,recentCases:[{...sample[0],findings:["unknown"]},sample[1]]},
    {...readiness,cryptographicIntegrityVerified:true},
    {...readiness,automaticFailuresMeasured:true},
  ])assert.throws(()=>verifiedCaseReadiness(value));
});
test("PostgreSQL integrity SQL is read-only, service-only and labels findings as noncryptographic",async()=>{
  const sql=await read("supabase/migrations/20261123140000_automation_lifecycle_integrity.sql");
  for(const re of [
    /CREATE OR REPLACE FUNCTION public\.automation_incident_lifecycle_check/,
    /CREATE OR REPLACE FUNCTION public\.automation_incident_readiness_report/,
    /lag\(to_status\) OVER/,
    /incident_event_chain_inconsistent/,
    /incident_status_mismatch/,
    /incident_revision_mismatch/,
    /plan_revision_mismatch/,
    /plan_stage_event_mismatch/,
    /audit_projection_count_mismatch/,
    /closureApprovalCurrent/,
    /reopenApprovalCurrent/,
    /historicalClosedPlanAfterReopen/,
    /owner_actual_case_readiness/,
    /ORDER BY updated_at DESC,id DESC LIMIT 30/,
    /recentSampleTruncated/,
    /allCasesIntegrityChecked/,
    /cryptographicIntegrityVerified',false/,
    /workerLivenessVerified',false/,
    /externalExecutionTriggered',false/,
    /GRANT EXECUTE ON FUNCTION public\.automation_incident_lifecycle_check\(uuid,uuid\)\s+TO service_role/,
    /GRANT EXECUTE ON FUNCTION public\.automation_incident_readiness_report\(uuid\)\s+TO service_role/,
  ])assert.match(sql,re);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
  assert.doesNotMatch(sql,/automation_record_run\(/);
  assert.doesNotMatch(sql,/automation_toggle_schedule\(/);
  assert.doesNotMatch(sql,/INSERT INTO|UPDATE public\.automation|DELETE FROM public\.automation/i);
});
test("authenticated Edge and operator UI expose actual non-executing status and export",async()=>{
  const edge=await read("supabase/functions/automation-control/index.ts");
  const ui=await read("src/components/AutomationLifecycleReadinessPanel.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  for(const rpc of ["automation_incident_lifecycle_check","automation_incident_readiness_report"]){
    assert.ok(edge.includes(rpc));
  }
  assert.match(edge,/authenticateUser\(req\)/);
  assert.match(edge,/p_user_id:user\.id/);
  assert.match(edge,/integritySource:data\.source/);
  assert.match(edge,/readinessSource:data\.source/);
  assert.match(ui,/Load owner readiness/);
  assert.match(ui,/Recheck exact case/);
  assert.match(ui,/Safe CSV/);
  assert.match(ui,/recentSampleTruncated/);
  assert.match(ui,/cryptographic tamper detection/);
  assert.match(cloud,/<AutomationLifecycleReadinessPanel/);
});
