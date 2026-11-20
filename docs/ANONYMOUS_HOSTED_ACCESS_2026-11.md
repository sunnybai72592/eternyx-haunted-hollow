# ETERNYX — Hosted Anonymous Access Boundaries

**Milestone:** November 20, 2026, following successful public hosted acceptance (#44772980245)

## Confirmed baseline

- PR #259 merged into main (99ef09c8c3e518a74a143e7d5404def73366b069).
- GitHub manual hosted run #44772980245 passed 16/16 public desktop/mobile UI journeys.
- Public build fingerprint remained unavailable in that run, even after the release-provenance PR merged. Therefore the exact deployed revision is NOT yet independently established. Passing UI smoke tests did not certify authenticated features, payment providers, real AI or backend RLS.

## New anonymous route audit

The existing opt-in GitHub Actions hosted acceptance workflow gains a second,
independent, anonymous-browser test:

| Entry point or protected route | Expected behavior with zero stored session |
| --- | --- |
| /auth | Public sign-in form is usable and account creation option is visible |
| /account | Redirect to /auth; do not render private account content |
| /notifications | Redirect to /auth |
| /profile | Redirect to /auth |
| /settings | Redirect to /auth |
| /ai-arsenal/image | Redirect to /auth |
| /ai-arsenal/video | Redirect to /auth |
| /black-hat-pentesting | Redirect to /auth |
| /my-bug-reports | Redirect to /auth |

Nine entries at two viewports (390 × 844 and 1440 × 900) yield **18 separate
browser outcomes**.

The test starts a completely fresh browser context, blocks service workers,
and permits **GET/HEAD only** to one exact, approved HTTPS Lovable hostname.
It blocks and separately counts known Lovable telemetry POST attempts;
any other attempted write fails the audit. It never accesses third-party
websites, generates account passwords, submits sign-in forms or probes
private endpoints.

Source: tests/browser/anonymous_route_guards.py
Machine-readable evidence: test-results/anonymous-route-acceptance.json
Strict validator: src/lib/anonymousRouteAcceptance.mjs
CI summary: scripts/summarize-anonymous-routes.mjs

Reports contain only static case names, viewport, pass/fail, and bounded
request counts; not user IDs, cookies, query strings, credentials, screenshots,
form contents or raw error stacks. The manual GitHub workflow uploads both
the original public UI acceptance and anonymous route acceptance evidence.

## Explicit limits

A successful redirect is evidence of **frontend anonymous navigation
protection only**. It is NOT evidence of:

- successful real login/signup or third-party OAuth;
- session persistence after refresh or navigation;
- Supabase row-level security or tenant isolation;
- private API authorization against forged/expired tokens;
- payment, credits, AI output generation or webhook processing;
- production certification of any master-registry tool.

No production tool registry verification flags change in this PR. No test
credentials, user accounts, Supabase writes, paid services, provider calls
or production deployment are required.

## Next acceptance milestone

With the owner's explicit approval, use dedicated non-production test
accounts and a separate environment to validate:
1. Session restoration and authorized account pages;
2. Denial of one user's private records to another user;
3. Expired/revoked token handling and server-side RLS;
4. Account deletion, private file ownership and sign-out;
5. Provider-backed tool results under real, sandboxed quotas.

Do not use a real customer's account or expose login credentials in CI.

**Outstanding item:** Lovable's hosted release stamp was unavailable in run
#44772980245. Check publication/caching of /release-info.json and all
HTML/JS markers separately before claiming a specific deployed SHA.
