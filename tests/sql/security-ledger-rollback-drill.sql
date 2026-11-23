-- Cybersecurity Universe Wave 11: disposable PostgreSQL only.
-- This drill deliberately changes RLS inside a transaction then rolls back.
-- DO NOT run in any real staging or production project.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE public.security_case_assets DISABLE ROW LEVEL SECURITY;
DO $check$
BEGIN
  IF EXISTS(
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='security_case_assets' AND c.relrowsecurity
  ) THEN RAISE EXCEPTION 'Drill did not actually remove RLS within the transaction'; END IF;
END;
$check$;
ROLLBACK;
DO $check$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='security_case_assets' AND c.relrowsecurity
  ) THEN RAISE EXCEPTION 'RLS was not restored after rollback'; END IF;
END;
$check$;
