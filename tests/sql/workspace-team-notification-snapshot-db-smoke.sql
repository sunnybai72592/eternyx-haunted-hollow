-- Phase 20 snapshot acceptance: exact count, RLS, role, membership and cursor.
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
DO $p20$
DECLARE sid uuid; other_space uuid; invite jsonb; snapshot jsonb;
  event_id bigint;
BEGIN
  sid:=public.workspace_team_create('Phase 20 notification snapshot','SQL fixture');
  other_space:=public.workspace_team_create('Unrelated Phase 20 team','Private');
  PERFORM pg_catalog.set_config('test.p20.space',sid::text,false);
  snapshot:=public.workspace_team_notification_snapshot(sid);
  IF snapshot IS NULL OR (snapshot->>'unread_count')::bigint<>0
     OR (snapshot->>'last_seen_event_id')::bigint<>0
     OR (snapshot->>'latest_event_id') IS NULL THEN
    RAISE EXCEPTION 'Owner initial zero-unread snapshot incorrect';
  END IF;
  event_id:=(snapshot->>'latest_event_id')::bigint;
  IF public.workspace_team_mark_events_seen(sid,event_id)<>event_id
     OR (public.workspace_team_notification_snapshot(sid)->>'last_seen_event_id')::bigint<>event_id THEN
    RAISE EXCEPTION 'Read receipt not reflected in consistent snapshot';
  END IF;
  IF public.workspace_team_notification_snapshot(other_space) IS NULL THEN
    RAISE EXCEPTION 'Owner cannot inspect own other team';
  END IF;
  invite:=public.workspace_team_invite(sid,'viewer');
  PERFORM pg_catalog.set_config('test.p20.invite',invite->>'token',false);
END;
$p20$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
DO $p20$
DECLARE sid uuid:=pg_catalog.current_setting('test.p20.space')::uuid;
BEGIN
  IF public.workspace_team_notification_snapshot(sid) IS NOT NULL THEN
    RAISE EXCEPTION 'Uninvited account received a team snapshot';
  END IF;
  IF public.workspace_team_accept_invite(
     pg_catalog.current_setting('test.p20.invite'))<>sid THEN
    RAISE EXCEPTION 'Fixture viewer did not join';
  END IF;
  IF public.workspace_team_notification_snapshot(sid) IS NULL THEN
    RAISE EXCEPTION 'Viewer cannot read own team notification summary';
  END IF;
END;
$p20$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
DO $p20$
DECLARE sid uuid:=pg_catalog.current_setting('test.p20.space')::uuid;
  tid uuid;
BEGIN
  tid:=public.workspace_team_save_task(sid,NULL,'Verified site findings','',
    'todo','normal',NULL,NULL,NULL);
  PERFORM public.workspace_team_post_comment(sid,tid,'Only metadata events are notified');
END;
$p20$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
DO $p20$
DECLARE sid uuid:=pg_catalog.current_setting('test.p20.space')::uuid;
  snapshot jsonb; expected_count bigint; latest bigint;
BEGIN
  snapshot:=public.workspace_team_notification_snapshot(sid);
  SELECT count(*) INTO expected_count
    FROM public.workspace_team_events e
    JOIN public.workspace_team_members m ON m.space_id=e.space_id
    WHERE m.space_id=sid AND m.user_id=auth.uid()
      AND e.created_at>=m.joined_at
      AND e.actor_id<>auth.uid();
  IF (snapshot->>'unread_count')::bigint<>expected_count OR expected_count<2 THEN
    RAISE EXCEPTION 'Viewer exact unread event count did not match real events';
  END IF;
  latest:=(snapshot->>'latest_event_id')::bigint;
  PERFORM public.workspace_team_mark_events_seen(sid,latest);
  snapshot:=public.workspace_team_notification_snapshot(sid);
  IF (snapshot->>'unread_count')::bigint<>0
     OR (snapshot->>'last_seen_event_id')::bigint<>latest THEN
    RAISE EXCEPTION 'Mark-seen did not clear viewer notification snapshot';
  END IF;
END;
$p20$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',false);
DO $p20$
DECLARE sid uuid:=pg_catalog.current_setting('test.p20.space')::uuid;
BEGIN
  IF public.workspace_team_notification_snapshot(sid) IS NOT NULL THEN
    RAISE EXCEPTION 'Outsider received team event summary';
  END IF;
END;
$p20$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
DO $p20$
DECLARE sid uuid:=pg_catalog.current_setting('test.p20.space')::uuid;
BEGIN
  PERFORM public.workspace_team_set_status(sid,'archived');
END;
$p20$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
DO $p20$
DECLARE sid uuid:=pg_catalog.current_setting('test.p20.space')::uuid;
BEGIN
  IF public.workspace_team_notification_snapshot(sid) IS NULL THEN
    RAISE EXCEPTION 'Viewer lost read-only archived-team activity';
  END IF;
END;
$p20$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
DO $p20$
DECLARE sid uuid:=pg_catalog.current_setting('test.p20.space')::uuid;
BEGIN
  PERFORM public.workspace_team_set_status(sid,'active');
  PERFORM public.workspace_team_member_change(sid,
    '22222222-2222-4222-8222-222222222222',NULL);
END;
$p20$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
DO $p20$
DECLARE sid uuid:=pg_catalog.current_setting('test.p20.space')::uuid;
BEGIN
  IF public.workspace_team_notification_snapshot(sid) IS NOT NULL THEN
    RAISE EXCEPTION 'Former member obtained notification snapshot';
  END IF;
END;
$p20$;
DO $p20$ BEGIN
  RAISE NOTICE 'Phase 20: single-snapshot counts, viewer rights, outsider denial, read receipts and membership removal passed';
END $p20$;
