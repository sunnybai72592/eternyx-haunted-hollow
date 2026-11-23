-- Phase 18 isolated PostgreSQL acceptance after Phase 17 three-user suite.
-- Tests true owner/editor/viewer roles, foreign IDs, same-space composite FK,
-- actual comments/checklists, moderation, stale writes and audit records.
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);

DO $p18$
DECLARE sid uuid:=pg_catalog.current_setting('test.team17.space')::uuid;
  task uuid; other_space uuid; other_task uuid; comment uuid; step uuid; invite jsonb;
BEGIN
  task:=public.workspace_team_save_task(
    sid,NULL,'Coating field review','Verify actual inspection findings',
    'todo','high',DATE '2026-12-10',NULL,NULL);
  PERFORM pg_catalog.set_config('test.p18_task',task::text,false);
  comment:=public.workspace_team_post_comment(sid,task,'Actual readings verified on site');
  step:=public.workspace_team_add_step(sid,task,'Inspect surface preparation');
  PERFORM pg_catalog.set_config('test.p18_owner_comment',comment::text,false);
  PERFORM pg_catalog.set_config('test.p18_step',step::text,false);
  IF NOT EXISTS(SELECT 1 FROM public.workspace_team_task_comments
    WHERE id=comment AND task_id=task AND author_id=auth.uid())
    OR NOT EXISTS(SELECT 1 FROM public.workspace_team_task_steps
    WHERE id=step AND task_id=task AND done=false) THEN
    RAISE EXCEPTION 'Owner comment/checklist not persisted';
  END IF;
  other_space:=public.workspace_team_create('Other private project','No cross-team writes');
  other_task:=public.workspace_team_save_task(other_space,NULL,'Other scope','',
    'todo','normal',NULL,NULL,NULL);
  BEGIN
    PERFORM public.workspace_team_post_comment(sid,other_task,'Cross-team text');
    RAISE EXCEPTION 'Foreign team task accepted a comment';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_add_step(sid,other_task,'Cross-team step');
    RAISE EXCEPTION 'Foreign team task accepted a checklist step';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.workspace_team_task_comments(space_id,task_id,author_id,body)
      VALUES(sid,task,auth.uid(),'Forge direct browser comment');
    RAISE EXCEPTION 'Direct browser comment write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.workspace_team_task_steps SET done=true WHERE id=step;
    RAISE EXCEPTION 'Direct browser step update accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_post_comment(sid,task,'   ');
    RAISE EXCEPTION 'Whitespace-only comment accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_add_step(sid,task,repeat('x',181));
    RAISE EXCEPTION 'Too long checklist title accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  invite:=public.workspace_team_invite(sid,'editor');
  PERFORM pg_catalog.set_config('test.p18_invite',invite->>'token',false);
END;
$p18$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
DO $p18$
DECLARE sid uuid:=pg_catalog.current_setting('test.team17.space')::uuid;
  task uuid:=pg_catalog.current_setting('test.p18_task')::uuid;
  step uuid:=pg_catalog.current_setting('test.p18_step')::uuid;
  tstamp timestamptz; comment uuid; own_step uuid;
