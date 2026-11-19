# ETERNYX — Digital SaaS subscriptions and merchant registration

**Current situation — November 19, 2026**

ETERNYX is an online software-as-a-service (SaaS) platform. Customers may
purchase **digital services**, not physical inventory: subscriptions to
use hosted tools, optional tier-based access, and later usage credits.
A Stripe "Product" is an API/catalog representation of a service, not
a warehouse item. Each paid tier is a different Stripe Product with a
monthly recurring Stripe Price.

## Actual connected test account

- Stripe context: `acct_1SFN0gIRb2Syqa2Z`, **US test account**.
- Charges enabled: false; payouts enabled: false.
- Business identity/details submitted: false.
- Verified Stripe test catalog: no Products and no Prices.
- Stripe Tax status: `pending` (missing `head_office`).
- A test Customer Portal was created; the test webhook endpoint exists
  but remains disabled until its matching signing secret is configured.
- **No live charges** or customer subscriptions are authorized.
- The Stripe account and ownership of a GitHub project are **not**
  proof of incorporation or eligibility for US banking/payouts.

## Legal/operating jurisdiction

The founder is currently in Saudi Arabia and has not yet registered
a legal business entity for ETERNYX. An online-only service may have no
retail storefront or physical inventory; that does *not* dispense with
business registration, principal business address, tax status, payment
processor identity verification, or work authorization where required.

Stripe's current supported merchant-country list does **not** include
Saudi Arabia. Do not supply fake US/UAE company data or claim to be a
merchant in a country without a legitimate eligible entity.
Test-mode integration can be built with the connected US test account;
**live merchant onboarding requires a lawful, verified structure**.

Saudi legal paths to assess (not a determination of eligibility):

1. **Saudi citizen or otherwise eligible domestic registrant**: review the
   Saudi Business Center at https://business.sa and the Ministry of Commerce
   registration rules for the digital-service activity.
2. **Non-Saudi founder**: confirm the appropriate Ministry of Investment
   (MISA) investor registration category, business activity and relevant
   Ministry of Commerce commercial registration.
   MISA's 2026 investor guide identifies an entrepreneurial-establishment
   registration path with accredited incubator support. For applicants
   residing in Saudi Arabia, that specific category lists an employer
   no-objection letter and residence permit among requirements.
   Do not assume an ordinary employment iqama is authorization to run
   an independent commercial business.
3. Review the need for a legal/registered business address (which may not
   need a customer-facing retail premises). Do not invent a head-office
   location to make Stripe Tax onboarding pass.

Official sources:

- Stripe global availability: https://stripe.com/global
- Saudi Business Center: https://business.sa
- MISA investment registration: https://eservices.misa.gov.sa/en/resources/updatedInvestmentLaw
- MISA 2026 Investor Guide: https://misa.gov.sa/app/uploads/2026/11/Investor_Guide_13_04_EN.pdf
- Ministry of Commerce: https://mc.gov.sa/en/ESERVICES/pages/ServiceDetails.aspx?sID=38

## Saudi tax considerations

Saudi Arabia's standard VAT rate is **15%** on taxable domestic supplies.
ZATCA's domestic **mandatory VAT registration** threshold is generally
SAR 375,000 in taxable supplies within a rolling 12-month period, with
voluntary registration starting at SAR 187,500 under relevant conditions.
The actual treatment depends on the **registered merchant, sales
destinations, cross-border digital-service rules and applicable law**.
Do not assume every ETERNYX sale is subject to Saudi VAT or that thresholds
apply identically to an overseas merchant. Consult ZATCA or a qualified
accountant before configuring tax collection.

Official sources:
- VAT background: https://zatca.gov.sa/en/RulesRegulations/VAT/Pages/About-Vat.aspx
- VAT registration: https://zatca.gov.sa/en/eServices/Pages/eservices-001.aspx

## Test-mode digital subscription catalog contract

No final prices are assumed. Once pricing/tax treatment is agreed, create
one **test Stripe Product per tier**, not a physical product:

| Plan | Required Product metadata | Recurring Price lookup key |
| --- | --- | --- |
| Shadow Operative (Premium) | `eternyx_plan_id=premium` | `eternyx_premium_monthly` |
| Cyber Overlord (Elite) | `eternyx_plan_id=elite` | `eternyx_elite_monthly` |

Both Prices must be active, in USD, with positive monthly recurring
amounts and interval count 1 for the **current US sandbox**. They must
be created through Stripe test mode, not client-submitted data.

Set these *server-only* environment settings in the target test
Supabase Edge Functions project:

- `STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_...`
- `STRIPE_ELITE_MONTHLY_PRICE_ID=price_...`
- `STRIPE_SECRET_KEY` — **test mode only**, in the server secrets vault
- `STRIPE_WEBHOOK_SECRET` — matching signed test webhook secret, vault only
- `ETERNYX_STRIPE_CHECKOUT_MODE=test` — controlled sandbox use only
- `APP_BASE_URL` — approved origin for redirect URLs

The existing frontend `VITE_ENABLE_STRIPE_TEST_CHECKOUT=true` is a
presentation flag, **not a security boundary**. The server checks
authenticated user, allowed plan, price ID, Stripe Price/Product
metadata, test key and launch mode before creating a customer.

**Until these fields are valid, checkout fails closed instead of
inventing prices or products.**

## Outstanding owner/legal decisions

- [ ] Confirm the founder's nationality/residency classification and whether
      a Saudi investor/entrepreneur license or a different entity jurisdiction
      is suitable.
- [ ] Confirm the legitimate registered business address, legal entity,
      merchant country, bank and identity requirements.
- [ ] Approve plan names, actual included tools/credits, monthly fees,
      currency, cancellation/refund terms, and applicable tax treatment.
- [ ] Complete Stripe Tax registration/settings if required.
- [ ] Configure test Stripe Products/Prices with correct metadata and lookup keys.
- [ ] Add secrets securely; enable/test signed webhook delivery, recurring
      renewals, failed payments, cancellations, disputes and refunds.
- [ ] Prove paid entitlements and credits reconcile before any production launch.

Release without payments as a public preview if the November 23 target
arrives before legal identity and end-to-end payment verification. This
note is practical software/compliance guidance, not individual legal advice.
