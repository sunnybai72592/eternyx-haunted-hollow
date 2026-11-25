# Workspace Phase 51 — isolated acceptance fixtures

2026-11-25: explicit operator approval for four disposable staging accounts and fixtures. Target is Eternyx Staging only (mhodwvypfbxafamkrgsk). PR #826 merged.

## Actual live database rehearsal
A rollback-only transaction on the deployed staging database passed nine checks: owner creation, editor invitation and write, viewer invitation/read/write denial, outsider read/write denial, private personal record isolation, consumed invitation replay denial, stale-version rejection, membership revocation, remaining viewer access. Four random synthetic non-login Auth FK identities and SQL role claims were used. No real Auth session, simultaneous requests, WebSocket or file bytes were tested. Post-rollback counts of Workspace teams, members, tasks, events, projects, personal tasks, items and private objects were zero. Sequences may have advanced; no persistent test rows or existing workload modifications were intended.

## Real account provisioning runner
The available remote connector exposes SQL and catalog APIs, not Auth Admin creation or authenticated HTTP/Storage execution. Do not use SQL password/hash insertion or bypass Auth. Run this server-side script on a trusted local machine with Node 22 and the repository dependencies installed. Obtain the staging-only secret/service-role and publishable keys in the Supabase Dashboard. Never paste them into chat, Git or frontend environment files.

Set these environment variables privately:
- WORKSPACE_FIXTURE_CONFIRM=PROVISION_FOUR_DISPOSABLE_WORKSPACE_STAGING_ACCOUNTS
- WORKSPACE_FIXTURE_PROJECT_REF=mhodwvypfbxafamkrgsk
- WORKSPACE_FIXTURE_ADMIN_KEY (staging secret/service role only)
- WORKSPACE_FIXTURE_PUBLISHABLE_KEY (staging publishable or legacy anon)
- WORKSPACE_FIXTURE_OUTPUT (absolute new file path outside repository, e.g. /home/operator/private/workspace-fixtures.env; parent must already exist)

Run `node scripts/workspace-staging-provision-fixtures.mjs --config-check`, then `npm run workspace:staging:fixtures`. The protected exclusive local receipt records generated passwords and each created fixture; the admin key is never written. On partial failure inspect that receipt before retrying, do not blindly create duplicates. On Windows restrict the receipt's ACL to your account; POSIX mode 0600 is not a Windows ACL. Accounts use reserved example.com addresses (no email delivery or recovery proof); no existing users are touched.

After success, use the receipt as the local environment file with Node 22, e.g. `node --env-file=/absolute/path/workspace-fixtures.env scripts/workspace-team-staging-acceptance.mjs --run`. Then run the write-role, storage, realtime, and revocation scripts in the same way, with revocation last. The realtime script needs a coordinated owner edit after ARMED. Revocation and write drills retain synthetic audit events. Do not run against production. Browser, email recovery, concurrent/disconnected Realtime and final migration-provenance approval remain separate gates. No production or paid infrastructure changes.
