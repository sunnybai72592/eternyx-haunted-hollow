-- Review candidate: deploy only after regression and staging review.
BEGIN;
CREATE TABLE public.security_evidence_gateway_global_budget (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 day_utc date NOT NULL,
 minute_utc timestamptz NOT NULL,
 daily_bytes bigint NOT NULL CHECK(daily_bytes BETWEEN 0 AND 1073741824),
 daily_requests integer NOT NULL CHECK(daily_requests BETWEEN 0 AND 1024),
 minute_requests integer NOT NULL CHECK(minute_requests BETWEEN 0 AND 60)
);
ALTER TABLE public.security_evidence_gateway_global_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_evidence_gateway_global_budget FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.security_evidence_gateway_global_budget TO service_role;
-- A nested subtransaction rolls back the owner charge and receipt if the global reservation fails.
CREATE FUNCTION public.security_evidence_gateway_reserve_v2(p_owner uuid,p_request uuid,p_bytes bigint)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE
 v_day date := (statement_timestamp() AT TIME ZONE 'UTC')::date;
 v_minute timestamptz := date_trunc('minute',statement_timestamp());
 v_decision text;
 v_rows integer;
BEGIN
 BEGIN
  v_decision := public.security_evidence_gateway_reserve(p_owner,p_request,p_bytes);
  IF v_decision IS DISTINCT FROM 'reserved' THEN RETURN v_decision; END IF;
  INSERT INTO public.security_evidence_gateway_global_budget AS g(singleton,day_utc,minute_utc,daily_bytes,daily_requests,minute_requests)
  VALUES(true,v_day,v_minute,p_bytes,1,1)
  ON CONFLICT(singleton) DO UPDATE SET
   day_utc=v_day,minute_utc=v_minute,
   daily_bytes=CASE WHEN g.day_utc=v_day THEN g.daily_bytes+p_bytes ELSE p_bytes END,
   daily_requests=CASE WHEN g.day_utc=v_day THEN g.daily_requests+1 ELSE 1 END,
   minute_requests=CASE WHEN g.minute_utc=v_minute THEN g.minute_requests+1 ELSE 1 END
  WHERE g.day_utc<=v_day AND g.minute_utc<=v_minute
    AND (g.day_utc<>v_day OR (g.daily_bytes+p_bytes<=1073741824 AND g.daily_requests<1024))
    AND (g.minute_utc<>v_minute OR g.minute_requests<60);
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows=0 THEN RAISE EXCEPTION USING ERRCODE='P2401',MESSAGE='global evidence quota'; END IF;
  RETURN 'reserved';
 EXCEPTION WHEN SQLSTATE 'P2401' THEN
  RETURN 'quota';
 END;
END;
$$;
REVOKE ALL ON FUNCTION public.security_evidence_gateway_reserve_v2(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.security_evidence_gateway_reserve_v2(uuid,uuid,bigint) TO service_role;
COMMIT;
