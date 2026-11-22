-- ETERNYX Automation Phase 2L. Factual observability, metadata-only
-- owner exports and controlled schedule quarantine. No automatic retry, external
-- dispatch, secret export or guest-readable audit tables.

CREATE TABLE public.automation_audit_exports (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  workflow_id uuid,
  channel text CHECK(channel IS NULL OR channel IN ('manual','webhook','scheduled')),
  -- A bounded immutable snapshot, only pre-existing completed run metadata.
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_key),
  CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=125000)
);
CREATE INDEX automation_export_owner_recent
 ON public.automation_audit_exports(user_id,created_at DESC);
ALTER TABLE public.automation_audit_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_audit_exports FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.automation_audit_exports TO service_role;

CREATE TABLE public.automation_schedule_quarantines (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  schedule_id uuid NOT NULL,
  expected_revision integer NOT NULL CHECK(expected_revision>0),
  reason text NOT NULL CHECK(reason IN
    ('stale_lease','unexpected_behavior','manual_safety_hold')),
  previous_attempts integer NOT NULL,
  previous_status text NOT NULL,
  new_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_key)
);
CREATE INDEX automation_quarantine_owner_time
 ON public.automation_schedule_quarantines(user_id,created_at DESC);
ALTER TABLE public.automation_schedule_quarantines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_schedule_quarantines FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.automation_schedule_quarantines TO service_role;

