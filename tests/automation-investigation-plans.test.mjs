import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest} from "../supabase/functions/_shared/automation-control-contract.mjs";
import {verifiedIncidentTrend,incidentTrendCsv} from "../src/lib/automationIncidentTrend.mjs";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const id="11111111-1111-4111-8111-111111111111";
const requestKey="22222222-2222-4222-8222-222222222222";
const steps=["review_evidence","inspect_run_history","document_outcome"];
const makeTrend=(days=7)=>({
  source:"authenticated_server",reportSource:"recorded_incident_activity",
  rangeDays:days,timezone:"UTC",
  days:Array.from({length:days},(_,i)=>{
    const d=new Date(Date.UTC(2026,10,1+i)).toISOString().slice(0,10);
    return {date:d,casesOpened:i===0?2:0,resolutionEvents:i===1?1:0};
  }),
  casesOpened:2,resolutionEvents:1,
  automatedFailureDetection:false,actualWorkerUptimeMeasured:false,
  externalExecutionTriggered:false,
});
test("strict plan creation contract only accepts fixed unique manual review steps",()=>{
  assert.equal(parseAutomationControlRequest({
    action:"investigationPlanCreate",incidentId:id,incidentRevision:2,
    requestKey,steps,
  }).ok,true);
  for(const request of [
    {action:"investigationPlanCreate",incidentId:id,incidentRevision:0,requestKey,steps},
    {action:"investigationPlanCreate",incidentId:"invalid",incidentRevision:2,requestKey,steps},
    {action:"investigationPlanCreate",incidentId:id,incidentRevision:2,requestKey:"bad",steps},
    {action:"investigationPlanCreate",incidentId:id,incidentRevision:2,requestKey,steps:[]},
    {action:"investigationPlanCreate",incidentId:id,incidentRevision:2,requestKey,steps:["review_evidence","review_evidence"]},
    {action:"investigationPlanCreate",incidentId:id,incidentRevision:2,requestKey,steps:["shell_exec"]},
    {action:"investigationPlanCreate",incidentId:id,incidentRevision:2,requestKey,steps:[...steps,"verify_schedule_state","review_quarantine","document_outcome","inspect_workflow_policy"]},
    {action:"investigationPlanCreate",incidentId:id,incidentRevision:2,requestKey,steps,script:"rm -rf /"},
    {action:"investigationPlanCreate",incidentId:id,incidentRevision:2,requestKey,steps,runNow:true},
  ])assert.equal(parseAutomationControlRequest(request).ok,false,JSON.stringify(request));
});
test("review step acknowledgments and stage signoff require bounded note and revision fencing",()=>{
  for(const stepKind of [
    "review_evidence","inspect_run_history","inspect_workflow_policy",
    "verify_schedule_state","review_quarantine","document_outcome",
  ]){
    assert.equal(parseAutomationControlRequest({
      action:"investigationStepAck",planId:id,expectedRevision:1,
      stepKind,note:"Recorded manual operator review",requestKey,
    }).ok,true,stepKind);
  }
  for(const nextStage of ["reviewed","closed"]){
    assert.equal(parseAutomationControlRequest({
      action:"investigationPlanTransition",planId:id,expectedRevision:1,
      nextStage,note:"Manual operator signed off the review",requestKey,
    }).ok,true,nextStage);
  }
  for(const request of [
    {action:"investigationStepAck",planId:id,expectedRevision:0,
      stepKind:"review_evidence",note:"Recorded manual operator review",requestKey},
    {action:"investigationStepAck",planId:id,expectedRevision:1,
      stepKind:"external_api_call",note:"Recorded manual operator review",requestKey},
    {action:"investigationStepAck",planId:id,expectedRevision:1,
      stepKind:"review_evidence",note:"too brief",requestKey},
    {action:"investigationStepAck",planId:id,expectedRevision:1,
      stepKind:"review_evidence",note:"Recorded manual operator review",
      requestKey,autoRetry:true},
    {action:"investigationPlanTransition",planId:id,expectedRevision:1,
      nextStage:"run",note:"Recorded manual operator review",requestKey},
    {action:"investigationPlanTransition",planId:id,expectedRevision:2147483647,
      nextStage:"closed",note:"Recorded manual operator review",requestKey},
    {action:"investigationPlanTransition",planId:id,expectedRevision:1,
      nextStage:"closed",note:"Recorded manual operator review",
      requestKey,url:"https://internal.example"},
    {action:"investigationPlanRead",incidentId:"bad"},
    {action:"incidentDailyTrend",days:365},
    {action:"incidentDailyTrend",days:"7"},
    {action:"incidentDailyTrend",days:7,includeSecrets:true},
  ])assert.equal(parseAutomationControlRequest(request).ok,false,JSON.stringify(request));
  assert.equal(parseAutomationControlRequest({
    action:"investigationPlanRead",incidentId:id,
  }).ok,true);
  assert.equal(parseAutomationControlRequest({action:"incidentDailyTrend",days:7}).ok,true);
  assert.equal(parseAutomationControlRequest({action:"incidentDailyTrend",days:30}).ok,true);
});
test("real UTC daily trend totals and sequence are verified before rendering or download",()=>{
  for(const n of [7,30]){
    const validated=verifiedIncidentTrend(makeTrend(n));
    assert.equal(validated.days.length,n);
    assert.equal(validated.casesOpened,2);
    assert.equal(validated.resolutionEvents,1);
    assert.equal(incidentTrendCsv(validated),incidentTrendCsv(makeTrend(n)));
    assert.ok(incidentTrendCsv(validated).startsWith("\ufeff"));
  }
});
test("trend parser rejects fabricated uptime, forged case totals and skipped days",()=>{
  const valid=makeTrend();
  for(const item of [
    {...valid,source:"client_mock"},
    {...valid,reportSource:"fake"},
    {...valid,automatedFailureDetection:true},
    {...valid,actualWorkerUptimeMeasured:true},
    {...valid,externalExecutionTriggered:true},
    {...valid,rangeDays:14},
    {...valid,casesOpened:999},
    {...valid,days:valid.days.slice(1)},
    {...valid,days:[...valid.days.slice(0,1),
      {...valid.days[1],date:"2026-11-12"},...valid.days.slice(2)]},
    {...valid,days:[...valid.days.slice(0,1),
      {...valid.days[1],casesOpened:-1},...valid.days.slice(2)]},
    {...valid,days:[...valid.days.slice(0,1),
      {...valid.days[1],date:"2026-02-30"},...valid.days.slice(2)]},
  ])assert.throws(()=>verifiedIncidentTrend(item));
});
test("SQL gates each review and never upgrades an incident to executed or auto restored",async()=>{
  const migration=await read("supabase/migrations/20261123110000_automation_investigation_plans.sql");
  for(const pattern of [
    /CREATE TABLE public\.automation_investigation_plans/,
    /CREATE TABLE public\.automation_investigation_events/,
    /CREATE OR REPLACE FUNCTION public\.automation_create_investigation_plan/,
    /CREATE OR REPLACE FUNCTION public\.automation_acknowledge_investigation_step/,
    /CREATE OR REPLACE FUNCTION public\.automation_transition_investigation_plan/,
    /CREATE OR REPLACE FUNCTION public\.automation_read_investigation_plan/,
    /CREATE OR REPLACE FUNCTION public\.automation_incident_daily_trend/,
    /missing_captured_evidence/,
    /requires_investigating/,
    /plan_daily_limit/,
    /unreviewed_steps/,
    /stale_plan/,
    /already_acknowledged/,
    /UNIQUE\(user_id,incident_id\)/,
    /UNIQUE\(user_id,request_key\)/,
    /expected_revision IS DISTINCT FROM p_expected_revision/,
    /REVOKE ALL ON public\.automation_investigation_plans FROM PUBLIC,anon,authenticated/,
    /ENABLE ROW LEVEL SECURITY/,
    /externalExecutionTriggered',false/,
  ])assert.match(migration,pattern);
  assert.doesNotMatch(migration,/SECURITY DEFINER/);
  assert.doesNotMatch(migration,/automation_toggle_schedule\(/);
  assert.doesNotMatch(migration,/automation_record_run\(/);
});
test("authenticated app and Edge expose genuine user-attested plan workbench, not automated fixes",async()=>{
  const edge=await read("supabase/functions/automation-control/index.ts");
  const panel=await read("src/components/AutomationInvestigationPlanPanel.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  for(const name of [
    "automation_create_investigation_plan","automation_acknowledge_investigation_step",
    "automation_transition_investigation_plan","automation_read_investigation_plan",
    "automation_incident_daily_trend",
  ])assert.ok(edge.includes(name),name);
  assert.match(edge,/authenticateUser\(req\)/);
  assert.match(edge,/p_user_id:user\.id/);
  assert.match(edge,/externalExecutionTriggered:false/);
  assert.match(panel,/Create evidence-gated review plan/);
  assert.match(panel,/Record human review acknowledgment/);
  assert.match(panel,/Close plan after separate case resolution/);
  assert.match(panel,/Load measured daily trend/);
  assert.match(panel,/window\.confirm/);
  assert.match(cloud,/<AutomationInvestigationPlanPanel/);
});
