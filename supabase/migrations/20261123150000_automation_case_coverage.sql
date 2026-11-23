-- ETERNYX Automation Phase 2S. Explicitly paged owner case ledger review.
-- Fixed created_at/id ordering does not shift on status updates. This is a
-- multi-request read-only pass, NOT an atomic database snapshot or global
-- release certification. No automatic action, retry or remediation.
CREATE INDEX IF NOT EXISTS automation_incidents_owner_creation_cursor
 ON public.automation_incidents(user_id,created_at DESC,id DESC);
CREATE OR REPLACE FUNCTION public.automation_incident_coverage_page(
 p_user_id uuid,p_page_size integer,p_before_created_at timestamptz,p_before_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE
 rec record;
 result jsonb;
 rows jsonb:='[]'::jsonb;
 n integer:=0;
 inconsistent integer:=0;
 historical integer:=0;
 missing_evidence integer:=0;
 owner_total integer;
 has_more boolean:=false;
 next_time timestamptz;
 next_id uuid;
 inspected_at timestamptz;
BEGIN
 IF p_user_id IS NULL OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 20 OR
    ((p_before_created_at IS NULL) IS DISTINCT FROM (p_before_id IS NULL)) THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_coverage_cursor');
 END IF;
 inspected_at:=pg_catalog.statement_timestamp();
 SELECT count(*)::integer INTO owner_total FROM public.automation_incidents
   WHERE user_id=p_user_id;
 FOR rec IN
   SELECT i.id,i.created_at FROM public.automation_incidents i
   WHERE i.user_id=p_user_id AND
    (p_before_created_at IS NULL OR
      (i.created_at,i.id)<(p_before_created_at,p_before_id))
   ORDER BY i.created_at DESC,i.id DESC LIMIT p_page_size+1
 LOOP
   IF n>=p_page_size THEN
     has_more:=true;EXIT;
   END IF;
   SELECT public.automation_incident_lifecycle_check(p_user_id,rec.id) INTO result;
   IF result->>'ok'<>'true' OR result->>'source'<>'owner_case_ledger_consistency' THEN
      RETURN jsonb_build_object('ok',false,'reason','coverage_case_failed');
   END IF;
   n:=n+1;
   IF result->>'consistent'='false' THEN inconsistent:=inconsistent+1; END IF;
   IF result->>'historicalClosedPlanAfterReopen'='true' THEN
     historical:=historical+1;
   END IF;
   IF (result->>'capturedEvidenceCount')::integer=0 THEN
     missing_evidence:=missing_evidence+1;
   END IF;
   next_time:=rec.created_at;next_id:=rec.id;
   rows:=rows||jsonb_build_array(jsonb_build_object(
     'incidentId',rec.id,'createdAt',rec.created_at,
     'status',result->'incidentStatus',
     'revision',result->'incidentRevision',
     'consistent',result->'consistent','findings',result->'findings',
     'hasPlan',result->'hasPlan','planStage',result->'planStage',
     'evidenceCount',result->'capturedEvidenceCount',
     'closureApprovalCurrent',result->'closureApprovalCurrent',
     'reopenApprovalCurrent',result->'reopenApprovalCurrent',
     'historicalClosedPlanAfterReopen',result->'historicalClosedPlanAfterReopen'
   ));
 END LOOP;
 RETURN jsonb_build_object(
   'ok',true,'source','owner_case_coverage_page',
   'ordering','created_at_desc_id_desc',
   'scope','best_effort_multi_request_not_atomic_snapshot',
   'checkedAt',inspected_at,'ownerCaseTotalAtRead',owner_total,
   'pageSize',p_page_size,'returned',n,'rows',rows,
   'requestedCursor',CASE WHEN p_before_created_at IS NULL THEN NULL
     ELSE jsonb_build_object('beforeCreatedAt',p_before_created_at,
       'beforeId',p_before_id) END,
   'pageInconsistent',inconsistent,
   'pageHistoricalClosedAfterReopen',historical,
   'pageCasesWithNoEvidence',missing_evidence,
   'hasMore',has_more,
   'nextCursor',CASE WHEN has_more THEN jsonb_build_object(
     'beforeCreatedAt',next_time,'beforeId',next_id) ELSE NULL END,
   'allOwnerCasesCheckedInSinglePage',
     p_before_created_at IS NULL AND NOT has_more,
   'transactionallyConsistentAcrossPages',false,
   'cryptographicIntegrityVerified',false,
   'workerLivenessVerified',false,'automatedFailureDetection',false,
   'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_incident_coverage_page(
 uuid,integer,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_coverage_page(
 uuid,integer,timestamptz,uuid) TO service_role;
