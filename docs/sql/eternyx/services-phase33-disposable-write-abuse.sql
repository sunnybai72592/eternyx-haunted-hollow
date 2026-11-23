-- ETERNYX Services Phase 33: actual write-path abuse tests against the
-- full 13-file Services schema in disposable, network-isolated PG17 ONLY.
-- Never run in Supabase, staging, production, or a shared database.
-- These actors and request IDs are synthetic; no real accounts or records.
-- The entire fixture is rolled back even when assertions pass.
BEGIN;
SET LOCAL statement_timeout = '15000ms';

INSERT INTO auth.users(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.admin_users(user_id)
 VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO public.service_requests
(id,user_id,service_key,title,description,contact_email)
VALUES
 ('33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111','security-review',
  'Disposable request A', 'Synthetic request description long enough for the Services schema.',
  'owner-a@invalid.example'),
 ('44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222','security-review',
  'Disposable request B', 'Synthetic request description long enough for the Services schema.',
  'owner-b@invalid.example');

-- The real Supabase authenticated SQL role, paired with a synthetic
-- JWT-subject GUC, must pass legitimate owner writes and reject abuse.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',true);

-- Genuine owner insertion: let DB assign ID, server time and pending status.
INSERT INTO public.service_brief_amendments
(request_id,author_id,category,summary,details)
VALUES (
 '33333333-3333-4333-8333-333333333333',
 '11111111-1111-4111-8111-111111111111',
 'requirements','Synthetic revision Alpha',
 'Original synthetic amendment details for rate and duplicate testing.'
);

-- Semantic duplicate must fail even after changing case or whitespace.
-- The blocked marker is set ONLY by an authentic SQLSTATE + message.
DO $duplicate$
DECLARE blocked boolean := false; message text;
BEGIN
  BEGIN
    INSERT INTO public.service_brief_amendments
    (request_id,author_id,category,summary,details)
    VALUES (
     '33333333-3333-4333-8333-333333333333',
     '11111111-1111-4111-8111-111111111111',
     'requirements','  SYNTHETIC REVISION ALPHA  ',
     ' original synthetic amendment details for rate and duplicate testing. '
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
    IF message = 'This brief amendment was already submitted recently.' THEN
      blocked := true;
    ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'duplicate normalization guard failed';
  END IF;
END $duplicate$;

-- An owner must neither impersonate another author nor insert into another
-- customer's request even with an otherwise valid body.
DO $identity$
DECLARE blocked boolean; counter integer;
BEGIN
  blocked := false;
  BEGIN
    INSERT INTO public.service_brief_amendments
    (request_id,author_id,category,summary,details)
    VALUES (
     '33333333-3333-4333-8333-333333333333',
     '22222222-2222-4222-8222-222222222222',
     'requirements','Synthetic spoofed author',
     'This synthetic request forges a different signed-in owner identity.'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'forged amendment author succeeded'; END IF;

  blocked := false;
  BEGIN
    INSERT INTO public.service_brief_amendments
    (request_id,author_id,category,summary,details)
    VALUES (
     '44444444-4444-4444-8444-444444444444',
     '11111111-1111-4111-8111-111111111111',
     'requirements','Synthetic cross-account insert',
     'This synthetic insert targets another customer request and must fail.'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'cross-owner amendment insert succeeded'; END IF;

  -- Assert neither rejected write created any extra rows.
  SELECT count(*) INTO counter FROM public.service_brief_amendments;
  IF counter <> 1 THEN RAISE EXCEPTION 'rejected insert changed persisted state'; END IF;
END $identity$;

-- A client's column-level GRANT must reject forged server timestamps,
-- post-hoc content rewrites and attempts to DELETE immutable amendments.
DO $immutability$
DECLARE blocked boolean;
BEGIN
  blocked := false;
  BEGIN
    INSERT INTO public.service_brief_amendments
    (request_id,author_id,category,summary,details,created_at)
    VALUES (
     '33333333-3333-4333-8333-333333333333',
     '11111111-1111-4111-8111-111111111111',
     'requirements','Forged server timestamp',
     'Attempt to inject a fake synthetic creation timestamp into the record.',
     '2020-01-01T00:00:00Z'
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'client timestamp forgery allowed'; END IF;

  blocked := false;
  BEGIN
    UPDATE public.service_brief_amendments SET summary='Changed by requester'
    WHERE request_id='33333333-3333-4333-8333-333333333333';
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'owner edited immutable summary'; END IF;

  blocked := false;
  BEGIN
    DELETE FROM public.service_brief_amendments
    WHERE request_id='33333333-3333-4333-8333-333333333333';
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'owner deleted immutable amendment'; END IF;
END $immutability$;

-- A non-admin cannot acknowledge even their own amendment. An RLS-filtered
-- zero-row UPDATE is the correct outcome (NOT an exception requirement).
DO $owner_review$
DECLARE changed integer;
BEGIN
  UPDATE public.service_brief_amendments SET status='reviewed'
  WHERE request_id='33333333-3333-4333-8333-333333333333';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'owner self-reviewed an amendment'; END IF;
END $owner_review$;

-- Three additional DIFFERENT owner amendments are legitimate. The fifth
-- within ten minutes must fail, without writing a fifth row.
INSERT INTO public.service_brief_amendments
(request_id,author_id,category,summary,details)
VALUES
 ('33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'scope','Synthetic revision Bravo',
  'Independent synthetic amendment two for the owner-specific rate budget.'),
 ('33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'constraints','Synthetic revision Charlie',
  'Independent synthetic amendment three for the owner-specific rate budget.'),
 ('33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'timeframe','Synthetic revision Delta',
  'Independent synthetic amendment four for the owner-specific rate budget.');

DO $burst$
DECLARE blocked boolean := false; message text;
BEGIN
  BEGIN
    INSERT INTO public.service_brief_amendments
    (request_id,author_id,category,summary,details)
    VALUES (
     '33333333-3333-4333-8333-333333333333',
     '11111111-1111-4111-8111-111111111111',
     'requirements','Synthetic revision Echo',
     'A fifth distinct amendment is deliberately rejected by the actual burst guard.'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
    IF message = 'Too many brief amendments. Try again in ten minutes.' THEN
      blocked := true;
    ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'fifth owner amendment bypassed burst limit'; END IF;
  IF (SELECT count(*) FROM public.service_brief_amendments) <> 4 THEN
    RAISE EXCEPTION 'burst or rejected attempts changed row count';
  END IF;
  IF (SELECT count(*) FROM public.service_request_journal
     WHERE request_id='33333333-3333-4333-8333-333333333333'
       AND event_kind='amendment_submitted') <> 4 THEN
    RAISE EXCEPTION 'journal event count differs from committed amendments';
  END IF;
END $burst$;
RESET ROLE;

-- Burst limit is per owner and per request, not a global service throttle.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',true);
INSERT INTO public.service_brief_amendments
(request_id,author_id,category,summary,details)
VALUES (
 '44444444-4444-4444-8444-444444444444',
 '22222222-2222-4222-8222-222222222222',
 'scope','Synthetic owner B revision',
 'This completely independent owner amendment must still be accepted.'
);
DO $owner_b$
BEGIN
  IF (SELECT count(*) FROM public.service_brief_amendments) <> 1 OR
     (SELECT count(*) FROM public.service_request_journal
       WHERE event_kind='amendment_submitted') <> 1 OR
     (SELECT count(*) FROM public.service_request_journal
       WHERE request_id='33333333-3333-4333-8333-333333333333') <> 0 THEN
    RAISE EXCEPTION 'owner-specific burst/journal isolation failed';
  END IF;
END $owner_b$;
RESET ROLE;

-- Admin may acknowledge, not accept, deliver, reopen or rewrite a brief.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $admin$
DECLARE original_id uuid; review_time timestamptz; blocked boolean := false; changed integer;
BEGIN
  SELECT id INTO original_id FROM public.service_brief_amendments
    WHERE request_id='33333333-3333-4333-8333-333333333333'
      AND summary='Synthetic revision Alpha';
  IF original_id IS NULL THEN RAISE EXCEPTION 'first amendment missing'; END IF;

  UPDATE public.service_brief_amendments SET status='reviewed'
    WHERE id=original_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'admin could not review pending amendment'; END IF;
  SELECT reviewed_at INTO review_time FROM public.service_brief_amendments
    WHERE id=original_id AND status='reviewed'
      AND reviewed_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  IF review_time IS NULL THEN RAISE EXCEPTION 'reviewer/time not stamped by server'; END IF;

  -- Repeating same-status update must not silently mint a new review event.
  UPDATE public.service_brief_amendments SET status='reviewed' WHERE id=original_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.service_brief_amendments
     WHERE id=original_id AND reviewed_at=review_time
  ) THEN RAISE EXCEPTION 'idempotent admin review changed timestamp'; END IF;

  BEGIN
    UPDATE public.service_brief_amendments SET status='pending' WHERE id=original_id;
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'admin reopened reviewed amendment'; END IF;

  IF (SELECT count(*) FROM public.service_request_journal
    WHERE request_id='33333333-3333-4333-8333-333333333333'
      AND event_kind='amendment_reviewed') <> 1 OR
     (SELECT count(*) FROM public.service_request_journal
       WHERE request_id='33333333-3333-4333-8333-333333333333'
         AND event_kind='amendment_submitted') <> 4 OR
     (SELECT count(*) FROM public.service_brief_amendments
       WHERE request_id='33333333-3333-4333-8333-333333333333') <> 4 THEN
    RAISE EXCEPTION 'admin review created duplicate or lost source journal event';
  END IF;
END $admin$;

-- Admin cannot edit the original customer-authored content, even with an
-- admin membership record. Test actual column-level SQL permissions.
DO $admin_immutable$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.service_brief_amendments SET details='Forbidden rewrite'
     WHERE request_id='33333333-3333-4333-8333-333333333333';
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'admin modified immutable customer details'; END IF;
END $admin_immutable$;
RESET ROLE;

-- Not even anonymous clients may view private request history.
SET LOCAL ROLE anon;
DO $anon$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.service_brief_amendments LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'anonymous amendment read accepted'; END IF;
END $anon$;
RESET ROLE;

-- No production/billing/status changes or durable synthetic records.
ROLLBACK;
DO $cleanup$
BEGIN
  IF EXISTS (SELECT 1 FROM public.service_requests
     WHERE id IN ('33333333-3333-4333-8333-333333333333',
                  '44444444-4444-4444-8444-444444444444')) OR
     EXISTS (SELECT 1 FROM auth.users
     WHERE id IN ('11111111-1111-4111-8111-111111111111',
                  '22222222-2222-4222-8222-222222222222',
                  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) THEN
    RAISE EXCEPTION 'disposable Phase 33 fixture did not roll back';
  END IF;
END $cleanup$;
SELECT 'PASS: isolated Services Phase 33 write guards, burst, identity, immutable review and journal lineage' AS verdict;
