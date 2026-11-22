-- Docker operator incident cases: durable owner-only investigation records,
-- never an execution authorization or independent Docker success certificate.
-- Requires preceding Docker claim, control and receipt recovery migrations.
ALTER TABLE public.docker_command_claims
  ADD CONSTRAINT docker_command_claim_id_owner_unique UNIQUE (id,owner_id);

CREATE TABLE public.docker_lab_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('missing_receipt','reported_failed','reported_guard_denied')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','reviewed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT docker_lab_incident_claim_owner
    FOREIGN KEY (claim_id,owner_id) REFERENCES public.docker_command_claims(id,owner_id) ON DELETE CASCADE,
  CONSTRAINT docker_lab_incident_owner_pair UNIQUE(id,owner_id)
);
CREATE INDEX docker_lab_incidents_owner_recent ON public.docker_lab_incidents(owner_id,created_at DESC);
ALTER TABLE public.docker_lab_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_lab_incidents FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.docker_lab_incidents TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.docker_lab_incidents TO service_role;
CREATE POLICY "Owner may read Docker incident cases" ON public.docker_lab_incidents
  FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);

CREATE TABLE public.docker_lab_incident_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('opened','investigating','reviewed')),
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 12 AND 500 AND note !~ '[[:cntrl:]]'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT docker_lab_incident_event_owner
    FOREIGN KEY (incident_id,owner_id) REFERENCES public.docker_lab_incidents(id,owner_id) ON DELETE CASCADE
);
CREATE INDEX docker_lab_incident_events_recent ON public.docker_lab_incident_events(owner_id,id DESC);
ALTER TABLE public.docker_lab_incident_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_lab_incident_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.docker_lab_incident_events TO authenticated;
GRANT SELECT,INSERT ON public.docker_lab_incident_events TO service_role;
CREATE POLICY "Owner may read Docker incident history" ON public.docker_lab_incident_events
  FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);

CREATE FUNCTION public.docker_lab_open_incident(
  p_owner_id uuid,p_claim_id uuid,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 v_now timestamptz:=pg_catalog.statement_timestamp();
 v_claim public.docker_command_claims%ROWTYPE;
 v_existing public.docker_lab_incidents%ROWTYPE;
 v_reason text;v_id uuid;
BEGIN
 IF p_owner_id IS NULL OR p_claim_id IS NULL OR p_note IS NULL
   OR char_length(pg_catalog.btrim(p_note)) NOT BETWEEN 12 AND 500
   OR p_note ~ '[[:cntrl:]]' THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261123,pg_catalog.hashtext(p_owner_id::text));
 SELECT * INTO v_claim FROM public.docker_command_claims
   WHERE id=p_claim_id AND owner_id=p_owner_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT * INTO v_existing FROM public.docker_lab_incidents
   WHERE claim_id=p_claim_id AND owner_id=p_owner_id;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'incident_id',v_existing.id,
   'status',v_existing.status,'reused',true); END IF;
 IF v_claim.state='reported_failed' THEN v_reason:='reported_failed';
 ELSIF v_claim.state='reported_guard_denied' THEN v_reason:='reported_guard_denied';
 ELSIF v_claim.state='claimed' AND v_claim.claimed_at <= v_now-interval '45 seconds'
   THEN v_reason:='missing_receipt';
 ELSE RETURN jsonb_build_object('ok',false,'reason','not_actionable'); END IF;
 IF (SELECT count(*) FROM public.docker_lab_incidents WHERE owner_id=p_owner_id)>=50
   THEN RETURN jsonb_build_object('ok',false,'reason','case_limit'); END IF;
 IF (SELECT count(*) FROM public.docker_lab_incidents
     WHERE owner_id=p_owner_id AND created_at>v_now-interval '24 hours')>=12
   THEN RETURN jsonb_build_object('ok',false,'reason','daily_limit'); END IF;
 INSERT INTO public.docker_lab_incidents(claim_id,owner_id,reason,status,created_at,updated_at)
   VALUES(p_claim_id,p_owner_id,v_reason,'open',v_now,v_now) RETURNING id INTO v_id;
 INSERT INTO public.docker_lab_incident_events(incident_id,owner_id,action,note,occurred_at)
   VALUES(v_id,p_owner_id,'opened',pg_catalog.btrim(p_note),v_now);
 RETURN jsonb_build_object('ok',true,'incident_id',v_id,
   'reason',v_reason,'status','open','reused',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_lab_open_incident(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_lab_open_incident(uuid,uuid,text) TO service_role;

CREATE FUNCTION public.docker_lab_triage_incident(
  p_owner_id uuid,p_incident_id uuid,p_status text,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 v_case public.docker_lab_incidents%ROWTYPE;v_now timestamptz:=pg_catalog.statement_timestamp();
BEGIN
 IF p_owner_id IS NULL OR p_incident_id IS NULL OR p_status IS NULL
   OR p_status NOT IN ('investigating','reviewed') OR p_note IS NULL
   OR char_length(pg_catalog.btrim(p_note)) NOT BETWEEN 12 AND 500
   OR p_note ~ '[[:cntrl:]]' THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261123,pg_catalog.hashtext(p_owner_id::text));
 SELECT * INTO v_case FROM public.docker_lab_incidents
   WHERE id=p_incident_id AND owner_id=p_owner_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF v_case.status=p_status THEN RETURN jsonb_build_object('ok',true,
   'incident_id',p_incident_id,'status',p_status,'reused',true); END IF;
 IF (SELECT count(*) FROM public.docker_lab_incident_events
     WHERE incident_id=p_incident_id)>=20 THEN
   RETURN jsonb_build_object('ok',false,'reason','event_limit');
 END IF;
 UPDATE public.docker_lab_incidents SET status=p_status,updated_at=v_now
   WHERE id=p_incident_id AND owner_id=p_owner_id;
 INSERT INTO public.docker_lab_incident_events(incident_id,owner_id,action,note,occurred_at)
   VALUES(p_incident_id,p_owner_id,p_status,pg_catalog.btrim(p_note),v_now);
 RETURN jsonb_build_object('ok',true,'incident_id',p_incident_id,
   'status',p_status,'reused',false,'docker_execution_verified',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_lab_triage_incident(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_lab_triage_incident(uuid,uuid,text,text) TO service_role;
