-- Export one complete owner release-review audit, never a Docker operation.
-- Service-role-only, SECURITY INVOKER, owner scoped and held under same per-owner
-- advisory lock used by submit/decide/invite/reviewer-response transactions.
CREATE FUNCTION public.docker_release_export_audit(
 p_owner_id uuid,p_review_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 v_review public.docker_release_reviews%ROWTYPE;
 v_assignment jsonb;
 v_events jsonb;
 v_count integer;
BEGIN
 IF p_owner_id IS NULL OR p_review_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261124,pg_catalog.hashtext(p_owner_id::text));
 SELECT * INTO v_review FROM public.docker_release_reviews
  WHERE id=p_review_id AND owner_id=p_owner_id FOR SHARE;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('ok',false,'reason','not_found');
 END IF;
 SELECT count(*) INTO v_count FROM public.docker_release_review_events
  WHERE review_id=p_review_id AND owner_id=p_owner_id;
 IF v_count<1 OR v_count>32 THEN
  RETURN jsonb_build_object('ok',false,'reason','history_unavailable');
 END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) ORDER BY e.id),'[]'::jsonb)
 INTO v_events FROM public.docker_release_review_events e
 WHERE e.review_id=p_review_id AND e.owner_id=p_owner_id;
 IF pg_catalog.jsonb_array_length(v_events)<>v_count THEN
  RETURN jsonb_build_object('ok',false,'reason','history_incomplete');
 END IF;
 SELECT pg_catalog.to_jsonb(a) INTO v_assignment
 FROM public.docker_release_reviewer_assignments a
 WHERE a.review_id=p_review_id AND a.owner_id=p_owner_id;
 RETURN jsonb_build_object(
  'ok',true,'schema','eternyx-docker-release-audit-export-v1',
  'review',pg_catalog.to_jsonb(v_review),'assignment',v_assignment,
  'events',v_events,'eventCount',v_count,
  'fullDatabaseWindow',true,'serverChainAuthenticated',false,
  'independentTailAnchorVerified',false,'productionDeploymentAuthorized',false,
  'dockerExecutionAuthorized',false,'independentSecurityApprovalRequired',true
 );
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_release_export_audit(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_release_export_audit(uuid,uuid)
 TO service_role;
