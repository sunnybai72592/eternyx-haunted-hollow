import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest} from "../supabase/functions/_shared/automation-control-contract.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const uuid="11111111-1111-4111-8111-111111111111";
const req="22222222-2222-4222-8222-222222222222";

test("incident actions require factual source type, UUID, title and bounded owner note",()=>{
  for(const sourceKind of [
    "schedule_failed","schedule_expired_lease",
    "schedule_quarantine","completed_run_review",
  ]){
    const parsed=parseAutomationControlRequest({
      action:"incidentOpen",sourceKind,sourceId:uuid,
      title:"Real evidence case",severity:"high",
      note:"Review persisted source record",requestKey:req,
    });
    assert.equal(parsed.ok,true,sourceKind);
    assert.equal(parsed.sourceKind,sourceKind);
  }
  for(const value of [
    {action:"incidentOpen",sourceKind:"http_fetch",sourceId:uuid,
      title:"Real evidence case",severity:"high",
      note:"Review persisted source record",requestKey:req},
    {action:"incidentOpen",sourceKind:"schedule_failed",sourceId:"bad",
      title:"Real evidence case",severity:"high",
      note:"Review persisted source record",requestKey:req},
    {action:"incidentOpen",sourceKind:"schedule_failed",sourceId:uuid,
      title:"short",severity:"high",note:"Review persisted source record",requestKey:req},
    {action:"incidentOpen",sourceKind:"schedule_failed",sourceId:uuid,
      title:"Valid title",severity:"critical",
      note:"Review persisted source record",requestKey:req},
    {action:"incidentOpen",sourceKind:"schedule_failed",sourceId:uuid,
      title:"Valid title",severity:"high",note:"short",requestKey:req},
    {action:"incidentOpen",sourceKind:"schedule_failed",sourceId:uuid,
      title:"Valid title",severity:"high",
      note:"A".repeat(501),requestKey:req},
    {action:"incidentOpen",sourceKind:"schedule_failed",sourceId:uuid,
      title:"Valid title",severity:"high",
      note:"Review persisted source record",requestKey:"not-a-key"},
    {action:"incidentOpen",sourceKind:"schedule_failed",sourceId:uuid,
      title:"Valid title",severity:"high",
      note:"Review persisted source record",requestKey:req,url:"https://example.org"},
    {action:"incidentOpen",sourceKind:"schedule_failed",sourceId:uuid,
      title:"Valid title",severity:"high",
      note:"Review persisted source record",requestKey:req,runNow:true},
  ])assert.equal(parseAutomationControlRequest(value).ok,false,JSON.stringify(value));
});

test("incident state transitions reject stale/invalid client contracts and extra effects",()=>{
  for(const nextStatus of ["investigating","resolved"]){
    assert.equal(parseAutomationControlRequest({
      action:"incidentTransition",incidentId:uuid,expectedRevision:1,
      nextStatus,note:"Reviewed current owner evidence",requestKey:req,
    }).ok,true);
  }
  for(const request of [
    {action:"incidentTransition",incidentId:uuid,expectedRevision:0,
      nextStatus:"resolved",note:"Reviewed current owner evidence",requestKey:req},
    {action:"incidentTransition",incidentId:uuid,expectedRevision:1,
      nextStatus:"open",note:"Reviewed current owner evidence",requestKey:req},
    {action:"incidentTransition",incidentId:uuid,expectedRevision:1,
      nextStatus:"resolved",note:"tiny",requestKey:req},
    {action:"incidentTransition",incidentId:uuid,expectedRevision:1,
      nextStatus:"resolved",note:"Reviewed current owner evidence",
      requestKey:req,enableSchedule:true},
    {action:"incidentTransition",incidentId:"not-uuid",expectedRevision:1,
      nextStatus:"resolved",note:"Reviewed current owner evidence",requestKey:req},
  ])assert.equal(parseAutomationControlRequest(request).ok,false,JSON.stringify(request));
  assert.equal(parseAutomationControlRequest({
    action:"incidentTimeline",incidentId:uuid,
  }).ok,true);
  assert.equal(parseAutomationControlRequest({
    action:"incidentTimeline",incidentId:uuid,showTokens:true,
  }).ok,false);
  for(const request of [
    {action:"incidentInbox"},
    {action:"incidentInbox",status:"resolved",severity:"high",limit:30},
    {action:"incidentInbox",status:"open",limit:1},
  ])assert.equal(parseAutomationControlRequest(request).ok,true);
  for(const request of [
    {action:"incidentInbox",status:"all"},
    {action:"incidentInbox",severity:"urgent"},
    {action:"incidentInbox",limit:31},
    {action:"incidentInbox",limit:0},
    {action:"incidentInbox",offset:500},
    {action:"incidentInbox",includeUserNotes:true},
  ])assert.equal(parseAutomationControlRequest(request).ok,false);
});

