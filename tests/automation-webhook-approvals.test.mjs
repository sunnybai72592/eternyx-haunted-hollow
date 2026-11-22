import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAutomationControlRequest } from "../supabase/functions/_shared/automation-control-contract.mjs";
import { encryptScheduledText, decryptScheduledText } from "../supabase/functions/_shared/automation-schedule-crypto.mjs";
import { issueWebhookCredential, openWebhookCredential, signWebhookRequest, verifyWebhookRequest } from "../supabase/functions/_shared/automation-webhook-crypto.mjs";

const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");
const id="11111111-1111-4111-8111-111111111111";
const key="a".repeat(64);

test("owner-review actions accept bounded, exact request fields only",()=>{
  for (const body of [
    {action:"approvalInbox"},
    {action:"previewApproval",approvalId:id},
    {action:"approveWebhook",approvalId:id},
    {action:"rejectWebhook",approvalId:id},
    {action:"setWebhookApproval",triggerId:id,required:true},
    {action:"setWebhookApproval",triggerId:id,required:false},
  ]) assert.equal(parseAutomationControlRequest(body).ok,true,JSON.stringify(body));
  for (const body of [
    {action:"approvalInbox",user_id:id},
    {action:"approvalInbox",input:"private"},
    {action:"approveWebhook",approvalId:"bad"},
    {action:"approveWebhook",approvalId:id,userId:id},
    {action:"approveWebhook",approvalId:id,output:"forged"},
    {action:"approveWebhook",approvalId:id,steps:[{kind:"shell"}]},
    {action:"setWebhookApproval",triggerId:id,required:"true"},
    {action:"setWebhookApproval",triggerId:id,required:true,url:"http://localhost"},
    {action:"runExternalAction"},
    {action:"autoApprove"},
  ]) assert.equal(parseAutomationControlRequest(body).ok,false,JSON.stringify(body));
});

test("signed event can be encrypted at rest, decrypted solely with the server key",async()=>{
  const text="A\nBeta\né";
  const encrypted=await encryptScheduledText(key,text,2000);
  assert.match(encrypted.ciphertext,/^[0-9a-f]+$/);
  assert.match(encrypted.nonce,/^[0-9a-f]{24}$/);
  assert.equal(await decryptScheduledText(key,encrypted.ciphertext,encrypted.nonce,2000),text);
  await assert.rejects(decryptScheduledText("b".repeat(64),encrypted.ciphertext,encrypted.nonce,2000));
  await assert.rejects(encryptScheduledText(key,"é".repeat(1001),2000));
  await assert.rejects(decryptScheduledText(key,encrypted.ciphertext,encrypted.nonce,100));
});

test("approvals extend verified signed webhooks, not anonymous or fake client decisions",async()=>{
  const webhook=await read("supabase/functions/automation-webhook/index.ts");
  const controller=await read("supabase/functions/automation-control/index.ts");
  const form=await read("src/components/AutomationApprovalPanel.tsx");
  const controls=await read("src/components/AutomationWebhookPanel.tsx");
  assert.match(webhook,/verifyWebhookRequest\(secretBytes, timestamp, requestId, raw, signature\)/);
  assert.match(webhook,/if \(trigger\.approval_required === true\)/);
  assert.match(webhook,/encryptScheduledText\(approvalMaster, envelope\.input, SCHEDULE_INPUT_BYTES\)/);
  assert.match(webhook,/automation_enqueue_webhook_approval/);
  assert.match(webhook,/executed: false/);
  assert.match(controller,/authenticateUser\(req\)/);
  assert.match(controller,/\.eq\("user_id", user\.id\)/);
  assert.match(controller,/approvalInbox/);
  assert.match(controller,/decryptScheduledText\(/);
  assert.match(controller,/runLocalWorkflow\(input, workflow\.steps\)/);
  assert.match(controller,/automation_approve_webhook_execution/);
  assert.match(form,/Review input/);
  assert.match(form,/Approve & run/);
  assert.match(form,/Reject/);
  assert.match(controls,/setWebhookApproval/);
  assert.match(controls,/<AutomationApprovalPanel/);
});

test("signed webhook integrity remains in force when review is turned on",async()=>{
  const secret=await issueWebhookCredential(key);
  const bytes=await openWebhookCredential(key,secret.credential_iv,secret.credential_ciphertext);
  const event=JSON.stringify({triggerId:id,input:"Review this"});
  const timestamp="1795360000",requestId="22222222-2222-4222-8222-222222222222";
  const signature="sha256="+await signWebhookRequest(secret.secret,timestamp,requestId,event);
  assert.equal(await verifyWebhookRequest(bytes,timestamp,requestId,event,signature),true);
  assert.equal(await verifyWebhookRequest(bytes,timestamp,requestId,event.replace("Review","Approve"),signature),false);
});

test("database queue is private, owner-locked, replay-safe and quota-bounded",async()=>{
  const sql=await read("supabase/migrations/20261123000000_automation_webhook_approvals.sql");
  assert.match(sql,/approval_required boolean NOT NULL DEFAULT false/);
  assert.match(sql,/input_ciphertext text NOT NULL/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.automation_approval_requests FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/UNIQUE\(user_id,request_key\)/);
  assert.match(sql,/interval '24 hours'/);
  assert.match(sql,/>= 40/);
  assert.match(sql,/>= 10/);
  assert.match(sql,/credential_version=a\.credential_version/);
  assert.match(sql,/automation_record_run\(/);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
});

test("no external automation or unreviewed code execution added",async()=>{
  const controller=await read("supabase/functions/automation-control/index.ts");
  const webhook=await read("supabase/functions/automation-webhook/index.ts");
  for(const content of [controller,webhook]){
    assert.doesNotMatch(content,/\beval\s*\(|new Function|Deno\.Command/);
  }
  const docs=await read("docs/ETERNYX_AUTOMATION_APPROVALS.md");
  assert.match(docs,/disabled by default/i);
  assert.match(docs,/40/);
  assert.match(docs,/production/i);
});
