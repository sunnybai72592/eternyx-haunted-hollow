/** ETERNYX Services Phase 22 — bounded read-only request-page queries.
 * This wrapper never retries, writes, persists data or accepts a count that
 * was not confirmed by the API. RLS and authenticated actors still enforce
 * all access control; client-side protection is only defense in depth.
 */
export type ServicePageQueryResponse<T> = {
  data: T[] | null;
  count: number | null;
  error: { code?: string | null; message?: string | null } | null;
};

export type ServicePageReadOutcome<T> =
  | { kind: 'ready'; data: T[]; count: number }
  | { kind: 'canceled' }
  | { kind: 'unavailable'; message: string };

const DEFAULT_TIMEOUT_MS = 15_000;

export function describeServicePageError(
  error?: { code?: string | null; message?: string | null } | null,
  timedOut = false,
): string {
  if (timedOut || error?.code === '57014' || /timed?\s*out|timeout|abort|cancel/i.test(error?.message ?? '')) {
    return 'The database request timed out. No empty result was assumed; retry when connectivity recovers.';
  }
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST200') {
    return 'The Services request view may be missing or unavailable in the Data API. Verify reviewed migrations and exposure.';
  }
  if (error?.code === '42501' || error?.code === 'PGRST301'
    || /permission denied|unauthorized|forbidden/i.test(error?.message ?? '')) {
    return 'Your current session cannot access this queue. Sign in again or contact an administrator; access was not bypassed.';
  }
  if (/network|fetch|connect/i.test(error?.message ?? '')) {
    return 'The database connection could not be reached. Retry after the connection is restored.';
  }
  if (!error) return 'The database did not provide a verified page count. Retry before assuming this queue is empty.';
  return 'The request-list query failed. Its results were not treated as an empty inbox.';
}

export async function readServicePageWithinBudget<T>(
  request: (signal: AbortSignal) => PromiseLike<ServicePageQueryResponse<T>>,
  current: () => boolean,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ServicePageReadOutcome<T>> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error('Invalid Services page deadline');
  }
  if (!current() || signal?.aborted) return { kind: 'canceled' };

  const controller = new AbortController();
  let expired = false;
  const propagateAbort = () => controller.abort();
  signal?.addEventListener('abort', propagateAbort, { once: true });

  // Race rather than relying solely on the fetch layer honouring its signal.
  // A stalled transport must not keep a spinner alive indefinitely.
  let resolveAborted: (() => void) | null = null;
  const interrupted = new Promise<{ type: 'aborted' }>((resolve) => {
    resolveAborted = () => resolve({ type: 'aborted' });
  });
  const notifyAborted = () => resolveAborted?.();
  controller.signal.addEventListener('abort', notifyAborted, { once: true });
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, timeoutMs);

  try {
    const result = await Promise.race([
      Promise.resolve()
        .then(() => request(controller.signal))
        .then((value) => ({ type: 'response' as const, value }))
        .catch((error: unknown) => ({ type: 'exception' as const, error })),
      interrupted,
    ]);

    if (!current() || signal?.aborted) return { kind: 'canceled' };
    if (expired || controller.signal.aborted || result.type === 'aborted') {
      return { kind: 'unavailable', message: describeServicePageError(null, true) };
    }
    if (result.type === 'exception') {
      // Do not print upstream error messages: they can contain sensitive URLs.
      return {
        kind: 'unavailable',
        message: describeServicePageError(
          result.error instanceof Error ? { message: result.error.message } : null,
        ),
      };
    }
    if (result.value.error) return { kind: 'unavailable', message: describeServicePageError(result.value.error) };
    if (!Array.isArray(result.value.data)
      || !Number.isSafeInteger(result.value.count)
      || (result.value.count ?? -1) < 0
      || result.value.data.length > result.value.count!) {
      return { kind: 'unavailable', message: describeServicePageError(null) };
    }
    return {
      kind: 'ready',
      data: result.value.data,
      count: result.value.count as number,
    };
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', notifyAborted);
    signal?.removeEventListener('abort', propagateAbort);
    controller.abort();
  }
}


/**
 * Exact, count-free page window. Fetch pageSize + 1 actual rows to prove
 * whether a next page exists. The extra row is NEVER displayed or exported.
 * Page totals are intentionally unknown; no approximate/fictional totals.
 */
export type ServiceWindowReadOutcome<T> =
  | { kind: 'ready'; rows: T[]; hasMore: boolean }
  | { kind: 'canceled' }
  | { kind: 'unavailable'; message: string };

export async function readServiceWindowWithinBudget<T>(
  request: (signal: AbortSignal) => PromiseLike<{
    data: T[] | null;
    error: { code?: string | null; message?: string | null } | null;
  }>,
  pageSize: number,
  current: () => boolean,
  signal?: AbortSignal,
  timeoutMs = 15_000,
): Promise<ServiceWindowReadOutcome<T>> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('Invalid Services window size');
  }
  const result = await readServicePageWithinBudget<T>(
    async (signalValue) => {
      const response = await request(signalValue);
      // This count is the actual number of rows in the bounded window,
      // never a claim about all matching database records.
      return {
        data: response.data,
        count: Array.isArray(response.data) ? response.data.length : null,
        error: response.error,
      };
    },
    current,
    signal,
    timeoutMs,
  );
  if (result.kind !== 'ready') return result;
  if (result.data.length > pageSize + 1) {
    return {
      kind: 'unavailable',
      message: 'The request page exceeded the expected bounded window. No incomplete results were displayed.',
    };
  }
  return {
    kind: 'ready',
    rows: result.data.slice(0, pageSize),
    hasMore: result.data.length > pageSize,
  };
}