test("quarantine review requires real receipt, explicit advisory outcome and bounded rationale",()=>{
  assert.equal(parseAutomationControlRequest({action:"recoveryReviewInbox"}).ok,true);
  for(const decision of ["keep_quarantined","reviewed_for_manual_restore"]){
    const r=parseAutomationControlRequest({
      action:"recoveryReview",quarantineKey:uuid,decision,
      note:"Manual review of disabled schedule",requestKey:req,
    });
    assert.equal(r.ok,true);
  }
  for(const request of [
    {action:"recoveryReview",quarantineKey:"fake",decision:"keep_quarantined",
      note:"Manual review of disabled schedule",requestKey:req},
    {action:"recoveryReview",quarantineKey:uuid,decision:"auto_retry",
      note:"Manual review of disabled schedule",requestKey:req},
    {action:"recoveryReview",quarantineKey:uuid,decision:"reviewed_for_manual_restore",
      note:"too brief",requestKey:req},
    {action:"recoveryReview",quarantineKey:uuid,decision:"reviewed_for_manual_restore",
      note:"Manual review of disabled schedule",requestKey:req,enable:true},
    {action:"recoveryReview",quarantineKey:uuid,decision:"keep_quarantined",
      note:"Manual review of disabled schedule",requestKey:req,
      webhookUrl:"http://localhost:5432"},
    {action:"recoveryReviewInbox",workflowId:uuid},
  ])assert.equal(parseAutomationControlRequest(request).ok,false,JSON.stringify(request));
});

test("database incidents bind only persisted factual owner evidence and append status events",async()=>{
  const migration=await read("supabase/migrations/20261123090000_automation_incident_management.sql");
  for(const symbol of [
    "automation_incidents","automation_incident_events",
    "automation_recovery_reviews","automation_open_incident",
    "automation_transition_incident","automation_incident_inbox",
    "automation_incident_timeline","automation_review_quarantine",
    "automation_recovery_review_inbox",
  ])assert.ok(migration.includes(symbol),symbol);
  assert.match(migration,/FROM public\.automation_runs\s+WHERE id=p_source_id AND user_id=p_user_id/);
  assert.match(migration,/FROM public\.automation_schedule_quarantines\s+WHERE user_id=p_user_id AND request_key=p_source_id/);
  assert.match(migration,/s\.last_status<>'failed'/);
  assert.match(migration,/lease_expires_at<=pg_catalog\.statement_timestamp\(\)/);
  assert.match(migration,/UNIQUE\(user_id,source_kind,source_id\)/);
  assert.match(migration,/incident_daily_limit/);
  assert.match(migration,/incident_open_limit/);
  assert.match(migration,/stale_incident/);
  assert.match(migration,/previous_status,p_next_status,btrim\(p_note\)/);
  assert.match(migration,/GRANT SELECT,INSERT ON public\.automation_incident_events TO service_role/);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration,/REVOKE ALL ON public\.automation_incidents FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(migration,/SECURITY DEFINER/);
});

test("recovery-review SQL fences schedule version and requires disabled, unleased state",async()=>{
  const sql=await read("supabase/migrations/20261123090000_automation_incident_management.sql");
  assert.match(sql,/UNIQUE\(user_id,quarantine_request_key\)/);
  assert.match(sql,/s\.enabled OR s\.revision<>q\.new_revision OR/);
  assert.match(sql,/s\.lease_token IS NOT NULL OR s\.lease_expires_at IS NOT NULL/);
  assert.match(sql,/recovery_review_limit/);
  assert.match(sql,/already_reviewed/);
  assert.match(sql,/automaticRestore',false/);
  assert.match(sql,/externalExecutionTriggered',false/);
  assert.doesNotMatch(sql,/automation_toggle_schedule\(/);
  assert.doesNotMatch(sql,/automation_claim_due_schedule\(/);
});

test("authenticated Edge and real UI are connected without fake auto-remediation",async()=>{
  const endpoint=await read("supabase/functions/automation-control/index.ts");
  const panel=await read("src/components/AutomationIncidentCenter.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  // Phase 2P routes the older action through the guarded DB wrapper.
  assert.doesNotMatch(endpoint,/supabase\.rpc\("automation_transition_incident"/);
  assert.match(endpoint,/authenticateUser\(req\)/);
  for(const name of ["automation_incident_inbox","automation_open_incident",
    "automation_governed_incident_transition","automation_incident_timeline",
    "automation_recovery_review_inbox","automation_review_quarantine"]){
    assert.ok(endpoint.includes(name),name);
  }
  assert.match(endpoint,/p_user_id:user\.id/);
  assert.match(endpoint,/externalExecutionTriggered:false/);
  assert.match(endpoint,/automaticRestore:false/);
  assert.match(panel,/Load real evidence/);
  assert.match(panel,/Review actual/);
  assert.match(panel,/Verify failed\/expired state/);
  assert.match(panel,/immutable/i);
  assert.match(panel,/window\.confirm/);
  assert.match(panel,/Save manual recovery review/);
  assert.match(panel,/No workflow executed/);
  assert.match(cloud,/<AutomationIncidentCenter/);
});
