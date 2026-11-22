-- Networkless PostgreSQL 17 acceptance for saved workflow issue draft lineage
-- and separate, bounded read-only issue tracking. No live GitHub or credentials.
DO $$
DECLARE
  alice uuid:='11111111-1111-4111-8111-111111111111';
  bob uuid:='22222222-2222-4222-8222-222222222222';
  workflow_id uuid; draft_id uuid;
  v integer; first_key uuid:=gen_random_uuid(); status_key uuid:=gen_random_uuid();
  check_id uuid; second_id uuid; r jsonb;i integer;
BEGIN
  SELECT public.automation_save_workflow(
    alice,'Saved issue body transform','[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'failed to save owner workflow: %',r; END IF;
  workflow_id:=(r->>'workflow_id')::uuid;
  SELECT public.automation_connect_github_issues(
    alice,'octocat','Hello-World','octocat',repeat('a',200),repeat('b',24)) INTO r;
  v:=(r->>'version')::int;
  PERFORM public.automation_toggle_github_issues(alice,true);

  SELECT public.automation_prepare_github_workflow_issue(
    bob,gen_random_uuid(),repeat('1',64),repeat('f',100),repeat('c',24),
    workflow_id,1,repeat('a',64)) INTO r;
  IF r->>'reason'<>'stale_workflow' THEN RAISE EXCEPTION 'cross-owner workflow accepted'; END IF;
  SELECT public.automation_prepare_github_workflow_issue(
    alice,first_key,repeat('1',64),repeat('f',100),repeat('c',24),
    workflow_id,2,repeat('a',64)) INTO r;
  IF r->>'reason'<>'stale_workflow' THEN RAISE EXCEPTION 'stale revision accepted'; END IF;

  SELECT public.automation_prepare_github_workflow_issue(
    alice,first_key,repeat('1',64),repeat('f',100),repeat('c',24),
    workflow_id,1,repeat('a',64)) INTO r;
  IF r->>'ok'<>'true' OR r->>'replayed'<>'false' THEN
    RAISE EXCEPTION 'real workflow draft not prepared: %',r; END IF;
  draft_id:=(r->>'draft_id')::uuid;
  IF EXISTS(SELECT 1 FROM public.automation_github_issue_drafts WHERE id=draft_id
    AND (source_workflow_id IS DISTINCT FROM workflow_id
      OR source_workflow_revision<>1 OR source_input_sha256<>repeat('a',64)
      OR status<>'pending')) THEN
    RAISE EXCEPTION 'source provenance was not committed atomically';
  END IF;
  SELECT public.automation_prepare_github_workflow_issue(
    alice,first_key,repeat('1',64),repeat('f',100),repeat('c',24),
    workflow_id,1,repeat('a',64)) INTO r;
  IF r->>'replayed'<>'true' OR r->>'draft_id'<>draft_id::text THEN
    RAISE EXCEPTION 'workflow request UUID not idempotent'; END IF;
  SELECT public.automation_prepare_github_workflow_issue(
    alice,first_key,repeat('1',64),repeat('f',100),repeat('c',24),
    workflow_id,1,repeat('b',64)) INTO r;
  IF r->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'changed source digest accepted on replay'; END IF;
  SELECT public.automation_prepare_github_issue(
    alice,first_key,repeat('1',64),repeat('f',100),repeat('c',24)) INTO r;
  IF r->>'replayed'<>'true' THEN
    RAISE EXCEPTION 'base issue draft replay was broken'; END IF;
  IF (SELECT count(*) FROM public.automation_github_issue_drafts
    WHERE user_id=alice AND status='submitting')<>0 THEN
    RAISE EXCEPTION 'workflow bridge triggered an unapproved write'; END IF;

  SELECT public.automation_mark_github_issue_previewed(alice,draft_id,v) INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'owner review failed: %',r; END IF;
  SELECT public.automation_claim_github_issue(alice,draft_id,v) INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'owner approved claim failed'; END IF;
  SELECT public.automation_finish_github_issue(alice,draft_id,'succeeded',42,
    'https://github.com/octocat/Hello-World/issues/42',NULL) INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'confirmed issue fixture failed'; END IF;

  SELECT public.automation_reserve_github_issue_status(
    bob,draft_id,status_key) INTO r;
  IF r->>'reason'<>'not_confirmed' THEN RAISE EXCEPTION 'Bob tracked Alice issue'; END IF;
  SELECT public.automation_reserve_github_issue_status(
    alice,draft_id,status_key) INTO r;
  IF r->>'ok'<>'true' OR r->>'replayed'<>'false' OR r->>'issue_number'<>'42' THEN
    RAISE EXCEPTION 'bounded issue status read reservation failed: %',r; END IF;
  check_id:=(r->>'check_id')::uuid;
  SELECT public.automation_reserve_github_issue_status(
    alice,draft_id,gen_random_uuid()) INTO r;
  IF r->>'reason'<>'read_in_flight' THEN
    RAISE EXCEPTION 'concurrent read bypassed one-in-flight guard'; END IF;
  SELECT public.automation_reserve_github_issue_status(
    alice,draft_id,status_key) INTO r;
  IF r->>'replayed'<>'true' OR r->>'check_id'<>check_id::text THEN
    RAISE EXCEPTION 'read receipt replay triggered duplicate call'; END IF;
  SELECT public.automation_finish_github_issue_status(bob,check_id,'open',NULL) INTO r;
  IF r->>'reason'<>'stale_check' THEN
    RAISE EXCEPTION 'cross-owner status result accepted'; END IF;
  SELECT public.automation_finish_github_issue_status(alice,check_id,'invalid',NULL) INTO r;
  IF r->>'reason'<>'invalid_result' THEN
    RAISE EXCEPTION 'untrusted GitHub status was accepted'; END IF;
  SELECT public.automation_finish_github_issue_status(alice,check_id,'open',NULL) INTO r;
  IF r->>'status'<>'succeeded' OR r->>'observed_state'<>'open' THEN
    RAISE EXCEPTION 'open state was not verified: %',r; END IF;
  IF (SELECT last_known_issue_state FROM public.automation_github_issue_drafts
      WHERE id=draft_id)<>'open' THEN RAISE EXCEPTION 'real state was not persisted'; END IF;
  SELECT public.automation_finish_github_issue_status(alice,check_id,'closed',NULL) INTO r;
  IF r->>'reason'<>'stale_check' THEN RAISE EXCEPTION 'receipt was completed twice'; END IF;

  -- Close state on a distinct read; do not infer from past metadata.
  SELECT public.automation_reserve_github_issue_status(
    alice,draft_id,gen_random_uuid()) INTO r;
  second_id:=(r->>'check_id')::uuid;
  SELECT public.automation_finish_github_issue_status(alice,second_id,'closed',NULL) INTO r;
  IF r->>'status'<>'succeeded' OR
     (SELECT last_known_issue_state FROM public.automation_github_issue_drafts
       WHERE id=draft_id)<>'closed' THEN
    RAISE EXCEPTION 'new closed state not recorded'; END IF;

  -- Two above plus ten metered reads exhaust the 12/24h per-owner cap.
  FOR i IN 1..10 LOOP
    SELECT public.automation_reserve_github_issue_status(
      alice,draft_id,gen_random_uuid()) INTO r;
    IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'read number % failed early: %',i,r; END IF;
    SELECT public.automation_finish_github_issue_status(
      alice,(r->>'check_id')::uuid,NULL,'github_rate_limit') INTO r;
    IF r->>'status'<>'failed' THEN
      RAISE EXCEPTION 'provider failure did not count against budget'; END IF;
  END LOOP;
  SELECT public.automation_reserve_github_issue_status(
    alice,draft_id,gen_random_uuid()) INTO r;
  IF r->>'reason'<>'read_limit' THEN RAISE EXCEPTION '12/day read quota bypassed'; END IF;
  SELECT public.automation_reserve_github_issue_status(
    alice,draft_id,status_key) INTO r;
  IF r->>'replayed'<>'true' OR r->>'observed_state'<>'open' THEN
    RAISE EXCEPTION 'receipt replay failed after exhaustion'; END IF;

  SELECT public.automation_housekeep_github_issue_status(bob) INTO r;
  IF r->>'removed'<>'0' THEN RAISE EXCEPTION 'Bob pruned Alice read audit'; END IF;
  UPDATE public.automation_github_issue_status_checks
    SET created_at=now()-interval '8 days' WHERE id=check_id;
  SELECT public.automation_housekeep_github_issue_status(alice) INTO r;
  IF (r->>'removed')::integer<1 OR EXISTS (
    SELECT 1 FROM public.automation_github_issue_status_checks WHERE id=check_id
  ) THEN RAISE EXCEPTION '7-day owner receipt privacy pruning failed'; END IF;

  SELECT public.automation_save_workflow(
    alice,'Edited original workflow','[{"id":"s1","kind":"sort_asc"}]'::jsonb,
    workflow_id) INTO r;
  IF r->>'revision'<>'2' THEN RAISE EXCEPTION 'workflow revision did not change'; END IF;
  SELECT public.automation_prepare_github_workflow_issue(
    alice,gen_random_uuid(),repeat('2',64),repeat('f',100),repeat('c',24),
    workflow_id,1,repeat('a',64)) INTO r;
  IF r->>'reason'<>'stale_workflow' THEN RAISE EXCEPTION 'outdated workflow was accepted'; END IF;

  RAISE NOTICE 'Saved workflow lineage, preview-only drafts, verified issue GET receipts, owner fences and daily quotas passed';
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated',
      'public.automation_github_issue_status_checks','SELECT')
    OR has_table_privilege('anon',
      'public.automation_github_issue_status_checks','INSERT')
    OR has_function_privilege('authenticated',
      'public.automation_reserve_github_issue_status(uuid,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.automation_prepare_github_workflow_issue(uuid,uuid,text,text,text,uuid,integer,text)','EXECUTE')
    OR has_function_privilege('anon',
      'public.automation_finish_github_issue_status(uuid,uuid,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'browser-accessible privileged GitHub issue functions/tables'; END IF;
END;
$$;
