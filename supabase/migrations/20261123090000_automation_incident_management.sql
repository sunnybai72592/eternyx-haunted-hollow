-- ETERNYX Automation Phase 2M. Owner-owned incidents MUST reference factual
-- stored evidence. Recovery reviews are advisory; they cannot enable a
-- schedule, retry a failed job, bypass a lease, or post to external services.

CREATE TABLE public.automation_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creation_key uuid NOT NULL,
  source_kind text NOT NULL CHECK(source_kind IN
    ('schedule_failed','schedule_expired_lease','schedule_quarantine','completed_run_review')),
  source_id uuid NOT NULL,
  workflow_id uuid,
  title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 8 AND 100),
  severity text NOT NULL CHECK(severity IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','resolved')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 2147483647),
  source_evidence jsonb NOT NULL CHECK(jsonb_typeof(source_evidence)='object'
    AND octet_length(source_evidence::text)<=4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,creation_key),
  UNIQUE(user_id,source_kind,source_id)
);
CREATE INDEX automation_incident_owner_status_time
  ON public.automation_incidents(user_id,status,created_at DESC,id DESC);
ALTER TABLE public.automation_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_incidents FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.automation_incidents TO service_role;

CREATE TABLE public.automation_incident_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.automation_incidents(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('opened','transition')),
  from_status text,
  to_status text NOT NULL CHECK(to_status IN ('open','investigating','resolved')),
  note text NOT NULL CHECK(char_length(btrim(note)) BETWEEN 8 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_key)
);
CREATE INDEX automation_events_owner_incident
  ON public.automation_incident_events(user_id,incident_id,id DESC);
ALTER TABLE public.automation_incident_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_incident_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.automation_incident_events TO service_role;

CREATE TABLE public.automation_recovery_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  quarantine_request_key uuid NOT NULL,
  schedule_id uuid NOT NULL,
  schedule_revision integer NOT NULL CHECK(schedule_revision>0),
  decision text NOT NULL CHECK(decision IN
    ('keep_quarantined','reviewed_for_manual_restore')),
  note text NOT NULL CHECK(char_length(btrim(note)) BETWEEN 12 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_key),
  -- Intentionally retain the independently verified review after the original
  -- quarantine receipt is pruned by Phase 2L's seven-day owner cleanup.
  UNIQUE(user_id,quarantine_request_key)
);
CREATE INDEX automation_recovery_reviews_owner_time
  ON public.automation_recovery_reviews(user_id,created_at DESC);
ALTER TABLE public.automation_recovery_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_recovery_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.automation_recovery_reviews TO service_role;

