-- Synthetic identities only, wrapped in a transaction rolled back by the runner.
DO $$
DECLARE
  a uuid := '11111111-1111-4111-8111-111111111111';
  b uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
  IF public.ctf_claim_verification_attempt(a,'encoded-access-log') IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'first CTF attempt refused'; END IF;
  IF public.ctf_claim_verification_attempt(a,'encoded-access-log') IS DISTINCT FROM false
    THEN RAISE EXCEPTION 'CTF minimum attempt gap bypassed'; END IF;
  IF public.ctf_claim_verification_attempt(b,'encoded-access-log') IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'CTF rate limit crossed owner boundary'; END IF;
  UPDATE public.ctf_verify_rate SET attempts=12,
    last_attempt_at=statement_timestamp()-interval '4 seconds'
    WHERE user_id=a AND mission_id='encoded-access-log';
  IF public.ctf_claim_verification_attempt(a,'encoded-access-log') IS DISTINCT FROM false
    THEN RAISE EXCEPTION 'CTF window cap bypassed'; END IF;
  UPDATE public.ctf_verify_rate SET window_started_at=statement_timestamp()-interval '16 minutes'
    WHERE user_id=a AND mission_id='encoded-access-log';
  IF public.ctf_claim_verification_attempt(a,'encoded-access-log') IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'expired CTF window did not reset'; END IF;
  IF (SELECT attempts FROM public.ctf_verify_rate WHERE user_id=a AND mission_id='encoded-access-log')<>1
    THEN RAISE EXCEPTION 'CTF attempt count did not reset'; END IF;
  INSERT INTO public.ctf_verified_solves(user_id,mission_id) VALUES
    (a,'encoded-access-log'),(b,'header-evidence');
END;
$$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.ctf_verified_solves)<>1 OR
    NOT EXISTS (SELECT 1 FROM public.ctf_verified_solves WHERE mission_id='encoded-access-log')
    THEN RAISE EXCEPTION 'CTF owner A isolation failed'; END IF;
  IF has_table_privilege(current_user,'public.ctf_verified_solves','INSERT,UPDATE,DELETE')
    OR has_table_privilege(current_user,'public.ctf_verify_rate','SELECT,INSERT,UPDATE,DELETE')
    OR has_function_privilege(current_user,'public.ctf_claim_verification_attempt(uuid,text)','EXECUTE')
    THEN RAISE EXCEPTION 'Browser can manipulate CTF verification'; END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.ctf_verified_solves)<>1 OR
    NOT EXISTS (SELECT 1 FROM public.ctf_verified_solves WHERE mission_id='header-evidence')
    THEN RAISE EXCEPTION 'CTF owner B isolation failed'; END IF;
END;
$$;
RESET ROLE;
SET ROLE anon;
DO $$
BEGIN
  IF has_table_privilege(current_user,'public.ctf_verified_solves','SELECT')
    OR has_function_privilege(current_user,'public.ctf_claim_verification_attempt(uuid,text)','EXECUTE')
    THEN RAISE EXCEPTION 'Anonymous CTF access permitted'; END IF;
END;
$$;
RESET ROLE;
SELECT 'verified CTF owner isolation and real rate windows passed' AS result;
