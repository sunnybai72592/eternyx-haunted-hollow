-- Same seed is run twice before this test; prove no queue or quota use.
DO $$
BEGIN
 IF (SELECT count(*) FROM public.ctf_range_sessions)<>2
 OR EXISTS(SELECT 1 FROM public.ctf_range_sessions WHERE status<>'stopped'
   OR requested_at>=statement_timestamp()-interval '24 hours'
   OR claimed_at IS NOT NULL OR worker_fence_id IS NOT NULL OR provider_instance_ref IS NOT NULL)
 THEN RAISE EXCEPTION 'Unsafe terminal fixture or duplicate'; END IF;
END;
$$;
SET LOCAL ROLE service_role;
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.ctf_range_request_session('11111111-1111-4111-8111-111111111111','http-basics-v1');
 IF r->>'reason' IS DISTINCT FROM 'provider_offline' THEN RAISE EXCEPTION 'Disabled provider accepted request'; END IF;
 r:=public.ctf_range_stop_session('11111111-1111-4111-8111-111111111111','6b220002-1000-4000-8000-000000000002');
 IF r->>'reason' IS DISTINCT FROM 'not_found_or_closed' THEN RAISE EXCEPTION 'Foreign terminal stop not refused'; END IF;
 r:=public.ctf_range_stop_session('11111111-1111-4111-8111-111111111111','6b220001-1000-4000-8000-000000000001');
 IF r->>'reason' IS DISTINCT FROM 'not_found_or_closed' THEN RAISE EXCEPTION 'Closed session stop not refused'; END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $$
BEGIN
 IF (SELECT count(id) FROM public.ctf_range_sessions)<>1 OR
 NOT EXISTS(SELECT id FROM public.ctf_range_sessions WHERE id='6b220001-1000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'Owner A fixture invisible or foreign visible'; END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $$
BEGIN
 IF (SELECT count(id) FROM public.ctf_range_sessions)<>1 OR
 NOT EXISTS(SELECT id FROM public.ctf_range_sessions WHERE id='6b220002-1000-4000-8000-000000000002')
 THEN RAISE EXCEPTION 'Owner B fixture invisible or foreign visible'; END IF;
END;
$$;
RESET ROLE;
SELECT 'Terminal fixtures, idempotence, disabled request and owner isolation verified' AS result;
