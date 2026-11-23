-- ETERNYX Automation Phase 2U.
-- Versioned, owner-attested package handoff for SEPARATE manual release
-- verification. This is neither a release approval nor a deployment action.
-- Existing Phase 2T packages and reviews retain their original semantics.
CREATE TABLE public.automation_case_audit_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.automation_case_audit_packages(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES public.automation_case_audit_reviews(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  incident_revision integer NOT NULL CHECK(incident_revision BETWEEN 1 AND 2147483647),
  note text NOT NULL CHECK(char_length(btrim(note)) BETWEEN 12 AND 500),
  acknowledged_owner_review boolean NOT NULL CHECK(acknowledged_owner_review),
  acknowledged_ci_unverified boolean NOT NULL CHECK(acknowledged_ci_unverified),
  acknowledged_deployment_unverified boolean NOT NULL CHECK(acknowledged_deployment_unverified),
  acknowledged_worker_unverified boolean NOT NULL CHECK(acknowledged_worker_unverified),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_key)
);
CREATE INDEX automation_case_audit_handoffs_owner_pkg
 ON public.automation_case_audit_handoffs(user_id,package_id,sequence DESC);
ALTER TABLE public.automation_case_audit_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_case_audit_handoffs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.automation_case_audit_handoffs TO service_role;

