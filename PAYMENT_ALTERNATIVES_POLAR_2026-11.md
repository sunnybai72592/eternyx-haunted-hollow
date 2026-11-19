# ETERNYX — Payment alternatives and Polar Merchant-of-Record sandbox

Audit date: November 19, 2026. Status: sandbox integration code prepared, merchant onboarding and real test subscription NOT completed.

ETERNYX sells digital SaaS access rather than physical inventory. Its founder is Pakistani and currently resides in Saudi Arabia. Neither fact alone establishes a registered merchant country, a payout account, nor authorization to conduct independent business on an employment Iqama.

## Provider selection

| Candidate | Value to ETERNYX | Qualification |
| --- | --- | --- |
| Polar (first technical integration) | Merchant of Record for SaaS, usage, subscriptions, invoices, buyer tax remittance, hosted portal | Lists Pakistan and Saudi Arabia for eligible seller residency/establishment; actual account, payout eligibility, and cybersecurity-tool AUP review required |
| Paddle (second choice) | Merchant of Record, recurring SaaS, global buyer tax processing | Offers Pakistan SaaS merchant offering, but requires identity/domain/product approval; some security or technical-support products are restricted |
| Safepay (Pakistan fallback) | Pakistan payment processor, recurring checkout | Business/bank onboarding; not the same international MoR sales-tax arrangement |
| Moyasar (Saudi fallback) | Saudi gateway with local payment support | Requires qualifying Saudi registration/licensing and associated business bank account |
| Stripe | Existing isolated US test-only sandbox | No verified live account or payouts; neither Saudi Arabia nor Pakistan is a standard direct merchant account country |
| Lemon Squeezy | Do not newly integrate | Closed new signups on November 16, 2026, and will end payment processing March 31, 2027 |

Official information:
- Polar seller countries: https://polar.sh/docs/merchant-of-record/supported-countries
- Polar acceptable-use policy (unauthorized access, spyware, OSINT): https://polar.sh/legal/acceptable-use-policy
- Polar checkout API: https://polar.sh/docs/api-reference/checkouts/create-session
- Polar portal API: https://polar.sh/docs/api-reference/customer-portal/sessions/create
- Polar webhook API: https://polar.sh/docs/api-reference/webhooks/endpoints/create
- Polar sandbox: https://sandbox.polar.sh
- Paddle for Pakistan: https://www.paddle.com/billing/pakistan
- Paddle AUP: https://www.paddle.com/help/start/account-verification/what-am-i-not-allowed-to-sell-on-paddle
- Safepay: https://safepay.pk
- Lemon Squeezy closure: https://www.lemonsqueezy.com/blog/saying-goodbye-to-lemon-squeezy

## Code architecture

Both client feature flags are default-off:
- VITE_ENABLE_POLAR_SANDBOX_CHECKOUT=true for new Polar sandbox.
- VITE_ENABLE_STRIPE_TEST_CHECKOUT=true for existing isolated Stripe sandbox.

If both are true or both are false, checkout is disabled: fail closed. Browser flags are NOT security boundaries. Server functions independently authenticate the user and check provider launch gates.

Polar functions:
- polar-checkout: requires ETERNYX_POLAR_CHECKOUT_MODE=sandbox, verified Supabase session, server-side plan ID, actual recurring sandbox Polar Product with matching metadata, and a trusted hosted sandbox checkout URL.
- polar-customer-portal: verified Supabase session and external Polar customer ID linked to the same user.
- polar-webhook: signed Polar SDK event verification on raw body, bounded size, duplicate-event protection, GET of current sandbox subscription state to defeat out-of-order events, product-to-plan and customer-to-user ownership validation, and server-only data projection.
- check-subscription: combines Stripe and Polar private subscription projections; denies access when conflicting active records exist.

Checkout redirects are never proof of a paid subscription. Only the server-managed projection reconciled from signed events may be used to determine a plan. No sandbox handler can access Polar production APIs.

Database migration:
supabase/migrations/20261119221500_polar_mor_subscription_foundation.sql
creates private polar_billing_subscriptions, polar_webhook_events and privileged idempotency RPCs.

**Merchant approval is a separate, mandatory gate.** A founder's
nationality or residence appearing on a payout-country list does not
guarantee underwriting approval, business authorization, identity
verification, or the acceptance of ETERNYX cybersecurity tooling.

## Owner action: sandbox onboarding

1. Create your own Polar sandbox organization at https://sandbox.polar.sh. Confirm you may legally operate from Saudi Arabia while holding a Pakistani passport and Iqama. Seek Polar's explicit approval for ETERNYX cybersecurity and developer tools.
2. Create **two monthly recurring sandbox Products**. Assign metadata eternyx_plan_id=premium and eternyx_plan_id=elite. Put their actual UUIDs in POLAR_PREMIUM_PRODUCT_ID and POLAR_ELITE_PRODUCT_ID respectively. Choose final prices and tax behavior yourself; the code invents no amounts.
3. Generate a scoped sandbox organization token under Polar Settings / Developers. Save it as POLAR_SANDBOX_ACCESS_TOKEN inside **Supabase Edge Function secrets**, not the frontend or GitHub.
4. Configure Polar Raw webhook to https://wcncuarekaofmfurbtbh.supabase.co/functions/v1/polar-webhook with events subscription.created, subscription.updated, subscription.active, subscription.canceled, subscription.uncanceled, subscription.revoked, subscription.past_due. Save the exact signing secret as POLAR_SANDBOX_WEBHOOK_SECRET inside Supabase secrets.
5. Apply the SQL migration in the correct environment; deploy polar-checkout, polar-customer-portal, polar-webhook and updated check-subscription. Verify table privileges and that events authenticate and reconcile.
6. Set ETERNYX_POLAR_CHECKOUT_MODE=sandbox server-side only in a dedicated sandbox environment after the correct secrets and product IDs are configured. Configure trusted APP_BASE_URL.
7. Set VITE_ENABLE_POLAR_SANDBOX_CHECKOUT=true in that sandbox frontend, keeping the Stripe frontend flag false. Test checkout, webhook, portal, renewals, unsuccessful charges, cancellation, disputes, and refunds.
8. For real customer payments, complete merchant identity, legal registration/work authorization, payouts, product approval, final prices, cancellation/refund terms and tax review. Real-money go-live requires a separate security and business review.

## Release checkpoints

- [ ] Owner's Polar sandbox organization and valid sandbox token connected
- [ ] Product UUIDs correspond to correct recurring paid plans, and prices approved
- [ ] Raw signed webhook configured and verified end-to-end
- [ ] Private RLS and duplicate-event handling validated
- [ ] Subscription active / past due / cancel / revoke and refund scenarios verified
- [ ] Product category and payout country accepted by Polar
- [ ] Lawful business activity, settlement account and tax/legal obligations confirmed

**No real-money charges, merchant acceptance or payment success is claimed.** Keep the free preview available while these conditions remain unresolved. This is implementation guidance, not a business-registration or tax-law determination.
