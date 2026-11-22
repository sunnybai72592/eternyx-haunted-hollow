# ETERNYX Automation Phase 2G — Owner-Approved GitHub Issues

## What this release actually implements

The Automation cloud workspace can now connect **one explicitly selected GitHub repository per ETERNYX account** with a **fine-grained personal access token (PAT)**. It can save an encrypted issue draft, show its exact contents and destination to the owner, and—only after the owner clicks Approve & create issue and confirms—send one real GitHub issue-creation REST call.

GitHub documents that creating an issue requires repository permission **Issues: write** for a fine-grained PAT, as well as repository selection. The server first verifies the token can read metadata for the exact repository with Issues enabled. This GET verification does **not** independently prove the token has Issues: write; GitHub enforces that permission when the approved POST is made.

Only a request with a valid signed-in Supabase user identity can create a draft or approve it. No public webhook or automatic scheduler can call this write endpoint on someone's behalf. There is no GitHub App OAuth flow in this PR: users explicitly paste a fine-grained PAT, which is never returned to the browser, stored in plaintext, or written to logs. Avoid overbroad PATs.

## Security and workflow

1. The user enters GitHub owner/repository and a fine-grained PAT; the server makes a **fixed-destination GET** to GitHub's repository metadata endpoint, without following redirects. If verification fails, no connection is saved.
2. The token is encrypted with AES-256-GCM, a fresh random nonce, and the dedicated server-only secret named AUTOMATION_GITHUB_WRITE_ENCRYPTION_KEY. PostgreSQL stores ciphertext and nonce only. The connection is **disabled by default** after creation, replacement or rotation.
3. The signed-in owner separately chooses Enable issue writes. This allows draft preparation but never automatically approves a draft.
4. Preparing a draft stores encrypted issue title/body for a maximum of 24 hours. The UI clearly says no GitHub write occurs at this stage.
5. Only the same verified account owner can preview exact plaintext draft content and the bound repository, or reject it. Rejection atomically erases the encrypted payload.
6. The owner confirms Approve & create issue. Before ANY outgoing POST, a private PostgreSQL transaction checks owner, repository, connection version, enabled state, unexpired pending approval, one-active-write limit, and the real three-write-attempts/24h budget. The transaction **permanently claims the draft** and erases its encrypted title/body, preventing a second request from using that draft.
7. The server sends exactly one POST to https://api.github.com/repos/OWNER/REPO/issues with a short title and body. Labels, assignees, milestones, branch changes, repository settings, arbitrary URL calls and other external write actions are not supported.
8. GitHub returns a confirmed new issue number and fixed-host URL on success, which ETERNYX verifies before recording completion. Known access/validation failures count against the attempt budget.
9. If the network response is lost or GitHub returns an ambiguous server response, the result is flagged **uncertain**. This draft is NEVER automatically retried, because GitHub might have created the issue already. Check the repository manually before preparing a new issue. If the Edge Function dies between claim and finish, the in-progress request is reported as uncertain after 90 seconds on owner status lookup.
10. Disconnecting deletes the stored encrypted credential, and rotation increments a version fence and disables the connection. Neither a stale draft nor a revoked key can be used for a new claim. Drafts expire after 24 hours, and decided attempt metadata is eligible for deletion after seven days when the owner revisits the provider. This cleanup is opportunistic, NOT a cron guarantee.

## Limits and costs

- One bound GitHub repository per ETERNYX account.
- **3 issue write attempts per rolling 24 hours**, including failed and uncertain attempts.
- At most **3 pending draft approvals** and **10 accepted drafts per rolling 24 hours**.
- Maximum 120 characters in an issue title and 1,000 UTF-8 bytes in a body; no attachments or files.
- These are request-count budgets, not monetary spending limits or a guarantee that GitHub won't apply its own rate limits. User-controlled API calls and storage can use billable hosting resources.
- Rate-limit invalid or unauthorized traffic at the Edge ingress or WAF; these database quotas only cover accepted authenticated operations.
- This is an authenticated issue-write action, **not** general automation of paid services. No payment, AI/GPU service, unrestricted internet traffic or automatic GitHub posting is enabled.

## Production deployment — not performed by merging

1. Review the source and require GitGuardian, utility tests, application build, public browser acceptance and the isolated PostgreSQL 17 acceptance workflow all green.
2. Apply migration 20261123030000_automation_github_issue_approvals.sql through the approved Supabase migration pipeline.
3. Generate **a fresh independent random 32-byte key** outside any chat or code, hex encode it to 64 characters, and store only as the Supabase Edge Function secret AUTOMATION_GITHUB_WRITE_ENCRYPTION_KEY. Never reuse other automation encryption keys. Store this key securely; loss makes linked credentials and pending drafts unreadable.
4. Deploy automation-github-issues with verify_jwt=true, and publish the updated AutomationCloudPanel UI.
5. In a staging account create a fine-grained PAT with only the chosen test repository and Issues: write (Metadata read is included with fine-grained access). Paste it into ETERNYX. Verify connected but disabled, then explicitly enable.
6. Prepare a harmless draft. Confirm GitHub has no new issue. Review the exact title/body in the owner UI, then explicitly approve a single issue and compare the confirmation to GitHub.
7. Attempt duplicate approval on the same draft. It must fail without a second GitHub POST. Exercise rejection, expired drafts, rotation, cross-account access, and quota exhaustion.
8. Revoke PAT access at GitHub when no longer needed. ETERNYX disconnect deletes only its stored ciphertext; it does **not** revoke the underlying token at GitHub.

## Verification

- node --test tests/automation-github-issues.test.mjs
- npm test and npm run build
- GitHub Actions: Automation Approved GitHub Issues PostgreSQL Acceptance.

No real GitHub issues or production database changes are created by the PR itself. The database acceptance creates only fake fixture users and cryptographic-looking blobs inside an isolated networkless container.
