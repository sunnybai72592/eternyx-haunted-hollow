# ETERNYX — Master Tool Registry and Release Evidence

**Review date:** November 20, 2026  
**Source:** `src/data/toolRegistry.json` and `src/App.tsx`  
**Purpose:** One honest catalogue across all six ETERNYX pillars.

## What the numbers actually mean

The first indexed batch contains **32 capabilities**, each linked to a real application route and source file. This is a **source-audited inventory**, not proof that 32 different tools have passed production end-to-end testing. Some capabilities share a page, such as five independently identifiable browser developer utilities.

| Evidence / status | Meaning | What it does NOT prove |
| --- | --- | --- |
| local-foundation | A local tool/workflow exists in source, generally backed by focused unit tests | Real-browser production verification, safe input edge cases across devices |
| preview-only | An authenticated local planner/editor/workbench exists without real model or automation execution | AI output, provider connectivity or autonomous operations |
| backend-dependent | Backend/account/provider activation or protected integration still needs verification | Availability, entitlement, model inference, paid features |
| external-dependent | Calls an external API, requiring rate limits and live conditions to be checked | Guaranteed availability, credentials or external writes |

`releaseVerified` is FALSE for all 32 entries. A passing source test is not a tested deployed user journey. A future PR may promote one entry only after it has a named reviewer, an existing test, a reproducible deployed browser acceptance record, and a stable build, not merely a reachable route.

**Source tests:** validate narrow behaviors, but should not be confused with real deployed product tests. A source-only entry has `test: null` and must remain unverified.

## Capability fields

- `id` — stable unique slug, never reuse for a different implementation.
- `name`, `description` — honest current capability, not a marketing promise.
- `pillar` — canonical six-pillar taxonomy from `src/data/ecosystem.ts`.
- `route` — real non-redirect `src/App.tsx` destination.
- `execution` — Browser, Backend-dependent, or External API.
- `access` and `securityScope` — scope/permissions; never imply unauthorized scanning is allowed.
- `source` and `test` — repository evidence, not runtime success.
- `provider` — actual dependency, or no provider.
- `owner` — named responsible reviewer once assigned (currently unassigned).
- `verification`, `releaseVerified`, `audit` — factual acceptance state.
- `reviewedAt` — source inventory review date, not a release certification.

Only routes and evidence that exist today are indexed; proposed tools do not silently inflate these counts.

## Tools and roadmap alignment

**Stage 1 — Current inventory**: 32 indexed capabilities, 6 pillars, zero completed deployment/browser certifications. The Explore page supports query, pillar, and readiness filters with copy that prevents false production claims.

**Stage 2 — Verified launch batch**: Test and certify the first 10–15 genuinely useful, low-risk local browser tools on mobile and desktop. Assign owners, add screenshots/reproduction evidence, validate accessibility, import/export and reduced motion. Record actual runtime versions; mark `releaseVerified` true only after this evidence exists.

**Stage 3 — Real backend workbenches**: Verify authenticated separation, Supabase RLS, failure states, external API rate limits and permission boundaries. Add security findings, GitHub collaboration, saved projects and dependable user history.

**Stage 4 — AI and subscriptions**: Activate real AI model providers after approval; run jobs/credits lifecycle and private asset access tests. Polar/Stripe remain sandbox-only until payments, business eligibility and tax requirements are proven. No fake credits or payment acceptance.

**Stage 5 — 120-capability target**: The long-term target is 25 cybersecurity, 25 developer, 24 AI, 16 workspace, 16 cloud/integration and 14 automation capabilities. A tool only counts as released when its real operation, permission boundary, result evidence, failure handling, and deployed smoke test are demonstrable.

The 120-capability numbers are **aspirational target capacity**, not currently deployed count.

## Acceptance checklist per capability

1. Confirm exact function and user value; no static placeholder pretending to run.
2. Confirm source entrypoint, route, and owner.
3. Unit-test successful, invalid and boundary inputs.
4. Verify authorization and access isolation for user data; confirm side-effect scope.
5. Test real backend/provider calls and upstream outages where relevant.
6. Inspect desktop, narrow mobile, keyboard navigation, loading, empty and error states.
7. Verify secure logging and result exports without exposing secrets.
8. Run release CI on the exact commit and test deployed build.
9. Attach concise acceptance evidence and promote release state only after review.
10. Keep capability labels honest as providers change or credentials are revoked.

## Repeatable audit

- `npm run audit:tools` — prints route-level status and rejects duplicate IDs/names, unsupported statuses, nonexistent routes and missing evidence files.
- `npm test` — includes `tests/master-tool-registry.test.mjs` plus existing tool tests.
- `npm run build` — checks compiled frontend bundles.

**Safety:** This change is inventory/UI/tests only. It does NOT deploy external scanners, enable model APIs, turn on subscriptions, create billing secrets, grant production entitlements, or perform real-world security testing.
