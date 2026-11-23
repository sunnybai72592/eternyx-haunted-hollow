-- ETERNYX Automation Phase 2T. Immutable, metadata-only owner audit
-- packages and manually attested review receipts. Never record an automatic
-- deployment, a release pass, system health, job execution or authorization.
CREATE TABLE public.automation_case_audit_packages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 incident_id uuid NOT NULL REFERENCES public.automation_incidents(id) ON DELETE CASCADE,
 evidence_id uuid NOT NULL REFERENCES public.automation_incident_evidence(id) ON DELETE CASCADE,
 request_key uuid NOT NULL,
 incident_revision integer NOT NULL CHECK(incident_revision>0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'
   AND octet_length(snapshot::text)<=4096),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE INDEX automation_case_audit_packages_owner_case
 ON public.automation_case_audit_packages(user_id,incident_id,sequence DESC);
CREATE INDEX automation_case_audit_packages_owner_recent
 ON public.automation_case_audit_packages(user_id,created_at DESC);
ALTER TABLE public.automation_case_audit_packages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_case_audit_packages FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.automation_case_audit_packages TO service_role;

CREATE TABLE public.automation_case_audit_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 package_id uuid NOT NULL REFERENCES public.automation_case_audit_packages(id) ON DELETE CASCADE,
 request_key uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('needs_attention','reviewed_for_manual_release_checklist')),
 note text NOT NULL CHECK(char_length(btrim(note)) BETWEEN 12 AND 500),
 acknowledged_source boolean NOT NULL,
 acknowledged_no_deployment boolean NOT NULL,
 acknowledged_no_crypto_proof boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE INDEX automation_case_audit_reviews_owner_pkg
 ON public.automation_case_audit_reviews(user_id,package_id,sequence DESC);
ALTER TABLE public.automation_case_audit_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_case_audit_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.automation_case_audit_reviews TO service_role;