-- Database-backed, owner-bound rollup. "eligibleForManualHandoff" means
-- stored records are current and the latest owner review is positive. It
-- does NOT verify GitHub CI, deployment, runtime worker or two-person signoff.
CREATE OR REPLACE FUNCTION public.automation_case_audit_handoff_assessment(
 p_user_id uuid,p_incident_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE inc public.automation_incidents%ROWTYPE;
 pkg public.automation_case_audit_packages%ROWTYPE;
 rev public.automation_case_audit_reviews%ROWTYPE;
 receipt public.automation_case_audit_handoffs%ROWTYPE;
 current_projection jsonb;case_check jsonb;
 review_current boolean;handoff_current boolean;
 case_consistent boolean;
 packages jsonb:='[]'::jsonb;
 rows_total integer:=0;ready_count integer:=0;handoff_count integer:=0;
 actual_evidence boolean;fresh boolean;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 SELECT * INTO inc FROM public.automation_incidents
  WHERE user_id=p_user_id AND id=p_incident_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT public.automation_incident_lifecycle_check(p_user_id,p_incident_id)
 INTO case_check;
 IF case_check->>'ok'<>'true' THEN
  RETURN jsonb_build_object('ok',false,'reason','case_unavailable');
 END IF;
 case_consistent:=case_check->>'consistent'='true';
 SELECT count(*) INTO rows_total FROM public.automation_case_audit_packages
  WHERE user_id=p_user_id AND incident_id=p_incident_id;
 FOR pkg IN SELECT * FROM public.automation_case_audit_packages
  WHERE user_id=p_user_id AND incident_id=p_incident_id
  ORDER BY sequence DESC LIMIT 8
 LOOP
   SELECT public.automation_case_audit_projection(
     p_user_id,p_incident_id,pkg.evidence_id) INTO current_projection;
   fresh:=current_projection IS NOT DISTINCT FROM pkg.snapshot
     AND case_consistent AND pkg.incident_revision=inc.revision;
   actual_evidence:=EXISTS(
     SELECT 1 FROM public.automation_incident_evidence e
      WHERE e.id=pkg.evidence_id AND e.user_id=p_user_id
       AND e.incident_id=p_incident_id
   );
   SELECT * INTO rev FROM public.automation_case_audit_reviews
     WHERE user_id=p_user_id AND package_id=pkg.id
     ORDER BY sequence DESC LIMIT 1;
   review_current:=fresh AND actual_evidence AND
     rev.id IS NOT NULL AND
     rev.decision='reviewed_for_manual_release_checklist' AND
     rev.acknowledged_source AND rev.acknowledged_no_deployment AND
     rev.acknowledged_no_crypto_proof;
   SELECT * INTO receipt FROM public.automation_case_audit_handoffs
     WHERE user_id=p_user_id AND package_id=pkg.id
     ORDER BY sequence DESC LIMIT 1;
   handoff_current:=review_current AND receipt.id IS NOT NULL AND
     receipt.review_id=rev.id AND
     receipt.incident_revision=inc.revision;
   IF review_current THEN ready_count:=ready_count+1; END IF;
   IF handoff_current THEN handoff_count:=handoff_count+1; END IF;
   packages:=packages||jsonb_build_array(jsonb_build_object(
    'packageId',pkg.id,'incidentRevision',pkg.incident_revision,
    'evidenceId',pkg.evidence_id,'capturedAt',pkg.created_at,
    'sourceSnapshotCurrent',fresh,'evidenceExists',actual_evidence,
    'latestReviewId',rev.id,'latestReviewDecision',rev.decision,
    'latestReviewAt',rev.created_at,
    'eligibleForManualHandoff',review_current,
    'latestHandoffId',receipt.id,'latestHandoffReviewId',receipt.review_id,
    'latestHandoffAt',receipt.created_at,
    'manualHandoffCurrent',handoff_current,
    'freshnessReason',CASE
      WHEN NOT actual_evidence THEN 'evidence_missing'
      WHEN NOT case_consistent THEN 'source_ledger_inconsistent'
      WHEN NOT fresh THEN 'source_changed'
      WHEN rev.id IS NULL THEN 'no_manual_review'
      WHEN rev.decision='needs_attention' THEN 'latest_review_needs_attention'
      WHEN NOT review_current THEN 'review_limitations_missing'
      ELSE 'current_owner_review' END
   ));
 END LOOP;
 RETURN jsonb_build_object(
   'ok',true,'source','owner_audit_handoff_metadata',
   'incidentId',inc.id,'incidentStatus',inc.status,
   'incidentRevision',inc.revision,'caseConsistent',case_consistent,
   'totalPackages',rows_total,'packages',packages,
   'eligibleForManualHandoffCount',ready_count,
   'currentManualHandoffCount',handoff_count,
   'generatedAt',pg_catalog.statement_timestamp(),
   'ownerAttestationOnly',true,'twoPersonReviewed',false,
   'ciVerified',false,'deploymentVerified',false,
   'workerVerified',false,'cryptographicProof',false,
   'externalExecutionTriggered',false
 );
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_case_audit_handoff_assessment(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_case_audit_handoff_assessment(uuid,uuid)
 TO service_role;

-- Explicit, idempotent acknowledgment tied to the EXACT latest review and
-- current persisted source snapshot, not just its earlier audit package.
-- Revalidate under the case row lock before inserting the immutable receipt.
CREATE OR REPLACE FUNCTION public.automation_attest_case_audit_handoff(
 p_user_id uuid,p_package_id uuid,p_review_id uuid,p_incident_revision integer,
 p_note text,p_ack_owner_review boolean,p_ack_ci_unverified boolean,
 p_ack_deployment_unverified boolean,p_ack_worker_unverified boolean,
 p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE replay public.automation_case_audit_handoffs%ROWTYPE;
 original public.automation_case_audit_packages%ROWTYPE;
 inc public.automation_incidents%ROWTYPE;
 latest_review public.automation_case_audit_reviews%ROWTYPE;
 made public.automation_case_audit_handoffs%ROWTYPE;
 projected jsonb;case_check jsonb;
 daily_count integer;case_count integer;
BEGIN
 IF p_user_id IS NULL OR p_package_id IS NULL OR p_review_id IS NULL OR
    p_request_key IS NULL OR p_incident_revision IS NULL OR
    p_incident_revision NOT BETWEEN 1 AND 2147483647 OR
    p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 12 AND 500 OR
    p_ack_owner_review IS DISTINCT FROM true OR
    p_ack_ci_unverified IS DISTINCT FROM true OR
    p_ack_deployment_unverified IS DISTINCT FROM true OR
    p_ack_worker_unverified IS DISTINCT FROM true THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid_handoff_attestation');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO replay FROM public.automation_case_audit_handoffs
  WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
  IF replay.package_id IS DISTINCT FROM p_package_id OR
    replay.review_id IS DISTINCT FROM p_review_id OR
    replay.incident_revision IS DISTINCT FROM p_incident_revision OR
    replay.note IS DISTINCT FROM btrim(p_note) OR
    replay.acknowledged_owner_review IS DISTINCT FROM p_ack_owner_review OR
    replay.acknowledged_ci_unverified IS DISTINCT FROM p_ack_ci_unverified OR
    replay.acknowledged_deployment_unverified IS DISTINCT FROM
      p_ack_deployment_unverified OR
    replay.acknowledged_worker_unverified IS DISTINCT FROM p_ack_worker_unverified THEN
   RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
  END IF;
  RETURN jsonb_build_object('ok',true,'replayed',true,'handoffId',replay.id,
    'packageId',replay.package_id,'reviewId',replay.review_id,
    'incidentRevision',replay.incident_revision,
    'ownerAttestationOnly',true,'automaticRelease',false,
    'externalExecutionTriggered',false);
 END IF;
 SELECT * INTO original FROM public.automation_case_audit_packages
  WHERE user_id=p_user_id AND id=p_package_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT * INTO inc FROM public.automation_incidents
  WHERE id=original.incident_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF inc.revision<>p_incident_revision OR
    original.incident_revision<>p_incident_revision THEN
   RETURN jsonb_build_object('ok',false,'reason','stale_handoff_revision');
 END IF;
 SELECT * INTO latest_review FROM public.automation_case_audit_reviews
  WHERE user_id=p_user_id AND package_id=original.id
  ORDER BY sequence DESC LIMIT 1;
 IF latest_review.id IS NULL OR latest_review.id<>p_review_id OR
    latest_review.decision<>'reviewed_for_manual_release_checklist' OR
    NOT latest_review.acknowledged_source OR
    NOT latest_review.acknowledged_no_deployment OR
    NOT latest_review.acknowledged_no_crypto_proof THEN
   RETURN jsonb_build_object('ok',false,'reason','latest_manual_review_required');
 END IF;
 SELECT public.automation_case_audit_projection(
   p_user_id,inc.id,original.evidence_id) INTO projected;
 SELECT public.automation_incident_lifecycle_check(p_user_id,inc.id)
 INTO case_check;
 IF projected IS NULL OR projected IS DISTINCT FROM original.snapshot OR
    case_check->>'consistent'<>'true' THEN
   RETURN jsonb_build_object('ok',false,'reason','stale_handoff_source');
 END IF;
 SELECT count(*) INTO daily_count FROM public.automation_case_audit_handoffs
  WHERE user_id=p_user_id AND created_at>pg_catalog.statement_timestamp()-interval '24 hours';
 SELECT count(*) INTO case_count FROM public.automation_case_audit_handoffs
  WHERE user_id=p_user_id AND package_id=p_package_id;
 IF daily_count>=20 OR case_count>=4 THEN
   RETURN jsonb_build_object('ok',false,'reason','handoff_limit');
 END IF;
 INSERT INTO public.automation_case_audit_handoffs(
   user_id,package_id,review_id,request_key,incident_revision,note,
   acknowledged_owner_review,acknowledged_ci_unverified,
   acknowledged_deployment_unverified,acknowledged_worker_unverified)
 VALUES(p_user_id,p_package_id,p_review_id,p_request_key,p_incident_revision,
   btrim(p_note),p_ack_owner_review,p_ack_ci_unverified,
   p_ack_deployment_unverified,p_ack_worker_unverified)
 RETURNING * INTO made;
 RETURN jsonb_build_object('ok',true,'replayed',false,'handoffId',made.id,
   'packageId',made.package_id,'reviewId',made.review_id,
   'incidentRevision',made.incident_revision,
   'ownerAttestationOnly',true,'automaticRelease',false,
   'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_attest_case_audit_handoff(
 uuid,uuid,uuid,integer,text,boolean,boolean,boolean,boolean,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_attest_case_audit_handoff(
 uuid,uuid,uuid,integer,text,boolean,boolean,boolean,boolean,uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.automation_case_audit_handoff_history(
 p_user_id uuid,p_package_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE original public.automation_case_audit_packages%ROWTYPE;
 items jsonb;total integer;
BEGIN
 IF p_user_id IS NULL OR p_package_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 SELECT * INTO original FROM public.automation_case_audit_packages
  WHERE user_id=p_user_id AND id=p_package_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT count(*) INTO total FROM public.automation_case_audit_handoffs
  WHERE user_id=p_user_id AND package_id=p_package_id;
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.sequence DESC),'[]'::jsonb)
 INTO items FROM (
   SELECT id,sequence,review_id,incident_revision,note,
     acknowledged_owner_review,acknowledged_ci_unverified,
     acknowledged_deployment_unverified,acknowledged_worker_unverified,created_at
   FROM public.automation_case_audit_handoffs
   WHERE user_id=p_user_id AND package_id=p_package_id
   ORDER BY sequence DESC LIMIT 4
 ) x;
 RETURN jsonb_build_object('ok',true,'source','owner_handoff_receipt_history',
   'packageId',p_package_id,'incidentId',original.incident_id,
   'rows',items,'total',total,
   'ownerAttestationOnly',true,'releaseVerified',false,
   'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_case_audit_handoff_history(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_case_audit_handoff_history(uuid,uuid)
 TO service_role;
