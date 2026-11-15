/**
 * Fail-closed safety decision contract for AI generation.
 * This is a gate, not a moderation implementation. No request is approved
 * until a trusted, policy-approved moderation service supplies a fresh decision.
 */
export interface AIGenerationSafetyApproval {
  readonly status: "approved";
  readonly policyVersion: string;
  readonly checkedAt: string;
  readonly requestDigest: string;
}
export class AIGenerationSafetyGateError extends Error {
  readonly code: "safety_unavailable" | "safety_not_approved" | "safety_decision_stale";
  constructor(code: AIGenerationSafetyGateError["code"]) {
    super(code);
    this.name = "AIGenerationSafetyGateError";
    this.code = code;
  }
}
const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/i;
const MAX_DECISION_AGE_MS = 5 * 60 * 1000;
/** Requires a server-supplied approval bound to the normalized request. */
export function requireAIGenerationSafetyApproval(value: unknown, expectedRequestDigest: string, now = Date.now()): AIGenerationSafetyApproval {
  if (value === null || value === undefined) throw new AIGenerationSafetyGateError("safety_unavailable");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AIGenerationSafetyGateError("safety_not_approved");
  const decision = value as Record<string, unknown>;
  if (decision.status !== "approved" || typeof decision.policyVersion !== "string" ||
      !POLICY_VERSION.test(decision.policyVersion) || typeof decision.checkedAt !== "string" ||
      typeof decision.requestDigest !== "string" || !SHA256_HEX.test(decision.requestDigest) ||
      !SHA256_HEX.test(expectedRequestDigest) ||
      decision.requestDigest.toLowerCase() !== expectedRequestDigest.toLowerCase()) {
    throw new AIGenerationSafetyGateError("safety_not_approved");
  }
  const checkedAt = Date.parse(decision.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > MAX_DECISION_AGE_MS) {
    throw new AIGenerationSafetyGateError("safety_decision_stale");
  }
  return { status: "approved", policyVersion: decision.policyVersion, checkedAt: decision.checkedAt, requestDigest: decision.requestDigest };
}
