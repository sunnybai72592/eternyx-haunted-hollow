# ETERNYX Stripe test-mode readiness — November 19, 2026

## Scope
This PR prepares **non-live test-only subscription checkout** for the existing
Vite/React + Supabase Edge Functions integration. It does **not** deploy functions,
enable real charges, publish live products/prices, activate provider-paid features,
set Stripe webhook destinations, grant entitlements, or claim that a real test
Checkout Session has been completed.

## Connected Stripe context checked
- One connected Stripe test-mode account was available: "New business".
- The test-mode catalog returned **0 products** and **0 prices**.
- No Stripe Product or Price was created: tax treatment and final product/pricing
  decisions have not yet been confirmed.
- The repo currently has illustrative server-only USD monthly amounts: premium
  2999 cents and elite 9999 cents. These are **test fixtures**, not approved live
  pricing, and are not published by the new plan cards.

## Two independent test-only guards

1. **Backend Edge Function (authoritative):**
   `ETERNYX_STRIPE_CHECKOUT_MODE=test` must be explicitly set in the target
   Supabase Edge Functions environment. Missing or any other value returns HTTP
   503 before creating a Stripe Customer or Checkout Session.
2. **Backend credentials (authoritative):**
   `STRIPE_SECRET_KEY` must have the `sk_test_` or `rk_test_` prefix.
   Live Stripe secret/restricted keys are refused even if test mode is enabled.
3. **Frontend UX (not security):**
   `VITE_ENABLE_STRIPE_TEST_CHECKOUT=true` allows the authorized tester to
   see a **sandbox test checkout** button. Without it, the UI disables
   purchase buttons and claims no paid features are active.

**The browser flag is not a security boundary.** The server always validates
the authenticated user, request body, plan ID, trusted redirect origin, and test
checkout gate. Leave both flags unset for a public preview.

## To test intentionally (not deployed by this PR)
- Use a dedicated isolated Stripe sandbox or existing Stripe test-mode account.
- Add test credentials to the server secrets vault; never commit a Stripe
  secret/restricted key, a webhook signing secret, or the Supabase service key.
- Confirm Stripe test product/price catalog and tax policy before creating Prices.
  The current inline Checkout prices in code are not automatically reconciled to
  catalog Prices; migrate to verified price IDs only after the tier economics are approved.
- Set `ETERNYX_STRIPE_CHECKOUT_MODE=test` **only** in a nonproduction environment
  with a test Stripe key and configured `APP_BASE_URL`.
- Enable `VITE_ENABLE_STRIPE_TEST_CHECKOUT=true` only in that same test frontend.
- Point a **test-mode** signed Stripe webhook destination at the deployed
  `stripe-webhook` function, securely configure `STRIPE_WEBHOOK_SECRET`,
  and verify signature, idempotency, ownership, subscription lifecycle and
  reconciliation behavior. A local code review cannot replace deployment testing.
- Test successful and failed payments, renewals, cancellation, delayed events,
  refunds, disputes and fraud warnings without real cards or charges.
- Validate customer portal, historical billing and credit/entitlement consistency.
- After tests, disable checkout flags again before public release.

## Required launch approvals
- [ ] Product names, customer terms, **final prices and currency** approved
- [ ] Confirm whether you collect sales tax, VAT or GST, jurisdictions and
      inclusive/exclusive tax treatment; configure Stripe Tax and registrations
      as applicable. Never assume a tax toggle means tax is actually collected.
- [ ] Verify webhook subscription and renewal/failure/refund/dispute/early-fraud
      reconciliation before granting paid access.
- [ ] Confirm restricted server keys and proper secret storage/rotation.
- [ ] Verify production authorization, isolated customer ownership and RLS.
- [ ] Approve real-money billing and production deployment in a **separate** review.

## Release assessment
November 23 is the target review; November 25 is the final go/no-go.
Live billing is **not deployed or enabled** by this PR. The test-only gate is a
prerequisite to a controlled sandbox verification, not a complete Stripe launch.

## Supabase environment validation — November 19, 2026

A direct audit of the **Eternyx** Supabase project (`wcncuarekaofmfurbtbh`)
showed that GitHub main did not automatically deploy billing changes.
A previous deployed checkout was missing authentication hardening, used untrusted
Origin redirects, and did not include the test-only launch gate.

### Implemented, tested, and deployed state

- The updated `create-checkout` Edge Function **v47** was deployed using
  the version-controlled, test-only gated implementation. It is still
  disabled unless the server has `ETERNYX_STRIPE_CHECKOUT_MODE=test`.
- The pending `stripe_webhook_lifecycle_foundation` SQL was applied to
  the linked Supabase database: server-managed `billing_subscriptions`,
  `stripe_webhook_events`, and idempotent webhook claim/finish/fail RPCs.
- SQL privilege checks verified that `anon` and `authenticated` roles
  cannot SELECT the subscription projection or EXECUTE the webhook claim RPC.
- The customer portal and webhook now receive the same **test-only key
  and server-side flag guards** as checkout in the reviewed code.
- The connected Stripe **test account** has no Product, Price, webhook
  destination, or billing portal configuration. Those are not invented by
  this patch.

### Not yet a completed Stripe Checkout production integration

The owner must configure an isolated test key, a signed test-mode webhook
secret, test-specific return URL, portal configuration, Stripe product/pricing
and country-specific tax treatment in the Stripe/Supabase dashboards.
The PR does not guess any key, price, tax registration, or merchant domicile.
A connected Stripe test account does not automatically provide credentials
to deployed Supabase functions.

For an actual end-to-end validation, verify: a signed-in test customer can
start a sandbox Checkout Session; it completes with a Stripe test card; the
verified webhook updates `billing_subscriptions` exactly once; the signed-in
client reads the correct tier; customer portal cancels and changes payment
methods in the test account; renewals, refunds, failures and retries reconcile
correctly. A successful build alone is insufficient.

Live payments and paid entitlements must remain disabled pending explicit
owner approval, tax registration verification, and full deployment testing.
