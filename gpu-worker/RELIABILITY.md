# GPU Worker reliability gates — Phase 2

This is an offline reliability patch to the existing loopback Python worker.
There is still **no approved inference executable, no GPU rental, and no production activation**.

## Safety improvements
- Set `ETERNYX_GPU_MAX_PENDING_JOBS` to a bounded integer between 1 and 1000; default is 32.
- Duplicate idempotency requests return their existing task even while the queue is full. New jobs are rejected with HTTP 429 and a sanitized `queue_full` code when the **sum of queued and processing jobs** reaches the cap. This is a protective cap, not a replacement for per-account quotas or a cost limit.
- On process startup, any previous `processing` jobs are marked failed with `WORKER_INTERRUPTED`; do not blindly replay GPU inference that may already have been billed.
- Fix the Python test loader path and execute Python worker tests in separate GitHub Actions checks when worker files change.
- The queue is still single-process, SQLite-based; no horizontal worker scaling or exactly-once GPU billing guarantee.
- Queue admission is not GPU purchase authorization. No paid GPU provider has been connected.

## Remaining production blockers
1. **Real model**: license, pin and benchmark a suitable video model, then implement the approved inference executable and output resolver.
2. **Crash correctness**: reconcile uncertain task completion and private uploaded outputs before any customer refund or retry. The startup failure state is conservative, not proof of no inference.
3. **Cost**: use provider-enforced account limits, bounded instance life, measured worker start and model processing time, low-concurrency test quotas.
4. **Safety**: deploy trusted moderation before GPU use, and preserve atomic credit reservation and staged payments.
5. **Abuse**: request-by-request authenticated user policy and persistent per-user quota at the upstream Supabase side.
6. **Operations**: secure private TLS ingress, protected secrets, encrypted disk and data retention policy, least-privilege GPU container, monitoring, incident response.
7. **Staging**: prove requests/invalid requests, idempotent replay, capacity responses, worker restarts, failed jobs and private media retrieval in an isolated environment before production.

Do **not** switch on customer payments or rent GPU hardware merely because CI passes.
