-- Execute after ctf-range-db-bootstrap.sql and the actual production migration.
-- This script runs only against disposable CI Postgres, never production.

DO $$
DECLARE
  p jsonb;
  q jsonb;
  id_a uuid;
  id_b uuid;
  v_state text;
BEGIN
  -- Defaults: provider disabled, ingress unapproved, capacity zero.
  SELECT public.ctf_range_request_session(
    '11111111-1111-4111-8111-111111111111', 'http-basics-v1'
  ) INTO p;
  IF p->>'reason' <> 'provider_offline' THEN
    RAISE EXCEPTION 'Default disabled provider accepted a reservation';
  END IF;
  IF (SELECT count(*) FROM public.ctf_range_sessions) <> 0 THEN
    RAISE EXCEPTION 'Offline provider created phantom sessions';
  END IF;

  -- Operator enables a simulated isolated provider ONLY in this temporary database.
  UPDATE public.ctf_range_provider
  SET enabled = true, max_active_sessions = 1,
      last_heartbeat_at = now()
  WHERE singleton_id = 1;
  SELECT public.ctf_range_request_session(
    '11111111-1111-4111-8111-111111111111', 'http-basics-v1'
  ) INTO p;
  IF p->>'reason' <> 'provider_offline' THEN
    RAISE EXCEPTION 'Ingress was not independently approved';
  END IF;

  UPDATE public.ctf_range_provider
  SET ingress_approved = true,
      last_heartbeat_at = now()
  WHERE singleton_id = 1;

  SELECT public.ctf_range_request_session(
    '11111111-1111-4111-8111-111111111111', 'http-basics-v1'
  ) INTO p;
  IF p->>'ok' <> 'true' OR p->>'status' <> 'queued' THEN
    RAISE EXCEPTION 'Expected first reservation, got %', p;
  END IF;
  id_a := (p->>'session_id')::uuid;

  SELECT public.ctf_range_request_session(
    '11111111-1111-4111-8111-111111111111', 'http-basics-v1'
  ) INTO q;
  IF q->>'reused' <> 'true' OR (q->>'session_id')::uuid <> id_a THEN
    RAISE EXCEPTION 'Repeated launch did not reuse same active reservation';
  END IF;

  SELECT public.ctf_range_request_session(
    '22222222-2222-4222-8222-222222222222', 'http-basics-v1'
  ) INTO q;
  IF q->>'reason' <> 'capacity_full' THEN
    RAISE EXCEPTION 'Global capacity 1 was bypassed: %', q;
  END IF;

  SELECT public.ctf_range_stop_session(
    '22222222-2222-4222-8222-222222222222', id_a
  ) INTO q;
  IF q->>'reason' <> 'not_found_or_closed' THEN
    RAISE EXCEPTION 'Account B could stop account A session';
  END IF;

  SELECT public.ctf_range_stop_session(
    '11111111-1111-4111-8111-111111111111', id_a
  ) INTO q;
  IF q->>'status' <> 'stopped' THEN
    RAISE EXCEPTION 'Queued cancellation failed';
  END IF;

  SELECT public.ctf_range_request_session(
    '22222222-2222-4222-8222-222222222222', 'http-basics-v1'
  ) INTO p;
  IF p->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'Released capacity cannot be reused';
  END IF;
  id_b := (p->>'session_id')::uuid;

  SELECT public.ctf_range_claim_queued_session() INTO q;
  IF (q->>'session_id')::uuid <> id_b THEN
    RAISE EXCEPTION 'Worker did not claim expected queued job';
  END IF;
  IF NOT public.ctf_range_report_session(id_b, 'running', 'range.target.1') THEN
    RAISE EXCEPTION 'Expected worker running transition';
  END IF;

  SELECT status INTO v_state FROM public.ctf_range_sessions WHERE id = id_b;
  IF v_state <> 'running' THEN RAISE EXCEPTION 'Worker running state was not saved'; END IF;

  SELECT public.ctf_range_stop_session(
    '22222222-2222-4222-8222-222222222222', id_b
  ) INTO p;
  IF p->>'status' <> 'stopping' THEN
    RAISE EXCEPTION 'Running session stop must await worker cleanup';
  END IF;

  SELECT public.ctf_range_request_session(
    '11111111-1111-4111-8111-111111111111', 'http-basics-v1'
  ) INTO q;
  IF q->>'reason' <> 'capacity_full' THEN
    RAISE EXCEPTION 'Stopping workload released capacity before cleanup';
  END IF;

  IF NOT public.ctf_range_report_session(id_b, 'stopped', NULL) THEN
    RAISE EXCEPTION 'Worker cleanup acknowledgement was rejected';
  END IF;
  SELECT public.ctf_range_request_session(
    '11111111-1111-4111-8111-111111111111', 'http-basics-v1'
  ) INTO q;
  IF q->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'Cleanup did not release range capacity';
  END IF;
END;
$$;

-- Test real RLS with a role that has no service-role privileges.
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.ctf_range_sessions;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Owner RLS returned % rows instead of 2', v_count;
  END IF;

  BEGIN
    INSERT INTO public.ctf_range_sessions (user_id)
    VALUES ('11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'Authenticated browser could INSERT sessions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.ctf_range_request_session(
      '11111111-1111-4111-8111-111111111111', 'http-basics-v1');
    RAISE EXCEPTION 'Authenticated role could call reservation RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM 1 FROM public.ctf_range_provider;
    RAISE EXCEPTION 'Authenticated role could read provider config';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SET request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.ctf_range_sessions;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'User B accessed session records owned by another user';
  END IF;
END;
$$;
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.ctf_range_sessions;
    RAISE EXCEPTION 'Anonymous role could read CTF sessions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SELECT 'ctf range SQL migration and access gates verified in disposable Postgres' AS result;
