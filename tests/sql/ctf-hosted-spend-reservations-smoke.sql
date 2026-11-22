-- Disposable PostgreSQL 17 CI acceptance, NEVER production.
-- Run after initial session + worker-fencing + new hosted ledger migrations.
DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  owner text := 'operator-hosted-ci';
  fence uuid;
  first_id uuid;
  second_id uuid;
  result jsonb;
  n1 text := repeat('a',32);
  n2 text := repeat('b',32);
  hash1 text := repeat('c',64);
  hash2 text := repeat('d',64);
BEGIN
  IF (SELECT enabled FROM public.ctf_hosted_spend_policy WHERE singleton_id=1)
     IS DISTINCT FROM false OR
     (SELECT max_24h_micro_usd FROM public.ctf_hosted_spend_policy WHERE singleton_id=1)<>0 THEN
    RAISE EXCEPTION 'Hosted spending not default disabled';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ctf_hosted_spend_reservations) THEN
    RAISE EXCEPTION 'Hosted ledger not initially empty';
  END IF;

  SELECT public.ctf_range_worker_acquire(owner,NULL) INTO result;
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Worker lease unavailable'; END IF;
  fence := (result->>'fence_id')::uuid;

  UPDATE public.ctf_range_provider
  SET enabled=true, ingress_approved=true,max_active_sessions=2,
      max_starts_per_24h=2,max_reserved_minutes_per_24h=30,
      last_heartbeat_at=now()
  WHERE singleton_id=1;

  SELECT public.ctf_range_request_session(user_a,'http-basics-v1') INTO result;
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Session A not queued: %',result; END IF;
  SELECT public.ctf_range_request_session(user_b,'http-basics-v1') INTO result;
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Session B not queued: %',result; END IF;

  SELECT public.ctf_range_worker_claim(owner,fence) INTO result;
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'First fenced claim rejected: %',result; END IF;
  first_id := (result->>'session_id')::uuid;
  SELECT public.ctf_range_worker_claim(owner,fence) INTO result;
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Second fenced claim rejected: %',result; END IF;
  second_id := (result->>'session_id')::uuid;
  IF first_id=second_id THEN RAISE EXCEPTION 'Duplicate worker claim'; END IF;

  SELECT public.ctf_hosted_reserve_quote(owner,fence,first_id,n1,hash1,17063,
    now()+interval '120 seconds') INTO result;
  IF result->>'reason'<>'hosted_budget_disabled' THEN
    RAISE EXCEPTION 'Default-off hosted ledger permitted reserve: %',result;
  END IF;

  -- Settings are enabled only on disposable CI database. No adapter exists
  -- that can launch actual paid cloud resources.
  UPDATE public.ctf_hosted_spend_policy
  SET enabled=true,max_single_session_micro_usd=20000,
      max_24h_micro_usd=30000,max_reservations_per_24h=1
  WHERE singleton_id=1;

  SELECT public.ctf_hosted_reserve_quote('operator-wrong',fence,first_id,n1,hash1,17063,
    now()+interval '120 seconds') INTO result;
  IF result->>'reason'<>'lease_lost' THEN RAISE EXCEPTION 'Wrong worker reserved quote'; END IF;

  SELECT public.ctf_hosted_reserve_quote(owner,gen_random_uuid(),first_id,n1,hash1,17063,
    now()+interval '120 seconds') INTO result;
  IF result->>'reason'<>'lease_lost' THEN RAISE EXCEPTION 'Wrong lease reserved quote'; END IF;

  SELECT public.ctf_hosted_reserve_quote(owner,fence,first_id,'nothex',hash1,17063,
    now()+interval '120 seconds') INTO result;
  IF result->>'reason'<>'invalid_quote' THEN RAISE EXCEPTION 'Invalid nonce accepted'; END IF;

  SELECT public.ctf_hosted_reserve_quote(owner,fence,first_id,n1,hash1,17063,
    now()-interval '1 second') INTO result;
  IF result->>'reason'<>'invalid_quote' THEN RAISE EXCEPTION 'Expired quote accepted'; END IF;

  SELECT public.ctf_hosted_reserve_quote(owner,fence,first_id,n1,hash1,17063,
    now()+interval '10 minutes') INTO result;
  IF result->>'reason'<>'invalid_quote' THEN RAISE EXCEPTION 'Overlong quote accepted'; END IF;

  SELECT public.ctf_hosted_reserve_quote(owner,fence,first_id,n1,hash1,20001,
    now()+interval '120 seconds') INTO result;
  IF result->>'reason'<>'hosted_budget_exhausted' THEN
    RAISE EXCEPTION 'Per-session USD budget not enforced';
  END IF;

  SELECT public.ctf_hosted_reserve_quote(owner,fence,first_id,n1,hash1,17063,
    now()+interval '120 seconds') INTO result;
  IF result->>'ok'<>'true' OR result->>'reservationRecorded'<>'true'
     OR result->>'cloudProvisioningAllowed'<>'false'
     OR result->>'providerHardLimitVerified'<>'false'
     OR (result->>'reserved_micro_usd')::bigint<>17063 THEN
    RAISE EXCEPTION 'Verified safe preauthorization not recorded: %',result;
  END IF;

  SELECT public.ctf_hosted_reserve_quote(owner,fence,first_id,n1,hash1,17063,
    now()+interval '120 seconds') INTO result;
  IF result->>'reason'<>'duplicate_session' THEN RAISE EXCEPTION 'Duplicate session replay permitted'; END IF;

  SELECT public.ctf_hosted_reserve_quote(owner,fence,second_id,n1,hash2,17063,
    now()+interval '120 seconds') INTO result;
  IF result->>'reason'<>'quote_replayed' THEN RAISE EXCEPTION 'Quote nonce replay permitted'; END IF;

  SELECT public.ctf_hosted_reserve_quote(owner,fence,second_id,n2,hash2,17063,
    now()+interval '120 seconds') INTO result;
  IF result->>'reason'<>'hosted_budget_exhausted' THEN RAISE EXCEPTION 'Count budget bypassed'; END IF;

  UPDATE public.ctf_hosted_spend_policy
  SET max_reservations_per_24h=2
  WHERE singleton_id=1;
  SELECT public.ctf_hosted_reserve_quote(owner,fence,second_id,n2,hash2,17063,
    now()+interval '120 seconds') INTO result;
  IF result->>'reason'<>'hosted_budget_exhausted' THEN RAISE EXCEPTION 'Cumulative USD budget bypassed'; END IF;

  UPDATE public.ctf_hosted_spend_policy
  SET max_24h_micro_usd=35000
  WHERE singleton_id=1;
  SELECT public.ctf_hosted_reserve_quote(owner,fence,second_id,n2,hash2,17063,
    now()+interval '120 seconds') INTO result;
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Valid second reservation rejected: %',result; END IF;

  IF (SELECT count(*) FROM public.ctf_hosted_spend_reservations)<>2
     OR (SELECT sum(reserved_micro_usd) FROM public.ctf_hosted_spend_reservations)<>34126 THEN
    RAISE EXCEPTION 'Append-only budget ledger contained unexpected balances';
  END IF;

  -- Deactivating provider does not erase or refund an already-recorded
  -- conservative 24-hour reservation.
  UPDATE public.ctf_hosted_spend_policy SET enabled=false WHERE singleton_id=1;
  IF (SELECT sum(reserved_micro_usd) FROM public.ctf_hosted_spend_reservations)<>34126 THEN
    RAISE EXCEPTION 'Disabled hosted budget incorrectly erased liability';
  END IF;