BEGIN
  IF public.workspace_team_accept_invite(pg_catalog.current_setting('test.p18_invite'))<>sid
    OR public.workspace_team_role(sid)<>'editor' THEN
    RAISE EXCEPTION 'Editor invitation did not create the expected role';
  END IF;
  comment:=public.workspace_team_post_comment(sid,task,'Editor handover remarks');
  PERFORM pg_catalog.set_config('test.p18_editor_comment',comment::text,false);
  own_step:=public.workspace_team_add_step(sid,task,'Verify coating DFT');
  PERFORM pg_catalog.set_config('test.p18_editor_step',own_step::text,false);
  SELECT updated_at INTO tstamp FROM public.workspace_team_task_steps WHERE id=step;
  BEGIN
    PERFORM public.workspace_team_check_step(sid,step,true,tstamp+interval '5 seconds');
    RAISE EXCEPTION 'Stale checklist update accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF NOT public.workspace_team_check_step(sid,step,true,tstamp) THEN
    RAISE EXCEPTION 'Editor could not mark a team step done';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_team_task_steps
    WHERE id=step AND done AND completed_at IS NOT NULL AND done_by=auth.uid()) THEN
    RAISE EXCEPTION 'Checklist actual completion actor or timestamp missing';
  END IF;
  -- Idempotent repeat with current version should not create another event.
  SELECT updated_at INTO tstamp FROM public.workspace_team_task_steps WHERE id=step;
  IF NOT public.workspace_team_check_step(sid,step,true,tstamp) THEN
    RAISE EXCEPTION 'Idempotent same-state step check returned false';
  END IF;
  IF (SELECT count(*) FROM public.workspace_team_events
    WHERE entity_id=task AND event_type='step_checked')<>1 THEN
    RAISE EXCEPTION 'Idempotent check duplicated step activity';
  END IF;
  -- An editor can redact only its own comment.
  BEGIN
    PERFORM public.workspace_team_redact_comment(sid,
      pg_catalog.current_setting('test.p18_owner_comment')::uuid);
    RAISE EXCEPTION 'Editor redacted owner comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT public.workspace_team_redact_comment(sid,comment) THEN
    RAISE EXCEPTION 'Comment author could not redact';
  END IF;
  IF EXISTS(SELECT 1 FROM public.workspace_team_task_comments
      WHERE id=comment AND body<>'[Comment redacted]') THEN
    RAISE EXCEPTION 'Redacted content still visible to team';
  END IF;
END;
$p18$;

-- Outsider knows actual task/comment/step IDs but may not read or mutate.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',false);
DO $p18$
DECLARE sid uuid:=pg_catalog.current_setting('test.team17.space')::uuid;
  task uuid:=pg_catalog.current_setting('test.p18_task')::uuid;
  step uuid:=pg_catalog.current_setting('test.p18_step')::uuid;
  comment uuid:=pg_catalog.current_setting('test.p18_owner_comment')::uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM public.workspace_team_task_comments WHERE task_id=task)
    OR EXISTS(SELECT 1 FROM public.workspace_team_task_steps WHERE task_id=task) THEN
    RAISE EXCEPTION 'Nonmember read private team discussion/checklist';
  END IF;
  BEGIN
    PERFORM public.workspace_team_post_comment(sid,task,'Unauthorized');
    RAISE EXCEPTION 'Nonmember posted team comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_add_step(sid,task,'Unauthorized');
    RAISE EXCEPTION 'Nonmember added checklist step';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_redact_comment(sid,comment);
    RAISE EXCEPTION 'Nonmember redacted team comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_remove_step(sid,step);
    RAISE EXCEPTION 'Nonmember deleted checklist step';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_check_step(sid,step,false,now());
    RAISE EXCEPTION 'Nonmember changed checklist completion';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$p18$;

-- Owner turns invited editor into viewer and assigns a task to them.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
DO $p18$
DECLARE sid uuid:=pg_catalog.current_setting('test.team17.space')::uuid;
  task uuid:=pg_catalog.current_setting('test.p18_task')::uuid; tstamp timestamptz;
BEGIN
  SELECT updated_at INTO tstamp FROM public.workspace_team_tasks WHERE id=task;
  PERFORM public.workspace_team_save_task(sid,task,'Coating field review','Assigned work',
    'in_progress','urgent',NULL,
    '22222222-2222-4222-8222-222222222222',tstamp);
  IF (SELECT count(*) FROM public.workspace_team_events
     WHERE space_id=sid AND entity_id=task AND event_type='task_assigned')<>1 THEN
    RAISE EXCEPTION 'Assignment change was not audited';
  END IF;
  PERFORM public.workspace_team_member_change(sid,
    '22222222-2222-4222-8222-222222222222','viewer');
