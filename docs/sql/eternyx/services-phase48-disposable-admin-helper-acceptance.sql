-- Disposable PG17 only. Phase47 fixtures exist; never run on live staging.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $check$
BEGIN
 IF public.is_admin() OR eternyx_admin_private.is_current_user_admin() OR (SELECT count(*) FROM public.service_requests)<>1 THEN
   RAISE EXCEPTION 'Phase48 nonadmin boundary failed';
 END IF;
 BEGIN
   PERFORM 1 FROM public.admin_users LIMIT 1;
   RAISE EXCEPTION 'Phase48 direct assignment read permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   INSERT INTO public.admin_users(user_id) VALUES ('11111111-1111-4111-8111-111111111111');
   RAISE EXCEPTION 'Phase48 self-assignment permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END
$check$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $check$
BEGIN
 IF NOT public.is_admin() OR NOT eternyx_admin_private.is_current_user_admin() OR (SELECT count(*) FROM public.service_requests)<>2 THEN
   RAISE EXCEPTION 'Phase48 approved admin access failed';
 END IF;
END
$check$;
RESET ROLE;
DELETE FROM public.admin_users WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET LOCAL ROLE authenticated;
DO $check$
BEGIN
 IF public.is_admin() OR eternyx_admin_private.is_current_user_admin() OR (SELECT count(*) FROM public.service_requests)<>0 THEN
   RAISE EXCEPTION 'Phase48 revoked admin retained access';
 END IF;
END
$check$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $check$
BEGIN
 IF public.is_admin() OR eternyx_admin_private.is_current_user_admin() THEN
   RAISE EXCEPTION 'Phase48 anonymous became admin';
 END IF;
END
$check$;
RESET ROLE;
SET LOCAL ROLE services_staging_auditor;
DO $check$
BEGIN
 BEGIN
   PERFORM public.is_admin();
   RAISE EXCEPTION 'Phase48 auditor public helper execute permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM eternyx_admin_private.is_current_user_admin();
   RAISE EXCEPTION 'Phase48 auditor private helper execute permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END
$check$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS Phase48 actual helper behavior, revocation, assignment and auditor restrictions';
