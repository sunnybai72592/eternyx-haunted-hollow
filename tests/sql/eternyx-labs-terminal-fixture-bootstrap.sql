-- Ephemeral CI stand-in for the actual recorded staging history.
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text NOT NULL);
INSERT INTO supabase_migrations.schema_migrations VALUES
 ('20261124121732','labs_20261122170000_ctf_verified_missions'),
 ('20261124121741','labs_20261122180000_ctf_range_session_control'),
 ('20261124121744','labs_20261122190000_ctf_range_access_grants'),
 ('20261124121747','labs_20261122200000_ctf_worker_fencing_budget'),
 ('20261124121749','labs_20261123041000_ctf_hosted_spend_reservations'),
 ('20261124121752','labs_20261124123000_ctf_range_session_column_privacy');
SET LOCAL eternyx.labs.fixture_consent='I_APPROVE_TWO_TERMINAL_STAGING_FIXTURES';
SET LOCAL eternyx.labs.fixture_owner_a='11111111-1111-4111-8111-111111111111';
SET LOCAL eternyx.labs.fixture_owner_b='22222222-2222-4222-8222-222222222222';
