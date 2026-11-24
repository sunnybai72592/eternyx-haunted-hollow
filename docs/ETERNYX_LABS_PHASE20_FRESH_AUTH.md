# LABS Phase 20 — fresh staging authentication

Phase 19 deployed six reviewed migrations and two JWT-protected functions
to Eternyx Staging on 2026-11-24. The observed mapping is in
docs/examples/labs-staging-deployment-observation.json. Supabase management
migration application generated different version timestamps; never assume
the repository filename versions are the recorded staging versions. This
is historical evidence, not a live inventory or permission to replay.
All three unrelated history rows and seven unrelated tables were preserved.

## One-time operator setup

In project mhodwvypfbxafamkrgsk ONLY, open Edge Functions > Secrets.
If CTF_FLAG_SECRET already exists, preserve it; otherwise generate at least
32 random bytes in a trusted local password manager or terminal, store it
as CTF_FLAG_SECRET, and do not share it in chat, Git or workflow logs.
Do not change production or enable workers.

In Authentication > Users, create two dedicated, confirmed test identities
with distinct strong passwords and no admin privileges. Do not use
personal or production accounts. Do not disable email confirmation for
the project. No test user is created by this PR.

In GitHub Settings > Environments > eternyx-staging, configure protected
reviewers and main-only deployment rules. Set variables
ETERNYX_LABS_STAGING_REF=mhodwvypfbxafamkrgsk and
ETERNYX_LABS_PRODUCTION_REF=wcncuarekaofmfurbtbh.
Set secrets ETERNYX_LABS_STAGING_PUBLIC_KEY (publishable or matching
legacy anon key), ETERNYX_LABS_TEST_EMAIL_A/B and
ETERNYX_LABS_TEST_PASSWORD_A/B. Never use a secret API key.
Run LABS fresh staging account acceptance on main with
I_APPROVE_LABS_STAGING_TEST_SIGNIN. The runner creates two ordinary Auth
sessions using password sign-in; no passwords or access/refresh tokens
are logged or persisted by the runner. The accounts and server sessions
remain until normal expiration or operator revocation. It does not create
accounts, rotate secrets, sign up, or reserve workloads.

The runner rejects other projects, mismatched public keys, reused
credentials and expired or wrong-scope tokens. The existing acceptance
then checks both real identities via Auth, reads CTF/range endpoints,
and tests REST denials. Empty fixtures are reported as not tested.
The old JWT-based acceptance remains supported but is also pinned to the
actual staging project and accepts only browser public credentials.

Deployment alone does not certify functionality. As of the recorded
observation there were zero Auth accounts and no solve/session fixtures.
The connected management tools cannot set secrets or create Auth users.
Live authenticated acceptance and approved synthetic fixture provisioning
remain outstanding. No additional database or production changes.
