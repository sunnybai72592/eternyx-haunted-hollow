-- Operator-reviewed staging fixture SQL. NOT a migration. No active sessions.
-- Must run in one explicit transaction with the three SET LOCAL values.
DO $$
DECLARE
  a uuid;
  b uuid;
  fixture_a constant uuid := '6b220001-1000-4000-8000-000000000001';
  fixture_b constant uuid := '6b220002-1000-4000-8000-000000000002';
  t timestamptz := statement_timestamp() - interval '72 hours';
  n integer;
BEGIN
  IF current_setting('eternyx.labs.fixture_consent',true) IS DISTINCT FROM 'I_APPROVE_TWO_TERMINAL_STAGING_FIXTURES'
  THEN RAISE EXCEPTION 'Explicit fixture consent required'; END IF;
  -- Verify the observed staging-specific history, not a caller-supplied ref.
  -- The dashboard project must ALSO be independently confirmed by the operator.
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL
  THEN RAISE EXCEPTION 'Missing staging history'; END IF;
  SELECT count(*) INTO n FROM supabase_migrations.schema_migrations WHERE (version,name) IN (
    ('20261124121732','labs_20261122170000_ctf_verified_missions'),
    ('20261124121741','labs_20261122180000_ctf_range_session_control'),
    ('20261124121744','labs_20261122190000_ctf_range_access_grants'),
    ('20261124121747','labs_20261122200000_ctf_worker_fencing_budget'),
    ('20261124121749','labs_20261123041000_ctf_hosted_spend_reservations'),
    ('20261124121752','labs_20261124123000_ctf_range_session_column_privacy')
  );
  IF n<>6 THEN RAISE EXCEPTION 'Staging deployment history mismatch'; END IF;
  a:=nullif(current_setting('eternyx.labs.fixture_owner_a',true),'')::uuid;
  b:=nullif(current_setting('eternyx.labs.fixture_owner_b',true),'')::uuid;
  IF a IS NULL OR b IS NULL OR a=b OR
    (SELECT count(*) FROM auth.users WHERE id IN (a,b))<>2
  THEN RAISE EXCEPTION 'Two distinct existing dedicated Auth accounts required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,340);
  LOCK TABLE public.ctf_range_provider,public.ctf_hosted_spend_policy IN SHARE MODE;
  IF NOT EXISTS(SELECT 1 FROM public.ctf_range_provider WHERE singleton_id=1
    AND NOT enabled AND NOT ingress_approved AND max_active_sessions=0
    AND max_starts_per_24h=0 AND max_reserved_minutes_per_24h=0)
  OR NOT EXISTS(SELECT 1 FROM public.ctf_hosted_spend_policy WHERE singleton_id=1
    AND NOT enabled AND max_single_session_micro_usd=0 AND max_24h_micro_usd=0
    AND max_reservations_per_24h=0)
  THEN RAISE EXCEPTION 'Provider and spend limits must be disabled'; END IF;
  -- Refuse any account with unrelated session history and any UUID collision.
  IF EXISTS(SELECT 1 FROM public.ctf_range_sessions WHERE user_id IN (a,b)
    AND id NOT IN (fixture_a,fixture_b))
  THEN RAISE EXCEPTION 'Dedicated accounts must have no unrelated range history'; END IF;
  IF EXISTS(SELECT 1 FROM public.ctf_range_sessions WHERE id IN (fixture_a,fixture_b)
    AND NOT ((id=fixture_a AND user_id=a OR id=fixture_b AND user_id=b)
      AND status='stopped' AND challenge_pack='http-basics-v1'
      AND requested_at < statement_timestamp()-interval '24 hours'
      AND started_at IS NULL AND finished_at IS NOT NULL
      AND provider_instance_ref IS NULL AND worker_fence_id IS NULL AND claimed_at IS NULL))
  THEN RAISE EXCEPTION 'Existing fixture collision or unsafe state'; END IF;
  INSERT INTO public.ctf_range_sessions
    (id,user_id,challenge_pack,status,requested_at,updated_at,expires_at,finished_at)
  VALUES (fixture_a,a,'http-basics-v1','stopped',t,t,t+interval '15 minutes',t),
         (fixture_b,b,'http-basics-v1','stopped',t,t,t+interval '15 minutes',t)
  ON CONFLICT (id) DO NOTHING;
  IF (SELECT count(*) FROM public.ctf_range_sessions WHERE
    (id=fixture_a AND user_id=a OR id=fixture_b AND user_id=b)
    AND status='stopped' AND provider_instance_ref IS NULL AND worker_fence_id IS NULL AND claimed_at IS NULL)<>2
  THEN RAISE EXCEPTION 'Fixture verification failed'; END IF;
END;
$$;
SELECT 'Two terminal-only range ownership fixtures verified; no provider launch' AS result;
