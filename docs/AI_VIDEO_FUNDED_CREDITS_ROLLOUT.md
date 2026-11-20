# ETERNYX AI Video — funded credits and GPU economics (Phase 1)

**Status: OFFLINE PLANNING ONLY. Nothing has been deployed to Supabase or GPU hosting. No users charged, subscriptions activated, model weights downloaded or videos generated.**

## Existing code inspected
- `public.plan_entitlements`, `public.credit_accounts`, `public.credit_ledger`: server-controlled feature access and wallet accounting.
- `enqueue_ai_generation_job_with_credits`: atomically creates a job and reserves the configured `credits_per_use`; returns the existing job for a matching idempotency replay.
- `ai-generation-job-enqueue`: authenticates a user, validates video/image request and rejects execution while the real moderation decision source is absent. Keep this fail-closed boundary.
- `ai-video-request`: currently supports `ai.video.text_to_video` and `ai.video.image_to_video` with a one-to-60-second requested *output duration*. This is NOT GPU processing time.
- Existing billing/payment integrations and worker settlement still require staged end-to-end verification. Neither merging this PR nor having a subscription route proves payment-to-credit settlement.

## Model for pricing
The customer buys a plan; verified server-side subscription status confers approved, fixed credits; generating a video consumes a plan-specific number of credits. We pay the GPU provider directly. **Never accept credits, price, quotas, provider or GPU resource selection from a client.**

The local `quoteVideoUnitEconomics` module takes *explicit*, authorized estimates in USD **integer cents**:
- plan price, credits granted, payment fee, and credits per generation;
- hourly GPU rate, measured processing seconds, startup and idle seconds;
- conservative number of paid attempts, storage/transfer and other variable costs;
- target gross-margin percentage.

It rounds GPU costs up and allocated revenue down, requires a target margin, and never activates paid execution. The illustrated $1.50/h and 600 seconds => $0.25 compute **only if those assumptions actually hold**. A more expensive GPU, longer real processing or retries can change the economics radically. Model licensing and GPU memory also affect feasibility.

**Important:** Contribution here is an illustrative **upper-bound video cost / plan revenue** calculation, NOT verified profit. It excludes fixed overhead, sales taxes, refunds/chargebacks, credits spent on other tools, unused credits, concurrency, queueing, subscription renewals and enterprise terms.

## Staged deployment gates
1. Benchmark an explicitly commercially permitted video model, quality, memory requirements and *real GPU usage*. Obtain quotes and verify GPU startup/idle billing and provider licensing.
2. Select an affordable fixed-size first generation tier (e.g. capped duration/resolution); do not advertise unlimited generations.
3. Verify each customer billing webhook signature, order/subscription ID, successful settlement and exactly-once credit grant **before** making credits spendable. Disputes/refunds require reconciliation.
4. Maintain server-authenticated entitlements and credit reservations. A backend worker needs strict budget ceilings, queue quotas, rate limits, timeouts, retry caps, idempotency and signed private output URLs.
5. The moderation gate must use a real trusted service, and it must remain enforced BEFORE reserving customer credits or requesting GPU work. Add abuse reporting and provider-compliant content policies.
6. On success settle only verified completed outputs; on provider failure/cancel use existing idempotent refund rules. Model failures **may still cost GPU money** and must be included in pricing.
7. Test in isolated staging: no subscription, insufficient credits, simultaneous requests, identical idempotency replay, failed job, partial output, retry/cancel, delayed webhook, chargeback, privacy/RLS and third-party cost overrun.
8. Explicitly approve and document deployment, paid infrastructure, plan price, credit allowances, tax treatment and margin before first real customer charge.

Until those steps finish, `launchApproved` is deliberately always false.
