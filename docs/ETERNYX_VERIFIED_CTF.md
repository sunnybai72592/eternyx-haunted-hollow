# ETERNYX CTF — server-verified casefile milestone

## What this PR actually ships

- Three original **forensic casefile** challenges: Base64 access log, hexadecimal response header, and reversed build manifest marker.
- An authenticated Supabase Edge Function at `supabase/functions/ctf-verified/index.ts` with the actions `catalog`, `artifact`, `submit`, and `progress`.
- Flags generated as an HMAC-SHA-256 derived token over the verified JWT subject and the challenge ID, using a server-only `CTF_FLAG_SECRET` of at least 32 UTF-8 bytes. Changing the secret invalidates old unsolved flags.
- Exact server-side comparison, atomic per-account rate slots (12 attempts per 15 minutes, minimum 3 seconds between attempts), unique idempotent solve awards, and read-only owner-scoped RLS.
- A new `/labs/verified` account-verified mission page, linked from `/labs` and `/labs/ctf`. It shows only real persisted solves and explicit unavailable states.

**Important:** These are encoded evidence *casefiles*, not exploitable backend web applications. They are a meaningful backend security and progress foundation, not the isolated Kali/Linux/browser cyber range. The pre-existing four intentionally vulnerable *browser-only* CTF rooms remain unchanged and have separate local practice scores.

## Trust boundaries

- Browser passes only `action`, `missionId`, and (for submission) `flag`. Never accept a browser-supplied account ID, score, timestamp, or verified status.
- Supabase Auth verifies the bearer token with `getUser`; the function derives identity from this verified token, not user_metadata or untrusted request bodies.
- `CTF_FLAG_SECRET` is never stored in migration SQL, a public repository file, client config, or the frontend bundle.
- `ctf_verified_solves` grants `authenticated` SELECT with owner RLS; no authenticated INSERT, UPDATE or DELETE. Inserts are made by a trusted Edge Function's secret-key client.
- `ctf_verify_rate` is not readable or writable by authenticated clients. Its atomic rate function is SECURITY INVOKER and only grants EXECUTE to `service_role`.
- Rows are bound to `auth.users` and cascade on account deletion.
- The Edge Function never returns the signing key or correct flag as a separate grader response. Encoded flags do appear in account-specific challenge casefiles by design.
- These challenges are pedagogical and do not prove any external vulnerability. Account-specific flags prevent direct cross-account reuse but do not enforce actual skill acquisition or prevent reading/decoding casefiles automatically. Do not use results for high-stakes certification or prize payouts.

## Deployment checklist (NOT performed by this PR)

1. Confirm the migration is compatible with the target Supabase project; review and apply `supabase/migrations/20261122170000_ctf_verified_missions.sql` using your normal migration process.
2. Generate a strong *server-only* secret with a cryptographically secure random generator and set it via Supabase function secret management as `CTF_FLAG_SECRET`. Do not paste it into chat, frontend `.env`, logs, PRs, or repository files.
3. Deploy the Edge Function `ctf-verified` with `verify_jwt = true` from `supabase/config.toml`.
4. Test with two distinct authenticated accounts. Generate each account's artifact, decode it, verify account A's flag succeeds only for A, ensure it fails for B, and ensure B's progress cannot read A's solves.
5. Confirm duplicate success awards one row, invalid flags cannot grant credit, the cooldown is enforced even under parallel requests, and the schema rejects attempts to insert solves through the browser Data API.
6. Run database security/performance advisors and inspect audit logs. Review failed network/secret/migration behavior; deployment should fail closed, never fabricate points.
7. In the browser, verify `/labs/verified` on desktop/mobile, log out/log in, solve, refresh, and absence of secret leakage in network response apart from the intentionally encoded casefile itself.

Until those steps are completed, the UI must say **Verified missions are not available yet** rather than claim that backend execution succeeded. This PR does not activate paid services or new virtual-machine costs; normal Supabase invocation and database usage limits still apply.

## Next milestone: isolated vulnerable target runtime

Provision an entirely separate, budget-capped cyber-range infrastructure pool for disposable per-user containers/microVMs, with no route into ETERNYX production or Supabase internal resources. Implement quotas, TTL and idle shutdown, separate ingress proxy with per-session authorization, deny-by-default egress, workload isolation, server-side verification of proof, and adversarial security tests. Only then expand to real web/SQLi/API pentesting applications.

## Validation

Run `node --test tests/eternyx-verified-ctf.test.mjs`, `npm test`, and `npm run build`. Migration and function must also be tested against a staging database and Deno Edge Runtime before production deployment; GitHub CI source tests alone are not a deployment certification.
