import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseScheduleControlRequest,SCHEDULE_INTERVALS,
} from "../supabase/functions/_shared/automation-schedule-contract.mjs";
import {
  encryptScheduledText,decryptScheduledText,validSchedulerWorkerKey,
  scheduledRunFingerprint,SCHEDULE_INPUT_BYTES,SCHEDULE_OUTPUT_BYTES,
} from "../supabase/functions/_shared/automation-schedule-crypto.mjs";

const uuid="11111111-1111-4111-8111-111111111111";
const runId="22222222-2222-4222-8222-222222222222";
const master="a".repeat(64);
const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("schedule actions allow only owner-bound CRUD, output lookup and fixed frequency values",()=>{
  assert.deepEqual(SCHEDULE_INTERVALS,[60,1440,10080]);
  for(const minutes of SCHEDULE_INTERVALS) {
    const r=parseScheduleControlRequest({action:"save",workflowId:uuid,intervalMinutes:minutes,input:"Hello"});
    assert.equal(r.ok,true);
  }
  assert.equal(parseScheduleControlRequest({action:"list"}).ok,true);
  assert.equal(parseScheduleControlRequest({action:"toggle",scheduleId:uuid,enabled:false}).ok,true);
  assert.equal(parseScheduleControlRequest({action:"delete",scheduleId:uuid}).ok,true);
  assert.equal(parseScheduleControlRequest({action:"output",runId}).ok,true);
  assert.equal(parseScheduleControlRequest({action:"save",workflowId:uuid,scheduleId:runId,intervalMinutes:60,input:"x"}).ok,true);
});
test("reject unapproved fields, cron expressions, scripts and forged user identity",()=>{
  for(const req of [
    {action:"save",workflowId:uuid,intervalMinutes:5,input:"hello"},
    {action:"save",workflowId:uuid,intervalMinutes:"* * * * *",input:"hello"},
    {action:"save",workflowId:uuid,intervalMinutes:60,input:" "},
    {action:"save",workflowId:uuid,intervalMinutes:60,input:"x",url:"http://localhost"},
    {action:"save",workflowId:uuid,intervalMinutes:60,input:"x",userId:runId},
    {action:"save",workflowId:uuid,intervalMinutes:60,input:"x",script:"eval('x')"},
    {action:"toggle",scheduleId:uuid,enabled:"true"},
    {action:"output",runId:"fake"},
    {action:"cron",cron:"* * * * *"},
    {action:"list",user_id:uuid},
  ]) assert.equal(parseScheduleControlRequest(req).ok,false,JSON.stringify(req));
});
test("UTF-8 byte limit applies even when character count looks short",()=>{
  assert.equal(parseScheduleControlRequest({action:"save",workflowId:uuid,intervalMinutes:60,input:"a".repeat(2000)}).ok,true);
  assert.equal(parseScheduleControlRequest({action:"save",workflowId:uuid,intervalMinutes:60,input:"é".repeat(1001)}).ok,false);
});
test("AES-GCM encrypts scheduled input and outputs with fresh IVs",async()=>{
  const a=await encryptScheduledText(master,"hello\nworld",SCHEDULE_INPUT_BYTES);
  const b=await encryptScheduledText(master,"hello\nworld",SCHEDULE_INPUT_BYTES);
  assert.match(a.nonce,/^[0-9a-f]{24}$/);
  assert.match(a.ciphertext,/^[0-9a-f]+$/);
  assert.notEqual(a.nonce,b.nonce);
  assert.notEqual(a.ciphertext,b.ciphertext);
  assert.equal(await decryptScheduledText(master,a.ciphertext,a.nonce,SCHEDULE_INPUT_BYTES),"hello\nworld");
  const output=await encryptScheduledText(master,"done".repeat(100),SCHEDULE_OUTPUT_BYTES);
  assert.equal(await decryptScheduledText(master,output.ciphertext,output.nonce,SCHEDULE_OUTPUT_BYTES),"done".repeat(100));
});
test("incorrect key, corrupted data or oversize payloads fail closed",async()=>{
  const one=await encryptScheduledText(master,"encrypted",SCHEDULE_INPUT_BYTES);
  await assert.rejects(decryptScheduledText("b".repeat(64),one.ciphertext,one.nonce,SCHEDULE_INPUT_BYTES));
  await assert.rejects(decryptScheduledText(master,"f".repeat(one.ciphertext.length),one.nonce,SCHEDULE_INPUT_BYTES));
  await assert.rejects(encryptScheduledText(master,"a".repeat(2001),SCHEDULE_INPUT_BYTES));
  await assert.rejects(encryptScheduledText(master,"é".repeat(1001),SCHEDULE_INPUT_BYTES));
  await assert.rejects(encryptScheduledText("missing","x",SCHEDULE_INPUT_BYTES));
});
test("trusted worker key matches only 32-byte configured secret",()=>{
  assert.equal(validSchedulerWorkerKey("a".repeat(64),"a".repeat(64)),true);
  assert.equal(validSchedulerWorkerKey("b".repeat(64),"a".repeat(64)),false);
  assert.equal(validSchedulerWorkerKey("a".repeat(63),"a".repeat(64)),false);
  assert.equal(validSchedulerWorkerKey("a".repeat(64),undefined),false);
});
test("input fingerprint varies by user, schedule, revision and plaintext",async()=>{
  const a=await scheduledRunFingerprint(uuid,runId,uuid,1,"abc");
  assert.match(a,/^[a-f0-9]{64}$/);
  assert.equal(await scheduledRunFingerprint(uuid,runId,uuid,1,"abc"),a);
  assert.notEqual(await scheduledRunFingerprint(uuid,runId,uuid,2,"abc"),a);
  assert.notEqual(await scheduledRunFingerprint(uuid,runId,uuid,1,"abcd"),a);
  assert.notEqual(await scheduledRunFingerprint(runId,runId,uuid,1,"abc"),a);
});
test("server validates signed-in account and never persists unencrypted input/output",async()=>{
  const control=await read("supabase/functions/automation-schedule-control/index.ts");
  const worker=await read("supabase/functions/automation-scheduler-worker/index.ts");
  const ui=await read("src/components/AutomationSchedulePanel.tsx");
  const app=await read("src/components/AutomationCloudPanel.tsx");
  assert.match(control,/authenticateUser\(req\)/);
  assert.match(control,/\.eq\("user_id", user\.id\)/);
  assert.match(control,/encryptScheduledText\(master, request\.input/);
  assert.match(control,/decryptScheduledText\(master,data\.output_ciphertext/);
  assert.match(control,/schedulerEnabled/);
  assert.match(worker,/validSchedulerWorkerKey\(supplied,expected\)/);
  assert.match(worker,/automation_claim_due_schedule/);
  assert.match(worker,/automation_complete_scheduled_run/);
  assert.match(worker,/automation_defer_scheduled_run/);
  assert.match(worker,/automation_fail_scheduled_run/);
  assert.doesNotMatch(worker,/\bfetch\s*\(|\beval\s*\(|Deno\.Command|new Function/);
  assert.match(app,/<AutomationSchedulePanel/);
  assert.match(ui,/Encrypted scheduled outputs/);
});
test("migration enforces disabled operator switch, encrypted-only columns and private RPCs",async()=>{
  const migration=await read("supabase/migrations/20261122234500_automation_scheduled_runs.sql");
  assert.match(migration,/enabled boolean NOT NULL DEFAULT false/);
  assert.match(migration,/input_ciphertext text NOT NULL/);
  assert.match(migration,/output_ciphertext text NOT NULL/);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration,/REVOKE ALL ON public\.automation_schedules FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/lease_expires_at/);
  assert.match(migration,/SKIP LOCKED/);
  assert.match(migration,/attempt_count<3/);
  assert.match(migration,/automation_record_run\(/);
  assert.match(migration,/interval '7 days'/);
  assert.doesNotMatch(migration,/SECURITY DEFINER/);
});
