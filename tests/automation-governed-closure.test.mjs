import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest} from "../supabase/functions/_shared/automation-control-contract.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const id="11111111-1111-4111-8111-111111111111";
const key="22222222-2222-4222-8222-222222222222";

test("owner closure preflight/history allow only exact UUID and no extraneous fields",()=>{
  for(const action of ["incidentClosurePreflight","incidentClosureHistory"]){
    const valid=parseAutomationControlRequest({action,incidentId:id});
    assert.equal(valid.ok,true);
    for(const invalid of [
      {action,incidentId:"bad"},
      {action,incidentId:id,output:"raw"},
      {action,incidentId:id,owner:key},
      {action,incidentId:id,enableWorkflow:true},
    ])assert.equal(parseAutomationControlRequest(invalid).ok,false,JSON.stringify(invalid));
  }
});

test("versioned owner decisions reject code, URLs, weak notes, future states and retries",()=>{
  for(const decision of ["approve","defer"]){
    const input={action:"incidentClosureDecision",incidentId:id,
      incidentRevision:2,planRevision:4,decision,
      note:"Reviewed factual incident evidence",requestKey:key};
    assert.equal(parseAutomationControlRequest(input).ok,true);
  }
  const good={action:"incidentClosureDecision",incidentId:id,
      incidentRevision:2,planRevision:4,decision:"approve",
      note:"Reviewed factual incident evidence",requestKey:key};
  for(const input of [
    {...good,decision:"auto_resolve"},
    {...good,decision:"retry"},
    {...good,incidentRevision:0},
    {...good,planRevision:0},
    {...good,planRevision:2147483648},
    {...good,requestKey:"no"},
    {...good,incidentId:"no"},
    {...good,note:"too short"},
    {...good,note:"x".repeat(501)},
    {...good,runNow:true},
    {...good,webhookUrl:"http://localhost"},
    {...good,scheduleId:id},
  ])assert.equal(parseAutomationControlRequest(input).ok,false,JSON.stringify(input));
});

test("database hard gate protects old incidentTransition endpoint and requires latest current decision",async()=>{
  const sql=await read("supabase/migrations/20261123120000_automation_governed_incident_closure.sql");
  for(const pattern of [
    /CREATE TABLE public\.automation_incident_closure_decisions/,
    /UNIQUE\(user_id,request_key\)/,
    /CREATE OR REPLACE FUNCTION public\.automation_incident_closure_preflight/,
    /CREATE OR REPLACE FUNCTION public\.automation_record_incident_closure_decision/,
    /CREATE OR REPLACE FUNCTION public\.automation_incident_closure_history/,
    /CREATE OR REPLACE FUNCTION public\.automation_guard_planned_resolution/,
    /CREATE TRIGGER automation_planned_incident_resolution_gate/,
    /BEFORE UPDATE OF status ON public\.automation_incidents/,
    /CREATE OR REPLACE FUNCTION public\.automation_governed_incident_transition/,
    /latest\.decision<>'approve'/,
    /latest\.incident_revision<>OLD\.revision/,
    /latest\.plan_revision<>p\.revision/,
    /latest\.incident_revision=inc\.revision/,
    /latest\.plan_revision=p\.revision/,
    /n_steps=jsonb_array_length\(p\.steps\)/,
    /incident_closure_decisions FROM PUBLIC,anon,authenticated/,
    /FOR UPDATE/,
    /pg_advisory_xact_lock/,
    /closure_review_limit/,
    /idempotency_conflict/,
    /externalExecutionTriggered',false/,
    /ALTER TABLE public\.automation_incident_closure_decisions ENABLE ROW LEVEL SECURITY/,
  ])assert.match(sql,pattern);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
  assert.doesNotMatch(sql,/automation_record_run\(/);
  assert.doesNotMatch(sql,/automation_toggle_schedule\(/);
  assert.doesNotMatch(sql,/https?:\/\//);
});

test("Edge routes both new and legacy status transitions through service-only governed DB RPCs",async()=>{
  const edge=await read("supabase/functions/automation-control/index.ts");
  const ui=await read("src/components/AutomationClosureGovernancePanel.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  for(const key of [
    "automation_incident_closure_preflight",
    "automation_record_incident_closure_decision",
    "automation_incident_closure_history",
    "automation_governed_incident_transition",
  ])assert.ok(edge.includes(key),key);
  assert.match(edge,/authenticateUser\(req\)/);
  assert.match(edge,/p_user_id:user\.id/);
  assert.doesNotMatch(edge,/supabase\.rpc\("automation_transition_incident"/);
  assert.match(ui,/Record manual decision/);
  assert.match(ui,/Verify closure readiness/);
  assert.match(ui,/Resolve case after governed approval/);
  assert.match(ui,/latestDecision/);
  assert.match(ui,/window\.confirm/);
  assert.match(ui,/does NOT resolve/);
  assert.match(cloud,/<AutomationClosureGovernancePanel/);
});
