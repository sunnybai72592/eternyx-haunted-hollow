/**
 * Shared contracts for durable asynchronous AI jobs.
 *
 * This module contains types and state policy only. It does not submit jobs,
 * contact providers, reserve credits, or expose private job payloads to clients.
 */

export const AI_JOB_STATUSES = [
  "queued",
  "reserved",
  "submitted",
  "processing",
  "cancel_requested",
  "succeeded",
  "failed",
  "cancelled",
  "reconciliation_required",
] as const;

export type AIJobStatus = (typeof AI_JOB_STATUSES)[number];

export type AIJobEventCode =
  | "job.created"
  | "job.claimed"
  | "job.lease_recovered"
  | "job.provider_submitted"
  | "job.processing"
  | "job.cancel_requested"
  | "job.succeeded"
  | "job.failed"
  | "job.cancelled"
  | "job.reconciliation_required"
  | "job.retry_scheduled";

export interface AIJobTransition {
  readonly from: AIJobStatus;
  readonly to: AIJobStatus;
}

const ALLOWED_TRANSITIONS: Readonly<Record<AIJobStatus, readonly AIJobStatus[]>> = {
  queued: [],
  reserved: [
    "submitted",
    "processing",
    "failed",
    "cancelled",
    "reconciliation_required",
    "queued",
  ],
  submitted: [
    "processing",
    "succeeded",
    "failed",
    "cancel_requested",
    "cancelled",
    "reconciliation_required",
  ],
  processing: [
    "succeeded",
    "failed",
    "cancel_requested",
    "cancelled",
    "reconciliation_required",
  ],
  cancel_requested: [
    "cancelled",
    "succeeded",
    "failed",
    "reconciliation_required",
  ],
  succeeded: [],
  failed: [],
  cancelled: [],
  reconciliation_required: [],
};

export function canTransitionAIJob(
  from: AIJobStatus,
  to: AIJobStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalAIJobStatus(status: AIJobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

/** Safe client projection; excludes prompts, provider IDs, leases and storage keys. */
export interface AIJobStatusSnapshot {
  readonly id: string;
  readonly featureKey: string;
  readonly status: AIJobStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly failureCode: string | null;
}

export function validateAIJobStatusSnapshot(
  value: unknown,
): value is AIJobStatusSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshot.id) &&
    typeof snapshot.featureKey === "string" &&
    /^[a-z0-9][a-z0-9._-]{0,99}$/.test(snapshot.featureKey) &&
    typeof snapshot.status === "string" &&
    (AI_JOB_STATUSES as readonly string[]).includes(snapshot.status) &&
    typeof snapshot.createdAt === "string" &&
    typeof snapshot.updatedAt === "string" &&
    (snapshot.completedAt === null || typeof snapshot.completedAt === "string") &&
    (snapshot.failureCode === null ||
      (typeof snapshot.failureCode === "string" && /^[A-Z0-9_]{1,80}$/.test(snapshot.failureCode)))
  );
}
