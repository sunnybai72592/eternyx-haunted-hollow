# ETERNYX — Hosted read-only acceptance

**Milestone:** PR #256, November 20, 2026

## Verified starting point

- PR #255 is merged into GitHub main.
- The connected Lovable project (4e3226d5-080f-4830-8446-9d86452bdf76) reports itself published, and its latest source SHA matches the merge commit.
- Lovable returned an editor preview URL. The application also contains an existing eternyx-haunted-hollow.lovable.app default origin.
- Neither the published deployment revision nor a completed hosted-browser journey has yet been verified.
- The live URLs were not reachable from this assistant's external network tools. A GitHub-hosted workflow is therefore the next reproducible remote test; inspect its results after it runs.

## New manually-triggered browser audit

GitHub → Actions → Hosted ETERNYX read-only acceptance → Run workflow → choose:

| Target | Fixed allowlisted origin | Confidence |
| --- | --- | --- |
| lovable-preview | https://id-preview--4e3226d5-080f-4830-8446-9d86452bdf76.lovable.app | Preview URL returned by the connected Lovable project |
| public-domain-candidate | https://eternyx-haunted-hollow.lovable.app | Default origin in application config; **not confirmed published** |

The workflow does **not** automatically run on pushes or PRs. It does not accept arbitrary URLs, IPs, ports, credentials or paths.

The public hosted browser test covers **8 UI journeys × 2 viewports = 16 attempts**:

1. Explore renders the 32-entry master registry and honest zero-verification count.
2. Explore search/pillar/readiness URL state survives navigation.
3. Developer Studio JSON formatting and malformed input.
4. Unicode Base64 and invalid input.
5. Unicode URL encoding and malformed escape rejection.
6. UUID v4 uniqueness and numeric bounds.
7. JWT inspection and the signature-verification disclaimer.
8. Local list cleanup and ordering without account persistence.

Chrome starts an anonymous disposable browser with reduced motion, no saved cookies, and no supplied personal credentials. Requests are intercepted: only GET/HEAD to exactly the approved first-party HTTPS hostname can proceed. External hosts and attempted HTTP writes are blocked. The test does not create accounts, initiate payments, submit forms, mutate Supabase, scan outside targets, issue administrative calls, or mock API/provider responses.

This tests browser-local functionality on a hosted frontend, not provider-backed tools. Blocking a third-party asset could cause an observed test-environment limitation; inspect before labeling a product defect.

## Provenance and truth labels

Every run writes test-results/remote-readonly-acceptance.json and uploads a short-retention Actions artifact, including on failure.

The report includes the approved host, viewport, each test outcome, blocked outbound requests, GitHub source commit and an explicit deployment-revision-unverified marker. It stores no screenshots, cookies, prompts, provider tokens or personal notes.

**A matching source SHA in Lovable project metadata is not proof the published URL serves that SHA.** To promote a registry releaseVerified field to true, obtain:
- a confirmed deployment URL and exact deployed build/version identifier,
- a green remote browser audit artifact from that version,
- independent acceptance by a named reviewer,
- a real backend/provider validation for services that require external calls.

Therefore PR #256 keeps all 32 releaseVerified flags false and does not enable subscriptions, scanners or AI providers.

## Run and interpret

1. Merge PR #256.
2. Open GitHub Actions and manually start the remote read-only workflow with lovable-preview.
3. Review the GitHub run and uploaded JSON artifact; failures are not silent.
4. If the public-domain candidate is actually published, run the workflow against it too.
5. Fix any demonstrated hosted regressions. Do not promote production status until hosting revision and acceptance signoff are verified.

## Scope

This is an on-demand, read-only external test harness. No production deploy, payment activation, Supabase migration or user data mutation is performed.

**Open issue:** Confirm canonical public domain and deployed build SHA. Until then, production verification is unclaimed.
