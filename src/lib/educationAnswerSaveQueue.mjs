/**
 * Serialize browser answer saves for ONE authenticated CBT attempt.
 *
 * The database RPC owns access control, timing and grading. This small local
 * queue prevents stale requests from overwriting the newest typed answer.
 * A rejected request is not silently discarded, and retry never requeues
 * an older answer over a newer edit for the same question.
 *
 * No localStorage/sessionStorage, plaintext persistence, telemetry, or keys.
 */
export function createEducationAnswerSaveQueue(save) {
  if (typeof save !== "function") throw new TypeError("A save function is required");
  const pending = new Map();
  let running = null;
  let disposed = false;

  function enqueue(answer) {
    if (disposed) throw new Error("The previous exam save queue is closed");
    if (!answer || typeof answer.questionId !== "string" || !answer.questionId) {
      throw new TypeError("A question identifier is required");
    }
    // Copy fields; future React state changes must not mutate the queued item.
    pending.set(answer.questionId, { ...answer });
  }

  async function drain() {
    while (pending.size) {
      if (disposed) throw new Error("The exam save queue is closed");
      const [questionId, answer] = pending.entries().next().value;
      pending.delete(questionId);
      try {
        await save(answer);
        if (disposed) throw new Error("The exam save queue is closed");
      } catch (error) {
        // A newer edit may have been made during the failed request.
        // Keep that newer edit and never let the rejected older payload
        // overwrite it. The queue remains retryable after a failure.
        if (!disposed && !pending.has(questionId)) pending.set(questionId, answer);
        throw error;
      }
    }
  }

  function flush() {
    if (disposed) return Promise.reject(new Error("The exam save queue is closed"));
    if (!running) {
      const promise = drain().finally(() => {
        if (running === promise) running = null;
      });
      running = promise;
    }
    // Every flush caller waits for the SAME serialized writer, including
    // a submit request made while a debounced save is already in flight.
    return running;
  }

  function dispose() {
    disposed = true;
    pending.clear();
  }

  return Object.freeze({
    enqueue,
    flush,
    dispose,
    hasUnsaved: () => pending.size > 0 || running !== null,
    pendingCount: () => pending.size,
  });
}
