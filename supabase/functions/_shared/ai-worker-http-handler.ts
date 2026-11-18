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


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validBatchResult(
  result: AIWorkerBatchRunResult,
  expectedWorkerId: string,
): boolean {
  if (!result || result.workerId !== expectedWorkerId ||
      !Number.isInteger(result.claimedCount) || result.claimedCount < 0 ||
      !Number.isInteger(result.attemptedCount) || result.attemptedCount < 0 ||
      !Number.isInteger(result.dispatchErrorCount) || result.dispatchErrorCount < 0 ||
      !Array.isArray(result.jobs) ||
      result.claimedCount !== result.jobs.length ||
      result.attemptedCount !== result.jobs.length ||
      result.dispatchErrorCount > result.attemptedCount) {
    return false;
  }

  let dispatchErrors = 0;
  const seenJobIds = new Set<string>();
  for (const job of result.jobs) {
    if (!job || typeof job.jobId !== "string" || !UUID.test(job.jobId) ||
        (job.outcome !== "dispatched" && job.outcome !== "dispatch_error") ||
        seenJobIds.has(job.jobId)) {
      return false;
    }
    seenJobIds.add(job.jobId);
    if (job.outcome === "dispatch_error") dispatchErrors += 1;
  }
  return dispatchErrors === result.dispatchErrorCount;
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

async function readBoundedBody(request: Request): Promise<{ text: string; byteLength: number }> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 1024) {
        await reader.cancel();
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    byteLength: total,
  };
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

    const contentLengthHeader = request.headers.get("content-length");
    let declaredLength: number | null = null;
    if (contentLengthHeader !== null) {
      if (!/^\d+$/.test(contentLengthHeader)) {
        return json({ error: "Invalid Content-Length header" }, 400);
      }
      declaredLength = Number(contentLengthHeader);
      if (!Number.isSafeInteger(declaredLength) || declaredLength > 1024) {
        return json({ error: "Request body is too large" }, 413);
      }
    }

    let options: Pick<RunAIWorkerBatchInput, "limit" | "leaseSeconds"> = {};
    if (request.body) {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return json({ error: "JSON content type required" }, 415);
      }
      let raw: string;
      try {
        const body = await readBoundedBody(request);
        if (declaredLength !== null && declaredLength !== body.byteLength) {
          return json({ error: "Content-Length does not match request body" }, 400);
        }
        raw = body.text;
      } catch (error) {
        if (error instanceof Error && error.message === "body_too_large") {
          return json({ error: "Request body is too large" }, 413);
        }
        return json({ error: "Invalid request body" }, 400);
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
    } else if (declaredLength !== null && declaredLength !== 0) {
      return json({ error: "Content-Length does not match request body" }, 400);
    }

    try {
      const result = await dependencies.processBatch({
        workerId: dependencies.workerId,
        ...options,
      });
      if (!validBatchResult(result, dependencies.workerId)) {
        return json({ error: "AI worker batch is temporarily unavailable" }, 503);
      }
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