-- No synthetic "success rate": only accepted completed-run receipts count.
-- Incomplete or failing attempts are NOT present in automation_runs.
CREATE OR REPLACE FUNCTION public.automation_observability_snapshot(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $observe$
DECLARE runs24 integer; runs7 integer; man24 integer; web24 integer;
  sch24 integer; maxrun timestamptz;
  webhook_enabled integer; webhook_paused integer;
  sch_enabled integer; sch_failed integer; sch_expired_lease integer;
  sch_live_lease integer; pending_approvals integer; stale_approvals integer;
  approvals_rejected integer; policies_paused integer; recent_export integer;
  recent_quarantine integer;
BEGIN
 IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
 SELECT count(*),count(*) FILTER(WHERE trigger_type='manual'),
   count(*) FILTER(WHERE trigger_type='webhook'),
   count(*) FILTER(WHERE trigger_type='scheduled'),max(created_at)
   INTO runs24,man24,web24,sch24,maxrun
   FROM public.automation_runs
   WHERE user_id=p_user_id AND created_at>
     pg_catalog.statement_timestamp()-interval '24 hours';
 SELECT count(*) INTO runs7 FROM public.automation_runs
   WHERE user_id=p_user_id AND created_at>
     pg_catalog.statement_timestamp()-interval '7 days';
 SELECT count(*) FILTER(WHERE enabled),
   count(*) FILTER(WHERE NOT enabled)
   INTO webhook_enabled,webhook_paused FROM public.automation_webhook_triggers
   WHERE user_id=p_user_id;
 SELECT count(*) FILTER(WHERE enabled),
   count(*) FILTER(WHERE last_status='failed'),
   count(*) FILTER(WHERE lease_token IS NOT NULL
      AND lease_expires_at<=pg_catalog.statement_timestamp()),
   count(*) FILTER(WHERE lease_token IS NOT NULL
      AND lease_expires_at>pg_catalog.statement_timestamp())
   INTO sch_enabled,sch_failed,sch_expired_lease,sch_live_lease
   FROM public.automation_schedules WHERE user_id=p_user_id;
 SELECT count(*) FILTER(WHERE status='pending' AND
      expires_at>pg_catalog.statement_timestamp()),
   count(*) FILTER(WHERE status='pending' AND
      expires_at<=pg_catalog.statement_timestamp()),
   count(*) FILTER(WHERE status='rejected')
   INTO pending_approvals,stale_approvals,approvals_rejected
   FROM public.automation_approval_requests WHERE user_id=p_user_id;
 SELECT count(*) INTO policies_paused
  FROM public.automation_workflows WHERE user_id=p_user_id AND active=false;
 SELECT count(*) INTO recent_export FROM public.automation_audit_exports
  WHERE user_id=p_user_id AND created_at>
    pg_catalog.statement_timestamp()-interval '24 hours';
 SELECT count(*) INTO recent_quarantine FROM public.automation_schedule_quarantines
  WHERE user_id=p_user_id AND created_at>
    pg_catalog.statement_timestamp()-interval '24 hours';
 RETURN jsonb_build_object(
   'ok',true,'source','measured_database_metadata',
   'runs24h',runs24,'runs7d',runs7,'manual24h',man24,
   'webhook24h',web24,'scheduled24h',sch24,'lastCompletedAt',maxrun,
   'enabledWebhooks',webhook_enabled,'disabledWebhooks',webhook_paused,
   'enabledSchedules',sch_enabled,'failedScheduleStates',sch_failed,
   'expiredScheduleLeases',sch_expired_lease,'activeScheduleLeases',sch_live_lease,
   'pendingApprovals',pending_approvals,'pastDuePendingApprovals',stale_approvals,
   'rejectedApprovalStates',approvals_rejected,'pausedWorkflows',policies_paused,
   'auditExports24h',recent_export,'auditExportLimit24h',5,
   'quarantines24h',recent_quarantine,'quarantineLimit24h',5,
   'successfulExecutionsOnly',true,'allAttemptFailuresMeasured',false,
   'liveWorkerVerified',false,'externalDeliveryVerified',false);
END;
$observe$;
REVOKE ALL ON FUNCTION public.automation_observability_snapshot(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_observability_snapshot(uuid) TO service_role;

-- Explicit request UUID and 5/day quota; immutable snapshot prevents a replay
-- from silently exporting a DIFFERENT set of completed runs.
CREATE OR REPLACE FUNCTION public.automation_prepare_audit_export(
  p_user_id uuid,p_request_key uuid,p_workflow_id uuid,p_channel text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $export$
DECLARE past public.automation_audit_exports%ROWTYPE;
  current_snapshot jsonb;rows jsonb;count_all integer;used integer;
  cutoff timestamptz;
BEGIN
 IF p_user_id IS NULL OR p_request_key IS NULL OR
    (p_channel IS NOT NULL AND p_channel NOT IN ('manual','webhook','scheduled')) THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO past FROM public.automation_audit_exports
   WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
   IF past.workflow_id IS DISTINCT FROM p_workflow_id OR
     past.channel IS DISTINCT FROM p_channel THEN
     RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
   END IF;
   RETURN jsonb_build_object('ok',true,'replayed',true,
     'snapshot',past.snapshot,'receiptId',past.request_key);
 END IF;
 IF p_workflow_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.automation_workflows
     WHERE id=p_workflow_id AND user_id=p_user_id) THEN
   RETURN jsonb_build_object('ok',false,'reason','not_found');
 END IF;
 SELECT count(*) INTO used FROM public.automation_audit_exports
   WHERE user_id=p_user_id AND created_at>
     pg_catalog.statement_timestamp()-interval '24 hours';
 IF used>=5 THEN RETURN jsonb_build_object('ok',false,'reason','daily_export_limit'); END IF;
 cutoff:=pg_catalog.statement_timestamp()-interval '7 days';
 SELECT count(*) INTO count_all FROM public.automation_runs
   WHERE user_id=p_user_id AND created_at>=cutoff
   AND (p_workflow_id IS NULL OR workflow_id=p_workflow_id)
   AND (p_channel IS NULL OR trigger_type=p_channel);
 SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC),
   '[]'::jsonb) INTO rows FROM (
   SELECT id,workflow_id,workflow_revision,trigger_type,created_at,
     input_lines,output_lines,input_characters,output_characters,trace
   FROM public.automation_runs WHERE user_id=p_user_id AND created_at>=cutoff
     AND (p_workflow_id IS NULL OR workflow_id=p_workflow_id)
     AND (p_channel IS NULL OR trigger_type=p_channel)
   ORDER BY created_at DESC,id DESC LIMIT 100
 ) r;
 current_snapshot:=jsonb_build_object(
   'schema','eternyx-automation-audit-v1','source','database_completed_runs',
   'generatedAt',pg_catalog.statement_timestamp(),
   'rangeDays',7,'workflowId',p_workflow_id,'channel',p_channel,
   'totalMatching',count_all,'included',jsonb_array_length(rows),
   'truncated',count_all>100,
   'rawInputsIncluded',false,'rawOutputsIncluded',false,'rows',rows);
 IF octet_length(current_snapshot::text)>125000 THEN
   RETURN jsonb_build_object('ok',false,'reason','export_too_large');
 END IF;
 INSERT INTO public.automation_audit_exports(
   user_id,request_key,workflow_id,channel,snapshot
 ) VALUES(p_user_id,p_request_key,p_workflow_id,p_channel,current_snapshot);
 RETURN jsonb_build_object('ok',true,'replayed',false,
   'snapshot',current_snapshot,'receiptId',p_request_key);