END;
$p18$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
DO $p18$
DECLARE sid uuid:=pg_catalog.current_setting('test.team17.space')::uuid;
  task uuid:=pg_catalog.current_setting('test.p18_task')::uuid;
  step uuid:=pg_catalog.current_setting('test.p18_step')::uuid;
  comment uuid:=pg_catalog.current_setting('test.p18_owner_comment')::uuid;
BEGIN
  IF public.workspace_team_role(sid)<>'viewer'
    OR NOT EXISTS(SELECT 1 FROM public.workspace_team_task_comments WHERE task_id=task)
    OR NOT EXISTS(SELECT 1 FROM public.workspace_team_task_steps WHERE task_id=task)
    OR NOT EXISTS(SELECT 1 FROM public.workspace_team_tasks
      WHERE id=task AND assignee_id=auth.uid()) THEN
    RAISE EXCEPTION 'Viewer cannot read assigned team task/discussion/checklist';
  END IF;
  BEGIN
    PERFORM public.workspace_team_post_comment(sid,task,'Viewer write');
    RAISE EXCEPTION 'Viewer wrote comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_add_step(sid,task,'Viewer step');
    RAISE EXCEPTION 'Viewer added step';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_redact_comment(sid,comment);
    RAISE EXCEPTION 'Viewer redacted owner comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_check_step(sid,step,false,now());
    RAISE EXCEPTION 'Viewer checked step';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_remove_step(sid,step);
    RAISE EXCEPTION 'Viewer removed step';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$p18$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
DO $p18$
DECLARE sid uuid:=pg_catalog.current_setting('test.team17.space')::uuid;
  task uuid:=pg_catalog.current_setting('test.p18_task')::uuid;
  step uuid:=pg_catalog.current_setting('test.p18_step')::uuid;
  comment uuid:=pg_catalog.current_setting('test.p18_owner_comment')::uuid;
BEGIN
  -- Owners can moderate their own/others' posts. Redaction is permanent to browsers.
  IF NOT public.workspace_team_redact_comment(sid,comment)
    OR NOT public.workspace_team_redact_comment(sid,comment) THEN
    RAISE EXCEPTION 'Owner moderation was not idempotent';
  END IF;
  IF (SELECT count(*) FROM public.workspace_team_events
    WHERE space_id=sid AND entity_id=task AND event_type='comment_redacted')<>2 THEN
    RAISE EXCEPTION 'Expected two unique redactions (author and owner)';
  END IF;
  IF NOT public.workspace_team_remove_step(sid,step)
    OR EXISTS(SELECT 1 FROM public.workspace_team_task_steps WHERE id=step) THEN
    RAISE EXCEPTION 'Owner step removal did not persist';
  END IF;
  PERFORM public.workspace_team_set_status(sid,'archived');
  BEGIN
    PERFORM public.workspace_team_post_comment(sid,task,'Archived comment');
    RAISE EXCEPTION 'Archived space accepted comment';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_add_step(sid,task,'Archived step');
    RAISE EXCEPTION 'Archived space accepted step';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM public.workspace_team_set_status(sid,'active');
  PERFORM public.workspace_team_member_change(sid,
    '22222222-2222-4222-8222-222222222222',NULL);
  IF (SELECT count(*) FROM public.workspace_team_events
     WHERE space_id=sid AND entity_id=task AND event_type='task_unassigned')<>1 THEN
    RAISE EXCEPTION 'Removed assignee not audited';
  END IF;
END;
$p18$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
DO $p18$
DECLARE task uuid:=pg_catalog.current_setting('test.p18_task')::uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM public.workspace_team_task_comments WHERE task_id=task)
    OR EXISTS(SELECT 1 FROM public.workspace_team_task_steps WHERE task_id=task) THEN
    RAISE EXCEPTION 'Removed member retained team discussion/checklist access';
  END IF;
END;
$p18$;

DO $p18$
BEGIN
  RAISE NOTICE 'Phase 18: team discussions, moderation, steps, assignments, archived guards and three-role RLS passed';
END;
$p18$;
