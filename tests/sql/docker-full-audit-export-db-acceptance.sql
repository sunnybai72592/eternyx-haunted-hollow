\set ON_ERROR_STOP on
-- Real network-isolated PostgreSQL test. Runs after 3 release-review migrations
-- and the existing owner/reviewer acceptance checks in Docker CI.
DO $audit$
DECLARE
 owner_a uuid:='11111111-1111-4111-8111-111111111111';
 owner_b uuid:='22222222-2222-4222-8222-222222222222';
 record_id uuid;
 bundle jsonb;ev_count integer;
BEGIN
 SELECT r.id INTO record_id FROM public.docker_release_reviews r
 JOIN public.docker_release_reviewer_assignments a ON a.review_id=r.id
 WHERE r.owner_id=owner_a AND r.state='reviewed' AND
  a.reviewer_id=owner_b AND a.state='accepted' LIMIT 1;
 IF record_id IS NULL THEN
  RAISE EXCEPTION 'Previous reviewer acceptance fixture missing';
 END IF;
 SELECT public.docker_release_export_audit(owner_a,record_id) INTO bundle;
 IF bundle->>'ok'<>'true' OR
  bundle->>'schema'<>'eternyx-docker-release-audit-export-v1' OR
  bundle->>'fullDatabaseWindow'<>'true' OR
  bundle->>'serverChainAuthenticated'<>'false' OR
  bundle->>'independentTailAnchorVerified'<>'false' OR
  bundle->>'productionDeploymentAuthorized'<>'false' OR
  bundle->>'dockerExecutionAuthorized'<>'false' THEN
  RAISE EXCEPTION 'Export misrepresented audit boundary: %',bundle;
 END IF;
 ev_count:=(bundle->>'eventCount')::integer;
 IF ev_count<>5 OR pg_catalog.jsonb_array_length(bundle->'events')<>ev_count THEN
  RAISE EXCEPTION 'Export was truncated or had unexpected count: %',ev_count;
 END IF;
 IF (bundle->'review'->>'owner_id')::uuid<>owner_a OR
  (bundle->'review'->>'id')::uuid<>record_id OR
  (bundle->'assignment'->>'reviewer_id')::uuid<>owner_b OR
  bundle->'assignment'->>'state'<>'accepted' THEN
  RAISE EXCEPTION 'Export leaked/changed reviewer binding';
 END IF;
 IF bundle->'events'->0->>'event_kind'<>'submitted' OR
  bundle->'events'->4->>'event_kind'<>'reviewed' OR
  bundle->'events'->3->>'event_kind'<>'reviewer_accepted' THEN
   RAISE EXCEPTION 'Actual audit export does not contain complete review chain';
 END IF;
 IF (SELECT count(*) FROM public.docker_release_review_events e
     WHERE e.review_id=record_id AND e.owner_id=owner_a)<>
     (bundle->>'eventCount')::integer THEN
  RAISE EXCEPTION 'Export count differs from durable PostgreSQL rows';
 END IF;
 SELECT public.docker_release_export_audit(owner_b,record_id) INTO bundle;
 IF bundle->>'reason'<>'not_found' THEN
  RAISE EXCEPTION 'Another account exported foreign owner notes: %',bundle;
 END IF;
 SELECT public.docker_release_export_audit(owner_a,
  'ffffffff-ffff-4fff-8fff-ffffffffffff') INTO bundle;
 IF bundle->>'reason'<>'not_found' THEN
  RAISE EXCEPTION 'Nonexistent release leaked data: %',bundle;
 END IF;
 SELECT public.docker_release_export_audit(owner_a,NULL) INTO bundle;
 IF bundle->>'reason'<>'invalid_request' THEN
  RAISE EXCEPTION 'Malformed export request accepted: %',bundle;
 END IF;
 RAISE NOTICE 'Full owner-only audit export, exact event count and no-execution flags passed';
END $audit$;

DO $permissions$
BEGIN
 IF has_function_privilege('authenticated',
  'public.docker_release_export_audit(uuid,uuid)','EXECUTE') OR
  has_function_privilege('anon',
  'public.docker_release_export_audit(uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser/anon can invoke privileged owner audit export RPC';
 END IF;
 IF NOT has_function_privilege('service_role',
  'public.docker_release_export_audit(uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Service-role audit export permission missing';
 END IF;
END $permissions$;
