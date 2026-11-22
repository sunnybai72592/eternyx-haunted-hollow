import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAutomationControlRequest } from "../supabase/functions/_shared/automation-control-contract.mjs";

const read = (file) => readFile(new URL("../"+file,import.meta.url),"utf8");
const triggerId = "11111111-1111-4111-8111-111111111111";

test("owner budgets accept only valid whole numbers and exact fields", () => {
  for (const [dailyExecutions,dailySubmissions] of [[1,1],[30,40],[5,12]]) {
    const parsed = parseAutomationControlRequest({
      action:"setWebhookLimits",triggerId,dailyExecutions,dailySubmissions,
    });
    assert.equal(parsed.ok,true,JSON.stringify(parsed));
    assert.equal(parsed.dailyExecutions,dailyExecutions);
    assert.equal(parsed.dailySubmissions,dailySubmissions);
  }
  for (const data of [
    {dailyExecutions:0,dailySubmissions:10},
    {dailyExecutions:31,dailySubmissions:10},
    {dailyExecutions:3.5,dailySubmissions:10},
    {dailyExecutions:10,dailySubmissions:0},
    {dailyExecutions:10,dailySubmissions:41},
    {dailyExecutions:"5",dailySubmissions:10},
    {dailyExecutions:10,dailySubmissions:null},
  ]) {
    assert.equal(parseAutomationControlRequest({
      action:"setWebhookLimits",triggerId,...data,
    }).ok,false,JSON.stringify(data));
  }
  assert.equal(parseAutomationControlRequest({
    action:"setWebhookLimits",triggerId,dailyExecutions:1,dailySubmissions:1,
    userId:triggerId,
  }).ok,false);
  assert.equal(parseAutomationControlRequest({
    action:"setWebhookLimits",triggerId,dailyExecutions:1,dailySubmissions:1,
    url:"https://internal.service/",
  }).ok,false);
});
test("owner can clear only through verified authenticated action",()=>{
  assert.equal(parseAutomationControlRequest({action:"clearResolvedApprovals"}).ok,true);
  assert.equal(parseAutomationControlRequest({action:"clearResolvedApprovals",user_id:triggerId}).ok,false);
  assert.equal(parseAutomationControlRequest({action:"deleteAllRunHistory"}).ok,false);
  assert.equal(parseAutomationControlRequest({action:"externalPayment",amount:99}).ok,false);
});
test("budgeted RPCs enforce trigger limits before real execution and approval",async()=>{
  const sql=await read("supabase/migrations/20261123010100_automation_budgeted_rpcs.sql");
  assert.match(sql,/v_trigger\.daily_execution_limit/);
  assert.match(sql,/t\.daily_execution_limit/);
  assert.match(sql,/t\.daily_submission_limit/);
  assert.match(sql,/trigger_run_limit/);
  assert.match(sql,/trigger_submission_limit/);
  assert.match(sql,/request_key=p_request_key/);
  assert.match(sql,/input_ciphertext=NULL,input_nonce=NULL/);
  assert.match(sql,/automation_record_run\(/);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
});
test("schema makes approved/rejected/expired ciphertext illegal",async()=>{
  const sql=await read("supabase/migrations/20261123010000_automation_budget_and_retention.sql");
  assert.match(sql,/automation_payload_only_while_pending/);
  assert.match(sql,/input_ciphertext IS NULL AND input_nonce IS NULL/);
  assert.match(sql,/allowed_scope='text_transform'/);
  assert.match(sql,/daily_execution_limit BETWEEN 1 AND 30/);
  assert.match(sql,/daily_submission_limit BETWEEN 1 AND 40/);
  assert.match(sql,/automation_housekeep_approval_inbox/);
  assert.match(sql,/automation_clear_resolved_approvals/);
  assert.match(sql,/interval '7 days'/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
});
test("owner API reads server-measured usage and asks SQL to enforce limits",async()=>{
  const api=await read("supabase/functions/automation-control/index.ts");
  const endpoint=await read("supabase/functions/automation-webhook/index.ts");
  const panel=await read("src/components/AutomationWebhookBudgetPanel.tsx");
  const parent=await read("src/components/AutomationWebhookPanel.tsx");
  const approvals=await read("src/components/AutomationApprovalPanel.tsx");
  assert.match(api,/authenticateUser\(req\)/);
  assert.match(api,/automation_set_webhook_limits/);
  assert.match(api,/automation_webhook_usage/);
  assert.match(api,/automation_housekeep_approval_inbox/);
  assert.match(api,/automation_clear_resolved_approvals/);
  assert.match(endpoint,/trigger_run_limit/);
  assert.match(endpoint,/trigger_submission_limit/);
  assert.match(panel,/Save per-trigger limits/);
  assert.match(panel,/text_transform only/);
  assert.match(parent,/<AutomationWebhookBudgetPanel/);
  assert.match(approvals,/clearResolvedApprovals/);
});
test("budgets are usage guards, not invented dollar spending controls",async()=>{
  const doc=await read("docs/ETERNYX_AUTOMATION_BUDGETS.md");
  assert.match(doc,/not a monetary spending cap/i);
  assert.match(doc,/opportunistic/i);
  assert.match(doc,/disabled by default/i);
  assert.doesNotMatch(doc,/automatically deploys|already deployed/i);
});
