# Phase 55 — protected HTTP assessment rehearsal candidate
PR #845 merged at 433477b9d85557f72859e6c5daf93b53c3f5749c; associated CI succeeded.

The candidate lives under scripts/sql, NOT supabase/migrations, and is
not an authorized deployment. Rehearse against a networkless disposable
PG17 with the exact baseline session/access/privacy migrations. This is
not full current migration parity or real Supabase authentication.

Three RLS-enabled, client-inaccessible tables; disabled policy with
reviewed image pin, one privileged observation per session and unique
transcript digest, one immutable assessment result per session.
Service-role-only invoker functions record fixed observations, validate
six bounded answer fields, lock session/provider/policy/grant state,
check expiry with actual wall clock, verify live access grant, calculate
score using stored facts, reject duplicate submissions, and expose only
owner-scoped result metadata. Browser never supplies scores or evidence.
No raw answers stored. Test fixtures are rolled back.

Important: this is a fixed knowledge check (answers are not secret).
A trusted producer must separately bind the actual approved guest and
per-session transcript; a hash or privileged RPC alone is not independent
proof. The policy pin is global, not an existing provider instance attestation.
There is no worker evidence producer, JWT endpoint, browser grading UI,
production migration, account score/certification, or learner activation.
Direct service-role SQL privileges remain trusted; this is not protection
against a compromised service role. Existing provider must not be enabled
as part of this rehearsal. Actual concurrent races, current full migration
composition, real JWT integration and dedicated runtime remain release gates.
CI job executes SQL with simulated identities and observations, no live
KVM or Supabase project changes. Next: reconcile full migrations in staging
rehearsal and implement trusted evidence admission and authenticated endpoint
only after explicit approval.
