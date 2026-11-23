-- Phase 17: disposable PostgreSQL acceptance ONLY.
-- Three authenticated fixture users, never remote Supabase accounts.
RESET ROLE;
INSERT INTO auth.users(id) VALUES('33333333-3333-4333-8333-333333333333')
ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);

DO $team$
DECLARE sid uuid; task_id uuid; invitation jsonb;
BEGIN
  sid:=public.workspace_team_create('Field survey crew','Secure team work');
  PERFORM pg_catalog.set_config('test.team17.space',sid::text,false);
  IF public.workspace_team_role(sid)<>'owner' OR
    (SELECT count(*) FROM public.workspace_team_members WHERE space_id=sid)<>1 THEN
    RAISE EXCEPTION 'Creator is not the sole owner';
  END IF;
  IF (SELECT count(*) FROM public.workspace_team_events
      WHERE space_id=sid AND event_type='space_created')<>1 THEN
    RAISE EXCEPTION 'Missing server-only space_created event';
  END IF;
  invitation:=public.workspace_team_invite(sid,'editor');
  IF length(invitation->>'token')<>64
    OR invitation->>'role'<>'editor' THEN
    RAISE EXCEPTION 'Team invitation did not return an editor secret';
  END IF;
  PERFORM pg_catalog.set_config('test.team17.invite',invitation->>'token',false);
  IF (SELECT count(*) FROM public.workspace_team_invites
      WHERE space_id=sid AND revoked_at IS NULL)<>1 THEN
    RAISE EXCEPTION 'No persisted invitation';
  END IF;
  BEGIN
    PERFORM public.workspace_team_invite(sid,'owner');
    RAISE EXCEPTION 'Owner-role invitation allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.workspace_team_members(space_id,user_id,role)
      VALUES(sid,'33333333-3333-4333-8333-333333333333','editor');
    RAISE EXCEPTION 'Browser inserted uninvited membership';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
      VALUES(sid,auth.uid(),sid,'space_created');
    RAISE EXCEPTION 'Browser forged team history';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM token_hash FROM public.workspace_team_invites WHERE space_id=sid;
    RAISE EXCEPTION 'Secret token hash exposed to browser role';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$team$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
DO $team$
DECLARE sid uuid:=pg_catalog.current_setting('test.team17.space')::uuid;
  invite text:=pg_catalog.current_setting('test.team17.invite');
  tid uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM public.workspace_team_spaces WHERE id=sid)
    OR public.workspace_team_role(sid) IS NOT NULL THEN
    RAISE EXCEPTION 'Uninvited user accessed team';
  END IF;
  IF public.workspace_team_accept_invite(invite)<>sid
    OR public.workspace_team_accept_invite(invite)<>sid
    OR public.workspace_team_role(sid)<>'editor' THEN
    RAISE EXCEPTION 'Invited editor could not join idempotently';
  END IF;
  IF (SELECT count(*) FROM public.workspace_team_members WHERE space_id=sid)<>2 THEN
    RAISE EXCEPTION 'Invitation replay duplicated membership';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_team_events
      WHERE space_id=sid AND actor_id=auth.uid() AND event_type='member_joined') THEN
    RAISE EXCEPTION 'Member acceptance did not create real audit event';
  END IF;
  tid:=public.workspace_team_save_task(sid,NULL,'Survey pipeline','Verified field work',
    'todo','high',DATE '2026-12-01',auth.uid(),NULL);
  PERFORM pg_catalog.set_config('test.team17.task',tid::text,false);
  IF NOT EXISTS(SELECT 1 FROM public.workspace_team_tasks
      WHERE id=tid AND assignee_id=auth.uid() AND created_by=auth.uid()) THEN
    RAISE EXCEPTION 'Editor-assigned task did not persist';
  END IF;
  BEGIN
    PERFORM public.workspace_team_save_task(sid,NULL,'Foreign assignment','',
      'todo','normal',NULL,'33333333-3333-4333-8333-333333333333',NULL);
    RAISE EXCEPTION 'Task assigned to a nonmember';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_invite(sid,'viewer');
    RAISE EXCEPTION 'Editor created owner-only invitation';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_set_status(sid,'archived');
    RAISE EXCEPTION 'Editor archived team';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_member_change(sid,auth.uid(),'owner');
    RAISE EXCEPTION 'Editor promoted itself';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$team$;

