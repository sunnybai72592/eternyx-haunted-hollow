import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  automationControlFailure,shouldInvalidateAutomationCloud,
  verifyAutomationRunHistory,
} from "../src/lib/automationCloudStatus.mjs";

const uuid="11111111-1111-4111-8111-111111111111";
const validRun=()=>({
  id:uuid,workflow_id:null,workflow_revision:1,status:"completed",
  trigger_type:"manual",webhook_trigger_id:null,schedule_id:null,
  input_lines:1,output_lines:1,input_characters:4,output_characters:4,
  trace:[{id:"p1",kind:"trim",changed:true,beforeLines:1,afterLines:1}],
  created_at:"2026-11-23T16:00:00.000Z",
});

test("missing Edge endpoint is only inferred for the authenticated list action",()=>{
  const list=automationControlFailure("list",404);
  assert.equal(list.kind,"backend_missing");
  assert.match(list.message,/local workflow/);
  assert.equal(list.message.includes("deployed"),false);
  assert.equal(shouldInvalidateAutomationCloud(list.kind),true);
  const record=automationControlFailure("run",404);
  assert.equal(record.kind,"resource_unavailable");
  assert.equal(shouldInvalidateAutomationCloud(record.kind),false);
  assert.notEqual(record.message,list.message);
});
test("401 is a session problem, not a missing deployment; 403, 409 and 429 retain distinct meanings",()=>{
  assert.equal(automationControlFailure("list",401).kind,"sign_in_required");
  assert.equal(automationControlFailure("save",403).kind,"permission_denied");
  assert.equal(automationControlFailure("run",409).kind,"conflict");
  assert.equal(automationControlFailure("run",429).kind,"limit");
  for(const code of [401,403,409,429]){
    assert.equal(automationControlFailure("run",code).message.includes("Bearer"),false);
  }
});
test("gateway failures and missing transport invalidate account-scoped cloud UI without claiming cause",()=>{
  for(const status of [502,503,504]){
    assert.equal(automationControlFailure("list",status).kind,"backend_unavailable");
    assert.equal(shouldInvalidateAutomationCloud("backend_unavailable"),true);
  }
  for(const status of [null,undefined,0]){
    assert.equal(automationControlFailure("list",status).kind,"network_unavailable");
    assert.equal(shouldInvalidateAutomationCloud("network_unavailable"),true);
  }
  assert.equal(automationControlFailure("run",400).kind,"request_error");
  assert.equal(shouldInvalidateAutomationCloud("request_error"),false);
});
test("history validation accepts only server-selected bounded completed metadata",()=>{
  const source=[validRun()];
  assert.deepEqual(verifyAutomationRunHistory(source),source);
  assert.deepEqual(verifyAutomationRunHistory([]),[]);
  assert.throws(()=>verifyAutomationRunHistory({runs:source}));
  assert.throws(()=>verifyAutomationRunHistory(Array(21).fill(validRun())));
  assert.throws(()=>verifyAutomationRunHistory([validRun(),validRun()]));
  assert.throws(()=>verifyAutomationRunHistory([{...validRun(),status:"running"}]));
  assert.throws(()=>verifyAutomationRunHistory([{...validRun(),workflow_revision:0}]));
});
test("history validation rejects raw input/output, secrets and malformed traces rather than hiding them",()=>{
  for(const key of ["input","output","raw_input","raw_output","input_ciphertext",
    "output_ciphertext","token","secret","user_id","authorization"]){
    assert.throws(()=>verifyAutomationRunHistory([{...validRun(),[key]:"PRIVATE"}]),key);
  }
  assert.throws(()=>verifyAutomationRunHistory([{...validRun(),trace:[{input:"PRIVATE"}]}]));
  assert.throws(()=>verifyAutomationRunHistory([{...validRun(),trace:Array(13).fill({id:"x"})}]));
  assert.throws(()=>verifyAutomationRunHistory([{...validRun(),output_lines:-1}]));
  assert.throws(()=>verifyAutomationRunHistory([{...validRun(),created_at:"not-time"}]));
  assert.throws(()=>verifyAutomationRunHistory([{...validRun(),id:"forged"}]));
});
test("UI has manual capability probe, offline fallback and no auto-probe on user login",async()=>{
  const ui=await readFile(new URL("../src/components/AutomationCloudPanel.tsx",import.meta.url),"utf8");
  assert.match(ui,/Check cloud & load workflows/);
  assert.match(ui,/role="status" aria-live="polite"/);
  assert.match(ui,/backendStatus === "available"/);
  assert.match(ui,/Other integrations and migrations are not verified/);
  assert.match(ui,/useRef\(userId\)/);
  assert.match(ui,/ownerRef\.current !== userId/);
  assert.match(ui,/setBackendStatus\("unchecked"\); setBusy\(false\)/);
  assert.match(ui,/setLoaded\(false\); setWorkflows\(\[\]\); setHistory\(\[\]\); setSelectedId\(null\)/);
  assert.match(ui,/verifyAutomationRunHistory\(raw\)/);
  assert.match(ui,/pendingRun\.current = null; pendingPreview\.current = null/);
  assert.doesNotMatch(ui,/useEffect\(\s*\(\)\s*=>\s*\{\s*void refresh\(/);
});
test("failure interpreter cannot transmit, execute, store secrets or return raw server errors",async()=>{
  const helper=await readFile(new URL("../src/lib/automationCloudStatus.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(helper,/\bfetch\s*\(|supabase\.|console\.|localStorage|sessionStorage|eval\(/);
  assert.doesNotMatch(helper,/serverResponse\.message|error\.context\.json\(/);
  for(const status of [401,403,404,409,429,502,503,504,500,null]){
    const v=automationControlFailure("list",status);
    assert.equal(typeof v.message,"string");
    assert.ok(v.message.length<180);
    assert.deepEqual(Object.keys(v).sort(),["kind","message","retryable"].sort());
  }
});
