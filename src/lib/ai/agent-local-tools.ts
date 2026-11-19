/**
 * Local-only agent planning utilities.
 * A plan is not an execution: no action, permission grant, network call,
 * payment, credit reservation, provider request, or background task happens.
 */
export const MAX_AGENT_STEPS = 12;
export const MAX_AGENT_GOAL = 2000;
export const MAX_AGENT_STEP_TITLE = 180;
export const MAX_AGENT_STEP_DETAILS = 1000;
export const MAX_AGENT_CONSTRAINTS = 1000;
export const AGENT_STEP_KINDS = [
  "research", "draft", "review", "external_action",
] as const;
export type AgentStepKind = (typeof AGENT_STEP_KINDS)[number];

export const AGENT_TOOL_SCOPES = [
  "local_notes", "public_research", "external_write", "paid_action",
] as const;
export type AgentToolScope = (typeof AGENT_TOOL_SCOPES)[number];

export interface AgentPlanStep {
  readonly id: string;
  readonly title: string;
  readonly details: string;
  readonly kind: AgentStepKind;
  readonly approvalRequired: boolean;
  readonly status: "proposed";
}
export interface AgentPlan {
  readonly featureKey: "ai.agents.plan";
  readonly goal: string;
  readonly constraints?: string;
  readonly proposedScopes: readonly AgentToolScope[];
  readonly steps: readonly AgentPlanStep[];
  readonly approvalSteps: number;
  readonly executionEnabled: false;
  readonly status: "local_draft_only";
}
export class LocalAgentPlanError extends Error {
  readonly code: "invalid_goal" | "invalid_constraints" | "invalid_step" |
    "invalid_kind" | "duplicate_step" | "too_many_steps" | "invalid_scope" | "empty_plan";
  constructor(code: LocalAgentPlanError["code"]) {
    super(code);
    this.name = "LocalAgentPlanError";
    this.code = code;
  }
}
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
function requiredText(value: unknown, limit: number): string | null {
  if (typeof value !== "string" || value.length > limit || value.includes("\u0000")) return null;
  const clean = value.trim();
  return clean || null;
}
function optionalText(value: unknown, limit: number): string | null {
  if (typeof value !== "string" || value.length > limit || value.includes("\u0000")) return null;
  return value.trim();
}
export function createAgentStep(
  existing: readonly AgentPlanStep[],
  input: { readonly id: string; readonly title: string; readonly details: string; readonly kind: AgentStepKind },
): AgentPlanStep[] {
  if (existing.length >= MAX_AGENT_STEPS) throw new LocalAgentPlanError("too_many_steps");
  if (typeof input?.id !== "string" || !ID_PATTERN.test(input.id) || existing.some(step => step.id === input.id)) {
    throw new LocalAgentPlanError("duplicate_step");
  }
  if (!(AGENT_STEP_KINDS as readonly string[]).includes(input.kind)) throw new LocalAgentPlanError("invalid_kind");
  const title = requiredText(input.title, MAX_AGENT_STEP_TITLE);
  const details = optionalText(input.details, MAX_AGENT_STEP_DETAILS);
  if (title === null || details === null) throw new LocalAgentPlanError("invalid_step");
  return [...existing, {
    id: input.id, title, details, kind: input.kind,
    // External actions always require review; UI cannot mark them approved.
    approvalRequired: input.kind === "external_action",
    status: "proposed",
  }];
}
export function removeAgentStep(existing: readonly AgentPlanStep[], id: string): AgentPlanStep[] {
  return existing.filter(step => step.id !== id);
}
export function moveAgentStep(existing: readonly AgentPlanStep[], id: string, direction: -1 | 1): AgentPlanStep[] {
  const index = existing.findIndex(step => step.id === id);
  const target = index + direction;
  if (index < 0 || (direction !== 1 && direction !== -1) || target < 0 || target >= existing.length) return [...existing];
  const next = [...existing];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function buildLocalAgentPlan(
  goal: string, constraints: string, proposedScopes: readonly AgentToolScope[], steps: readonly AgentPlanStep[],
): AgentPlan {
  const cleanGoal = requiredText(goal, MAX_AGENT_GOAL);
  if (cleanGoal === null) throw new LocalAgentPlanError("invalid_goal");
  const cleanConstraints = optionalText(constraints, MAX_AGENT_CONSTRAINTS);
  if (cleanConstraints === null) throw new LocalAgentPlanError("invalid_constraints");
  if (!Array.isArray(proposedScopes) || new Set(proposedScopes).size !== proposedScopes.length ||
      proposedScopes.some(scope => !(AGENT_TOOL_SCOPES as readonly string[]).includes(scope))) {
    throw new LocalAgentPlanError("invalid_scope");
  }
  if (!Array.isArray(steps) || steps.length === 0) throw new LocalAgentPlanError("empty_plan");
  if (steps.length > MAX_AGENT_STEPS) throw new LocalAgentPlanError("too_many_steps");
  // Revalidate all imported or externally constructed step objects.
  let verified: AgentPlanStep[] = [];
  for (const step of steps) {
    verified = createAgentStep(verified, step);
  }
  if (verified.some(step => step.kind === "external_action") && !proposedScopes.includes("external_write")) {
    // User must acknowledge the proposed external-write scope as a planning boundary.
    throw new LocalAgentPlanError("invalid_scope");
  }
  if (proposedScopes.includes("paid_action") &&
      !verified.some(step => step.kind === "external_action")) {
    throw new LocalAgentPlanError("invalid_scope");
  }
  return {
    featureKey: "ai.agents.plan", goal: cleanGoal,
    ...(cleanConstraints ? { constraints: cleanConstraints } : {}),
    proposedScopes: [...proposedScopes], steps: verified,
    approvalSteps: verified.filter(step => step.approvalRequired).length,
    executionEnabled: false, status: "local_draft_only",
  };
}
export function formatLocalAgentPlan(plan: AgentPlan): string {
  const lines = [
    "# ETERNYX agent plan — LOCAL DRAFT ONLY",
    "",
    "Goal: " + plan.goal,
    "Constraints: " + (plan.constraints || "None specified"),
    "Proposed tool scope (NOT granted): " + (plan.proposedScopes.join(", ") || "None"),
    "Execution enabled: NO",
    "External actions approved: NONE",
    "Steps requiring approval: " + plan.approvalSteps,
    "",
    "## Proposed steps",
  ];
  plan.steps.forEach((step, index) => {
    lines.push(
      (index + 1) + ". " + step.title + " (" + step.kind + ")",
      "   " + (step.details || "No additional instructions"),
      "   Status: proposed" + (step.approvalRequired ? " — requires explicit approval before any future execution" : ""),
    );
  });
  lines.push(
    "",
    "No AI planning, background task, web access, connected-app action, payment or credit reservation was performed.",
    "This document does not authorize execution. Every future external action needs a separately enforced server-side approval boundary.",
  );
  return lines.join("\n");
}