END;
$export$;
REVOKE ALL ON FUNCTION public.automation_prepare_audit_export(uuid,uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_prepare_audit_export(uuid,uuid,uuid,text)
 TO service_role;

-- Quarantine NEVER starts/resumes a worker. An active unexpired lease must
-- finish or expire before this can touch the schedule.
CREATE OR REPLACE FUNCTION public.automation_quarantine_schedule(
 p_user_id uuid,p_schedule_id uuid,p_expected_revision integer,
 p_reason text,p_request_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $hold$
DECLARE s public.automation_schedules%ROWTYPE;
  prior public.automation_schedule_quarantines%ROWTYPE;
  used integer; oldattempt integer;oldstatus text;
BEGIN
 IF p_user_id IS NULL OR p_schedule_id IS NULL OR
   p_request_key IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
   OR p_reason IS NULL OR p_reason NOT IN
     ('stale_lease','unexpected_behavior','manual_safety_hold') THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO prior FROM public.automation_schedule_quarantines
   WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
   IF prior.schedule_id IS DISTINCT FROM p_schedule_id OR
     prior.expected_revision IS DISTINCT FROM p_expected_revision OR
     prior.reason IS DISTINCT FROM p_reason THEN
     RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
   END IF;
   RETURN jsonb_build_object('ok',true,'replayed',true,
     'scheduleId',prior.schedule_id,'newRevision',prior.new_revision,
     'enabled',false,'externalExecutionTriggered',false);
 END IF;
 SELECT * INTO s FROM public.automation_schedules WHERE
   id=p_schedule_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF s.revision<>p_expected_revision THEN
   RETURN jsonb_build_object('ok',false,'reason','stale_schedule');
 END IF;
 IF s.lease_token IS NOT NULL AND s.lease_expires_at>
   pg_catalog.statement_timestamp() THEN
   RETURN jsonb_build_object('ok',false,'reason','lease_active');
 END IF;
 IF s.enabled=false AND s.lease_token IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','already_disabled');
 END IF;
 IF s.revision>=2147483647 THEN
   RETURN jsonb_build_object('ok',false,'reason','revision_exhausted');
 END IF;
 SELECT count(*) INTO used FROM public.automation_schedule_quarantines
   WHERE user_id=p_user_id AND created_at>
     pg_catalog.statement_timestamp()-interval '24 hours';
 IF used>=5 THEN RETURN jsonb_build_object('ok',false,'reason','daily_quarantine_limit'); END IF;
 oldattempt:=s.attempt_count;oldstatus:=s.last_status;
 UPDATE public.automation_schedules SET
   enabled=false,revision=revision+1,
   lease_token=NULL,lease_expires_at=NULL,
   last_status='failed',run_request_key=gen_random_uuid(),
   updated_at=pg_catalog.statement_timestamp()
 WHERE id=s.id AND user_id=p_user_id RETURNING * INTO s;
 INSERT INTO public.automation_schedule_quarantines(
   user_id,request_key,schedule_id,expected_revision,reason,
   previous_attempts,previous_status,new_revision
 ) VALUES(p_user_id,p_request_key,p_schedule_id,p_expected_revision,p_reason,
   oldattempt,oldstatus,s.revision);
 RETURN jsonb_build_object('ok',true,'replayed',false,'scheduleId',s.id,
   'newRevision',s.revision,'enabled',false,'reason',p_reason,
   'previousAttempts',oldattempt,'previousStatus',oldstatus,
   'externalExecutionTriggered',false,'automaticRetryQueued',false);
END;
$hold$;
REVOKE ALL ON FUNCTION public.automation_quarantine_schedule(uuid,uuid,integer,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_quarantine_schedule(uuid,uuid,integer,text,uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.automation_prune_audit_recovery(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $prune$
DECLARE erased_exports integer;erased_quarantines integer;
BEGIN
 IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 DELETE FROM public.automation_audit_exports WHERE user_id=p_user_id
  AND created_at<pg_catalog.statement_timestamp()-interval '7 days';
 GET DIAGNOSTICS erased_exports=ROW_COUNT;
 DELETE FROM public.automation_schedule_quarantines WHERE user_id=p_user_id
  AND created_at<pg_catalog.statement_timestamp()-interval '7 days';
 GET DIAGNOSTICS erased_quarantines=ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'exports',erased_exports,
   'quarantines',erased_quarantines);
END;
$prune$;
REVOKE ALL ON FUNCTION public.automation_prune_audit_recovery(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_prune_audit_recovery(uuid) TO service_role;
