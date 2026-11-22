-- Executed ONLY against disposable, networkless Postgres CI instance.
-- Apply bootstrap, original range migration, THEN fenced/budget migration.
DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  fence_a uuid;
  fence_b uuid;
  session_a uuid;
  session_b uuid;
  answer jsonb;
BEGIN
  -- A new provider is disabled and budget-free; acquiring a lease does not
  -- enable any workload or approve user ingress.
  SELECT public.ctf_range_worker_acquire('operator-alpha', NULL) INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'First lease not granted'; END IF;
  fence_a := (answer->>'fence_id')::uuid;

  SELECT public.ctf_range_worker_acquire('operator-beta', NULL) INTO answer;
  IF answer->>'reason' <> 'lease_busy' THEN
    RAISE EXCEPTION 'Second owner acquired an active coordinator lease';
  END IF;

  SELECT public.ctf_range_worker_acquire('operator-alpha', fence_a) INTO answer;
  IF (answer->>'fence_id')::uuid <> fence_a THEN
    RAISE EXCEPTION 'Same-owner renewal rotated coordinator fence';
  END IF;

  UPDATE public.ctf_range_provider
  SET enabled=true,ingress_approved=true,max_active_sessions=2,
      last_heartbeat_at=now()
  WHERE singleton_id=1;

  SELECT public.ctf_range_request_session(user_a,'http-basics-v1') INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'Could not queue first synthetic user'; END IF;
  session_a := (answer->>'session_id')::uuid;
  SELECT public.ctf_range_request_session(user_b,'http-basics-v1') INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'Could not queue second synthetic user'; END IF;
  session_b := (answer->>'session_id')::uuid;

  SELECT public.ctf_range_worker_claim('operator-alpha',fence_a) INTO answer;
  IF answer->>'reason' <> 'budget_disabled' THEN
    RAISE EXCEPTION 'Zero-default compute budget failed closed: %', answer;
  END IF;
  IF EXISTS(SELECT 1 FROM public.ctf_range_sessions WHERE claimed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Budget-disabled provider claimed a job';
  END IF;

  -- Budget allows EXACTLY one 15-minute worst-case reservation per 24 h.
  UPDATE public.ctf_range_provider
  SET max_starts_per_24h=1,max_reserved_minutes_per_24h=15
  WHERE singleton_id=1;
  SELECT public.ctf_range_worker_claim('operator-alpha',fence_a) INTO answer;
  IF answer->>'ok' <> 'true'
     OR (answer->>'session_id')::uuid NOT IN (session_a,session_b) THEN
    RAISE EXCEPTION 'First budgeted claim unavailable: %',answer;
  END IF;
  -- Both test reservations can have identical transaction timestamps;
  -- the queue's documented tie-breaker is the generated UUID, not user A.
  session_a := (answer->>'session_id')::uuid;
  IF (SELECT worker_fence_id FROM public.ctf_range_sessions WHERE id=session_a)
    IS DISTINCT FROM fence_a THEN
    RAISE EXCEPTION 'Session not fenced to elected provider';
  END IF;
  IF public.ctf_range_worker_report('operator-alpha',gen_random_uuid(),
      session_a,'running','cr-'||replace(session_a::text,'-','')) THEN
    RAISE EXCEPTION 'Wrong fence started a session';
  END IF;
  IF public.ctf_range_worker_report('operator-beta',fence_a,
      session_a,'running','cr-'||replace(session_a::text,'-','')) THEN
    RAISE EXCEPTION 'Wrong owner started a session';
  END IF;
  IF public.ctf_range_worker_report('operator-alpha',fence_a,
      session_a,'running','some-other-container') THEN
    RAISE EXCEPTION 'Arbitrary Docker instance reference was accepted';
  END IF;
  IF NOT public.ctf_range_worker_report('operator-alpha',fence_a,
      session_a,'running','cr-'||replace(session_a::text,'-','')) THEN
    RAISE EXCEPTION 'Current worker failed legitimate running transition';
  END IF;

  SELECT public.ctf_range_worker_claim('operator-alpha',fence_a) INTO answer;
  IF answer->>'reason' <> 'budget_exhausted' THEN
    RAISE EXCEPTION 'Second start bypassed rolling 24-hour budget: %',answer;
  END IF;
  IF (SELECT count(*) FROM public.ctf_range_sessions
      WHERE claimed_at IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'Extra claim incurred resource budget';
  END IF;

  -- Simulate operator host process crash and lease TTL expiry. New owner can
  -- acquire, but old generation can no longer report/release any outcome.
  UPDATE public.ctf_range_worker_lease
  SET expires_at=now()-interval '1 second'
  WHERE singleton_id=1;
  SELECT public.ctf_range_worker_acquire('operator-beta',NULL) INTO answer;
  IF answer->>'ok' <> 'true' THEN RAISE EXCEPTION 'Expired owner not replaced'; END IF;
  fence_b := (answer->>'fence_id')::uuid;
  IF fence_a=fence_b THEN RAISE EXCEPTION 'Takeover reused stale generation'; END IF;

  IF public.ctf_range_worker_report('operator-alpha',fence_a,session_a,'stopped') THEN
    RAISE EXCEPTION 'Stale worker marked another owner session terminal';
  END IF;
  IF public.ctf_range_worker_release('operator-alpha',fence_a) THEN
    RAISE EXCEPTION 'Stale worker released successor lease';
  END IF;
  SELECT public.ctf_range_worker_inventory('operator-alpha',fence_a) INTO answer;
  IF answer->>'reason' <> 'lease_lost' THEN
    RAISE EXCEPTION 'Stale coordinator inspected privileged inventory';
  END IF;

  SELECT public.ctf_range_worker_inventory('operator-beta',fence_b) INTO answer;
  IF answer->>'ok' <> 'true' OR
     jsonb_array_length(answer->'sessions') <> 1 THEN
    RAISE EXCEPTION 'Successor could not adopt running workloads: %',answer;
  END IF;
  IF (SELECT worker_fence_id FROM public.ctf_range_sessions WHERE id=session_a)
    IS DISTINCT FROM fence_b THEN
    RAISE EXCEPTION 'Old worker did not get fenced from adopted session';
  END IF;
  IF public.ctf_range_worker_report('operator-alpha',fence_a,session_a,'failed') THEN
    RAISE EXCEPTION 'Old generation reported after successor adoption';
  END IF;

  -- In an actual runtime the worker must physically remove the Docker project
  -- BEFORE reporting terminal. Here, only validate the DB transition.
  IF NOT public.ctf_range_worker_report('operator-beta',fence_b,session_a,'stopped') THEN
    RAISE EXCEPTION 'New owner cannot finish a reconciled session';
  END IF;
  SELECT public.ctf_range_worker_claim('operator-beta',fence_b) INTO answer;
  IF answer->>'reason' <> 'budget_exhausted' THEN
    RAISE EXCEPTION 'Early cleanup reset rolling daily compute budget';
  END IF;

  UPDATE public.ctf_range_provider SET enabled=false WHERE singleton_id=1;
  SELECT public.ctf_range_worker_claim('operator-beta',fence_b) INTO answer;
  IF answer->>'reason' <> 'provider_offline' THEN
    RAISE EXCEPTION 'Operator kill switch failed';
  END IF;
  -- Cleanup remains possible with provider disabled; no account access.
  SELECT public.ctf_range_worker_inventory('operator-beta',fence_b) INTO answer;
  IF answer->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'Operator kill switch prevented cleanup';
  END IF;

  IF NOT public.ctf_range_worker_release('operator-beta',fence_b) THEN
    RAISE EXCEPTION 'Owner cannot release its own lease';
  END IF;
END;
$$;

SET ROLE service_role;
DO $$
BEGIN
  IF pg_catalog.has_function_privilege(current_user,
      'public.ctf_range_claim_queued_session()','EXECUTE') THEN
    RAISE EXCEPTION 'Legacy unfenced claim callable by Edge service role';
  END IF;
  IF pg_catalog.has_function_privilege(current_user,
      'public.ctf_range_report_session(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Legacy unfenced report callable by Edge service role';
  END IF;
END;
$$;
RESET ROLE;

SET ROLE authenticated;
DO $$
BEGIN
  IF pg_catalog.has_table_privilege(current_user,
      'public.ctf_range_worker_lease','SELECT') THEN
    RAISE EXCEPTION 'Browser can inspect private worker lease';
  END IF;
  IF pg_catalog.has_function_privilege(current_user,
      'public.ctf_range_worker_claim(text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Browser can call privileged worker claim';
  END IF;
END;
$$;
RESET ROLE;

SELECT 'worker ownership, stale fencing, conservative cost budgets and kill switch verified' AS result;
