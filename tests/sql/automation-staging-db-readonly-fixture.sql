-- Synthetic Supabase migration journal for OFFLINE PostgreSQL 17 only.
-- Never execute this fixture against any hosted or linked database.
-- Requires synthetic Auth fixture and the three initial Automation SQL files.
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[]
);

-- Version identifiers are invented fixture data, not verified remote history.
INSERT INTO supabase_migrations.schema_migrations(version,statements) VALUES
  ('20261123030000',ARRAY['synthetic fixture, not an applied real migration']),
  ('20261123130000',ARRAY['synthetic fixture, not an applied real migration']);

-- The actual control/webhook/schedule migrations were applied separately.
DO $fixture$
BEGIN
  IF to_regclass('public.automation_workflows') IS NULL OR
     to_regclass('public.automation_runs') IS NULL OR
     to_regclass('public.automation_webhook_triggers') IS NULL OR
     to_regclass('public.automation_schedules') IS NULL THEN
    RAISE EXCEPTION 'Real Automation SQL prerequisite missing from synthetic fixture';
  END IF;
END $fixture$;
