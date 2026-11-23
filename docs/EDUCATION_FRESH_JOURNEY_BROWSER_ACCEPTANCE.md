# Education: prove the same fresh staging attempt reaches the student's actual browser

**Status:** Code prepared for a manually approved, fully isolated staging project. This does **not** certify production or mean any live staging test has run.

The existing protected **ETERNYX Education hosted staging release readiness** workflow already has an explicit, irreversible \`journey\` mode: one fresh synthetic CBT attempt, its MCQ and written answers, instructor provisional review, immutable trusted final grade, and owner-only final-results API. It did not demonstrate the **actual React results screen for that newly created attempt**, only separate pre-seeded result fixtures.

This phase adds a **browser proof after all five backend stages pass**. It uses the already-approved write/review/finalize acknowledgments; no new automatic write or API endpoint is introduced. Nothing runs on push/PR; the existing manual \`main\` + protected \`rls-staging\` workflow and shared concurrency group remain required.

## One-time handoff without private-data upload

After the final backend report confirms every stage, the runner writes a local \`0600\` / exclusive-create JSON handoff at \`test-results/education-journey-ui-target-private.json\`. It contains only the newly created attempt ID, expected approved score and maximum, source SHA, GitHub run and attempt. The attempt ID is validated against the original one-time CBT handoff and must be **different from all pre-seeded result fixtures**. This file is **never included in GitHub artifacts** and is removed on failure or in an unconditional cleanup step before artifact upload. No browser credentials, answer text, student ID, JWT or service role key are stored in it.

For \`journey\` only, the workflow builds a temporary staging-targeted frontend with the five coordinated Education RPC client flags. It downloads pinned Chromium without account credentials, starts a localhost preview, and signs in as the prepared Student A and Student B in **isolated browser contexts**.

Desktop and mobile each prove Student A can see **that newly created attempt's exact trusted final grade**, and Student B cannot read it. The existing strict browser network guard permits only the local preview and the exact approved HTTPS staging project; any unapproved write or outside request fails the run. A fixed six-check, sanitized browser report contains no attempt ID or score.

The final same-run gate requires both the **five verified backend release stages** and the **six actual browser checks**, tied to the same GitHub SHA/run/attempt. Only then does it create \`test-results/education-hosted-fresh-journey-ui-backend.json\`, the *combined full-journey staging proof*. Missing, stale, incomplete, altered or production-claiming evidence fails closed.

## Additional reliability fix

The separate read-only hosted browser workflow previously installed the Python \`playwright\` package but omitted the Chromium browser download required by its \`playwright.chromium.launch()\` call. Both live manual workflows now install the pinned browser binary in a step with **no staging account credentials**. This prevents a misleading missing-executable failure when a real staging run is approved.

## What remains

An independent Supabase staging project (not Eternyx production) must be provisioned, current Education migrations/RLS and trusted grading verified, synthetic students/instructor provisioned, and protected GitHub environment secrets/fixtures reviewed. An authorized operator must explicitly approve the one-time journey. **No real hosted browser or write tests are executed by the PR CI**, and neither a synthetic-browser green result nor this code alone authorizes production. Production remains NO-GO pending real-hosted acceptance and human release sign-off.