END;
$$;

SET ROLE authenticated;
DO $$
DECLARE signature text :=
  'public.ctf_hosted_reserve_quote(text,uuid,uuid,text,text,bigint,timestamptz)';
BEGIN
  IF pg_catalog.has_function_privilege(current_user,signature,'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated browser could reserve cloud budget';
  END IF;
  IF pg_catalog.has_table_privilege(current_user,
    'public.ctf_hosted_spend_policy','SELECT') THEN
    RAISE EXCEPTION 'Authenticated browser could inspect hosted budget policy';
  END IF;
  IF pg_catalog.has_table_privilege(current_user,
    'public.ctf_hosted_spend_reservations','SELECT') THEN
    RAISE EXCEPTION 'Authenticated browser could inspect private quote ledger';
  END IF;
END;
$$;
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  IF pg_catalog.has_function_privilege(current_user,
    'public.ctf_hosted_reserve_quote(text,uuid,uuid,text,text,bigint,timestamptz)',
    'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous client could call spend reserve RPC';
  END IF;
END;
$$;
RESET ROLE;

SET ROLE service_role;
DO $$
BEGIN
  IF NOT pg_catalog.has_function_privilege(current_user,
     'public.ctf_hosted_reserve_quote(text,uuid,uuid,text,text,bigint,timestamptz)',
     'EXECUTE') THEN
    RAISE EXCEPTION 'Service role cannot call its reserved RPC';
  END IF;
  IF pg_catalog.has_table_privilege(current_user,
     'public.ctf_hosted_spend_reservations','DELETE') OR
     pg_catalog.has_table_privilege(current_user,
     'public.ctf_hosted_spend_reservations','UPDATE') THEN
    RAISE EXCEPTION 'Hosted reservations must remain append-only';
  END IF;
END;
$$;
RESET ROLE;

SELECT 'hosted quote replay, fenced atomic reservations, default-off USD limits and browser revokes verified' AS result;
