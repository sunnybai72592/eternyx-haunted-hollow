import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest} from "../supabase/functions/_shared/automation-control-contract.mjs";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const id="11111111-1111-4111-8111-111111111111";
const base={
  action:"setWorkflowPolicy",workflowId:id,maxInputCharacters:250,
  maxOutputCharacters:800,dailyRunLimit:5,allowWebhook:false,allowSchedule:false,
};
test("owner actions accept exact workflow IDs, typed caps and channel toggles",()=>{
  for(const request of [
    {action:"workflowPolicy",workflowId:id},
    base,
    {...base,maxInputCharacters:0,maxOutputCharacters:0,dailyRunLimit:1},
    {...base,maxInputCharacters:12000,maxOutputCharacters:30000,dailyRunLimit:30,
      allowWebhook:true,allowSchedule:true},
    {action:"workflowPreflight",workflowId:id,channel:"manual"},
    {action:"workflowPreflight",workflowId:id,channel:"webhook",inputCharacters:500},
    {action:"workflowPreflight",workflowId:id,channel:"scheduled",
      inputCharacters:0,outputCharacters:30000},
  ])assert.equal(parseAutomationControlRequest(request).ok,true,JSON.stringify(request));
  for(const request of [
    {...base,workflowId:"untrusted"},
    {...base,maxInputCharacters:-1},
    {...base,maxInputCharacters:12001},
    {...base,maxInputCharacters:2.1},
    {...base,maxOutputCharacters:30001},
    {...base,maxOutputCharacters:"100"},
    {...base,dailyRunLimit:0},
    {...base,dailyRunLimit:31},
    {...base,allowWebhook:"false"},
    {...base,allowSchedule:null},
    {...base,token:"github_pat_broad"},
    {action:"workflowPolicy",workflowId:id,user_id:id},
    {action:"workflowPreflight",workflowId:id,channel:"writeIssue"},
    {action:"workflowPreflight",workflowId:id,channel:"manual",
      inputCharacters:12001},
    {action:"workflowPreflight",workflowId:id,channel:"manual",
      outputCharacters:-1},
    {action:"workflowPreflight",workflowId:id,channel:"manual",
      inputCharacters:0,steps:[{kind:"eval"}]},
  ])assert.equal(parseAutomationControlRequest(request).ok,false,JSON.stringify(request));
});
test("SQL applies a single cap to every real run, serializes owner quota and preserves request replay",async()=>{
  const sql=await read("supabase/migrations/20261123060000_automation_workflow_policies.sql");
  assert.match(sql,/CREATE TABLE public\.automation_workflow_policies/);
  assert.match(sql,/CHECK \(max_input_characters BETWEEN 0 AND 12000\)/);
  assert.match(sql,/CHECK \(max_output_characters BETWEEN 0 AND 30000\)/);
  assert.match(sql,/CHECK \(daily_run_limit BETWEEN 1 AND 30\)/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.automation_record_run/);
  assert.match(sql,/IF FOUND THEN[\s\S]*p_input_characters>v_policy\.max_input_characters/);
  assert.match(sql,/p_output_characters>v_policy\.max_output_characters/);
  assert.match(sql,/policy_daily_limit/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/already_recorded/);
  assert.match(sql,/CREATE TRIGGER automation_run_classification_guard/);
  assert.match(sql,/NEW\.trigger_type='webhook' AND p\.allow_webhook=false/);
  assert.match(sql,/NEW\.trigger_type='scheduled' AND p\.allow_schedule=false/);
  assert.match(sql,/RAISE EXCEPTION USING ERRCODE='P0001'/);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
});
test("readiness is grounded in real DB counters, owner-owned triggers and disabled global scheduler",async()=>{
  const sql=await read("supabase/migrations/20261123060000_automation_workflow_policies.sql");
  assert.match(sql,/automation_workflow_policy_status/);
  assert.match(sql,/automation_workflow_preflight/);
  assert.match(sql,/FROM public\.automation_runs/);
  assert.match(sql,/FROM public\.automation_webhook_triggers/);
  assert.match(sql,/FROM public\.automation_schedules/);
  assert.match(sql,/FROM public\.automation_scheduler_config/);
  assert.match(sql,/approval_required=true/);
  assert.match(sql,/deploymentVerified',false/);
  assert.match(sql,/policyIsSnapshot',true/);
  assert.match(sql,/SELECT \* INTO w FROM public\.automation_workflows\s+WHERE id=p_workflow_id AND user_id=p_user_id/);
  assert.match(sql,/REVOKE ALL ON public\.automation_workflow_policies FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.automation_workflow_preflight/);
});
test("all three Edge handlers check actual policy rather than merely rendering visual badges",async()=>{
  const control=await read("supabase/functions/automation-control/index.ts");
  const webhook=await read("supabase/functions/automation-webhook/index.ts");
  const worker=await read("supabase/functions/automation-scheduler-worker/index.ts");
  assert.match(control,/authenticateUser\(req\)/);
  assert.match(control,/request\.action === "setWorkflowPolicy"/);
  assert.match(control,/request\.action === "workflowPolicy"/);
  assert.match(control,/request\.action === "workflowPreflight"/);
  assert.match(control,/automation_set_workflow_policy/);
  assert.match(control,/automation_workflow_preflight/);
  assert.match(control,/p_channel:"manual"/);
  assert.match(control,/liveDeliveryVerified:false/);
  assert.match(control,/webhookSecretConfigured/);
  assert.match(control,/scheduleSecretConfigured/);
  assert.match(webhook,/automation_workflow_preflight/);
  assert.match(webhook,/p_channel:"webhook"/);
  assert.match(webhook,/Signed webhook execution denied by workflow owner policy/);
  assert.match(worker,/automation_workflow_preflight/);
  assert.match(worker,/p_channel:"scheduled"/);
  assert.match(worker,/policy_deferral_failed/);
});
test("UI displays factual readiness and refuses to claim preflight executed or proved future delivery",async()=>{
  const panel=await read("src/components/AutomationWorkflowPolicyPanel.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  assert.match(panel,/liveDeliveryVerified!==false/);
  assert.match(panel,/webhookSettingsReady/);
  assert.match(panel,/scheduleSettingsReady/);
  assert.match(panel,/execu(?:tion|te) policy/i);
  assert.match(panel,/action\("setWorkflowPolicy"/);
  assert.match(panel,/action\("workflowPreflight"/);
  assert.match(panel,/externalActionTriggered!==false/);
  assert.match(panel,/policyIsSnapshot!==true/);
  assert.match(panel,/Check without executing/);
  assert.match(cloud,/<AutomationWorkflowPolicyPanel/);
});