-- Derive an allowlisted factual projection from existing owner records.
-- The selected evidence receipt must exist for this owner + incident.
-- This MUST NOT copy source_evidence, evidence.snapshot, notes, raw input,
-- job outputs, credentials, request fingerprints, or protected API tokens.
CREATE OR REPLACE FUNCTION public.automation_case_audit_projection(
 p_user_id uuid,p_incident_id uuid,p_evidence_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE item jsonb;e public.automation_incident_evidence%ROWTYPE;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL OR p_evidence_id IS NULL THEN
  RETURN NULL;
 END IF;
 SELECT id,evidence_kind,captured_at INTO e
 FROM public.automation_incident_evidence
 WHERE user_id=p_user_id AND incident_id=p_incident_id AND id=p_evidence_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT public.automation_incident_lifecycle_check(p_user_id,p_incident_id)
 INTO item;
 IF item->>'ok'<>'true' OR item->>'source'<>'owner_case_ledger_consistency' THEN
  RETURN NULL;
 END IF;
 RETURN jsonb_build_object(
  'source','owner_case_ledger_consistency',
  'incidentId',item->'incidentId',
  'incidentStatus',item->'incidentStatus',
  'incidentRevision',item->'incidentRevision',
  'consistent',item->'consistent',
  'findings',item->'findings',
  'capturedEvidenceCount',item->'capturedEvidenceCount',
  'hasPlan',item->'hasPlan',
  'planStage',item->'planStage',
  'planRevision',item->'planRevision',
  'acknowledgedSteps',item->'acknowledgedSteps',
  'plannedSteps',item->'plannedSteps',
  'incidentEventCount',item->'incidentEventCount',
  'planEventCount',item->'planEventCount',
  'closureDecisionCount',item->'closureDecisionCount',
  'reopenDecisionCount',item->'reopenDecisionCount',
  'auditLedgerCount',item->'auditLedgerCount',
  'auditProjectionCount',item->'auditProjectionCount',
  'evidenceId',to_jsonb(e.id),
  'evidenceKind',to_jsonb(e.evidence_kind),
  'evidenceCapturedAt',to_jsonb(e.captured_at),
  'cryptographicIntegrityVerified',false,
  'workerLivenessVerified',false,
  'releaseDeployed',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_case_audit_projection(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_case_audit_projection(uuid,uuid,uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.automation_create_case_audit_package(
 p_user_id uuid,p_incident_id uuid,p_incident_revision integer,
 p_evidence_id uuid,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE existing public.automation_case_audit_packages%ROWTYPE;
 created public.automation_case_audit_packages%ROWTYPE;
 inc public.automation_incidents%ROWTYPE;
 projection jsonb;daily_count integer;case_count integer;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL OR p_evidence_id IS NULL OR
    p_request_key IS NULL OR p_incident_revision IS NULL OR
    p_incident_revision<1 THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO existing FROM public.automation_case_audit_packages
  WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
   IF existing.incident_id IS DISTINCT FROM p_incident_id OR
      existing.evidence_id IS DISTINCT FROM p_evidence_id OR
      existing.incident_revision IS DISTINCT FROM p_incident_revision THEN
      RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
   END IF;
   RETURN jsonb_build_object('ok',true,'replayed',true,
     'packageId',existing.id,'incidentId',existing.incident_id,
     'incidentRevision',existing.incident_revision,
     'automaticRelease',false,'externalExecutionTriggered',false);
 END IF;
 SELECT * INTO inc FROM public.automation_incidents
   WHERE user_id=p_user_id AND id=p_incident_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF inc.revision<>p_incident_revision THEN
   RETURN jsonb_build_object('ok',false,'reason','stale_incident');
 END IF;
 SELECT public.automation_case_audit_projection(p_user_id,inc.id,p_evidence_id)
 INTO projection;
 IF projection IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','audit_evidence_not_found');
 END IF;
 IF projection->>'consistent'<>'true' THEN
   RETURN jsonb_build_object('ok',false,'reason','inconsistent_case_ledger');
 END IF;
 SELECT count(*) INTO daily_count FROM public.automation_case_audit_packages
  WHERE user_id=p_user_id AND created_at>pg_catalog.statement_timestamp()-interval '24 hours';
 SELECT count(*) INTO case_count FROM public.automation_case_audit_packages
  WHERE user_id=p_user_id AND incident_id=inc.id;
 IF daily_count>=30 OR case_count>=8 THEN
   RETURN jsonb_build_object('ok',false,'reason','audit_package_limit');
 END IF;
 INSERT INTO public.automation_case_audit_packages(
   user_id,incident_id,evidence_id,request_key,incident_revision,snapshot)
 VALUES(p_user_id,inc.id,p_evidence_id,p_request_key,p_incident_revision,projection)
 RETURNING * INTO created;
 RETURN jsonb_build_object('ok',true,'replayed',false,
    'packageId',created.id,'incidentId',created.incident_id,
    'incidentRevision',created.incident_revision,'automaticRelease',false,
    'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_create_case_audit_package(
 uuid,uuid,integer,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_create_case_audit_package(
 uuid,uuid,integer,uuid,uuid) TO service_role;

-- A "reviewed" decision only attests a human checked an immutable private
-- package and understood its limitations. It DOES NOT mean a release passed
-- CI or was deployed, and grants no permission to execute any operation.
CREATE OR REPLACE FUNCTION public.automation_review_case_audit_package(
 p_user_id uuid,p_package_id uuid,p_decision text,p_note text,
 p_acknowledged_source boolean,p_acknowledged_no_deployment boolean,
 p_acknowledged_no_crypto_proof boolean,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE original public.automation_case_audit_packages%ROWTYPE;
 replay public.automation_case_audit_reviews%ROWTYPE;
 added public.automation_case_audit_reviews%ROWTYPE;
 inc public.automation_incidents%ROWTYPE;
 current_projection jsonb;case_count integer;daily_count integer;
BEGIN
 IF p_user_id IS NULL OR p_package_id IS NULL OR p_request_key IS NULL OR
   p_decision IS NULL OR p_decision NOT IN
     ('needs_attention','reviewed_for_manual_release_checklist') OR
   p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 12 AND 500 OR
   p_acknowledged_source IS NULL OR
   p_acknowledged_no_deployment IS NULL OR
   p_acknowledged_no_crypto_proof IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 IF p_decision='reviewed_for_manual_release_checklist' AND
   (p_acknowledged_source IS DISTINCT FROM true OR
    p_acknowledged_no_deployment IS DISTINCT FROM true OR
    p_acknowledged_no_crypto_proof IS DISTINCT FROM true) THEN
   RETURN jsonb_build_object('ok',false,'reason','manual_limitations_not_acknowledged');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO replay FROM public.automation_case_audit_reviews
  WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
   IF replay.package_id IS DISTINCT FROM p_package_id OR
      replay.decision IS DISTINCT FROM p_decision OR
      replay.note IS DISTINCT FROM btrim(p_note) OR
      replay.acknowledged_source IS DISTINCT FROM p_acknowledged_source OR
      replay.acknowledged_no_deployment IS DISTINCT FROM p_acknowledged_no_deployment OR
      replay.acknowledged_no_crypto_proof IS DISTINCT FROM p_acknowledged_no_crypto_proof THEN
     RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
   END IF;
   RETURN jsonb_build_object('ok',true,'replayed',true,'reviewId',replay.id,
     'decision',replay.decision,'manualAttestationOnly',true,
     'automaticRelease',false,'externalExecutionTriggered',false);
 END IF;
 SELECT * INTO original FROM public.automation_case_audit_packages
   WHERE user_id=p_user_id AND id=p_package_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT * INTO inc FROM public.automation_incidents
   WHERE id=original.incident_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF p_decision='reviewed_for_manual_release_checklist' THEN
   SELECT public.automation_case_audit_projection(
      p_user_id,original.incident_id,original.evidence_id)
   INTO current_projection;
   IF current_projection IS NULL OR
      current_projection IS DISTINCT FROM original.snapshot THEN
     RETURN jsonb_build_object('ok',false,'reason','stale_audit_package');
   END IF;
   IF current_projection->>'consistent'<>'true' THEN
     RETURN jsonb_build_object('ok',false,'reason','inconsistent_case_ledger');
   END IF;
 END IF;
 SELECT count(*) INTO daily_count FROM public.automation_case_audit_reviews
   WHERE user_id=p_user_id AND created_at>pg_catalog.statement_timestamp()-interval '24 hours';
 SELECT count(*) INTO case_count FROM public.automation_case_audit_reviews
   WHERE user_id=p_user_id AND package_id=p_package_id;
 IF daily_count>=30 OR case_count>=8 THEN
   RETURN jsonb_build_object('ok',false,'reason','audit_review_limit');
 END IF;
 INSERT INTO public.automation_case_audit_reviews(
   user_id,package_id,request_key,decision,note,
   acknowledged_source,acknowledged_no_deployment,acknowledged_no_crypto_proof)
 VALUES(p_user_id,p_package_id,p_request_key,p_decision,btrim(p_note),
   p_acknowledged_source,p_acknowledged_no_deployment,p_acknowledged_no_crypto_proof)
 RETURNING * INTO added;
 RETURN jsonb_build_object('ok',true,'replayed',false,'reviewId',added.id,
   'decision',added.decision,'manualAttestationOnly',true,
   'automaticRelease',false,'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_review_case_audit_package(
 uuid,uuid,text,text,boolean,boolean,boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_review_case_audit_package(
 uuid,uuid,text,text,boolean,boolean,boolean,uuid) TO service_role;

-- The owner dashboard deliberately returns only stored source identities,
-- bounded allowed snapshots and authored review notes; it has no release,
-- scheduling, credential or webhook dispatch capability.
CREATE OR REPLACE FUNCTION public.automation_case_audit_package_inbox(
 p_user_id uuid,p_incident_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE inc public.automation_incidents%ROWTYPE;
 pkg public.automation_case_audit_packages%ROWTYPE;
 item jsonb;projected jsonb;checks jsonb;
 packages jsonb:='[]'::jsonb;
 proofs jsonb;notes jsonb;note_count integer;counts integer;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 SELECT * INTO inc FROM public.automation_incidents
    WHERE user_id=p_user_id AND id=p_incident_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT public.automation_incident_lifecycle_check(p_user_id,p_incident_id) INTO checks;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
     'id',e.id,'kind',e.evidence_kind,'capturedAt',e.captured_at)
     ORDER BY e.captured_at DESC,e.id DESC),'[]'::jsonb) INTO proofs
 FROM public.automation_incident_evidence e
 WHERE e.user_id=p_user_id AND e.incident_id=p_incident_id;
 FOR pkg IN SELECT * FROM public.automation_case_audit_packages
  WHERE user_id=p_user_id AND incident_id=p_incident_id
  ORDER BY sequence DESC LIMIT 8
 LOOP
   SELECT public.automation_case_audit_projection(
       p_user_id,p_incident_id,pkg.evidence_id) INTO projected;
   SELECT count(*) INTO note_count FROM public.automation_case_audit_reviews
     WHERE user_id=p_user_id AND package_id=pkg.id;
   SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.sequence DESC),'[]'::jsonb)
     INTO notes FROM (
     SELECT id,sequence,decision,note,acknowledged_source,
       acknowledged_no_deployment,acknowledged_no_crypto_proof,created_at
     FROM public.automation_case_audit_reviews
     WHERE user_id=p_user_id AND package_id=pkg.id
     ORDER BY sequence DESC LIMIT 8
   ) q;
   item:=jsonb_build_object(
     'id',pkg.id,'incidentId',pkg.incident_id,
     'incidentRevision',pkg.incident_revision,
     'evidenceId',pkg.evidence_id,'capturedAt',pkg.created_at,
     'snapshot',pkg.snapshot,'reviewCount',note_count,
     'reviews',notes,'current',projected IS NOT DISTINCT FROM pkg.snapshot);
   packages:=packages||jsonb_build_array(item);
 END LOOP;
 SELECT count(*) INTO counts FROM public.automation_case_audit_packages
   WHERE user_id=p_user_id AND incident_id=p_incident_id;
 RETURN jsonb_build_object(
  'ok',true,'source','owner_audit_packages_metadata',
  'incidentId',inc.id,'incidentStatus',inc.status,
  'incidentRevision',inc.revision,'caseConsistent',checks->'consistent',
  'evidence',proofs,'packages',packages,'packageCount',counts,
  'capturedAt',pg_catalog.statement_timestamp(),
  'rawInputsIncluded',false,'rawOutputsIncluded',false,
  'releaseVerified',false,'cryptographicProof',false,
  'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_case_audit_package_inbox(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_case_audit_package_inbox(uuid,uuid)
 TO service_role;