-- Joining a team must NEVER make Alice's legacy private Workspace visible.
DO $team$
DECLARE alice_private uuid;
BEGIN
  SELECT id INTO alice_private FROM public.workspace_projects
    WHERE owner_id='11111111-1111-4111-8111-111111111111' LIMIT 1;
  IF alice_private IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.workspace_projects WHERE id=alice_private
  ) THEN
    RAISE EXCEPTION 'Team sharing leaked a personal Workspace project';
  END IF;
  IF EXISTS(SELECT 1 FROM public.workspace_items
     WHERE owner_id='11111111-1111-4111-8111-111111111111')
   OR EXISTS(SELECT 1 FROM public.workspace_tasks
     WHERE owner_id='11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'Team member gained another owner private records';
  END IF;
END;
$team$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',false);
DO $team$
DECLARE sid uuid:=pg_catalog.current_setting('test.team17.space')::uuid;
  invite text:=pg_catalog.current_setting('test.team17.invite');
BEGIN
  IF EXISTS(SELECT 1 FROM public.workspace_team_spaces WHERE id=sid)
    OR EXISTS(SELECT 1 FROM public.workspace_team_tasks WHERE space_id=sid)
    OR EXISTS(SELECT 1 FROM public.workspace_team_events WHERE space_id=sid) THEN
    RAISE EXCEPTION 'Uninvited third party accessed team records';
  END IF;
  BEGIN
    PERFORM public.workspace_team_accept_invite(invite);
    RAISE EXCEPTION 'Consumed one-time invitation reused by another account';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_save_task(sid,NULL,'Intrusion','','todo','normal',NULL,NULL,NULL);
    RAISE EXCEPTION 'Nonmember wrote task';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$team$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
DO $team$
DECLARE sid uuid:=pg_catalog.current_setting('test.team17.space')::uuid;
  tid uuid:=pg_catalog.current_setting('test.team17.task')::uuid;
  current_edit timestamptz;
  second_invite jsonb;
BEGIN
  second_invite:=public.workspace_team_invite(sid,'viewer');
  PERFORM pg_catalog.set_config('test.team17.revoked',second_invite->>'token',false);
  IF NOT public.workspace_team_revoke_invite((second_invite->>'invite_id')::uuid)
    OR NOT public.workspace_team_revoke_invite((second_invite->>'invite_id')::uuid) THEN
    RAISE EXCEPTION 'Owner revoke was not idempotent';
  END IF;
  SELECT updated_at INTO current_edit FROM public.workspace_team_tasks WHERE id=tid;
  BEGIN
    PERFORM public.workspace_team_save_task(sid,tid,'Review','Changed','done','urgent',
      NULL,NULL,current_edit + interval '1 second');
    RAISE EXCEPTION 'Stale task optimistic update accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM public.workspace_team_save_task(sid,tid,'Reviewed survey','Safe current edit',
    'done','urgent',NULL,'22222222-2222-4222-8222-222222222222',current_edit);
  IF NOT EXISTS(SELECT 1 FROM public.workspace_team_tasks
      WHERE id=tid AND completed_at IS NOT NULL AND status='done') THEN
    RAISE EXCEPTION 'Real task completion clock missing';
  END IF;
  IF NOT public.workspace_team_member_change(sid,
    '22222222-2222-4222-8222-222222222222','viewer') THEN
    RAISE EXCEPTION 'Owner could not demote editor to viewer';
  END IF;
  BEGIN
    PERFORM public.workspace_team_member_change(sid,auth.uid(),NULL);
    RAISE EXCEPTION 'Owner could remove itself';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$team$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',false);
DO $team$
BEGIN
  BEGIN
    PERFORM public.workspace_team_accept_invite(pg_catalog.current_setting('test.team17.revoked'));
    RAISE EXCEPTION 'Revoked invitation was usable';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$team$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
DO $team$
DECLARE sid uuid:=pg_catalog.current_setting('test.team17.space')::uuid;
  tid uuid:=pg_catalog.current_setting('test.team17.task')::uuid;
BEGIN
  IF public.workspace_team_role(sid)<>'viewer'
    OR NOT EXISTS(SELECT 1 FROM public.workspace_team_tasks WHERE id=tid) THEN
    RAISE EXCEPTION 'Viewer cannot see team task';
  END IF;
  BEGIN
    PERFORM public.workspace_team_save_task(sid,NULL,'Viewer write','','todo','low',NULL,NULL,NULL);
    RAISE EXCEPTION 'Viewer could create task';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_delete_task(sid,tid);
    RAISE EXCEPTION 'Viewer deleted team task';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT public.workspace_team_leave(sid) THEN
    RAISE EXCEPTION 'Viewer could not leave team';
  END IF;
  IF public.workspace_team_role(sid) IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.workspace_team_tasks WHERE space_id=sid) THEN
    RAISE EXCEPTION 'Departed member retained private team read access';
  END IF;
END;
$team$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
DO $team$
DECLARE sid uuid:=pg_catalog.current_setting('test.team17.space')::uuid;
  tid uuid:=pg_catalog.current_setting('test.team17.task')::uuid;
BEGIN
  IF (SELECT assignee_id FROM public.workspace_team_tasks WHERE id=tid) IS NOT NULL THEN
    RAISE EXCEPTION 'Departed teammate remains assigned';
  END IF;
  IF NOT public.workspace_team_set_status(sid,'archived') THEN
    RAISE EXCEPTION 'Owner cannot archive team';
  END IF;
  BEGIN
    PERFORM public.workspace_team_save_task(sid,NULL,'Archived write','','todo','normal',NULL,NULL,NULL);
    RAISE EXCEPTION 'Archived team accepted a write';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_team_invite(sid,'editor');
    RAISE EXCEPTION 'Archived team accepted new invitation';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF NOT public.workspace_team_set_status(sid,'active') THEN
    RAISE EXCEPTION 'Owner cannot reopen team';
  END IF;
  IF NOT public.workspace_team_delete_task(sid,tid) THEN
    RAISE EXCEPTION 'Owner cannot remove task';
  END IF;
  IF (SELECT count(*) FROM public.workspace_team_events WHERE space_id=sid)<9 THEN
    RAISE EXCEPTION 'Audit history is missing expected server-recorded events';
  END IF;
END;
$team$;
DO $team$
BEGIN
  RAISE NOTICE 'Workspace Phase 17 passed: isolated personal projects, one-time invitations, expiring/revoked codes, owner/editor/viewer permissions, assigned tasks, archive and audit trail';
END;
$team$;
