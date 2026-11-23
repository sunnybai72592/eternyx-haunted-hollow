-- Phase 19: current-member-only notification receipts, stale cursor monotonicity,
-- team/event binding, member removal, and viewer acknowledgement.
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
DO $p19$
DECLARE sid uuid; other_id uuid; owner_event bigint; foreign_event bigint; invitation jsonb;
BEGIN
  sid:=public.workspace_team_create('Phase 19 realtime events','Receipt test fixture');
  other_id:=public.workspace_team_create('Phase 19 unrelated','Isolated scope');
  PERFORM pg_catalog.set_config('test.p19.sid',sid::text,false);
  SELECT max(id) INTO owner_event FROM public.workspace_team_events WHERE space_id=sid;
  SELECT max(id) INTO foreign_event FROM public.workspace_team_events WHERE space_id=other_id;
  PERFORM pg_catalog.set_config('test.p19.event',owner_event::text,false);
  PERFORM pg_catalog.set_config('test.p19.foreign',foreign_event::text,false);
  IF public.workspace_team_mark_events_seen(sid,owner_event)<>owner_event THEN
    RAISE EXCEPTION 'Owner read receipt not persisted';
  END IF;
  IF (SELECT last_seen_event_id FROM public.workspace_team_read_cursors
      WHERE space_id=sid AND user_id=auth.uid())<>owner_event THEN
    RAISE EXCEPTION 'Owner cursor cannot be read';
  END IF;
  BEGIN
    PERFORM public.workspace_team_mark_events_seen(sid,foreign_event);
    RAISE EXCEPTION 'Foreign team event accepted as read receipt';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.workspace_team_read_cursors(space_id,user_id,last_seen_event_id)
      VALUES(sid,auth.uid(),999999);
    RAISE EXCEPTION 'Browser forged direct notification receipt';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  invitation:=public.workspace_team_invite(sid,'viewer');
  PERFORM pg_catalog.set_config('test.p19.invite',invitation->>'token',false);
END;
$p19$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
DO $p19$
DECLARE sid uuid:=pg_catalog.current_setting('test.p19.sid')::uuid;
  last_event bigint; old_event bigint:=pg_catalog.current_setting('test.p19.event')::bigint;
BEGIN
  IF public.workspace_team_accept_invite(
    pg_catalog.current_setting('test.p19.invite'))<>sid
    OR public.workspace_team_role(sid)<>'viewer' THEN
    RAISE EXCEPTION 'Viewer receipt fixture membership was not granted';
  END IF;
  SELECT max(id) INTO last_event FROM public.workspace_team_events WHERE space_id=sid;
  IF public.workspace_team_mark_events_seen(sid,last_event)<>last_event THEN
    RAISE EXCEPTION 'Viewer cannot acknowledge real events';
  END IF;
  IF public.workspace_team_mark_events_seen(sid,old_event)<>last_event THEN
    RAISE EXCEPTION 'Older read acknowledgment regressed cursor';
  END IF;
  BEGIN
    UPDATE public.workspace_team_read_cursors
      SET last_seen_event_id=999999 WHERE space_id=sid;
    RAISE EXCEPTION 'Browser directly updated read receipt';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.workspace_team_read_cursors
     WHERE user_id='11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'Viewer saw a different member read cursor';
  END IF;
END;
$p19$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',false);
DO $p19$
DECLARE sid uuid:=pg_catalog.current_setting('test.p19.sid')::uuid;
  event_id bigint:=pg_catalog.current_setting('test.p19.event')::bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.workspace_team_read_cursors
      WHERE space_id=sid)
    OR EXISTS (SELECT 1 FROM public.workspace_team_events
      WHERE space_id=sid) THEN
    RAISE EXCEPTION 'Outsider read team activity or notification receipts';
  END IF;
  BEGIN
    PERFORM public.workspace_team_mark_events_seen(sid,event_id);
    RAISE EXCEPTION 'Outsider acknowledged team activity';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$p19$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
DO $p19$
DECLARE sid uuid:=pg_catalog.current_setting('test.p19.sid')::uuid;
BEGIN
  PERFORM public.workspace_team_set_status(sid,'archived');
  IF public.workspace_team_mark_events_seen(sid,
    pg_catalog.current_setting('test.p19.event')::bigint)<1 THEN
    RAISE EXCEPTION 'Archived team lost read-only receipt capability';
  END IF;
  PERFORM public.workspace_team_set_status(sid,'active');
  PERFORM public.workspace_team_member_change(sid,
    '22222222-2222-4222-8222-222222222222',NULL);
END;
$p19$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
DO $p19$
DECLARE sid uuid:=pg_catalog.current_setting('test.p19.sid')::uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.workspace_team_read_cursors WHERE space_id=sid) THEN
    RAISE EXCEPTION 'Removed member retained a read receipt';
  END IF;
  BEGIN
    PERFORM public.workspace_team_mark_events_seen(sid,
      pg_catalog.current_setting('test.p19.event')::bigint);
    RAISE EXCEPTION 'Removed member acknowledged team activity';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$p19$;
DO $p19$
BEGIN
  RAISE NOTICE 'Phase 19: role isolation, real event receipts, viewer access, archived read, monotonic cursors and revoke on member removal passed';
END;
$p19$;
