import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest} from "../supabase/functions/_shared/automation-control-contract.mjs";
import {checkedIncidentReport,incidentReportCsv}
  from "../src/lib/automationIncidentReport.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const id="11111111-1111-4111-8111-111111111111",key="22222222-2222-4222-8222-222222222222";
const report={
  source:"authenticated_server",reportSource:"database_incident_reporting",
  generatedAt:"2026-11-22T20:45:00Z",
  rangeDays:7,
  casesOpenedInWindow:3,resolutionEventsInWindow:1,currentOpen:1,
  currentInvestigating:1,currentResolved:1,currentHighUnresolved:1,
  unresolvedOlder24h:1,unresolvedOlder7d:0,
  sourcesInWindow:{failedSchedule:1,expiredLease:0,quarantine:1,manualRunReview:1},
  severitiesInWindow:{low:1,medium:1,high:1},
  capturedEvidenceInWindow:2,
  currentUnresolvedWithEvidence:1,currentUnresolvedWithoutEvidence:1,
  topUnresolvedWorkflows:[{workflow_id:id,unresolved_cases:2}],
  allFailureAttemptsMeasured:false,automaticDetectionEnabled:false,
  externalDeliveryVerified:false,recoveryExecuted:false,
};

test("strict contracts allow only real bounded metadata capture and reject arbitrary payloads",()=>{
  for(const kind of ["incident_origin","completed_run","schedule_state","quarantine_receipt"]){
    const input={action:"incidentCaptureEvidence",incidentId:id,
      evidenceKind:kind,sourceId:key,requestKey:key};
    const parsed=parseAutomationControlRequest(input);
    assert.equal(parsed.ok,true,kind);
    assert.equal(parsed.evidenceKind,kind);
  }
  for(const request of [
    {action:"incidentCaptureEvidence",incidentId:id,evidenceKind:"http_probe",sourceId:key,requestKey:key},
    {action:"incidentCaptureEvidence",incidentId:id,evidenceKind:"completed_run",sourceId:"none",requestKey:key},
    {action:"incidentCaptureEvidence",incidentId:id,evidenceKind:"completed_run",sourceId:key,requestKey:"no"},
    {action:"incidentCaptureEvidence",incidentId:"no",evidenceKind:"completed_run",sourceId:key,requestKey:key},
    {action:"incidentCaptureEvidence",incidentId:id,evidenceKind:"completed_run",sourceId:key,requestKey:key,
      payload:"customer plaintext"},
    {action:"incidentCaptureEvidence",incidentId:id,evidenceKind:"completed_run",sourceId:key,requestKey:key,
      url:"http://127.0.0.1:5432"},
    {action:"incidentCaptureEvidence",incidentId:id,evidenceKind:"completed_run",sourceId:key,requestKey:key,
      autoRetry:true},
    {action:"incidentEvidence",incidentId:id,userId:key},
    {action:"incidentEvidence",incidentId:"invalid"},
    {action:"incidentReport",days:365},
    {action:"incidentReport",days:14},
    {action:"incidentReport",days:"7"},
    {action:"incidentReport",days:30,includeRaw:true},
    {action:"incidentRecoveryCheck",quarantineKey:"invalid"},
    {action:"incidentRecoveryCheck",quarantineKey:key,enableSchedule:true},
  ]){
    assert.equal(parseAutomationControlRequest(request).ok,false,JSON.stringify(request));
  }
  for(const action of [
    {action:"incidentEvidence",incidentId:id},
    {action:"incidentReport",days:7},
    {action:"incidentReport",days:30},
    {action:"incidentRecoveryCheck",quarantineKey:key},
  ])assert.equal(parseAutomationControlRequest(action).ok,true,JSON.stringify(action));
});
test("report sanitizer keeps only measured counters and never exports notes or credentials",()=>{
  const safe=checkedIncidentReport({...report,apiKey:"secret",notes:"private customer description",
    topUnresolvedWorkflows:[{workflow_id:id,unresolved_cases:2,accessToken:"hidden"}],
    sourcesInWindow:{...report.sourcesInWindow,plaintext:"danger"}});
  const json=JSON.stringify(safe);
  assert.equal(safe.casesOpenedInWindow,3);
  assert.equal(safe.topUnresolvedWorkflows.length,1);
  for(const secret of ["secret","private customer","hidden","danger","apiKey","accessToken"]){
    assert.equal(json.includes(secret),false,secret);
  }
  assert.equal(safe.allFailureAttemptsMeasured,false);
  assert.equal(safe.externalDeliveryVerified,false);
});
test("report sanitizer fails closed for invented success rates, missing counters or fabricated periods",()=>{
  for(const candidate of [
    {...report,source:"client_generated_placeholder"},
    {...report,reportSource:"client_generated_placeholder"},
    {...report,rangeDays:14},
    {...report,recoveryExecuted:true},
    {...report,automaticDetectionEnabled:true},
    {...report,externalDeliveryVerified:true},
    {...report,currentOpen:-1},
    {...report,currentHighUnresolved:0.5},
    {...report,topUnresolvedWorkflows:Array(6).fill(report.topUnresolvedWorkflows[0])},
    {...report,topUnresolvedWorkflows:[{workflow_id:"'=cmd",unresolved_cases:2}]},
    {...report,sourcesInWindow:{failedSchedule:0}},
    {...report,generatedAt:"invalid"},
  ])assert.throws(()=>checkedIncidentReport(candidate));
});
test("safe CSV quotes values and does not leak user-authored incident notes",()=>{
  const csv=incidentReportCsv(report);
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes('"case_counts","currentOpen","1"'));
  assert.ok(csv.includes(id));
  assert.ok(csv.includes('"limitations","automaticDetectionEnabled","false"'));
  assert.ok(!csv.includes("request_key"));
});
test("Postgres metadata evidence is owner-bound, immutable, bounded and secret-free",async()=>{
  const sql=await read("supabase/migrations/20261123100000_automation_incident_evidence_reporting.sql");
  for(const match of [
    /CREATE TABLE public\.automation_incident_evidence/,
    /UNIQUE\(user_id,request_key\)/,
    /UNIQUE\(user_id,incident_id,evidence_kind,source_id\)/,
    /CREATE OR REPLACE FUNCTION public\.automation_capture_incident_evidence/,
    /CREATE OR REPLACE FUNCTION public\.automation_incident_evidence_list/,
    /CREATE OR REPLACE FUNCTION public\.automation_incident_operational_report/,
    /CREATE OR REPLACE FUNCTION public\.automation_incident_recovery_check/,
    /WHERE id=p_incident_id AND user_id=p_user_id FOR UPDATE/,
    /WHERE id=p_source_id AND user_id=p_user_id/,
    /WHERE request_key=p_source_id AND user_id=p_user_id/,
    /incident_evidence_limit/,
    /daily_evidence_limit/,
    /already_captured/,
    /unrelated_evidence/,
    /capturedFrom','completed_run_metadata/,
    /capturedFrom','quarantine_receipt_metadata/,
    /automaticDetectionEnabled',false/,
    /allFailureAttemptsMeasured',false/,
    /automaticRestore',false/,
    /executed',false/,
    /ENABLE ROW LEVEL SECURITY/,
    /REVOKE ALL ON public\.automation_incident_evidence FROM PUBLIC,anon,authenticated/,
  ])assert.match(sql,match);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
  assert.doesNotMatch(sql,/SELECT\s+r\.\*/);
});
test("Edge handlers and real interface route through owner-only non-executing RPCs",async()=>{
  const endpoint=await read("supabase/functions/automation-control/index.ts");
  const panel=await read("src/components/AutomationIncidentEvidencePanel.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  for(const name of [
    "automation_capture_incident_evidence",
    "automation_incident_evidence_list",
    "automation_incident_operational_report",
    "automation_incident_recovery_check",
  ])assert.ok(endpoint.includes(name),name);
  assert.match(endpoint,/authenticateUser\(req\)/);
  assert.match(endpoint,/p_user_id:user\.id/);
  assert.match(endpoint,/rawInputsIncluded:false,rawOutputsIncluded:false/);
  assert.match(panel,/Capture real metadata/);
  assert.match(panel,/Load factual report/);
  assert.match(panel,/JSON report/);
  assert.match(panel,/Safe CSV report/);
  assert.match(panel,/Check without restoring/);
  assert.match(panel,/window\.confirm/);
  assert.match(panel,/real quarantine/i);
  assert.match(cloud,/<AutomationIncidentEvidencePanel/);
});
