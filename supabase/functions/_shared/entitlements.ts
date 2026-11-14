/**
 * Shared server-side helpers for tool functions that enforce plan entitlements
 * and credit accounting. Call only after authenticating the end user and
 * constructing a trusted service-role Supabase client.
 *
 * This module does not create clients, authenticate callers, choose plan
 * policy, or expose an HTTP endpoint. Individual tool handlers remain
 * responsible for validating input and invoking these helpers before work.
 */

export interface RpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export type CreditOperationCode =
  | "INVALID_CREDIT_REQUEST"
  | "INSUFFICIENT_CREDITS"
  | "FEATURE_NOT_ENTITLED"
  | "SUBSCRIPTION_RECONCILIATION_REQUIRED"
  | "SUBSCRIPTION_PLAN_UNRECOGNIZED"
  | "CREDIT_SERVICE_UNAVAILABLE"
  | "CREDIT_SERVICE_INVALID_RESPONSE";

export class CreditOperationError extends Error {
  readonly code: CreditOperationCode;

  constructor(code: CreditOperationCode) {
    super(code);
    this.name = "CreditOperationError";
    this.code = code;
  }
}

export interface ConsumeCreditsInput {
  userId: string;
  featureKey: string;
  idempotencyKey: string;
}

export interface ConsumeCreditsResult {
  allowed: true;
  alreadyProcessed: boolean;
  transactionId: string | null;
  creditsCharged: number;
  balance: number;
  planId?: "free" | "premium" | "elite";
}

export interface GrantCreditsInput {
  userId: string;
  credits: number;
  idempotencyKey: string;
  sourceKey: string;
}

export interface GrantCreditsResult {
  alreadyProcessed: boolean;
  transactionId: string;
  creditsGranted?: number;
  balance: number;
}

export interface RefundCreditsInput {
  userId: string;
  spendTransactionId: string;
}

export interface RefundCreditsResult {
  alreadyRefunded: boolean;
  transactionId: string;
  creditsRefunded?: number;
  balance: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FEATURE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) throw new CreditOperationError("INVALID_CREDIT_REQUEST");
}

function requireIdempotencyKey(value: string): void {
  if (typeof value !== "string" || value.length < 1 || value.length > 200) {
    throw new CreditOperationError("INVALID_CREDIT_REQUEST");
  }
}

function requireRpcRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new CreditOperationError("CREDIT_SERVICE_INVALID_RESPONSE");
  return value;
}

function mapRpcError(message: string | undefined): CreditOperationError {
  const normalized = (message ?? "").toLowerCase();
  if (normalized.includes("insufficient credits")) {
    return new CreditOperationError("INSUFFICIENT_CREDITS");
  }
  if (normalized.includes("feature is not enabled")) {
    return new CreditOperationError("FEATURE_NOT_ENTITLED");
  }
  if (normalized.includes("multiple active subscriptions")) {
    return new CreditOperationError("SUBSCRIPTION_RECONCILIATION_REQUIRED");
  }
  if (normalized.includes("active subscription plan is not recognized")) {
    return new CreditOperationError("SUBSCRIPTION_PLAN_UNRECOGNIZED");
  }
  if (normalized.includes("invalid entitlement request") ||
      normalized.includes("invalid credit grant") ||
      normalized.includes("invalid credit refund") ||
      normalized.includes("idempotency key was already used")) {
    return new CreditOperationError("INVALID_CREDIT_REQUEST");
  }
  return new CreditOperationError("CREDIT_SERVICE_UNAVAILABLE");
}

async function callRpc(
  client: RpcClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await client.rpc(functionName, args);
    if (error) throw mapRpcError(error.message);
    return requireRpcRecord(data);
  } catch (error) {
    if (error instanceof CreditOperationError) throw error;
    throw new CreditOperationError("CREDIT_SERVICE_UNAVAILABLE");
  }
}

/**
 * Atomically checks the authenticated user's current plan/feature entitlement
 * and consumes its configured per-use credits. The database RPC serializes
 * concurrent balance changes and enforces idempotency.
 */
