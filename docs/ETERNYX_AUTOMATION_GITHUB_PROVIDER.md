# ETERNYX Automation Phase 2F — GitHub Public Read Provider

## First real external integration

This milestone deliberately enables **one narrow, practical integration**:
**read-only public repository metadata from GitHub**.

The verified signed-in account explicitly enables the provider and chooses a repository owner and name. The Edge Function sends a single server-side GET to GitHub's fixed public REST endpoint, and returns a sanitized subset of repository information: name, description, stars, forks, open issues, programming language, archived flag and default branch.

GitHub's official public-repository API supports unauthenticated reads. No GitHub OAuth, PAT, API secret, paid provider, private repository access, pull-request writes, issue creation, commits, arbitrary URLs, or local commands are introduced.

## Cost and authorization

- The provider policy starts **disabled by default** for everyone.
- Strict permission scope: public_repository_metadata_read only. Neither browser nor user-supplied JSON can select a new provider, host, URL, HTTP method, script or account user ID.
- Fixed server-side URL pattern: https://api.github.com/repos/OWNER/REPO. Owner and repository names are constrained to safe path segments. Redirects are refused.
- The Edge endpoint independently verifies Supabase JWT identity, rejects anonymous accounts, and uses a service-role backend only after verification.
- Default **5 real provider API attempts per rolling 24 hours**; owner may choose any whole-number limit 1–20. This is enforced transactionally by PostgreSQL *before* any outbound API read.
- Repeating a request ID returns the original receipt, or its saved result, with no new GitHub request. A different repository with the same request ID is rejected. At most one in-flight call per account is permitted.
- Even a GitHub error consumes an API-attempt slot. The provider can independently return HTTP 404, 403 or 429. A 429 GitHub limit is not a promise of availability.
- Host and GitHub resources may incur costs; **this is a request-count budget, not an actual money-denominated spending cap**. Before high-scale usage, apply Supabase billing guards and provider-level quotas and check GitHub's platform rate-limit policy.

## Safety and privacy

- Fetch is always GET, with credentials omitted and a 6.5-second abort timeout. Outbound redirects are rejected; response must be JSON and at most 50 KB.
- GitHub results are validated as public; the provider response is reduced to ten allowed fields. Unexpected credentials, user permissions, raw headers, hidden repository data or unapproved fields are never stored or returned.
- PostgreSQL policy and provider call tables have RLS enabled, with no direct anon or authenticated role privileges; only the authenticated Edge service can read/write them.
- Successful sanitized result data is retained for **24 hours** and receipt metadata for at most **7 days after the owner next accesses the provider**. Pruning is opportunistic; this release does not install a background purge or guarantee deletion at an exact clock time.
- Only status, target repo and sanitized counters are retained. Provider errors have stable non-sensitive codes.
- No automatic scheduler, webhook trigger, GPU job, paid AI or purchase is enabled by this milestone.

## Deployment (not performed by this PR)

1. Require green Node tests, application build, browser acceptance, GitGuardian and the isolated PostgreSQL 17 provider acceptance workflow.
2. Apply migration 20261123020000_automation_github_read_provider.sql after the existing Automation migrations.
3. Deploy the automation-github-public Supabase Edge Function with verify_jwt=true. No new GitHub API key needs to be set.
4. Publish the AutomationCloudPanel frontend with AutomationGitHubReadPanel.
5. In a staging account sign in, load provider status, explicitly Enable read-only integration, set a daily limit of 1, and inspect a public GitHub repo. Confirm that real stars/forks and a call audit are returned.
6. Attempt a second *distinct* inspection. It should receive an enforced 429 without contacting GitHub. Reuse the original request UUID to verify it returns the saved result without a second provider call.
7. Try another signed-in account; verify policy, results and quotas are independent. Attempt unauthorized direct calls to the provider tables and ensure they are rejected.
8. Disable the provider, verify new inspections are refused, and confirm the old results remain owner-visible only until retention cleanup.

Do not promote to production without reviewing Edge Function/database costs, upstream rate limits and the intended target repository's public visibility.

## Tests

- node --test tests/automation-github-provider.test.mjs
- npm test and npm run build through the normal repository CI.
- GitHub Action: Automation GitHub Public Read SQL Acceptance (network-isolated PostgreSQL 17).

Future integrations with external side effects or financial charges require **separate** fine-grained OAuth, operator approval, destination allowlists, SSRF controls, real money-denominated budgets and redacted audit trails. They are not claimed as implemented here.