CREATE OR REPLACE FUNCTION public.automation_open_incident(
 p_user_id uuid,p_source_kind text,p_source_id uuid,p_title text,
 p_severity text,p_note text,p_request_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $inc$
DECLARE old public.automation_incidents%ROWTYPE;
  new_inc public.automation_incidents%ROWTYPE;
  s public.automation_schedules%ROWTYPE;
  q public.automation_schedule_quarantines%ROWTYPE;
  r public.automation_runs%ROWTYPE;
  evidence jsonb;source_workflow uuid;used integer;
BEGIN
 IF p_user_id IS NULL OR p_request_key IS NULL OR p_source_id IS NULL OR
    p_source_kind NOT IN ('schedule_failed','schedule_expired_lease',
      'schedule_quarantine','completed_run_review') OR p_source_kind IS NULL OR
    p_severity NOT IN ('low','medium','high') OR p_severity IS NULL OR
    p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 8 AND 100 OR
    p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 8 AND 500 THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO old FROM public.automation_incidents
   WHERE user_id=p_user_id AND creation_key=p_request_key;
 IF FOUND THEN
   IF old.source_kind IS DISTINCT FROM p_source_kind OR
      old.source_id IS DISTINCT FROM p_source_id OR
      old.title IS DISTINCT FROM btrim(p_title) OR
      old.severity IS DISTINCT FROM p_severity OR
      NOT EXISTS(SELECT 1 FROM public.automation_incident_events
        WHERE incident_id=old.id AND user_id=p_user_id AND kind='opened'
          AND note=btrim(p_note)) THEN
     RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
   END IF;
   RETURN jsonb_build_object('ok',true,'replayed',true,'incidentId',old.id,
     'status',old.status,'revision',old.revision);
 END IF;
 IF EXISTS(SELECT 1 FROM public.automation_incidents
   WHERE user_id=p_user_id AND source_kind=p_source_kind AND source_id=p_source_id) THEN
   RETURN jsonb_build_object('ok',false,'reason','already_reported');
 END IF;
 SELECT count(*) INTO used FROM public.automation_incidents
   WHERE user_id=p_user_id AND created_at>
     pg_catalog.statement_timestamp()-interval '24 hours';
 IF used>=10 THEN RETURN jsonb_build_object('ok',false,'reason','incident_daily_limit'); END IF;
 SELECT count(*) INTO used FROM public.automation_incidents
   WHERE user_id=p_user_id AND status<>'resolved';
 IF used>=20 THEN RETURN jsonb_build_object('ok',false,'reason','incident_open_limit'); END IF;
 IF p_source_kind IN ('schedule_failed','schedule_expired_lease') THEN
   SELECT * INTO s FROM public.automation_schedules
     WHERE id=p_source_id AND user_id=p_user_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','evidence_not_found'); END IF;
   IF p_source_kind='schedule_failed' AND s.last_status<>'failed' THEN
     RETURN jsonb_build_object('ok',false,'reason','evidence_not_ready');
   END IF;
   IF p_source_kind='schedule_expired_lease' AND NOT
      (s.lease_token IS NOT NULL AND
       s.lease_expires_at<=pg_catalog.statement_timestamp()) THEN
     RETURN jsonb_build_object('ok',false,'reason','evidence_not_ready');
   END IF;
   source_workflow:=s.workflow_id;
   evidence:=jsonb_build_object('scheduleId',s.id,
     'scheduleRevision',s.revision,'observedStatus',s.last_status,
     'attempts',s.attempt_count,'leaseExpired',
     s.lease_token IS NOT NULL AND
       s.lease_expires_at<=pg_catalog.statement_timestamp());
 ELSIF p_source_kind='schedule_quarantine' THEN
   SELECT * INTO q FROM public.automation_schedule_quarantines
     WHERE user_id=p_user_id AND request_key=p_source_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','evidence_not_found'); END IF;
   SELECT workflow_id INTO source_workflow FROM public.automation_schedules
     WHERE id=q.schedule_id AND user_id=p_user_id;
   evidence:=jsonb_build_object('quarantineReceiptId',q.request_key,
      'scheduleId',q.schedule_id,'quarantineReason',q.reason,
      'scheduleRevisionAfterHold',q.new_revision,'quarantinedAt',q.created_at);
 ELSE
   SELECT * INTO r FROM public.automation_runs
     WHERE id=p_source_id AND user_id=p_user_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','evidence_not_found'); END IF;
   source_workflow:=r.workflow_id;
   evidence:=jsonb_build_object('runId',r.id,'completedAt',r.created_at,
     'channel',r.trigger_type,'workflowRevision',r.workflow_revision,
     'inputLines',r.input_lines,'outputLines',r.output_lines);
 END IF;
 INSERT INTO public.automation_incidents(
   user_id,creation_key,source_kind,source_id,workflow_id,title,severity,source_evidence
 ) VALUES(p_user_id,p_request_key,p_source_kind,p_source_id,source_workflow,
   btrim(p_title),p_severity,evidence) RETURNING * INTO new_inc;
 INSERT INTO public.automation_incident_events(
   user_id,incident_id,request_key,kind,from_status,to_status,note
 ) VALUES(p_user_id,new_inc.id,p_request_key,'opened',NULL,'open',btrim(p_note));
 RETURN jsonb_build_object('ok',true,'replayed',false,'incidentId',new_inc.id,
   'status',new_inc.status,'revision',new_inc.revision);
END;
$inc$;
REVOKE ALL ON FUNCTION public.automation_open_incident(
 uuid,text,uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_open_incident(
 uuid,text,uuid,text,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_transition_incident(
 p_user_id uuid,p_incident_id uuid,p_revision integer,
 p_next_status text,p_note text,p_request_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $trans$
DECLARE inc public.automation_incidents%ROWTYPE;
  past public.automation_incident_events%ROWTYPE;
  used integer;previous_status text;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL OR p_request_key IS NULL OR
    p_revision IS NULL OR p_revision NOT BETWEEN 1 AND 2147483646 OR
    p_next_status NOT IN ('investigating','resolved') OR p_next_status IS NULL OR
    p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 8 AND 500 THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO past FROM public.automation_incident_events
    WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
    IF past.incident_id IS DISTINCT FROM p_incident_id OR
       past.kind<>'transition' OR
       past.to_status IS DISTINCT FROM p_next_status OR
       past.note IS DISTINCT FROM btrim(p_note) THEN
      RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
    END IF;
    SELECT * INTO inc FROM public.automation_incidents
      WHERE id=p_incident_id AND user_id=p_user_id;
    RETURN jsonb_build_object('ok',true,'replayed',true,
      'incidentId',inc.id,'status',inc.status,'revision',inc.revision);
 END IF;
 SELECT * INTO inc FROM public.automation_incidents
   WHERE user_id=p_user_id AND id=p_incident_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF inc.revision<>p_revision THEN
   RETURN jsonb_build_object('ok',false,'reason','stale_incident');
 END IF;
 IF NOT ((inc.status='open' AND p_next_status='investigating') OR
     (inc.status='investigating' AND p_next_status='resolved') OR
     (inc.status='resolved' AND p_next_status='investigating')) THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_transition');
 END IF;
 SELECT count(*) INTO used FROM public.automation_incident_events
   WHERE incident_id=inc.id;
 IF used>=30 THEN RETURN jsonb_build_object('ok',false,'reason','incident_event_limit'); END IF;
 previous_status:=inc.status;
 UPDATE public.automation_incidents SET status=p_next_status,
   revision=revision+1,updated_at=pg_catalog.statement_timestamp()
   WHERE id=inc.id AND user_id=p_user_id RETURNING * INTO inc;
 INSERT INTO public.automation_incident_events(
   user_id,incident_id,request_key,kind,from_status,to_status,note)
 VALUES(p_user_id,inc.id,p_request_key,'transition',
   previous_status,p_next_status,btrim(p_note));
 RETURN jsonb_build_object('ok',true,'replayed',false,
   'incidentId',inc.id,'status',inc.status,'revision',inc.revision);
END;
$trans$;
REVOKE ALL ON FUNCTION public.automation_transition_incident(
 uuid,uuid,integer,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_transition_incident(
 uuid,uuid,integer,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_incident_inbox(
 p_user_id uuid,p_status text,p_severity text,p_limit integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $list$
DECLARE items jsonb;total integer;by_status jsonb;
BEGIN
 IF p_user_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 30 OR
    (p_status IS NOT NULL AND p_status NOT IN ('open','investigating','resolved')) OR
    (p_severity IS NOT NULL AND p_severity NOT IN ('low','medium','high')) THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 SELECT count(*) INTO total FROM public.automation_incidents
   WHERE user_id=p_user_id AND
    (p_status IS NULL OR status=p_status) AND
    (p_severity IS NULL OR severity=p_severity);
 SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.updated_at DESC,i.id DESC),
    '[]'::jsonb) INTO items FROM (
    SELECT id,source_kind,source_id,workflow_id,title,severity,status,revision,
      source_evidence,created_at,updated_at
    FROM public.automation_incidents
    WHERE user_id=p_user_id AND
      (p_status IS NULL OR status=p_status) AND
      (p_severity IS NULL OR severity=p_severity)
    ORDER BY updated_at DESC,id DESC LIMIT p_limit
 ) i;
 SELECT jsonb_build_object(
    'open',count(*) FILTER(WHERE status='open'),
    'investigating',count(*) FILTER(WHERE status='investigating'),
    'resolved',count(*) FILTER(WHERE status='resolved'),
    'highUnresolved',count(*) FILTER(WHERE severity='high' AND status<>'resolved'),
    'scheduleSources',count(*) FILTER(WHERE source_kind LIKE 'schedule_%'),
    'runReviewSources',count(*) FILTER(WHERE source_kind='completed_run_review')
 ) INTO by_status FROM public.automation_incidents WHERE user_id=p_user_id;
 RETURN jsonb_build_object('ok',true,'source','owner_recorded_incidents',
   'rows',items,'totalMatching',total,'included',jsonb_array_length(items),
   'truncated',total>jsonb_array_length(items),'counts',by_status,
   'allFailuresMeasured',false,'autoRecoveryEnabled',false);
END;
$list$;
REVOKE ALL ON FUNCTION public.automation_incident_inbox(uuid,text,text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_inbox(uuid,text,text,integer)
 TO service_role;

CREATE OR REPLACE FUNCTION public.automation_incident_timeline(
 p_user_id uuid,p_incident_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $hist$
DECLARE events jsonb;count_events integer;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.automation_incidents
    WHERE id=p_incident_id AND user_id=p_user_id) THEN
   RETURN jsonb_build_object('ok',false,'reason','not_found');
 END IF;
 SELECT count(*) INTO count_events FROM public.automation_incident_events
   WHERE incident_id=p_incident_id AND user_id=p_user_id;
 SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.id ASC),
   '[]'::jsonb) INTO events FROM (
   SELECT id,kind,from_status,to_status,note,created_at
   FROM public.automation_incident_events
   WHERE incident_id=p_incident_id AND user_id=p_user_id
   ORDER BY id ASC LIMIT 30
 ) e;
 RETURN jsonb_build_object('ok',true,'incidentId',p_incident_id,
   'events',events,'total',count_events,'truncated',count_events>30);
END;
$hist$;
REVOKE ALL ON FUNCTION public.automation_incident_timeline(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_timeline(uuid,uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.automation_review_quarantine(
 p_user_id uuid,p_quarantine_key uuid,p_decision text,
 p_note text,p_request_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $review$
DECLARE past public.automation_recovery_reviews%ROWTYPE;
  q public.automation_schedule_quarantines%ROWTYPE;
  s public.automation_schedules%ROWTYPE;
  new_review public.automation_recovery_reviews%ROWTYPE;used integer;
BEGIN
 IF p_user_id IS NULL OR p_quarantine_key IS NULL OR p_request_key IS NULL OR
    p_decision IS NULL OR p_decision NOT IN
      ('keep_quarantined','reviewed_for_manual_restore') OR
    p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 12 AND 500 THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO past FROM public.automation_recovery_reviews
   WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
   IF past.quarantine_request_key IS DISTINCT FROM p_quarantine_key OR
      past.decision IS DISTINCT FROM p_decision OR
      past.note IS DISTINCT FROM btrim(p_note) THEN
     RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
   END IF;
   RETURN jsonb_build_object('ok',true,'replayed',true,
     'reviewId',past.id,'decision',past.decision,'scheduleId',past.schedule_id,
     'automaticRestore',false,'externalExecutionTriggered',false);
 END IF;
 IF EXISTS(SELECT 1 FROM public.automation_recovery_reviews
   WHERE user_id=p_user_id AND quarantine_request_key=p_quarantine_key) THEN
   RETURN jsonb_build_object('ok',false,'reason','already_reviewed');
 END IF;
 SELECT * INTO q FROM public.automation_schedule_quarantines
   WHERE user_id=p_user_id AND request_key=p_quarantine_key;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT * INTO s FROM public.automation_schedules
   WHERE user_id=p_user_id AND id=q.schedule_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','schedule_missing'); END IF;
 IF s.enabled OR s.revision<>q.new_revision OR
    s.lease_token IS NOT NULL OR s.lease_expires_at IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','schedule_not_quarantined');
 END IF;
 SELECT count(*) INTO used FROM public.automation_recovery_reviews
   WHERE user_id=p_user_id AND created_at>
     pg_catalog.statement_timestamp()-interval '24 hours';
 IF used>=5 THEN RETURN jsonb_build_object('ok',false,'reason','recovery_review_limit'); END IF;
 INSERT INTO public.automation_recovery_reviews(
   user_id,request_key,quarantine_request_key,schedule_id,schedule_revision,
   decision,note
 ) VALUES(p_user_id,p_request_key,p_quarantine_key,q.schedule_id,
   q.new_revision,p_decision,btrim(p_note)) RETURNING * INTO new_review;
 RETURN jsonb_build_object('ok',true,'replayed',false,
   'reviewId',new_review.id,'decision',new_review.decision,
   'scheduleId',new_review.schedule_id,'automaticRestore',false,
   'externalExecutionTriggered',false,'scheduleStillDisabled',true);
END;
$review$;
REVOKE ALL ON FUNCTION public.automation_review_quarantine(
 uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_review_quarantine(
 uuid,uuid,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_recovery_review_inbox(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $inbox$
DECLARE rows jsonb;total integer;
BEGIN
 IF p_user_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 SELECT count(*) INTO total FROM public.automation_schedule_quarantines
   WHERE user_id=p_user_id AND created_at>
     pg_catalog.statement_timestamp()-interval '30 days';
 SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.quarantined_at DESC),
   '[]'::jsonb) INTO rows FROM (
   SELECT q.request_key AS quarantine_key,q.schedule_id,q.reason,
     q.new_revision,q.created_at AS quarantined_at,
     s.enabled AS current_enabled,s.revision AS current_revision,
     COALESCE((s.lease_token IS NOT NULL AND
      s.lease_expires_at>pg_catalog.statement_timestamp()),false) AS lease_active,
     r.id AS review_id,r.decision AS review_decision,r.created_at AS reviewed_at
   FROM public.automation_schedule_quarantines q
   LEFT JOIN public.automation_schedules s ON s.id=q.schedule_id AND s.user_id=q.user_id
   LEFT JOIN public.automation_recovery_reviews r
     ON r.user_id=q.user_id AND r.quarantine_request_key=q.request_key
   WHERE q.user_id=p_user_id AND q.created_at>
      pg_catalog.statement_timestamp()-interval '30 days'
   ORDER BY q.created_at DESC LIMIT 20
 ) t;
 RETURN jsonb_build_object('ok',true,'source','real_quarantine_receipts',
   'rows',rows,'totalMatching',total,'truncated',total>20,
   'automaticRecoveryEnabled',false);
END;
$inbox$;
REVOKE ALL ON FUNCTION public.automation_recovery_review_inbox(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_recovery_review_inbox(uuid)
 TO service_role;
