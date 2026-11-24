# Wave 21 — real staging session fence deployment

## Observed live staging deployment, 2026-11-24
PR #738 was merged and both CI workflows succeeded. The separate healthy Eternyx Staging project (mhodwvypfbxafamkrgsk) was preflighted: seven RLS-protected security tables, private evidence bucket, no existing session helper or fence policies, zero Auth users. Applied only the exact reviewed SQL from merge 47c2de997e30f6e70a6237a126feb945a5fbacea, source scripts/sql/staged-security-session-fence.sql, Git blob 6b975cd4428c70d8f70c4448c5edab95f52f46f2.

Recorded migration: 20261124130236 cybersecurity_wave20_session_fence_staging. Its single recorded statement matched the reviewed source byte-for-byte. Live PostgreSQL catalog confirms seven restrictive ALL policies and one bucket-scoped restrictive ALL policy, with USING and WITH CHECK, authenticated role only. The stable definer helper has empty search_path, postgres ownership, authenticated execution and schema usage, no anon execution or schema usage, and denies absent JWT claims. Security Advisor returned six informational no-policy notices for unrelated LABS tables, no findings for the cybersecurity session fence. Do not grant LABS access to silence informational notices.

Production was not contacted. Migration history uses staging-specific versions; do not blindly run db push, repair or reset. The private helper schema must remain outside Data API exposure.

## Actual HTTP acceptance: still blocked
Zero staging Auth users at preflight. Create two distinct confirmed disposable email/password users via supported staging Auth administration. Never add rows directly to auth.users or send passwords to chat or GitHub. Use Wave 18's guarded environment requirements plus ETERNYX_W21_ACK=I_APPROVE_STAGING_LIVE_SESSION_FENCE_TEST in a private terminal. No service key.

    node --test tests/security-wave21-live-fence.test.mjs
    node scripts/security-wave21-live-fence.mjs --check-config
    node scripts/security-wave21-live-fence.mjs --run > wave21-observation.json

The final command writes new synthetic engagements and registered evidence, retains them for inspection, and logs out only the newly created disposable A session. It verifies positive A/B owner reads, cross-account isolation, private bytes, local logout, refresh-token rejection, denied reads on all seven relations with the old still-unexpired JWT, denied asset insert/update, denied authenticated Storage download and new signing, continued B reads/writes and renewed A session access. Token expiry is checked before and after denial; an expired-token 401 is not accepted as proof. No token, path or account ID is emitted in the report. Stop on failure; review retained fixtures instead of repeatedly running.

This is not a guarantee that already-issued signed bearer URLs or previously downloaded bytes are revoked. Direct signing by active authorized users remains possible. Browser authenticated delivery was changed in Wave 20, but browser end-to-end acceptance is still outstanding. Strict mediated delivery and backup restore remain separate release gates. Reports are unsigned, production remains blocked, and offline tests do not replace real staging HTTP evidence.
