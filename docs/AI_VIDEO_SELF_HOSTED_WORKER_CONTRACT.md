# ETERNYX Video AI — self-hosted GPU worker transport

**Status:** This PR adds a real HTTPS client adapter for a **future** self-hosted GPU worker. It does **not** deploy the worker, run any AI model, activate the model registry, incur GPU cost, turn on real billing, or claim generation works end-to-end.

## Worker API contract
An operator-approved trusted backend can instantiate `createSelfHostedVideoWorkerAdapter` in a protected server process with:
- `baseUrl` = exact HTTPS origin on an explicitly trusted GPU worker hostname
- `hostname` = exact DNS hostname, independently approved in server configuration
- `secret` = long secret stored **server side only**, never browser/committed
- optional timeout 1000–30000ms

The connector performs actual network I/O and is compatible with the existing `AIGenerationProviderAdapter` interface:
- POST `/v1/jobs` with `{payload,idempotencyKey}`, expect HTTP 200/202 and `{taskId,state:"queued"|"processing"}`;
- GET `/v1/jobs/:taskId`, expect validated `{taskId,state,progressPercent?,outputReference?,failureCode?}`;
- POST `/v1/jobs/:taskId/cancel`, expect `{accepted:true}` or 405/501 for unsupported cancellation.

The transport limits responses to 16KiB, rejects redirects, does not send arbitrary callback URLs, and treats failed connections, ambiguous acknowledgements, and 429/5xx submission outcomes as **uncertain** so workers are not blindly resubmitted.

**Critical requirement:** the GPU server must implement atomic idempotency using `idempotencyKey`, authenticated access, request-scoped job authorization, explicit per-job GPU budgets and quotas, cancellation, output allowlisting, policy moderation, safe media generation and private output storage. HTTPS alone is insufficient to trust a compromised worker. Obtain the real worker contract and test it before enabling it.

## Recommended next milestone
1. Select and license an open-weight video model for commercial use, and confirm GPU memory + runtime dependencies from the current upstream documentation.
2. Build a private GPU worker that implements this exact API using a queue and real inference, with model checksum pinning and strict safety controls.
3. Benchmark real resolution/duration/latency/compute costs on rented GPU hardware in a **cost-capped staging** project.
4. Wire the worker through the existing ETERNYX job dispatcher only after staging moderation, model selection, private output materialization, credit settlement/refunds, authentication and RLS all pass.
5. Keep production paid subscriptions and video generation disabled until launch sign-off.

No customer-supplied worker URLs, API keys, provider credentials or unrestricted GPU settings may reach this adapter. Provider-side idempotency and cost controls are prerequisites to live integration.
