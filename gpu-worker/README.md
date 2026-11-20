# ETERNYX AI Video GPU Worker — private staging service

This PR creates **actual Python HTTP + persistent job queue code**, NOT a functioning video model or a hosted GPU service. Its HTTP contract matches the self-hosted adapter from PR #270 for new queued jobs.

## What works at source level
- Standard-library Python worker: POST `/v1/jobs`, GET `/v1/jobs/:taskId`, POST `/v1/jobs/:taskId/cancel`.
- Bearer secret authentication, 12KB JSON request size cap, feature/prompt/duration validation.
- SQLite-backed unique idempotency keys and request digest conflict detection.
- Single background worker thread: queued -> processing -> succeeded/failed; safe queued cancellation; one active subprocess at a time.
- Inference execution by one **absolute operator-approved executable** with JSON sent to stdin. It must return a JSON object with exactly one `outputReference` field: `asset_<safe_token>`. The executable must use approved private storage; arbitrary public URLs are not supported.
- Missing executable, invalid output, process crash or timeout marks the job failed, not succeeded.
- No user-supplied commands, model paths, target URLs, GPU runtime flags or output storage paths.
- The service binds to loopback only; HTTPS requires private trusted ingress/proxy.

## Must NOT deploy publicly as-is
This is a **development foundation**, not production-ready:
- No real inference executable is included; no model selection or license review performed.
- Worker bearer credential is service-wide; upstream Supabase must enforce user ownership, credits, moderation, rate limiting and budgets BEFORE submission.
- Worker does not authenticate customers or expose customer-specific results directly; only the trusted backend should reach this service.
- Single SQLite process design is not a distributed queue. Do not run multiple service replicas against the same database. SQLite does not replace durable distributed leasing.
- A process interrupted after marking `processing` will need manual reconciliation; automatic restart recovery is not implemented here.
- Running jobs cannot yet be cancelled; the endpoint returns a conflict for jobs already processing.
- The private output reference must be integrated with Eternyx's existing output materialization and ownership checks; a success signal alone cannot count as deliverable output.
- Output commands must be security reviewed and run in an isolated container with GPU/memory/CPU limits, read-only approved model files, no general internet, restricted output volume, a dedicated unprivileged user and a strict billable timeout.
- No UI, subscriptions, real credits, model registry, checkout, production Supabase secrets or production calls changed.

## Offline validation
```bash
python3 -m unittest discover -s gpu-worker/tests -p 'test_*.py' -v
```

## Staging prerequisites
1. Choose and license a model; pin its repository version and model checksum, benchmark on suitable hardware.
2. Implement the reviewed inference executable with secure model input/output and model runtime. Image-to-video remains disabled until verified private image resolution exists.
3. Deploy behind a private ingress with TLS, strict operator-owned hostname and persistent storage. Never expose port 8765 publicly.
4. Add an operator-controlled overall GPU cost ceiling and fail-closed queue cap, plus robust worker-restart reconciliation and per-job resource limits.
5. Run authenticated API lifecycle, repeat/retry, failure and output ownership tests against a staging Supabase project.
6. Deploy paid production resources or subscriptions only after explicit owner approval.

## Known follow-up
The previous connector expects only `queued` or `processing` acknowledgement on submit. An idempotent replay of a completed job will get the persisted terminal state, which must be reconciled through status rather than being treated as a new submission. This is not yet full integrated retry acceptance.
