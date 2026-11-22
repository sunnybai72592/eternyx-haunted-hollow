-- Disposable PostgreSQL acceptance test; never execute against production.
-- Requires minimal Supabase bootstrap, 18:00 sessions and 19:00 access migrations.
DO $$
DECLARE
  uid_a uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  uid_b uuid := '22222222-2222-4222-8222-222222222222'::uuid;
  sid_a uuid;
  sid_b uuid;
  answer jsonb;
  grant_id uuid;
  granted boolean;
BEGIN
  -- Only in this isolated CI transaction: simulate a reviewed provider.
  UPDATE public.ctf_range_provider
  SET enabled = true, ingress_approved = true,
    max_active_sessions = 2, last_heartbeat_at = now()
  WHERE singleton_id = 1;

  SELECT public.ctf_range_request_session(uid_a, 'http-basics-v1') INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'Could not reserve session A'; END IF;
  sid_a := (answer->>'session_id')::uuid;
  SELECT public.ctf_range_request_session(uid_b, 'http-basics-v1') INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'Could not reserve session B'; END IF;
  sid_b := (answer->>'session_id')::uuid;

  -- Trusted worker claim/report contracts, no actual Docker needed for DB test.
  SELECT public.ctf_range_claim_queued_session() INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'First worker claim failed'; END IF;
  IF NOT public.ctf_range_report_session((answer->>'session_id')::uuid, 'running',
    'cr-' || replace(answer->>'session_id','-','')) THEN
    RAISE EXCEPTION 'Could not mark first session running';
  END IF;
  SELECT public.ctf_range_claim_queued_session() INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'Second worker claim failed'; END IF;
  IF NOT public.ctf_range_report_session((answer->>'session_id')::uuid, 'running',
    'cr-' || replace(answer->>'session_id','-','')) THEN
    RAISE EXCEPTION 'Could not mark second session running';
  END IF;

  SELECT public.ctf_range_issue_access_grant(uid_b, sid_a, repeat('f',64)) INTO answer;
  IF answer->>'reason' <> 'session_unavailable' THEN
    RAISE EXCEPTION 'Cross-account session issued a grant: %', answer;
  END IF;
  SELECT public.ctf_range_issue_access_grant(uid_a, sid_a, repeat('a',64)) INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'Owner grant failed: %', answer; END IF;
  grant_id := (answer->>'grant_id')::uuid;
  IF (answer->>'duration_seconds')::numeric > 60 THEN
    RAISE EXCEPTION 'Grant lifetime exceeded 60 seconds';
  END IF;

  IF NOT public.ctf_range_check_access_grant(sid_a, uid_a, repeat('a',64)) THEN
    RAISE EXCEPTION 'Valid live session grant denied';
  END IF;
  IF public.ctf_range_check_access_grant(sid_a, uid_b, repeat('a',64)) THEN
    RAISE EXCEPTION 'Another verified account could reuse an owned lab grant';
  END IF;
  IF public.ctf_range_check_access_grant(sid_b, uid_b, repeat('a',64)) THEN
    RAISE EXCEPTION 'Grant could be replayed in another account session';
  END IF;
  IF public.ctf_range_check_access_grant(sid_a, uid_a, repeat('b',64)) THEN
    RAISE EXCEPTION 'Unrecognized grant hash passed verification';
  END IF;

  -- Two active credentials per session maximum.
  SELECT public.ctf_range_issue_access_grant(uid_a, sid_a, repeat('b',64)) INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'Second owner grant failed'; END IF;
  SELECT public.ctf_range_issue_access_grant(uid_a, sid_a, repeat('c',64)) INTO answer;
  IF answer->>'reason' <> 'active_limit' THEN
    RAISE EXCEPTION 'Concurrent active grant limit did not apply';
  END IF;

  UPDATE public.ctf_range_access_grants SET revoked_at = now() WHERE id = grant_id;
  SELECT public.ctf_range_issue_access_grant(uid_a, sid_a, repeat('c',64)) INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'Revoked capacity was not reusable'; END IF;
  UPDATE public.ctf_range_access_grants SET revoked_at = now()
    WHERE user_id = uid_a;
  SELECT public.ctf_range_issue_access_grant(uid_a, sid_a, repeat('d',64)) INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'Fourth rolling-minute grant refused'; END IF;
  SELECT public.ctf_range_issue_access_grant(uid_a, sid_a, repeat('e',64)) INTO answer;
  IF answer->>'reason' <> 'rate_limited' THEN
    RAISE EXCEPTION 'Grant issuance quota not enforced: %', answer;
  END IF;

  -- Stop transitions revoke active grants via trigger and verifier state check.
  SELECT public.ctf_range_stop_session(uid_a, sid_a) INTO answer;
  IF answer->>'status' <> 'stopping' THEN
    RAISE EXCEPTION 'Owner stop did not transition to stopping';
  END IF;
  IF public.ctf_range_check_access_grant(sid_a, uid_a, repeat('d',64)) THEN
    RAISE EXCEPTION 'Stopped session kept a live token';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ctf_range_access_grants
    WHERE token_hash = repeat('d',64) AND revoked_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Stop trigger did not revoke grant'; END IF;

  -- Provider kill switch revokes effective access without altering grant row.
  SELECT public.ctf_range_issue_access_grant(uid_b, sid_b, repeat('5',64)) INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'Owner B grant unavailable'; END IF;
  UPDATE public.ctf_range_provider SET enabled = false WHERE singleton_id = 1;
  SELECT public.ctf_range_check_access_grant(sid_b, uid_b, repeat('5',64)) INTO granted;
  IF granted THEN RAISE EXCEPTION 'Provider kill switch failed'; END IF;
END;
$$;

SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.ctf_range_access_grants;
    RAISE EXCEPTION 'User could SELECT private access grants';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.ctf_range_issue_access_grant(
      '11111111-1111-4111-8111-111111111111'::uuid,
      '123e4567-e89b-42d3-a456-426614174001'::uuid,
      repeat('1',64));
    RAISE EXCEPTION 'Authenticated browser could issue grants directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.ctf_range_check_access_grant(
      '123e4567-e89b-42d3-a456-426614174001'::uuid,
      '11111111-1111-4111-8111-111111111111'::uuid,
      repeat('1',64));
    RAISE EXCEPTION 'Authenticated browser could verify arbitrary grants';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.ctf_range_access_grants;
    RAISE EXCEPTION 'Anonymous caller could read grants';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SELECT 'ctf range access grant owner isolation, TTL, revocation and privileges passed' AS result;
