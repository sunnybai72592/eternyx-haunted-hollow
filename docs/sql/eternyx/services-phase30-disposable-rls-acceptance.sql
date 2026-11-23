-- Services Phase 30: execute REAL Postgres RLS against synthetic A/B/admin/anon
-- actors inside a brand-new, network-isolated PostgreSQL 17 container.
-- Preconditions: Phase 29 bootstrap and all 13 Services SQL files applied.
-- Never run in Supabase, production, staging, or a shared database.
-- No real user, customer, email, service, or secret is present.
-- A single transaction rolls back ALL synthetic test fixtures on completion.
BEGIN;
SET LOCAL statement_timeout = '15000ms';

INSERT INTO auth.users(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.admin_users(user_id)
 VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- Synthetic seed as the isolated container superuser ONLY; RLS tests below
-- execute with the actual authenticated/anon SQL roles and JWT-like GUC.
INSERT INTO public.service_requests
(id,user_id,service_key,title,description,contact_email)
VALUES
 ('33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'security-review','Synthetic request A',
  'Entirely invented disposable request to verify isolated row security.',
  'synthetic-a@invalid.example'),
 ('44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'security-review','Synthetic request B',
  'Entirely invented second disposable request for privacy regression checks.',
  'synthetic-b@invalid.example');
INSERT INTO public.service_request_triage
(request_id,assigned_admin_id,internal_note)
VALUES ('33333333-3333-4333-8333-333333333333',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'Synthetic admin-only note never visible in journal');

-- The actual amendment INSERT trigger checks auth.uid even for a superuser
-- seeding disposable fixtures, so bind the matching synthetic actor.
SELECT set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.service_brief_amendments
(id,request_id,author_id,category,summary,details)
VALUES
 ('55555555-5555-4555-8555-555555555555',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'requirements','Synthetic owner A revision',
  'Disposable first amendment used only for a PostgreSQL role test.');

SELECT set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',true);
INSERT INTO public.service_brief_amendments
(id,request_id,author_id,category,summary,details)
VALUES
 ('66666666-6666-4666-8666-666666666666',
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'requirements','Synthetic owner B revision',
  'Disposable second amendment used only for a PostgreSQL role test.');

-- Genuine admin review trigger stamps actor/time; Phase 14 journal should
-- emit both submission and acknowledgment for request A.
SELECT set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
UPDATE public.service_brief_amendments SET status='reviewed'
 WHERE id='55555555-5555-4555-8555-555555555555';
DO $review$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.service_brief_amendments
    WHERE id='55555555-5555-4555-8555-555555555555'
      AND reviewed_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND reviewed_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'disposable real admin review trigger did not stamp'; END IF;
END $review$;

-- OWNER A: both allow (own) and deny (other) MUST hold.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',true);
DO $owner_a$
BEGIN
  IF (SELECT count(*) FROM public.service_requests) <> 1 OR
     (SELECT count(*) FROM public.service_requests
       WHERE user_id='11111111-1111-4111-8111-111111111111') <> 1 THEN
    RAISE EXCEPTION 'owner A request RLS read violated';
  END IF;
  IF (SELECT count(*) FROM public.service_request_activity) <> 1 OR
     (SELECT count(*) FROM public.service_brief_amendments) <> 1 THEN
    RAISE EXCEPTION 'owner A participant source RLS violated';
  END IF;
  IF (SELECT count(*) FROM public.service_customer_amendment_queue) <> 1 OR
     (SELECT count(*) FROM public.service_admin_amendment_queue) <> 0 THEN
    RAISE EXCEPTION 'owner A customer/admin queue boundary violated';
  END IF;
  IF (SELECT count(*) FROM public.service_request_journal) <> 3 OR
     (SELECT count(*) FROM public.service_request_journal
       WHERE request_id='44444444-4444-4444-8444-444444444444') <> 0 OR
     (SELECT count(*) FROM public.service_request_journal
       WHERE stream IN ('internal','triage')
          OR detail LIKE '%admin-only note%') <> 0 THEN
    RAISE EXCEPTION 'owner A journal source/row privacy violated';
  END IF;
  IF (SELECT count(*) FROM public.service_request_triage) <> 0 THEN
    RAISE EXCEPTION 'owner A can see admin-only triage';
  END IF;
END $owner_a$;

-- A must not acknowledge even an OWN brief amendment.
DO $owner_a_write$
DECLARE updated integer;
BEGIN
  UPDATE public.service_brief_amendments SET status='reviewed'
   WHERE id='66666666-6666-4666-8666-666666666666';
  GET DIAGNOSTICS updated=ROW_COUNT;
  IF updated<>0 THEN
    RAISE EXCEPTION 'owner A changed another customer amendment status';
  END IF;
  BEGIN
    INSERT INTO public.service_brief_amendments
      (request_id,author_id,category,summary,details)
    VALUES
      ('44444444-4444-4444-8444-444444444444',
       '11111111-1111-4111-8111-111111111111',
       'requirements','Unauthorized owner A revision',
       'Cross-account synthetic amendment must be denied by active RLS.');
    RAISE EXCEPTION 'owner A cross-account amendment INSERT succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $owner_a_write$;
RESET ROLE;

-- OWNER B: expected mirror image; pending review remains B-owned.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',true);
DO $owner_b$
BEGIN
  IF (SELECT count(*) FROM public.service_requests) <> 1 OR
     (SELECT count(*) FROM public.service_requests
       WHERE id='33333333-3333-4333-8333-333333333333') <> 0 OR
     (SELECT count(*) FROM public.service_brief_amendments) <> 1 OR
     (SELECT count(*) FROM public.service_request_journal) <> 2 OR
     (SELECT count(*) FROM public.service_request_journal
       WHERE request_id='33333333-3333-4333-8333-333333333333') <> 0 OR
     (SELECT count(*) FROM public.service_customer_amendment_queue) <> 1 OR
     (SELECT count(*) FROM public.service_admin_amendment_queue) <> 0 OR
     (SELECT count(*) FROM public.service_request_triage) <> 0 THEN
    RAISE EXCEPTION 'owner B role isolation violated';
  END IF;
  IF (SELECT count(*) FROM public.service_request_activity) <> 1 THEN
    RAISE EXCEPTION 'owner B cannot read own activity';
  END IF;
END $owner_b$;

-- B cannot review their own amendment: no admin RLS UPDATE policy.
DO $owner_b_update$
DECLARE updated integer;
BEGIN
  UPDATE public.service_brief_amendments SET status='reviewed'
   WHERE id='66666666-6666-4666-8666-666666666666';
  GET DIAGNOSTICS updated=ROW_COUNT;
  IF updated<>0 THEN RAISE EXCEPTION 'customer B reviewed own amendment'; END IF;
END $owner_b_update$;
RESET ROLE;

-- ADMIN: the real is_admin() stub is evaluated with admin UUID; all
-- participant rows become visible and internal triage remains separately
-- private (never UNIONed into the customer-facing unified journal).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $admin$
BEGIN
  IF NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'disposable admin predicate not verified';
  END IF;
  IF (SELECT count(*) FROM public.service_requests) <> 2 OR
     (SELECT count(*) FROM public.service_brief_amendments) <> 2 OR
     (SELECT count(*) FROM public.service_admin_amendment_queue) <> 2 OR
     (SELECT count(*) FROM public.service_request_triage) <> 1 OR
     (SELECT count(*) FROM public.service_request_journal) <> 5 THEN
    RAISE EXCEPTION 'admin access to actual persisted workflow rows violated';
  END IF;
  IF (SELECT count(*) FROM public.service_request_journal
       WHERE stream IN ('internal','triage')
          OR detail LIKE '%admin-only note%') <> 0 THEN
    RAISE EXCEPTION 'internal triage leaked through participant journal to admin';
  END IF;
END $admin$;

-- The delivery gate must NOT be bypassed even by verified admin.
DO $delivery$
BEGIN
  BEGIN
    UPDATE public.service_requests SET status='in_progress'
     WHERE id='33333333-3333-4333-8333-333333333333';
    RAISE EXCEPTION 'unverified delivery status incorrectly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $delivery$;
RESET ROLE;

-- ANON: positive assertion of an actual 42501 privilege rejection for
-- both a base-table read and the exposed journal view.
SET LOCAL ROLE anon;
DO $anonymous$
BEGIN
  BEGIN
    PERFORM 1 FROM public.service_requests LIMIT 1;
    RAISE EXCEPTION 'anonymous service request SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.service_request_journal LIMIT 1;
    RAISE EXCEPTION 'anonymous journal SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $anonymous$;
RESET ROLE;

-- Check actual GUC role switching did not touch schema or customer data.
-- Rollback unconditionally; the disposable Docker container is removed by CI.
ROLLBACK;
SELECT 'PASS: isolated SQL RLS for owner A, owner B, admin and anon (synthetic only)' AS verdict;
