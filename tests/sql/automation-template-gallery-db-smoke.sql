-- Phase 2I acceptance. Apply manual workflow base, then catalog migration,
-- in a disposable isolated PostgreSQL 17 database.
DO $$
DECLARE
  alice uuid:='11111111-1111-4111-8111-111111111111';
  bob uuid:='22222222-2222-4222-8222-222222222222';
  key1 uuid:=gen_random_uuid();
  installed uuid;mine uuid;
  r jsonb;i integer;
  pkey uuid:=gen_random_uuid();
BEGIN
  IF (SELECT count(*) FROM public.automation_template_catalog)<>8 THEN
    RAISE EXCEPTION 'Expected 8 curated real templates';
  END IF;
  IF EXISTS(SELECT 1 FROM public.automation_template_catalog
    WHERE category NOT IN ('operations','developer','security','engineering')
    OR jsonb_array_length(steps) NOT BETWEEN 1 AND 12) THEN
    RAISE EXCEPTION 'Malformed built-in recipe';
  END IF;
  IF EXISTS(SELECT 1 FROM public.automation_template_catalog
    WHERE id='clean-lines' AND name<>'Clean & deduplicate') THEN
    RAISE EXCEPTION 'Curated catalog content drift';
  END IF;
  SELECT public.automation_instantiate_template(alice,'not-a-real-template',gen_random_uuid()) INTO r;
  IF r->>'reason'<>'unknown_template' THEN RAISE EXCEPTION 'Unknown template installed'; END IF;
  SELECT public.automation_instantiate_template(alice,'clean-lines',key1) INTO r;
  IF r->>'ok'<>'true' OR r->>'replayed'<>'false' THEN
    RAISE EXCEPTION 'Owner template installation rejected: %',r;
  END IF;
  installed:=(r->>'workflow_id')::uuid;
  IF installed IS NULL OR EXISTS(
    SELECT 1 FROM public.automation_workflows WHERE id=installed AND
      (user_id<>alice OR revision<>1 OR active<>true
      OR source_template_id<>'clean-lines' OR source_template_version<>1)
  ) THEN RAISE EXCEPTION 'Server copy was not persisted with correct owner and origin'; END IF;
  IF (SELECT steps FROM public.automation_workflows WHERE id=installed)
     IS DISTINCT FROM
     (SELECT steps FROM public.automation_template_catalog WHERE id='clean-lines') THEN
    RAISE EXCEPTION 'Installed steps do not match curated catalog';
  END IF;
  IF EXISTS (SELECT 1 FROM public.automation_webhook_triggers WHERE workflow_id=installed)
    OR EXISTS (SELECT 1 FROM public.automation_schedules WHERE workflow_id=installed) THEN
    RAISE EXCEPTION 'Template installation created an external trigger';
  END IF;
  SELECT public.automation_instantiate_template(alice,'clean-lines',key1) INTO r;
  IF r->>'replayed'<>'true' OR r->>'workflow_id'<>installed::text THEN
    RAISE EXCEPTION 'Repeated template installation caused a duplicate';
  END IF;
  SELECT public.automation_instantiate_template(alice,'review-queue',key1) INTO r;
  IF r->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'Reused request key for different template was accepted';
  END IF;
  SELECT public.automation_instantiate_template(bob,'clean-lines',key1) INTO r;
  IF r->>'ok'<>'true' OR r->>'workflow_id'=installed::text THEN
    RAISE EXCEPTION 'Another owner did not get an independent copy';
  END IF;
  -- Preview a real saved workflow: only counts and a keyed digest stored.
  SELECT public.automation_record_workflow_preview(
    bob,installed,1,pkey,repeat('a',64),5,4,1) INTO r;
  IF r->>'reason'<>'stale_workflow' THEN
    RAISE EXCEPTION 'Cross-owner preview recorded: %',r;
  END IF;
  SELECT public.automation_record_workflow_preview(
    alice,installed,1,pkey,repeat('a',64),5,4,1) INTO r;
  IF r->>'ok'<>'true' OR r->>'replayed'<>'false' THEN
    RAISE EXCEPTION 'Valid no-side-effect preview refused: %',r;
  END IF;
  SELECT public.automation_record_workflow_preview(
    alice,installed,1,pkey,repeat('a',64),5,4,1) INTO r;
  IF r->>'replayed'<>'true' THEN RAISE EXCEPTION 'Preview replay double billed'; END IF;
  SELECT public.automation_record_workflow_preview(
    alice,installed,1,pkey,repeat('b',64),5,4,1) INTO r;
  IF r->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'Same preview ID accepted with changed input digest';
  END IF;
  SELECT public.automation_record_workflow_preview(
    alice,installed,1,gen_random_uuid(),repeat('b',64),2001,4,1) INTO r;
  IF r->>'reason'<>'invalid_request' THEN
    RAISE EXCEPTION 'Oversized preview accepted';
  END IF;
  IF (SELECT count(*) FROM public.automation_runs WHERE user_id=alice)<>0 THEN
    RAISE EXCEPTION 'Dry-run preview charged a cloud execution or caused external action';
  END IF;
  PERFORM public.automation_toggle_workflow(alice,installed,false);
  SELECT public.automation_record_workflow_preview(
    alice,installed,1,gen_random_uuid(),repeat('a',64),5,4,1) INTO r;
  IF r->>'reason'<>'stale_workflow' THEN
    RAISE EXCEPTION 'Paused saved workflow was previewable';
  END IF;
  PERFORM public.automation_toggle_workflow(alice,installed,true);
  FOR i IN 1..19 LOOP
    SELECT public.automation_record_workflow_preview(
      alice,installed,1,gen_random_uuid(),repeat('a',64),5,4,1) INTO r;
    IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'Preview % refused early: %',i,r; END IF;
  END LOOP;
  SELECT public.automation_preview_usage(alice) INTO r;
  IF r->>'limit'<>'20' OR r->>'used'<>'20' THEN
    RAISE EXCEPTION 'Actual owner preview usage is wrong: %',r;
  END IF;
  SELECT public.automation_record_workflow_preview(
    alice,installed,1,gen_random_uuid(),repeat('a',64),5,4,1) INTO r;
  IF r->>'reason'<>'preview_limit' THEN
    RAISE EXCEPTION '20-preview daily quota bypassed: %',r;
  END IF;
  SELECT public.automation_preview_usage(bob) INTO r;
  IF r->>'used'<>'0' THEN RAISE EXCEPTION 'Usage leaked across owners'; END IF;
  SELECT public.automation_save_workflow(alice,'Edited copy',
    '[{"id":"s1","kind":"trim"}]'::jsonb,installed) INTO r;
  IF r->>'revision'<>'2' THEN RAISE EXCEPTION 'Template copy not editable as normal saved workflow'; END IF;
  SELECT public.automation_record_workflow_preview(
    alice,installed,1,gen_random_uuid(),repeat('a',64),5,4,1) INTO r;
  IF r->>'reason'<>'stale_workflow' THEN
    RAISE EXCEPTION 'Older saved revision was still executable in preview';
  END IF;
  IF EXISTS (SELECT 1 FROM public.automation_workflow_previews
    WHERE user_id=alice AND (request_fingerprint IS NULL OR
      octet_length(request_fingerprint)<>64)) THEN
    RAISE EXCEPTION 'Preview audit does not retain keyed digest-only metadata';
  END IF;
  IF (SELECT count(*) FROM public.automation_runs WHERE user_id=alice)<>0 THEN
    RAISE EXCEPTION 'Privacy preview accidentally persisted a cloud run';
  END IF;
  -- Deleting a template copy must not let its original idempotency UUID create
  -- a different workflow on retry.
  SELECT public.automation_delete_workflow(alice,installed) INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'Could not delete saved copy'; END IF;
  SELECT public.automation_instantiate_template(alice,'clean-lines',key1) INTO r;
  IF r->>'reason'<>'template_copy_deleted' THEN
    RAISE EXCEPTION 'Deleted copy was silently recreated on request replay';
  END IF;
  -- Matured metadata is pruned on owner access, not via fictitious cron.
  UPDATE public.automation_workflow_previews SET
    created_at=pg_catalog.statement_timestamp()-interval '8 days'
    WHERE user_id=alice;
  UPDATE public.automation_template_instantiations SET
    created_at=pg_catalog.statement_timestamp()-interval '8 days'
    WHERE user_id=alice;
  SELECT public.automation_prune_template_metadata(bob) INTO r;
  IF r->>'previews_deleted'<>'0' OR r->>'instantiations_deleted'<>'0' THEN
    RAISE EXCEPTION 'Another owner erased private audit metadata';
  END IF;
  SELECT public.automation_prune_template_metadata(alice) INTO r;
  IF (r->>'previews_deleted')::int<>20 OR (r->>'instantiations_deleted')::int<>1 THEN
    RAISE EXCEPTION 'Owner retention did not prune precisely: %',r;
  END IF;
  RAISE NOTICE 'Curated templates, owner copies, quota previews, drift, replay and retention passed';
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated','public.automation_template_catalog','INSERT')
    OR has_table_privilege('anon','public.automation_template_catalog','SELECT')
    OR has_table_privilege('authenticated','public.automation_template_instantiations','SELECT')
    OR has_table_privilege('authenticated','public.automation_workflow_previews','SELECT')
    OR has_function_privilege('anon',
      'public.automation_instantiate_template(uuid,text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.automation_record_workflow_preview(uuid,uuid,integer,uuid,text,integer,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Privileged template write or preview audit is browser-accessible';
  END IF;
END;
$$;
