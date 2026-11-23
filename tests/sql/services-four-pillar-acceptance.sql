-- Real Services acceptance in the SAME disposable PG17 database used by
-- Automation, Docker and Workspace. No production account or remote access.
-- Requires services-four-pillar-bootstrap.sql and all Services source migrations.
\set ON_ERROR_STOP on

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);

INSERT INTO public.service_requests(
  user_id,service_key,title,description,contact_email
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'workflow-automation','Owner One Service Request',
  'A synthetic, private workflow automation request for offline database testing.',
  'alice@example.invalid'
);

DO $a$
DECLARE n integer;
BEGIN
  IF (SELECT public.is_admin()) THEN RAISE EXCEPTION 'Owner A is unexpectedly admin'; END IF;
  SELECT count(*) INTO n FROM public.service_requests;
  IF n <> 1 THEN RAISE EXCEPTION 'Owner A cannot read own request: %',n; END IF;
  UPDATE public.service_requests SET status='completed';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Owner A changed service delivery status'; END IF;
END $a$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);

INSERT INTO public.service_requests(
  user_id,service_key,title,description,contact_email
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'security-review','Owner Two Security Request',
  'A distinct synthetic security review request for isolation checks in the offline database.',
  'bob@example.invalid'
);

DO $b$
DECLARE n integer;
BEGIN
  IF (SELECT public.is_admin()) THEN RAISE EXCEPTION 'Owner B is unexpectedly admin'; END IF;
  SELECT count(*) INTO n FROM public.service_requests;
  IF n<>1 THEN RAISE EXCEPTION 'Owner B observed owner A request: %',n; END IF;
  IF (SELECT count(*) FROM public.service_requests
      WHERE user_id='11111111-1111-4111-8111-111111111111')<>0
    THEN RAISE EXCEPTION 'Owner B can enumerate owner A request'; END IF;
  IF (SELECT count(*) FROM public.service_request_activity a
      JOIN public.service_requests r ON r.id=a.request_id
      WHERE r.user_id='11111111-1111-4111-8111-111111111111')<>0
    THEN RAISE EXCEPTION 'Owner B accessed owner A activity'; END IF;
END $b$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',false);

DO $admin$
BEGIN
  IF NOT (SELECT public.is_admin()) THEN RAISE EXCEPTION 'Synthetic admin not recognized'; END IF;
  IF (SELECT count(*) FROM public.service_requests)<>2
    THEN RAISE EXCEPTION 'Synthetic admin cannot inspect both requests'; END IF;
END $admin$;

UPDATE public.service_requests SET status='reviewing'
WHERE user_id='11111111-1111-4111-8111-111111111111';

-- The real review-only delivery gate forbids fake completion,
-- even by the synthetic admin.
DO $delivery$
DECLARE blocked boolean:=false;
BEGIN
  BEGIN
    UPDATE public.service_requests SET status='completed'
    WHERE user_id='11111111-1111-4111-8111-111111111111';
  EXCEPTION WHEN check_violation THEN
    blocked:=true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Unverified delivery/completion is not blocked';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_requests
       WHERE user_id='11111111-1111-4111-8111-111111111111'
         AND status='reviewing') THEN
    RAISE EXCEPTION 'Failed delivery gate changed the request status';
  END IF;
END $delivery$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
DO $owner_return$
BEGIN
  IF (SELECT count(*) FROM public.service_requests)<>1
    THEN RAISE EXCEPTION 'Owner A saw the synthetic admin or owner B rows'; END IF;
  IF (SELECT count(*) FROM public.service_request_journal
      WHERE request_id NOT IN (SELECT id FROM public.service_requests))<>0
    THEN RAISE EXCEPTION 'Private Services journal leaked other requests'; END IF;
END $owner_return$;

RESET ROLE;
RESET request.jwt.claim.sub;
DO $final$
BEGIN
  RAISE NOTICE 'Services real PG17 owner A/B + synthetic admin isolation, audit and false-delivery safeguards passed';
END $final$;
