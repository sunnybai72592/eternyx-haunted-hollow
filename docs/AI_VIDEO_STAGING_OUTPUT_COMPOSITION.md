# ETERNYX Video output composition — staged, private, no paid activation

This PR connects the existing **real self-hosted GPU output HTTP downloader**
to ETERNYX's existing **lease-fenced private Supabase output materializer** as
an explicitly constructed server-side staging module. It is a component—not
a publicly callable API, generation server, or production deployment.

## Data path (when a future trusted server uses the module)
1. An approved server-only staging caller supplies vetted GPU hostname/secret
   and a **trusted private storage client**, plus an approved `maxBytes` limit.
2. The GPU downloader checks the exact provider task and opaque output handle
   against a fresh successful GPU task snapshot.
3. It fetches the bounded MP4 over authenticated HTTPS with no redirects.
4. `createAIWorkerOutputMaterializer` invokes the existing materialization
   core. The core validates content, hashes bytes, calls `confirmLease` directly
   before storage, and uses create-if-absent private object storage.
5. The caller must use existing worker reconciliation and central credits
   settlement to finalize the job; **this module does not issue those updates**.

### Security
- Neither GPU service secret nor privileged Supabase Storage credentials may
  ever be sent to client-side JavaScript.
- The server caller must verify signed-in user, approved generation request,
  accepted moderation, exact job ownership and current lease **before** any
  provider call; the existing materializer rechecks lease prior to writing.
- Supabase private bucket access must be governed by RLS or tightly restricted
  trusted server operations. Privileged service credentials bypass Storage RLS,
  so never expose them. Supabase docs: https://supabase.com/docs/guides/storage/security/access-control
- `stagingApproved: true` is an explicit construction guard **not** a security
  authorization or external feature flag. Only trusted deployment policy and
  operator approval may authorize staging usage.
- Pricing is injected from the central credit service, never guessed from GPU
  response content or visitor-provided values.

### Out of scope / still blocked
- No model weights, GPU service deployment, real video execution or billing.
- No Supabase production migration, new RLS policies, Edge Function deployment,
  production model registry activation or public user download endpoint.
- No verified end-to-end staging run; integration needs protected environment
  and an approved hosting budget.
- Production authorization, final file ownership, signed user download and
  retention rules must be separately tested against a staging database.
- A model-generated clip is not considered delivered until private storage and
  job settlement are confirmed; a worker status alone is insufficient.

All tests in this milestone are offline and do not contact a GPU or Supabase.
