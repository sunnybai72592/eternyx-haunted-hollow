# ETERNYX — Local Chrome Preview Acceptance (20 November 2026)

## Purpose and evidence boundary

This milestone extends the existing Playwright/Chrome CI suite to exercise
**12 cases × 2 viewport sizes = 24 viewport-specific journeys** against a
**locally served, freshly built Vite preview**, not the actual production URL.
It does not change any tool's `releaseVerified` field to true.

The test runner uses the Chromium **Chrome channel**, 390×844 mobile-size
and 1440×900 desktop-size, with reduced motion enabled. It also runs targeted
Node utility tests and the production-build compiler.

The external tests use **mocked GitHub** responses, **mocked AI** responses
and a synthetic authenticated test user; no test should be mistaken for a
live API/provider acceptance check. In particular, checkout, paid plans,
actual AI model inference and security scans are NOT enabled.

## Covered journeys

| Journey | Execution mode | Important acceptance evidence |
| --- | --- | --- |
| Device scratchpad | Local browser | Save, reload, search, copy management and export |
| Clean a list | Local browser | Deduplication, ordering, mobile/desktop layout, JSON export, saved copy |
| Explore → GitHub repository inspector | Mocked GitHub API | Search, navigation, public repo data, 403 response, back navigation |
| Explore registry filtering | Local browser | Pillar/readiness filtering, URL persistence, no-results state |
| JSON formatter | Local browser | Valid JSON formatting and malformed JSON rejection |
| UTF-8 Base64 | Local browser | Non-Latin/emoji round-trip, bad input handling |
| URI encoding | Local browser | Unicode round-trip, malformed percent escapes |
| UUID v4 generator | Local browser | RFC-style version/variant format, uniqueness, invalid counts |
| JWT decoder | Local browser | Header/claims inspection, invalid token handling, explicit no-signature-verification warning |
| Video storyboard | Mocked authentication | Shot list generation, export, invalid import protection |
| AI document local search | Mocked authentication | Upload, search, Unicode handling, exports and clear confirmation |
| AI chat | Mocked AI and storage | Insufficient-credit error, retry, saved history, search and text export |

## Reproducible evidence

- Manifest: `tests/browser/acceptance_manifest.json` records each exact case,
  its tool ID and classification (`local-preview`, `auth-fixture`,
  `mocked-external`, or `mocked-backend`).
- Runner: `tests/browser/preview_smoke.py` exercises real UI controls
  in desktop/mobile Chrome after `npm run build` and `npm run preview`.
- CI writes `test-results/browser-preview-acceptance.json` even when a test
  fails, with **only case names, viewport sizes and result**—no screenshots,
  prompts, private documents, API tokens or user identity.
- GitHub Actions uploads the report as a short-retention artifact. Review
  the artifact on the exact PR commit before claiming a passed journey.

**Do not interpret Chrome preview green checks as deployed production
certification.** Stage 2 should separately exercise live production with
permissioned test accounts, real expected response fixtures and approved
provider integrations.

## Release-readiness follow-up

Next priority is to record per-tool deployment URL, commit, verification
date and test owner after a browser test against the actual deployment,
including failing inputs and narrow mobile. Only then should
`releaseVerified` be promoted from false.

The original 120-capability roadmap is an aspirational inventory and is
not affected by these 24 case/viewport executions. A test case is never
counted as a new product feature.

## Scope

This is a repository-only PR: no live payment, Stripe/Polar activation,
Supabase migration, external security scan, user account mutation or paid
AI model execution.
