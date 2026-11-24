# LABS Phase 22 — terminal range ownership fixtures

Staging still has zero Auth accounts, zero range sessions and zero verified
solves. Provider is disabled. No live mutation has been made by this PR.

After Phase 20 setup and explicit approval for fixture creation, an operator
can use the SQL script in scripts/sql/labs-staging-terminal-fixtures.sql.
Verify the Dashboard project is Eternyx Staging (mhodwvypfbxafamkrgsk), not
production. The SQL also checks the exact six observed staging migration
history pairs, but history alone is not a cryptographic project identity.

In one SQL editor transaction, start with:
```sql
BEGIN;
SET LOCAL eternyx.labs.fixture_consent='I_APPROVE_TWO_TERMINAL_STAGING_FIXTURES';
SET LOCAL eternyx.labs.fixture_owner_a='<dedicated staging Auth UUID A>';
SET LOCAL eternyx.labs.fixture_owner_b='<dedicated staging Auth UUID B>';
-- paste the reviewed script here
ROLLBACK;
```
Replace UUID placeholders only with the two dedicated, existing staging
test accounts. First dry-run with ROLLBACK. After independently checking
the target and authorizing fixture writes, rerun the exact transaction
with COMMIT instead. Never run on production, never use regular users.
No secrets or account IDs are printed by the script.

The script requires provider and spending limits to be disabled and rejects
unrelated session history for either account. It creates exactly two fixed,
terminal stopped records backdated 72 hours, with no provider reference,
claim, fence, or start. They are synthetic ownership fixtures, not launched
workloads. Reruns reuse them and reject unsafe collisions. No provider
setting, auth account, migration history or other row is modified.
They must not be used to demonstrate actual VM execution.

The networkless PG17 rehearsal exercises the exact script twice in a
rollback-only transaction with stand-in history, owner RLS, disabled
request refusal, and terminal stop refusal. A foreign terminal stop and an
owned terminal stop are both refused; this does NOT establish active
cross-account stop authorization. Live acceptance remains the existing
Phase 20/21 workflows; after the fixture transaction is committed they can
correlate both actual authenticated Edge and REST rows. No live request or
stop probe is added: a provider state change could permit a real reservation.
