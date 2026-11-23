import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const helperText = await read("src/lib/ai/agent-ai-assist.ts");
const page = await read("src/pages/AIAgentsStudio.tsx");
const chat = await read("src/lib/ai/studio-chat-request.ts");
const localText = await read("src/lib/ai/agent-local-tools.ts");
const hub = await read("src/pages/AIArsenal.tsx");
async function loadText(source) {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
const ai = await loadText(helperText);
const request = await loadText(chat);
const local = await loadText(localText);
const suggestion = { title: "Inspect test criteria", details: "Review authorized project records.", kind: "review" };
const json = value => JSON.stringify(value);

test("agent suggestion prompt uses untrusted input with a strict bounded review-only contract", () => {
  const prompt = ai.prepareAgentSuggestionPrompt("Inspect coating compliance", "No external calls or paid work");
  assert.match(prompt, /HUMAN-REVIEWED/);
  assert.match(prompt, /Return ONLY JSON/);
  assert.match(prompt, /Every suggested step requires human approval/);
  assert.match(prompt, /USER GOAL \(untrusted\)/);
  assert.match(prompt, /No external calls or paid work/);
  assert.ok(request.prepareStudioChatMessage("ai.agents.plan", prompt).length <= 4000);
  assert.throws(() => ai.prepareAgentSuggestionPrompt("", ""), { code: "invalid_input" });
  assert.throws(() => ai.prepareAgentSuggestionPrompt("x".repeat(2001), ""), { code: "invalid_input" });
  assert.throws(() => ai.prepareAgentSuggestionPrompt("Goal", "x".repeat(1001)), { code: "invalid_input" });
});

test("AI plan review prompt is advisory and refuses oversized drafts without truncation", () => {
  const plan = local.formatLocalAgentPlan(local.buildLocalAgentPlan(
    "Inspect coating compliance", "Work locally", ["local_notes"],
    [local.createAgentStep([], { id: "a", title: "Review records", details: "", kind: "review" })[0]],
  ));
  const prompt = ai.prepareAgentReviewPrompt(plan);
  assert.match(prompt, /feasibility/);
  assert.match(prompt, /BEGIN PROPOSED DRAFT/);
  assert.ok(prompt.includes("Review records"));
  assert.ok(request.prepareStudioChatMessage("ai.agents.review", prompt).length <= 4000);
  assert.throws(() => ai.prepareAgentReviewPrompt(" "), { code: "invalid_input" });
  assert.throws(() => ai.prepareAgentReviewPrompt("x".repeat(3201)), { code: "too_long" });
});

test("AI suggestion parser accepts only one bounded JSON object, optionally fenced", () => {
  const data = { steps: [suggestion] };
  assert.deepEqual(ai.parseAgentAISuggestions(json(data)), [suggestion]);
  const fence = String.fromCharCode(96).repeat(3);
  assert.deepEqual(ai.parseAgentAISuggestions(fence + "json\n" + json(data) + "\n" + fence), [suggestion]);
  assert.equal(ai.MAX_AI_AGENT_SUGGESTIONS, 6);
  assert.throws(() => ai.parseAgentAISuggestions("not JSON"), { code: "invalid_response" });
  assert.throws(() => ai.parseAgentAISuggestions('{"steps":[]}'), { code: "too_many_steps" });
  assert.throws(() => ai.parseAgentAISuggestions(json({ steps: Array(7).fill(suggestion) })), { code: "too_many_steps" });
});

test("model cannot smuggle external actions, execution states, permissions or IDs into local steps", () => {
  const extras = [
    { ...suggestion, kind: "external_action" },
    { ...suggestion, kind: "paid_action" },
    { ...suggestion, permissions: ["external_write"] },
    { ...suggestion, status: "executed" },
    { ...suggestion, id: "trusted-id" },
    { ...suggestion, approvalRequired: false },
  ];
  for (const item of extras) {
    assert.throws(() => ai.parseAgentAISuggestions(json({ steps: [item] })), { code: "unsafe_step" });
  }
  assert.throws(() => ai.parseAgentAISuggestions(json({ steps: [suggestion], executed: true })), { code: "invalid_response" });
});

test("AI validation rejects malformed step text and never silently truncates", () => {
  for (const entry of [
    { ...suggestion, title: "" },
    { ...suggestion, title: "x".repeat(181) },
    { ...suggestion, details: "x".repeat(1001) },
    { ...suggestion, title: "Hello\u0000world" },
  ]) assert.throws(() => ai.parseAgentAISuggestions(json({ steps: [entry] })), { code: "invalid_response" });
  assert.equal(ai.parseAgentAISuggestions(json({ steps: [{ title: " Review ", kind: "review" }] }))[0].details, "");
  assert.throws(() => ai.parseAgentAISuggestions("x".repeat(10001)), { code: "invalid_response" });
});

test("human approval and authoritative local step validation are mandatory for import", () => {
  assert.match(page, /parseAgentAISuggestions\(aiPlan\.result\)/);
  assert.match(page, /window\.confirm\(/);
  assert.match(page, /if \(!window\.confirm\(/);
  assert.match(page, /next = createAgentStep\(next, \{/);
  assert.match(page, /id: crypto\.randomUUID\(\)/);
  assert.match(page, /setSteps\(next\)/);
  assert.match(page, /steps\.length \+ suggestions\.length > MAX_AGENT_STEPS/);
  assert.match(page, /no agent|No agent/i);
  assert.doesNotMatch(page, /ai-generation-job-enqueue|supabase\.functions\.invoke|eval\(/);
  const parsed = ai.parseAgentAISuggestions(json({ steps: [suggestion] }));
  const verified = local.createAgentStep([], { ...parsed[0], id: "reviewed" });
  assert.equal(verified[0].status, "proposed");
  assert.equal(verified[0].approvalRequired, false);
});

test("two separate opt-in AI tasks preserve chat entitlement and invalidate after local changes", () => {
  assert.ok(request.STUDIO_CHAT_FEATURES.includes("ai.agents.plan"));
  assert.ok(request.STUDIO_CHAT_FEATURES.includes("ai.agents.review"));
  assert.match(page, /aiPlan\.run\("ai\.agents\.plan", prompt\)/);
  assert.match(page, /aiReview\.run\("ai\.agents\.review", prompt\)/);
  assert.match(page, /aiPlan\.invalidate\(\)/);
  assert.match(page, /aiReview\.invalidate\(\)/);
  assert.match(page, /ai\.chat credits/);
  assert.match(page, /Download local draft/);
  assert.match(page, /await navigator\.clipboard\.writeText\(preview\)/);
  assert.match(page, /URL\.revokeObjectURL\(url\)/);
  assert.match(hub, /optional AI Chat step suggestions/);
});
