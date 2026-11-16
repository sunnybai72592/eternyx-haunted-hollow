/**
 * Authenticated HTTP boundary for one bounded AI worker batch.
 *
 * This factory is inert: deployment code must explicitly supply a secret,
 * worker identity, and an already-composed batch processor. It creates no
 * clients, reads no environment variables, and activates no providers.
 */
import type {
  AIWorkerBatchRunResult,
  RunAIWorkerBatchInput,
} from "./ai-worker-batch-runner.ts";

export type AIWorkerBatchProcessor = (
  input: RunAIWorkerBatchInput,
) => Promise<AIWorkerBatchRunResult>;

export interface AIWorkerHttpHandlerDependencies {
  secret: string;
  workerId: string;
  processBatch: AIWorkerBatchProcessor;
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

function parseBatchOptions(value: unknown): Pick<RunAIWorkerBatchInput, "limit" | "leaseSeconds"> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "limit" && key !== "leaseSeconds")) {
    return null;
  }
  if (record.limit !== undefined &&
      (!Number.isInteger(record.limit) || (record.limit as number) < 1 || (record.limit as number) > 25)) {
    return null;
  }
  if (record.leaseSeconds !== undefined &&
      (!Number.isInteger(record.leaseSeconds) ||
       (record.leaseSeconds as number) < 10 || (record.leaseSeconds as number) > 900)) {
    return null;
  }
  return {
    ...(record.limit === undefined ? {} : { limit: record.limit as number }),
    ...(record.leaseSeconds === undefined ? {} : { leaseSeconds: record.leaseSeconds as number }),
  };
}

/** Create a fail-closed, secret-authenticated POST handler for one batch. */
export function createAIWorkerHttpHandler(
  dependencies: AIWorkerHttpHandlerDependencies,
): (request: Request) => Promise<Response> {
  if (typeof dependencies?.secret !== "string" ||
      dependencies.secret.length < 32 ||
      typeof dependencies.workerId !== "string" ||
      dependencies.workerId.trim().length === 0 ||
      dependencies.workerId.length > 120 ||
      typeof dependencies.processBatch !== "function") {
    throw new Error("AI worker HTTP handler dependencies are incomplete");
  }

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const authorization = request.headers.get("authorization") ?? "";
    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    if (!match || !constantTimeEqual(match[1], dependencies.secret)) {
      return json({ error: "Authentication required" }, 401);
    }

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(declaredLength) || declaredLength > 1024) {
      return json({ error: "Request body is too large" }, 413);
    }

    let options: Pick<RunAIWorkerBatchInput, "limit" | "leaseSeconds"> = {};
    if (declaredLength > 0) {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return json({ error: "JSON content type required" }, 415);
      }
      let raw: string;
      try {
        raw = await request.text();
      } catch {
        return json({ error: "Invalid request body" }, 400);
      }
      if (new TextEncoder().encode(raw).length > 1024) {
        return json({ error: "Request body is too large" }, 413);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return json({ error: "Invalid JSON request" }, 400);
      }
      const validated = parseBatchOptions(parsed);
      if (!validated) return json({ error: "Invalid batch options" }, 400);
      options = validated;
    }

    try {
      const result = await dependencies.processBatch({
        workerId: dependencies.workerId,
        ...options,
      });
      return json({
        success: true,
        workerId: result.workerId,
        claimedCount: result.claimedCount,
        attemptedCount: result.attemptedCount,
        dispatchErrorCount: result.dispatchErrorCount,
        jobs: result.jobs.map(({ jobId, outcome }) => ({ jobId, outcome })),
      }, 200);
    } catch {
      // Never return claim, database, provider, or storage error details.
      return json({ error: "AI worker batch is temporarily unavailable" }, 503);
    }
  };
}
