import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest} from "../supabase/functions/_shared/automation-control-contract.mjs";
import {issueWebhookCredential,openWebhookCredential,signWebhookRequest,verifyWebhookRequest}
  from "../supabase/functions/_shared/automation-webhook-crypto.mjs";
import {encryptScheduledText,decryptScheduledText}
  from "../supabase/functions/_shared/automation-schedule-crypto.mjs";

const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const first="11111111-1111-4111-8111-111111111111";
const second="22222222-2222-4222-8222-222222222222";
const key="33333333-3333-4333-8333-333333333333";
const items=[{id:first,revision:1,active:true},{id:second,revision:2,active:false}];

test("bulk policy accepts exactly 1–5 owned candidates and strict UUID expected state",()=>{
  for(const action of [true,false]){
    const r=parseAutomationControlRequest({action:"bulkToggle",items,active:action,requestKey:key});
    assert.equal(r.ok,true);
    assert.equal(r.items.length,2);
  }
  for(const value of [
    {action:"bulkToggle",items:[],active:false,requestKey:key},
    {action:"bulkToggle",items:Array(6).fill(items[0]),active:false,requestKey:key},
    {action:"bulkToggle",items:[items[0],items[0]],active:false,requestKey:key},
    {action:"bulkToggle",items:[{...items[0],owner:first}],active:false,requestKey:key},
    {action:"bulkToggle",items:[{...items[0],revision:0}],active:false,requestKey:key},
    {action:"bulkToggle",items:[{...items[0],revision:2147483648}],active:false,requestKey:key},
    {action:"bulkToggle",items:[{...items[0],active:"yes"}],active:false,requestKey:key},
    {action:"bulkToggle",items,active:"true",requestKey:key},
    {action:"bulkToggle",items,active:true,requestKey:"invalid"},
    {action:"bulkToggle",items,active:true,requestKey:key,deleteOldRuns:true},
    {action:"bulkToggle",items:[{...items[0],id:"../../users"}],active:false,requestKey:key},
  ])assert.equal(parseAutomationControlRequest(value).ok,false,JSON.stringify(value));
  assert.equal(parseAutomationControlRequest({action:"bulkUsage"}).ok,true);
  assert.equal(parseAutomationControlRequest({action:"bulkUsage",userId:first}).ok,false);
});
test("real history filters support bounded cursor, exact channel and reject arbitrary query injection",()=>{
  for(const value of [
    {action:"runHistory"},
    {action:"runHistory",workflowId:first,channel:"manual",pageSize:15},
    {action:"runHistory",channel:"webhook",pageSize:30,
      beforeTime:"2026-11-22T21:30:00.123456+00:00",beforeId:second},
    {action:"runHistory",channel:"scheduled",pageSize:1,
      beforeTime:"2026-11-22T21:30:00Z",beforeId:second},
  ])assert.equal(parseAutomationControlRequest(value).ok,true,JSON.stringify(value));
  for(const value of [
    {action:"runHistory",pageSize:31},
    {action:"runHistory",pageSize:0},
    {action:"runHistory",pageSize:"15"},
    {action:"runHistory",channel:"all"},
    {action:"runHistory",channel:"delete"},
    {action:"runHistory",workflowId:"invalid"},
    {action:"runHistory",beforeTime:"2026-11-22T21:30:00Z"},
    {action:"runHistory",beforeId:second},
    {action:"runHistory",beforeTime:"2026-11-22T21:30:00Z",beforeId:"bad"},
    {action:"runHistory",beforeTime:"' DROP TABLE",beforeId:second},
    {action:"runHistory",rawInputs:true},
  ])assert.equal(parseAutomationControlRequest(value).ok,false,JSON.stringify(value));
  assert.equal(parseAutomationControlRequest({action:"triggerDiagnostics",workflowId:first}).ok,true);
  assert.equal(parseAutomationControlRequest({
    action:"triggerDiagnostics",workflowId:first,url:"https://internal.example",
  }).ok,false);
});
test("real encrypted webhook credential passes local signing/verification without ingress request",async()=>{
  const master="a".repeat(64);
  const credential=await issueWebhookCredential(master);
  const secret=await openWebhookCredential(master,
    credential.credential_iv,credential.credential_ciphertext);
  const hex=[...secret].map(v=>v.toString(16).padStart(2,"0")).join("");
  const signature=await signWebhookRequest(hex,"1700000000",key,"{}");
  assert.equal(await verifyWebhookRequest(secret,"1700000000",key,"{}",
    "sha256="+signature),true);
  assert.equal(await verifyWebhookRequest(secret,"1700000000",key,"changed",
    "sha256="+signature),false);
  await assert.rejects(openWebhookCredential("b".repeat(64),
    credential.credential_iv,credential.credential_ciphertext));
});
test("scheduled input decryptability is a real cryptographic local check, not a worker tick",async()=>{
  const master="c".repeat(64);
  const encrypted=await encryptScheduledText(master,"Scheduled check",2000);
  assert.equal(await decryptScheduledText(master,
    encrypted.ciphertext,encrypted.nonce,2000),"Scheduled check");
  await assert.rejects(decryptScheduledText("d".repeat(64),
    encrypted.ciphertext,encrypted.nonce,2000));
});
test("server guards all mutations and never exports credentials, triggers or raw run text",async()=>{
  const sql=await read("supabase/migrations/20261123070000_automation_operations.sql");
  const endpoint=await read("supabase/functions/automation-control/index.ts");
  const panel=await read("src/components/AutomationOperationsPanel.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  assert.match(sql,/automation_bulk_toggle_workflows/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/stale_workflow/);
  assert.match(sql,/duplicate_workflow/);
  assert.match(sql,/daily_bulk_limit/);
  assert.match(sql,/cardinality\(seen\)/);
  assert.match(sql,/automation_query_run_history/);
  assert.match(sql,/created_at,id\)<\(p_before_time,p_before_id\)/);
  assert.match(sql,/LIMIT p_page_size\+1/);
  assert.match(sql,/rawInputsStored',false/);
  assert.match(sql,/rawOutputsStored',false/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.automation_bulk_workflow_receipts FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
  assert.match(endpoint,/authenticateUser\(req\)/);
  assert.match(endpoint,/automation_bulk_toggle_workflows/);
  assert.match(endpoint,/automation_query_run_history/);
  assert.match(endpoint,/automation_workflow_policy_status/);
  assert.match(endpoint,/openWebhookCredential/);
  assert.match(endpoint,/verifyWebhookRequest/);
  assert.match(endpoint,/decryptScheduledText/);
  assert.match(endpoint,/noNetworkRequest:true,executed:false,externalActionTriggered:false/);
  assert.match(endpoint,/workerLivenessVerified:false/);
  assert.match(panel,/Atomic bulk pause/);
  assert.match(panel,/Load next 15 runs/);
  assert.match(panel,/Confirm|confirm/);
  assert.match(panel,/credentialChallengePassed/);
  assert.match(cloud,/<AutomationOperationsPanel/);
});
