import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const helper = await read("src/lib/ai/agent-local-tools.ts");
const page = await read("src/pages/AIAgentsStudio.tsx");
const app = await read("src/App.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const output = ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const agent = await import("data:text/javascript;base64," + Buffer.from(output).toString("base64"));
const research = { id: "s1", title: "Gather sources", details: "Use only approved public resources.", kind: "research" };
const external = { id: "s2", title: "Send update", details: "Ask the owner before writing.", kind: "external_action" };

test("Agent Studio has protected lazy-loaded route and explicit navigation link", () => {
  assert.ok(app.includes('const AIAgentsStudio = lazy(() => import("./pages/AIAgentsStudio"));'));
  assert.ok(app.includes('path="/ai-arsenal/agents" element={<RequireAuth><AIAgentsStudio /></RequireAuth>}'));
  assert.ok(hub.includes('to="/ai-arsenal/agents"'));
  assert.ok(hub.includes("Local workspace ready · AI disabled"));
});
test("steps are proposed, bounded and external actions always require approval", () => {
  const steps = agent.createAgentStep([], research);
  assert.equal(steps[0].status, "proposed");
  assert.equal(steps[0].approvalRequired, false);
  const next = agent.createAgentStep(steps, external);
  assert.equal(next[1].approvalRequired, true);
  assert.equal(next[1].status, "proposed");
});
test("duplicate IDs, invalid titles, unknown kinds and oversize steps fail closed", () => {
  const steps = agent.createAgentStep([], research);
  assert.throws(() => agent.createAgentStep(steps, research), { code: "duplicate_step" });
  assert.throws(() => agent.createAgentStep([], { ...research, title: " " }), { code: "invalid_step" });
  assert.throws(() => agent.createAgentStep([], { ...research, title: "x".repeat(181) }), { code: "invalid_step" });
  assert.throws(() => agent.createAgentStep([], { ...research, details: "x".repeat(1001) }), { code: "invalid_step" });
  assert.throws(() => agent.createAgentStep([], { ...research, kind: "run-shell" }), { code: "invalid_kind" });
});
test("step limit is 12 even when callers bypass UI", () => {
  const full = Array.from({ length: 12 }, (_, n) => ({ ...research, id: "step" + n }));
  assert.throws(() => agent.createAgentStep(full, { ...research, id: "step13" }), { code: "too_many_steps" });
});
test("step order changes by one position without mutating original", () => {
  const steps = agent.createAgentStep(agent.createAgentStep([], research), external);
  const reordered = agent.moveAgentStep(steps, "s2", -1);
  assert.deepEqual(reordered.map(step => step.id), ["s2", "s1"]);
  assert.deepEqual(steps.map(step => step.id), ["s1", "s2"]);
  assert.deepEqual(agent.moveAgentStep(steps, "s1", -1), steps);
  assert.deepEqual(agent.removeAgentStep(steps, "s1").map(step => step.id), ["s2"]);
});
test("building a local plan has no execution or approval state", () => {
  const steps = agent.createAgentStep([], research);
  const plan = agent.buildLocalAgentPlan("  Investigate tool quality ", "", ["local_notes"], steps);
  assert.equal(plan.featureKey, "ai.agents.plan");
  assert.equal(plan.goal, "Investigate tool quality");
  assert.deepEqual(plan.proposedScopes, ["local_notes"]);
  assert.equal(plan.approvalSteps, 0);
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.status, "local_draft_only");
});
test("external actions require declared proposed scope and explicit future approval", () => {
  const steps = agent.createAgentStep([], external);
  assert.throws(() => agent.buildLocalAgentPlan("Send results", "", ["local_notes"], steps), { code: "invalid_scope" });
  const plan = agent.buildLocalAgentPlan("Send results", "Manual approval", ["external_write"], steps);
  assert.equal(plan.approvalSteps, 1);
  assert.equal(plan.steps[0].approvalRequired, true);
  assert.match(agent.formatLocalAgentPlan(plan), /External actions approved: NONE/);
  assert.match(agent.formatLocalAgentPlan(plan), /requires explicit approval/);
});
test("unknown, duplicated scopes and mismatched paid scopes cannot be smuggled in", () => {
  const steps = agent.createAgentStep([], research);
  assert.throws(() => agent.buildLocalAgentPlan("Goal", "", ["local_notes", "local_notes"], steps), { code: "invalid_scope" });
  assert.throws(() => agent.buildLocalAgentPlan("Goal", "", ["shell_access"], steps), { code: "invalid_scope" });
  assert.throws(() => agent.buildLocalAgentPlan("Goal", "", ["paid_action"], steps), { code: "invalid_scope" });
});
test("empty and oversized goals or constraints fail before plan creation", () => {
  const steps = agent.createAgentStep([], research);
  assert.throws(() => agent.buildLocalAgentPlan(" ", "", [], steps), { code: "invalid_goal" });
  assert.throws(() => agent.buildLocalAgentPlan("x".repeat(2001), "", [], steps), { code: "invalid_goal" });
  assert.throws(() => agent.buildLocalAgentPlan("Goal", "x".repeat(1001), [], steps), { code: "invalid_constraints" });
  assert.throws(() => agent.buildLocalAgentPlan("Goal", "", [], []), { code: "empty_plan" });
});
test("revalidated imported steps cannot turn off external-action approval", () => {
  const forged = { ...external, approvalRequired: false, status: "done" };
  const plan = agent.buildLocalAgentPlan("Goal", "", ["external_write"], [forged]);
  assert.equal(plan.steps[0].approvalRequired, true);
  assert.equal(plan.steps[0].status, "proposed");
});
test("formatted plan states all execution limitations accurately", () => {
  const steps = agent.createAgentStep([], research);
  const text = agent.formatLocalAgentPlan(agent.buildLocalAgentPlan("Goal", "", [], steps));
  assert.match(text, /LOCAL DRAFT ONLY/);
  assert.match(text, /No AI planning, background task/);
  assert.match(text, /does not authorize execution/);
});
test("UI does not call providers, external services, execute actions or persist data", () => {
  assert.doesNotMatch(page + helper, /supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(|\beval\(|localStorage\.|sessionStorage\./);
  assert.match(page, /No AI agent has been started/);
  assert.match(page, /Nothing is executed, scheduled, sent or charged/);
  assert.match(page, /await navigator\.clipboard\.writeText\(preview\)/);
  assert.match(page, /role="alert"/);
  assert.match(page, /aria-live="polite"/);
});
test("UI makes step removal, reordering and scope selection explicit", () => {
  for (const fragment of [
    "createAgentStep(", "removeAgentStep(", "moveAgentStep(",
    "setSteps(next)", "onChange={e => toggleScope(",
    "AGENT_TOOL_SCOPES.map", "buildLocalAgentPlan(",
  ]) assert.ok(page.includes(fragment), "Missing local planning control: " + fragment);
});
