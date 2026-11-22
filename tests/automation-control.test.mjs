import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseAutomationControlRequest, CLOUD_INPUT_LIMIT, UUID_RE,
} from "../supabase/functions/_shared/automation-control-contract.mjs";
const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const workflowId = "11111111-1111-4111-8111-111111111111";
const runKey = "22222222-2222-4222-8222-222222222222";
const steps = [{ id: "a", kind: "trim" }, { id: "b", kind: "unique", caseSensitive: false }];

test("auth control parser supports exactly six manual-only actions", () => {
  assert.equal(parseAutomationControlRequest({ action: "list" }).ok, true);
  assert.equal(parseAutomationControlRequest({ action: "history" }).ok, true);
  assert.equal(parseAutomationControlRequest({ action: "save", name: "Clean", steps }).ok, true);
  assert.equal(parseAutomationControlRequest({ action: "run", workflowId, input: "a", requestKey: runKey }).ok, true);
  assert.equal(parseAutomationControlRequest({ action: "toggle", workflowId, active: false }).ok, true);
  assert.equal(parseAutomationControlRequest({ action: "delete", workflowId }).ok, true);
  for (const action of ["schedule", "webhook", "execute", "approve", "cron", "shell"]) {
    assert.equal(parseAutomationControlRequest({ action }).ok, false, action);
  }
});
test("rejects unknown keys, caller-supplied identity, scores, URL, and step execution claims", () => {
  for (const body of [
    { action: "list", userId: workflowId },
    { action: "history", output: "fake" },
    { action: "save", name: "x", steps, webhookUrl: "http://example.test" },
    { action: "run", workflowId, input: "a", requestKey: runKey, steps },
    { action: "run", workflowId, input: "a", requestKey: runKey, output: "forged" },
    { action: "run", workflowId, input: "a", requestKey: runKey, user_id: workflowId },
    { action: "toggle", workflowId, active: true, schedule: "* * * * *" },
  ]) assert.equal(parseAutomationControlRequest(body).ok, false, JSON.stringify(body));
});
test("save validates name, IDs, limits and operation allowlist", () => {
  const result = parseAutomationControlRequest({ action: "save", name: "  Safe  ", steps });
  assert.equal(result.ok, true);
  assert.equal(result.name, "Safe");
  assert.deepEqual(result.steps, [{ id: "a", kind: "trim" }, { id: "b", kind: "unique", caseSensitive: false }]);
  assert.equal(parseAutomationControlRequest({ action: "save", name: "", steps }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "save", name: "a".repeat(81), steps }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "save", name: "test", steps: [] }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "save", name: "test", steps: [{ id: "x", kind: "eval" }] }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "save", name: "test", steps, workflowId: "abc" }).ok, false);
});
test("run requires valid workflow and idempotency UUID, bounded input and no user-chosen actions", () => {
  assert.equal(UUID_RE.test(runKey), true);
  assert.equal(parseAutomationControlRequest({ action: "run", workflowId: "wrong", input: "", requestKey: runKey }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "run", workflowId, input: "", requestKey: "x" }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "run", workflowId, input: "x".repeat(CLOUD_INPUT_LIMIT + 1), requestKey: runKey }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "run", workflowId, input: "", requestKey: runKey }).ok, true);
  assert.equal(parseAutomationControlRequest({ action: "run", workflowId, input: {}, requestKey: runKey }).ok, false);
});
test("toggle and delete require owner workflow target and boolean state", () => {
  assert.equal(parseAutomationControlRequest({ action: "toggle", workflowId, active: "false" }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "delete" }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "toggle", active: true }).ok, false);
});
test("backend executes a stored definition with verified identity rather than browser steps", async () => {
  const edge = await read("supabase/functions/automation-control/index.ts");
  const ui = await read("src/components/AutomationCloudPanel.tsx");
  const workbench = await read("src/components/AutomationWorkflowStudio.tsx");
  assert.match(edge, /authenticateUser\(req\)/);
  assert.match(edge, /user\.is_anonymous/);
  assert.match(edge, /runLocalWorkflow\(request\.input, workflow\.steps\)/);
  assert.match(edge, /\.eq\("user_id", user\.id\)/);
  assert.match(edge, /automation_record_run/);
  assert.match(edge, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(edge, /rawInputsStored: false, rawOutputsStored: false/);
  assert.match(ui, /pendingRun\.current/);
  assert.match(ui, /crypto\.randomUUID\(\)/);
  assert.match(ui, /<textarea|<Textarea/);
  assert.match(workbench, /<AutomationCloudPanel/);
});
test("migration explicitly enforces RLS, manual triggers, quotas and grants", async () => {
  const sql = await read("supabase/migrations/20261122220000_automation_manual_control_plane.sql");
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql, /CHECK \(trigger_kind = 'manual'\)/);
  assert.match(sql, /REVOKE ALL ON public\.automation_runs FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON public\.automation_workflows FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /count\(\*\).*public\.automation_runs/s);
  assert.match(sql, /request_fingerprint/);
  assert.match(sql, /UNIQUE\(user_id, request_key\)/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
});
