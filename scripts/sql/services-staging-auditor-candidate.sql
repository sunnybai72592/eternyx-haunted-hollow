-- REVIEW CANDIDATE ONLY: independently approved staging operator setup.
-- Outside automatic migrations. Run only on verified Eternyx Staging.
-- Deliberately NOLOGIN until an operator assigns a unique password privately.
-- A second application fails rather than altering an existing auditor role.
CREATE ROLE services_staging_auditor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE postgres TO services_staging_auditor;
GRANT USAGE ON SCHEMA supabase_migrations TO services_staging_auditor;
GRANT SELECT (version, name) ON supabase_migrations.schema_migrations TO services_staging_auditor;
ALTER ROLE services_staging_auditor SET default_transaction_read_only = on;
ALTER ROLE services_staging_auditor SET statement_timeout = '12s';
-- No business tables, Auth rows, migration SQL statements, role membership,
-- definer helper execution, or account changes. Verify effective privileges
-- before separately activating LOGIN and setting a private password.
