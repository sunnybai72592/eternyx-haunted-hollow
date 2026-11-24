# Cybersecurity Universe Wave 18 — real staging Auth/API acceptance

## Observed before this PR
Wave 17 PR #700 is merged. The separate Eternyx Staging project is healthy and the seven security tables exist with RLS enabled. A fresh read-only count confirmed **zero Auth users**. The execution environment could not resolve the staging API host, so no real JWT, Storage or HTTP mutation acceptance was performed here. Production was not contacted.

## Operator setup
Create two separate disposable email/password users using the **Eternyx Staging** Auth dashboard only (Authentication → Users → Add user). Confirm them using the supported Auth workflow; use distinct randomly generated strong passwords. Do not add production users or real customer data. Use a private terminal on a network that can reach the staging API; use ephemeral environment variables from a secure password manager, not shell history, source, PR comments or public logs. Never use a service-role/secret key.

Required environment variables:
- ETERNYX_STAGING_URL=https://mhodwvypfbxafamkrgsk.supabase.co (no trailing slash)
- ETERNYX_STAGING_PROJECT_REF=mhodwvypfbxafamkrgsk
- ETERNYX_PRODUCTION_PROJECT_REF=wcncuarekaofmfurbtbh
- ETERNYX_STAGING_ONLY=yes
- ETERNYX_W18_ACK=I_APPROVE_PERSISTENT_SYNTHETIC_STAGING_FIXTURES
- ETERNYX_STAGING_PUBLIC_KEY (staging publishable or legacy anon key)
- ETERNYX_W18_EMAIL_A and ETERNYX_W18_PASSWORD_A
- ETERNYX_W18_EMAIL_B and ETERNYX_W18_PASSWORD_B

From the reviewed checkout, with Node 22+:
    node --test tests/security-wave18-real-auth.test.mjs
    node scripts/security-wave18-real-auth.mjs --check-config
    node scripts/security-wave18-real-auth.mjs --run > wave18-observation.json

The last command actually signs in and writes only synthetic fixtures into the pinned staging project, using ordinary user JWTs and the deployed Data API and Storage endpoints. The previous two commands are offline. There is no automatic account provisioning, no network scanning and no use of privileged database roles. No production SQL, migrations or deployments are performed.

## Acceptance
- Two password sign-ins and independently retrieved distinct Auth user identities.
- Separate engagement, scoped asset, finding, uploaded private text object, evidence metadata and finding/evidence link per account.
- Positive owner and negative opposite-owner/anonymous reads for all seven tables before and after revocation.
- Exact own-object contents and denied foreign/anonymous authenticated Storage reads in both phases.
- Cross-owner write rejection; positive authorized write; revocation of A's synthetic engagement through ordinary authenticated PATCH; denial of new assets and existing asset/finding updates; B still able to write.
- A real actor-scoped revocation audit event; post-revocation historical owner reads remain permitted by design.

The script stops nonzero on the first failed or inconclusive check; no successful receipt is emitted on failure. Generic errors contain no response bodies or credentials. Do not count the offline tests as a live pass. Reports are unsigned observations, not independent attestations.

## Deliberate retention and boundaries
Each run creates new synthetic fixtures and **retains them**, including partial fixtures on failure, because evidence/audit rows are intentionally append-only. Do not loop the runner. Cleanup must be separately reviewed by a staging administrator using supported Storage object deletion before database cleanup; never delete storage metadata directly in SQL. Do not test against real personal or customer data. Revocation is engagement attestation revocation, not account/session invalidation. Historical evidence access is not revoked. Signed URLs, public object endpoint access, session revocation, UI end-to-end, disaster recovery and independent approval are still separate gates. Production remains blocked even after a successful observation.