export async function consumeToolCredits(
  client: RpcClient,
  input: ConsumeCreditsInput,
): Promise<ConsumeCreditsResult> {
  requireUuid(input.userId);
  if (!FEATURE_KEY_PATTERN.test(input.featureKey)) {
    throw new CreditOperationError("INVALID_CREDIT_REQUEST");
  }
  requireIdempotencyKey(input.idempotencyKey);

  const data = await callRpc(client, "consume_tool_credits", {
    p_user_id: input.userId,
    p_feature_key: input.featureKey,
    p_idempotency_key: input.idempotencyKey,
  });

  if (data.allowed !== true ||
      typeof data.already_processed !== "boolean" ||
      !(data.transaction_id === null || typeof data.transaction_id === "string") ||
      !Number.isInteger(data.credits_charged) || (data.credits_charged as number) < 0 ||
      !Number.isInteger(data.balance) || (data.balance as number) < 0) {
    throw new CreditOperationError("CREDIT_SERVICE_INVALID_RESPONSE");
  }

  const planId = data.plan_id;
  if (planId !== undefined && planId !== "free" && planId !== "premium" && planId !== "elite") {
    throw new CreditOperationError("CREDIT_SERVICE_INVALID_RESPONSE");
  }

  return {
    allowed: true,
    alreadyProcessed: data.already_processed,
    transactionId: data.transaction_id as string | null,
    creditsCharged: data.credits_charged as number,
    balance: data.balance as number,
    ...(planId ? { planId } : {}),
  };
}

/** Idempotently grants credits from a trusted server-side event or adjustment. */
export async function grantToolCredits(
  client: RpcClient,
  input: GrantCreditsInput,
): Promise<GrantCreditsResult> {
  requireUuid(input.userId);
  requireIdempotencyKey(input.idempotencyKey);
  if (!Number.isInteger(input.credits) || input.credits < 1 || input.credits > 100_000_000 ||
      typeof input.sourceKey !== "string" || input.sourceKey.length < 1 || input.sourceKey.length > 100) {
    throw new CreditOperationError("INVALID_CREDIT_REQUEST");
  }

  const data = await callRpc(client, "grant_tool_credits", {
    p_user_id: input.userId,
    p_credits: input.credits,
    p_idempotency_key: input.idempotencyKey,
    p_source_key: input.sourceKey,
  });

  if (typeof data.already_processed !== "boolean" ||
      typeof data.transaction_id !== "string" ||
      !Number.isInteger(data.balance) || (data.balance as number) < 0 ||
      (data.credits_granted !== undefined && data.credits_granted !== input.credits)) {
    throw new CreditOperationError("CREDIT_SERVICE_INVALID_RESPONSE");
  }

  return {
    alreadyProcessed: data.already_processed,
    transactionId: data.transaction_id,
    creditsGranted: data.credits_granted as number | undefined,
    balance: data.balance as number,
  };
}

/** Refunds a spend once; call only after a trusted tool job is confirmed failed. */
export async function refundToolCredits(
  client: RpcClient,
  input: RefundCreditsInput,
): Promise<RefundCreditsResult> {
  requireUuid(input.userId);
  requireUuid(input.spendTransactionId);

  const data = await callRpc(client, "refund_tool_credits", {
    p_user_id: input.userId,
    p_spend_transaction_id: input.spendTransactionId,
  });

  if (typeof data.already_refunded !== "boolean" ||
      typeof data.transaction_id !== "string" ||
      !Number.isInteger(data.balance) || (data.balance as number) < 0 ||
      (data.credits_refunded !== undefined &&
        (!Number.isInteger(data.credits_refunded) || (data.credits_refunded as number) < 1))) {
    throw new CreditOperationError("CREDIT_SERVICE_INVALID_RESPONSE");
  }

  return {
    alreadyRefunded: data.already_refunded,
    transactionId: data.transaction_id,
    creditsRefunded: data.credits_refunded as number | undefined,
    balance: data.balance as number,
  };
}
