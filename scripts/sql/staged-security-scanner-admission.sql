-- Review candidate; staging only after CI. Requires Wave 20 private session schema.
BEGIN;
CREATE TABLE public.security_scanner_budget (
 budget_key text PRIMARY KEY CHECK (budget_key='global' OR budget_key ~ '^owner:[0-9a-f-]{36}$'),
 day_utc date NOT NULL,
 minute_utc timestamptz NOT NULL,
 daily_requests integer NOT NULL CHECK (daily_requests BETWEEN 0 AND 300),
 minute_requests integer NOT NULL CHECK (minute_requests BETWEEN 0 AND 15)
);
ALTER TABLE public.security_scanner_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_scanner_budget FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.security_scanner_budget TO service_role;
GRANT USAGE ON SCHEMA cybersecurity_session_private TO service_role;
-- Server-only lookup; the caller has already verified the user's token with Auth.
CREATE FUNCTION cybersecurity_session_private.scanner_session_exists(p_owner uuid,p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id=p_owner AND s.id=p_session
 AND (s.not_after IS NULL OR s.not_after>statement_timestamp()))
$$;
REVOKE ALL ON FUNCTION cybersecurity_session_private.scanner_session_exists(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION cybersecurity_session_private.scanner_session_exists(uuid,uuid) TO service_role;
CREATE FUNCTION public.security_scanner_admit(p_owner uuid,p_session uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE
 d date := (statement_timestamp() AT TIME ZONE 'UTC')::date;
 m timestamptz := date_trunc('minute',statement_timestamp());
 k text; day_cap integer; minute_cap integer; n integer;
BEGIN
 IF p_owner IS NULL OR p_session IS NULL OR NOT cybersecurity_session_private.scanner_session_exists(p_owner,p_session) THEN RETURN 'revoked'; END IF;
 BEGIN
  FOREACH k IN ARRAY ARRAY['owner:'||p_owner::text,'global'] LOOP
   day_cap := CASE WHEN k='global' THEN 300 ELSE 30 END;
   minute_cap := CASE WHEN k='global' THEN 15 ELSE 3 END;
   INSERT INTO public.security_scanner_budget AS b(budget_key,day_utc,minute_utc,daily_requests,minute_requests)
    VALUES(k,d,m,1,1)
   ON CONFLICT(budget_key) DO UPDATE SET
    day_utc=d,minute_utc=m,
    daily_requests=CASE WHEN b.day_utc=d THEN b.daily_requests+1 ELSE 1 END,
    minute_requests=CASE WHEN b.minute_utc=m THEN b.minute_requests+1 ELSE 1 END
   WHERE b.day_utc<=d AND b.minute_utc<=m
    AND (b.day_utc<>d OR b.daily_requests<day_cap)
    AND (b.minute_utc<>m OR b.minute_requests<minute_cap);
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n<>1 THEN RAISE EXCEPTION USING ERRCODE='P3001',MESSAGE='scanner quota'; END IF;
  END LOOP;
  IF NOT cybersecurity_session_private.scanner_session_exists(p_owner,p_session) THEN
   RAISE EXCEPTION USING ERRCODE='P3002',MESSAGE='scanner session revoked';
  END IF;
  RETURN 'admitted';
 EXCEPTION WHEN SQLSTATE 'P3001' THEN RETURN 'quota';
 WHEN SQLSTATE 'P3002' THEN RETURN 'revoked';
 END;
END;
$$;
REVOKE ALL ON FUNCTION public.security_scanner_admit(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.security_scanner_admit(uuid,uuid) TO service_role;
COMMIT;
