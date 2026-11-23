import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest} from "../supabase/functions/_shared/automation-control-contract.mjs";
import {verifiedIncidentAuditTrace,incidentAuditCsv}
  from "../src/lib/automationIncidentAuditTrace.mjs";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const id="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const decision={
  action:"incidentReopenDecision",incidentId:id,
  incidentRevision:3,planRevision:4,evidenceId:other,
  decision:"approve",reason:"recurrence",
  note:"Reviewed real owner source metadata",requestKey:other,
};
function sourceTrace(){
  return {
    source:"authenticated_server",auditSource:"owner_database_audit_trace",
    incidentId:id,total:5,truncated:false,containsNotes:false,
    containsCredentials:false,externalExecutionTriggered:false,
    rows:[
      {kind:"incident_status",ref:"1",recordedAt:"2026-11-22T10:00:00Z",
        metadata:{state:"investigating",type:"transition",note:"not safe"}},
      {kind:"evidence_capture",ref:other,recordedAt:"2026-11-22T10:00:01Z",
        metadata:{evidenceKind:"incident_origin",sourceId:id,token:"hidden"}},
      {kind:"plan_review",ref:"2",recordedAt:"2026-11-22T10:00:02Z",
        metadata:{type:"step_acknowledged",stepKind:"review_evidence"}},
      {kind:"closure_decision",ref:"3",recordedAt:"2026-11-22T10:00:03Z",
        metadata:{decision:"approve",incidentRevision:2,requestKey:"private"}},
      {kind:"reopen_decision",ref:"4",recordedAt:"2026-11-22T10:00:04Z",
        metadata:{decision:"hold",reason:"recurrence",
          incidentRevision:3,evidenceId:other,secret:"private"}},
    ],
  };
}
test("strict owner reopening actions reject unexpected fields, forged UUID and arbitrary code",()=>{
  for(const action of ["incidentReopenPreflight","incidentReopenHistory","incidentAuditTrace"]){
    assert.equal(parseAutomationControlRequest({action,incidentId:id}).ok,true);
    for(const payload of [
      {action,incidentId:"not-uuid"},
      {action,incidentId:id,includeRawData:true},
      {action,incidentId:id,ownerId:other},
      {action,incidentId:id,execute:true},
    ])assert.equal(parseAutomationControlRequest(payload).ok,false,JSON.stringify(payload));
  }
  for(const decisionValue of ["hold","approve"]){
    for(const reason of ["new_evidence","recurrence","incomplete_review","other"]){
      assert.equal(parseAutomationControlRequest({
        ...decision,decision:decisionValue,reason,
      }).ok,true);
    }
  }
  for(const input of [
    {...decision,decision:"auto_retry"},
    {...decision,reason:"run_shell"},
    {...decision,incidentRevision:0},
    {...decision,planRevision:0},
    {...decision,incidentRevision:2147483648},
    {...decision,evidenceId:"bad"},
    {...decision,incidentId:"bad"},
    {...decision,requestKey:"fake"},
    {...decision,note:"tiny"},
    {...decision,note:"a".repeat(501)},
    {...decision,rawOutput:"secret"},
    {...decision,webhookUrl:"http://localhost"},
    {...decision,resumeWorkflow:true},
  ])assert.equal(parseAutomationControlRequest(input).ok,false,JSON.stringify(input));
});
test("metadata audit projection drops unknown fields, notes and credentials",()=>{
  const trace=verifiedIncidentAuditTrace(sourceTrace());
  assert.equal(trace.rows.length,5);
  const json=JSON.stringify(trace);
  for(const v of ["hidden","private","not safe","token","secret","requestKey"]){
    assert.equal(json.includes(v),false,v);
  }
  assert.equal(trace.containsNotes,false);
  assert.equal(trace.externalExecutionTriggered,false);
  const csv=incidentAuditCsv(sourceTrace());
  assert.equal(csv,incidentAuditCsv(trace));
  assert.ok(csv.startsWith("\ufeff"));
  assert.match(csv,/"reopen_decision"/);
  assert.doesNotMatch(csv,/hidden|private|secret|not safe/);
});
test("audit verifier fails closed on forged source, missing events, unexpected chronology",()=>{
  const orig=sourceTrace();
  for(const input of [
    {...orig,source:"mock"},
    {...orig,auditSource:"made_up"},
    {...orig,containsNotes:true},
    {...orig,containsCredentials:true},
    {...orig,externalExecutionTriggered:true},
    {...orig,incidentId:"invalid"},
    {...orig,total:99},
    {...orig,truncated:true},
    {...orig,rows:orig.rows.slice(1)},
    {...orig,rows:[orig.rows[1],orig.rows[0],...orig.rows.slice(2)]},
    {...orig,rows:[{...orig.rows[0],kind:"secret_token"},...orig.rows.slice(1)]},
    {...orig,rows:[{...orig.rows[0],metadata:{state:"=malicious",type:"transition"}},...orig.rows.slice(1)]},
  ])assert.throws(()=>verifiedIncidentAuditTrace(input));
});
test("SQL hardens both old and new reopened case status paths with actual evidence",async()=>{
  const sql=await read("supabase/migrations/20261123130000_automation_governed_reopen_trace.sql");
  for(const expression of [
    /CREATE TABLE public\.automation_incident_reopen_decisions/,
    /decision_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE/,
    /CREATE OR REPLACE FUNCTION public\.automation_incident_reopen_preflight/,
    /CREATE OR REPLACE FUNCTION public\.automation_record_incident_reopen_decision/,
    /CREATE OR REPLACE FUNCTION public\.automation_incident_reopen_history/,
    /CREATE OR REPLACE FUNCTION public\.automation_guard_planned_reopen/,
    /CREATE TRIGGER automation_planned_incident_reopen_gate/,
    /BEFORE UPDATE OF status ON public\.automation_incidents/,
    /CREATE OR REPLACE FUNCTION public\.automation_governed_incident_transition/,
    /CREATE OR REPLACE FUNCTION public\.automation_incident_audit_trace/,
    /OLD\.status IS DISTINCT FROM 'resolved'/,
    /NEW\.status IS DISTINCT FROM 'investigating'/,
    /latest\.decision<>'approve'/,
    /latest\.incident_revision<>OLD\.revision/,
    /latest\.plan_revision<>p\.revision/,
    /reopen_approval_required/,
    /reopen_review_limit/,
    /reopen_evidence_not_found/,
    /idempotency_conflict/,
    /pg_advisory_xact_lock/,
    /ENABLE ROW LEVEL SECURITY/,
    /REVOKE ALL ON public\.automation_incident_reopen_decisions FROM PUBLIC,anon,authenticated/,
    /externalExecutionTriggered',false/,
  ])assert.match(sql,expression);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
  assert.doesNotMatch(sql,/automation_toggle_schedule\(/);
  assert.doesNotMatch(sql,/automation_record_run\(/);
});
test("authenticated Edge RPCs and owner workbench genuinely connect to reopening and privacy-safe audit export",async()=>{
  const edge=await read("supabase/functions/automation-control/index.ts");
  const ui=await read("src/components/AutomationReopenGovernancePanel.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  for(const name of [
    "automation_incident_reopen_preflight",
    "automation_record_incident_reopen_decision",
    "automation_incident_reopen_history",
    "automation_incident_audit_trace",
    "automation_governed_incident_transition",
  ])assert.ok(edge.includes(name),name);
  assert.match(edge,/authenticateUser\(req\)/);
  assert.match(edge,/p_user_id:user\.id/);
  assert.match(edge,/auditSource:data\.source/);
  assert.match(ui,/Verify case, evidence & decisions/);
  assert.match(ui,/Record versioned manual decision/);
  assert.match(ui,/Reopen case for separate manual investigation/);
  assert.match(ui,/Load factual audit events/);
  assert.match(ui,/Safe CSV/);
  assert.match(ui,/window\.confirm/);
  assert.match(cloud,/<AutomationReopenGovernancePanel/);
});
