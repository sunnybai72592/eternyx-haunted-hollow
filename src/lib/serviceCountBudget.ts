/** Services Phase 21 — opt-in, load-shedding exact count queries.
 * No retries, polling, persistent cache, backend writes or fake zeros.
 * One outstanding request at a time, one shared deadline and stop on
 * first failure. This bounds the client-created count burst; it does not
 * diagnose the cause of Supabase database timeouts.
 */
export type ServiceCountResult = { count: number | null; error: unknown | null };
export type ServiceCountProbe = (signal: AbortSignal) => PromiseLike<ServiceCountResult>;

export type ServiceCountBudgetResult = {
  counts: Array<number | null>;
  interrupted: boolean;
  attempted: number;
};

export async function runServiceCountBudget(
  probes: readonly ServiceCountProbe[],
  current: () => boolean,
  signal?: AbortSignal,
  deadlineMs = 12000,
): Promise<ServiceCountBudgetResult> {
  if (!Number.isFinite(deadlineMs) || deadlineMs < 1 || deadlineMs > 30000) {
    throw new Error('Invalid Services count deadline');
  }
  const controller = new AbortController();
  const expire = () => controller.abort();
  if (signal?.aborted) expire();
  signal?.addEventListener('abort', expire, { once: true });
  const timer = setTimeout(expire, deadlineMs);
  const counts: Array<number | null> = Array(probes.length).fill(null);
  let attempted = 0;
  let interrupted = false;
  try {
    for (let index = 0; index < probes.length; index++) {
      if (!current() || controller.signal.aborted) { interrupted = true; break; }
      const probe = probes[index];
      let rejectOnAbort = () => {};
      const aborted = new Promise<never>((_, reject) => {
        rejectOnAbort = () => reject(new Error('Count read canceled'));
        controller.signal.addEventListener('abort', rejectOnAbort, { once: true });
      });
      try {
        attempted++;
        const result = await Promise.race([
          Promise.resolve().then(() => probe(controller.signal)),
          aborted,
        ]);
        if (!current() || controller.signal.aborted) { interrupted = true; break; }
        if (result.error || typeof result.count !== 'number' ||
          !Number.isSafeInteger(result.count) || result.count < 0) {
          interrupted = true;
          break;
        }
        counts[index] = result.count;
      } catch {
        interrupted = true;
        break;
      } finally {
        controller.signal.removeEventListener('abort', rejectOnAbort);
      }
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', expire);
    controller.abort();
  }
  return { counts, interrupted, attempted };
}
