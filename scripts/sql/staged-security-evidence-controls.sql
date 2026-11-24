-- Review candidate, not automatically deployed. Requires Wave 20 session fence.
BEGIN;
CREATE TABLE public.security_evidence_gateway_budget (
 owner_id uuid PRIMARY KEY,
 day_utc date NOT NULL,
 minute_utc timestamptz NOT NULL,
 daily_bytes bigint NOT NULL CHECK(daily_bytes BETWEEN 0 AND 268435456),
 daily_requests integer NOT NULL CHECK(daily_requests BETWEEN 0 AND 256),
 minute_requests integer NOT NULL CHECK(minute_requests BETWEEN 0 AND 20)
);
CREATE TABLE public.security_evidence_gateway_receipts (
 owner_id uuid NOT NULL,
 request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,request_id)
);
CREATE TABLE public.security_evidence_gateway_digests (
 storage_path text PRIMARY KEY CHECK(length(storage_path) BETWEEN 1 AND 400),
 owner_id uuid NOT NULL,
 byte_count bigint NOT NULL CHECK(byte_count BETWEEN 1 AND 20971520),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_evidence_gateway_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_evidence_gateway_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_evidence_gateway_digests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_evidence_gateway_budget,public.security_evidence_gateway_receipts,public.security_evidence_gateway_digests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.security_evidence_gateway_budget TO service_role;
GRANT SELECT,INSERT,DELETE ON public.security_evidence_gateway_receipts TO service_role;
GRANT SELECT,INSERT ON public.security_evidence_gateway_digests TO service_role;

-- Invoker-only RPC; the Edge service supplies its independently verified owner.
CREATE FUNCTION public.security_evidence_gateway_reserve(p_owner uuid,p_request uuid,p_bytes bigint)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE
 v_day date := (statement_timestamp() AT TIME ZONE 'UTC')::date;
 v_minute timestamptz := date_trunc('minute',statement_timestamp());
 v_rows integer;
BEGIN
 IF p_owner IS NULL OR p_request IS NULL OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 20971520 THEN
  RETURN 'invalid';
 END IF;
 INSERT INTO public.security_evidence_gateway_receipts(owner_id,request_id) VALUES(p_owner,p_request)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows=0 THEN RETURN 'replay'; END IF;
 INSERT INTO public.security_evidence_gateway_budget AS b(owner_id,day_utc,minute_utc,daily_bytes,daily_requests,minute_requests)
 VALUES(p_owner,v_day,v_minute,p_bytes,1,1)
 ON CONFLICT(owner_id) DO UPDATE SET
 day_utc=v_day,minute_utc=v_minute,
 daily_bytes=CASE WHEN b.day_utc=v_day THEN b.daily_bytes+p_bytes ELSE p_bytes END,
 daily_requests=CASE WHEN b.day_utc=v_day THEN b.daily_requests+1 ELSE 1 END,
 minute_requests=CASE WHEN b.minute_utc=v_minute THEN b.minute_requests+1 ELSE 1 END
 WHERE (b.day_utc<>v_day OR (b.daily_bytes+p_bytes<=268435456 AND b.daily_requests<256))
 AND (b.minute_utc<>v_minute OR b.minute_requests<20);
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows=0 THEN
  DELETE FROM public.security_evidence_gateway_receipts WHERE owner_id=p_owner AND request_id=p_request;
  RETURN 'quota';
 END IF;
 RETURN 'reserved';
END;
$$;
REVOKE ALL ON FUNCTION public.security_evidence_gateway_reserve(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.security_evidence_gateway_reserve(uuid,uuid,bigint) TO service_role;
COMMIT;
