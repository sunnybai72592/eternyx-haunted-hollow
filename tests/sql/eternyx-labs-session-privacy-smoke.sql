-- Run only within disposable PG17 rollback transaction AFTER the forward repair.
SET ROLE service_role;
INSERT INTO public.ctf_range_sessions (id,user_id,status,provider_instance_ref,worker_fence_id,claimed_at)
VALUES
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','stopped','synthetic-a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()),
 ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','stopped','synthetic-b','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now());
DO $$
BEGIN
  IF (SELECT count(*) FROM public.ctf_range_sessions WHERE provider_instance_ref IS NOT NULL AND worker_fence_id IS NOT NULL)<>2
    THEN RAISE EXCEPTION 'Server lost internal read access'; END IF;
  UPDATE public.ctf_range_sessions SET provider_instance_ref='synthetic-updated'
    WHERE id='33333333-3333-4333-8333-333333333333';
  IF NOT FOUND THEN RAISE EXCEPTION 'Server lost internal write access'; END IF;
END;
$$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE col text;
DECLARE n integer;
BEGIN
  IF (SELECT count(id) FROM public.ctf_range_sessions)<>1
    OR NOT EXISTS (SELECT id,challenge_pack,status,requested_at,updated_at,expires_at,started_at,finished_at
      FROM public.ctf_range_sessions WHERE id='33333333-3333-4333-8333-333333333333')
    OR EXISTS (SELECT id FROM public.ctf_range_sessions WHERE id='44444444-4444-4444-8444-444444444444')
    THEN RAISE EXCEPTION 'Owner A visibility failed'; END IF;
  FOREACH col IN ARRAY ARRAY['user_id','provider_instance_ref','worker_fence_id','claimed_at']
  LOOP
    BEGIN
      EXECUTE format('SELECT %I FROM public.ctf_range_sessions',col);
      RAISE EXCEPTION 'Private column readable: %',col;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      EXECUTE format('SELECT count(id) FROM public.ctf_range_sessions WHERE %I IS NOT NULL',col) INTO n;
      RAISE EXCEPTION 'Private column filter accepted: %',col;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM * FROM public.ctf_range_sessions;
    RAISE EXCEPTION 'Wildcard select leaked private columns';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.ctf_range_sessions SET status='failed' WHERE id='33333333-3333-4333-8333-333333333333';
    RAISE EXCEPTION 'Browser update permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $$
BEGIN
  IF (SELECT count(id) FROM public.ctf_range_sessions)<>1 OR
    NOT EXISTS(SELECT id FROM public.ctf_range_sessions WHERE id='44444444-4444-4444-8444-444444444444')
    THEN RAISE EXCEPTION 'Owner B visibility failed'; END IF;
END;
$$;
RESET ROLE;
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM id FROM public.ctf_range_sessions;
    RAISE EXCEPTION 'Anonymous session read permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;
SELECT 'Owner isolation, safe projection, private column and filter denials, wildcard denial, server compatibility passed' AS result;
