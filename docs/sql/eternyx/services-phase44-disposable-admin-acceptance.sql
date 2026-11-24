-- Run only against the isolated Phase44 candidate database. All synthetic
-- accounts, assignments and role changes below are rolled back.
BEGIN;
DO $assert$
DECLARE
  r text;
  privilege text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_users) THEN
    RAISE EXCEPTION 'Phase44 candidate seeded assignments';
  END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF pg_catalog.has_table_privilege(r,'public.admin_users',privilege) THEN
        RAISE EXCEPTION 'Phase44 client assignment table privilege retained';
      END IF;
    END LOOP;
    IF pg_catalog.has_any_column_privilege(r,'public.admin_users','SELECT,INSERT,UPDATE,REFERENCES') THEN
      RAISE EXCEPTION 'Phase44 client column privilege retained';
    END IF;
    IF NOT pg_catalog.has_function_privilege(r,'public.is_admin()','EXECUTE')
       OR pg_catalog.has_function_privilege(r,'public.is_admin()','EXECUTE WITH GRANT OPTION') THEN
      RAISE EXCEPTION 'Phase44 helper execute contract invalid';
    END IF;
  END LOOP;
END
$assert$;
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000044'),
 ('00000000-0000-4000-8000-000000000045');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000044',true);
DO $assert$
BEGIN
  IF public.is_admin() THEN RAISE EXCEPTION 'Phase44 unassigned caller elevated'; END IF;
  BEGIN
    INSERT INTO public.admin_users(user_id) VALUES ('00000000-0000-4000-8000-000000000044');
    RAISE EXCEPTION 'Phase44 authenticated self-assignment succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM user_id FROM public.admin_users;
    RAISE EXCEPTION 'Phase44 authenticated assignment read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$assert$;
RESET ROLE;
INSERT INTO public.admin_users(user_id) VALUES ('00000000-0000-4000-8000-000000000044');
SET LOCAL ROLE authenticated;
DO $assert$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Phase44 approved synthetic admin denied'; END IF;
END
$assert$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000045',true);
DO $assert$
BEGIN
  IF public.is_admin() THEN RAISE EXCEPTION 'Phase44 other caller elevated'; END IF;
END
$assert$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $assert$
BEGIN
  IF public.is_admin() THEN RAISE EXCEPTION 'Phase44 anonymous caller elevated'; END IF;
END
$assert$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $assert$
BEGIN
  BEGIN
    INSERT INTO public.admin_users(user_id) VALUES ('00000000-0000-4000-8000-000000000045');
    RAISE EXCEPTION 'Phase44 service role assignment succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$assert$;
RESET ROLE;
DELETE FROM auth.users WHERE id='00000000-0000-4000-8000-000000000044';
DO $assert$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_users) THEN
    RAISE EXCEPTION 'Phase44 stale deleted-user assignment retained';
  END IF;
END
$assert$;
ROLLBACK;
SELECT 'PASS Phase44 seedless foundation ACLs, caller identity, synthetic approved assignment, and cascade';
