-- ETERNYX Workspace Phase 17: independently permissioned team spaces.
-- NO permissions on the legacy owner-only project/task/item/storage tables are
-- modified. This is a separate team-data boundary; existing private files
-- and personal project exports DO NOT become shared.
-- Deploy through approved staging review, NEVER by assuming a PR applies SQL.

CREATE TABLE public.workspace_team_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description)<=2000),
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_team_spaces_owner_idx
  ON public.workspace_team_spaces(owner_id,created_at DESC);

CREATE TABLE public.workspace_team_members (
  space_id uuid NOT NULL REFERENCES public.workspace_team_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN('owner','editor','viewer')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(space_id,user_id)
);
CREATE UNIQUE INDEX workspace_team_one_owner_idx
  ON public.workspace_team_members(space_id) WHERE role='owner';
CREATE INDEX workspace_team_members_user_idx
  ON public.workspace_team_members(user_id,space_id);

CREATE TABLE public.workspace_team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.workspace_team_spaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{32}$'),
  role text NOT NULL CHECK(role IN('viewer','editor')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  consumed_by uuid REFERENCES auth.users(id),
  consumed_at timestamptz,
  CHECK((consumed_by IS NULL)=(consumed_at IS NULL))
);
CREATE INDEX workspace_team_invites_space_idx
  ON public.workspace_team_invites(space_id,created_at DESC);

CREATE TABLE public.workspace_team_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.workspace_team_spaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  assignee_id uuid REFERENCES auth.users(id),
  title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 200),
  details text NOT NULL DEFAULT '' CHECK(char_length(details)<=4000),
  status text NOT NULL DEFAULT 'todo' CHECK(status IN('todo','in_progress','done')),
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
  due_on date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_team_tasks_recent_idx
  ON public.workspace_team_tasks(space_id,updated_at DESC);
CREATE INDEX workspace_team_tasks_assignee_idx
  ON public.workspace_team_tasks(assignee_id,status,due_on);

CREATE TABLE public.workspace_team_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES public.workspace_team_spaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  entity_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type IN(
    'space_created','space_archived','space_reopened','invite_created',
    'invite_revoked','member_joined','member_removed','role_changed',
    'task_created','task_updated','task_deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_team_events_recent_idx
  ON public.workspace_team_events(space_id,created_at DESC,id DESC);

ALTER TABLE public.workspace_team_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_team_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_team_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_team_spaces,public.workspace_team_members,
  public.workspace_team_invites,public.workspace_team_tasks,
  public.workspace_team_events FROM PUBLIC,anon,authenticated;

-- Helper is SECURITY DEFINER to avoid recursion from members RLS. It
-- returns only the current caller's role, never another person's membership.
CREATE OR REPLACE FUNCTION public.workspace_team_role(p_space_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $team_role$
  SELECT m.role FROM public.workspace_team_members m
  WHERE m.space_id=p_space_id AND m.user_id=(SELECT auth.uid())
  LIMIT 1;
$team_role$;
REVOKE ALL ON FUNCTION public.workspace_team_role(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_team_role(uuid) TO authenticated;

GRANT SELECT ON public.workspace_team_spaces,public.workspace_team_members,
  public.workspace_team_tasks,public.workspace_team_events TO authenticated;
GRANT SELECT(id,space_id,created_by,role,expires_at,created_at,
  revoked_at,consumed_by,consumed_at) ON public.workspace_team_invites
  TO authenticated;

CREATE POLICY workspace_team_space_read ON public.workspace_team_spaces
  FOR SELECT TO authenticated USING(public.workspace_team_role(id) IS NOT NULL);
CREATE POLICY workspace_team_member_read ON public.workspace_team_members
  FOR SELECT TO authenticated USING(public.workspace_team_role(space_id) IS NOT NULL);
CREATE POLICY workspace_team_task_read ON public.workspace_team_tasks
  FOR SELECT TO authenticated USING(public.workspace_team_role(space_id) IS NOT NULL);
CREATE POLICY workspace_team_event_read ON public.workspace_team_events
  FOR SELECT TO authenticated USING(public.workspace_team_role(space_id) IS NOT NULL);
CREATE POLICY workspace_team_invite_owner_read ON public.workspace_team_invites
  FOR SELECT TO authenticated
  USING(public.workspace_team_role(space_id)='owner');

CREATE OR REPLACE FUNCTION public.workspace_team_create(
  p_name text,p_description text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_create$
DECLARE v_owner uuid:=(SELECT auth.uid()); v_id uuid;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Sign in to create a team space' USING ERRCODE='42501';
  END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120
    OR p_description IS NULL OR char_length(p_description)>2000 THEN
    RAISE EXCEPTION 'Invalid team-space name or description' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text,20261117));
  IF (SELECT count(*) FROM public.workspace_team_spaces
      WHERE owner_id=v_owner)>=10 THEN
    RAISE EXCEPTION 'Maximum 10 owned team spaces per account'
      USING ERRCODE='23514';
  END IF;
  INSERT INTO public.workspace_team_spaces(owner_id,name,description)
    VALUES(v_owner,btrim(p_name),p_description) RETURNING id INTO v_id;
  INSERT INTO public.workspace_team_members(space_id,user_id,role)
    VALUES(v_id,v_owner,'owner');
  INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
    VALUES(v_id,v_owner,v_id,'space_created');
  RETURN v_id;
END;
$team_create$;

-- Invite tokens are random 64-hex strings returned ONCE and never stored
-- in plaintext. Hash is private to SQL; expiration 7 days, use only once.
CREATE OR REPLACE FUNCTION public.workspace_team_invite(
  p_space_id uuid,p_role text DEFAULT 'editor'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_invite$
DECLARE
  v_actor uuid:=(SELECT auth.uid());
  v_space public.workspace_team_spaces%ROWTYPE;
  v_token text;
  v_id uuid;
  v_expiry timestamptz:=now()+interval '7 days';
BEGIN
  IF v_actor IS NULL OR public.workspace_team_role(p_space_id)<>'owner' THEN
    RAISE EXCEPTION 'Only the team owner can create invitations' USING ERRCODE='42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('editor','viewer') THEN
    RAISE EXCEPTION 'Invitation role must be editor or viewer' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_space FROM public.workspace_team_spaces
    WHERE id=p_space_id AND owner_id=v_actor FOR UPDATE;
  IF NOT FOUND OR v_space.status<>'active' THEN
    RAISE EXCEPTION 'An archived team cannot accept invitations' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM public.workspace_team_invites
      WHERE space_id=p_space_id AND revoked_at IS NULL
      AND consumed_by IS NULL AND expires_at>now())>=20 THEN
    RAISE EXCEPTION 'At most 20 active invitations per team'
      USING ERRCODE='23514';
  END IF;
  v_token:=replace(gen_random_uuid()::text,'-','')||
    replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.workspace_team_invites(
    space_id,created_by,token_hash,role,expires_at)
    VALUES(p_space_id,v_actor,pg_catalog.md5(v_token),p_role,v_expiry)
    RETURNING id INTO v_id;
  INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
    VALUES(p_space_id,v_actor,v_id,'invite_created');
  RETURN pg_catalog.jsonb_build_object(
    'invite_id',v_id,'token',v_token,'expires_at',v_expiry,'role',p_role);
END;
$team_invite$;

CREATE OR REPLACE FUNCTION public.workspace_team_accept_invite(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_accept$
DECLARE
  v_actor uuid:=(SELECT auth.uid());
  v_invite public.workspace_team_invites%ROWTYPE;
  v_space public.workspace_team_spaces%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sign in to accept a team invitation' USING ERRCODE='42501';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid team invitation token' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_invite FROM public.workspace_team_invites
    WHERE token_hash=pg_catalog.md5(p_token) FOR UPDATE;
  IF NOT FOUND OR v_invite.revoked_at IS NOT NULL
    OR v_invite.expires_at<=now()
    OR (v_invite.consumed_by IS NOT NULL AND v_invite.consumed_by<>v_actor) THEN
    RAISE EXCEPTION 'Invitation expired, revoked, used or invalid'
      USING ERRCODE='23514';
  END IF;
  -- Lock the team row to serialize member caps against removal/inviting.
  SELECT * INTO v_space FROM public.workspace_team_spaces
    WHERE id=v_invite.space_id FOR UPDATE;
  IF NOT FOUND OR v_space.status<>'active' THEN
    RAISE EXCEPTION 'The invited team is no longer active'
      USING ERRCODE='23514';
  END IF;
  IF v_invite.consumed_by=v_actor THEN
    IF NOT EXISTS(SELECT 1 FROM public.workspace_team_members
      WHERE space_id=v_space.id AND user_id=v_actor) THEN
      RAISE EXCEPTION 'Your team membership was removed' USING ERRCODE='23514';
    END IF;
    RETURN v_space.id;
  END IF;
  IF EXISTS(SELECT 1 FROM public.workspace_team_members
    WHERE space_id=v_space.id AND user_id=v_actor) THEN
    RAISE EXCEPTION 'Already a member; invitation was not consumed'
      USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM public.workspace_team_members
      WHERE space_id=v_space.id)>=20 THEN
    RAISE EXCEPTION 'Maximum 20 members per team' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.workspace_team_members(space_id,user_id,role)
    VALUES(v_space.id,v_actor,v_invite.role);
  UPDATE public.workspace_team_invites
    SET consumed_by=v_actor,consumed_at=now() WHERE id=v_invite.id;
  INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
    VALUES(v_space.id,v_actor,v_actor,'member_joined');
  RETURN v_space.id;
END;
$team_accept$;

CREATE OR REPLACE FUNCTION public.workspace_team_revoke_invite(p_invite_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_revoke$
DECLARE v_invite public.workspace_team_invites%ROWTYPE; v_actor uuid:=(SELECT auth.uid());
BEGIN
  SELECT * INTO v_invite FROM public.workspace_team_invites
    WHERE id=p_invite_id FOR UPDATE;
  IF NOT FOUND OR v_actor IS NULL
    OR public.workspace_team_role(v_invite.space_id)<>'owner' THEN
    RAISE EXCEPTION 'Invitation not found or cannot be managed'
      USING ERRCODE='42501';
  END IF;
  IF v_invite.consumed_by IS NOT NULL THEN
    RAISE EXCEPTION 'An accepted invitation cannot be revoked'
      USING ERRCODE='23514';
  END IF;
  IF v_invite.revoked_at IS NULL THEN
    UPDATE public.workspace_team_invites SET revoked_at=now()
      WHERE id=v_invite.id;
    INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
      VALUES(v_invite.space_id,v_actor,v_invite.id,'invite_revoked');
  END IF;
  RETURN true;
END;
$team_revoke$;

CREATE OR REPLACE FUNCTION public.workspace_team_member_change(
  p_space_id uuid,p_user_id uuid,p_role text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_member_change$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_old text; v_space public.workspace_team_spaces%ROWTYPE;
BEGIN
  SELECT * INTO v_space FROM public.workspace_team_spaces
    WHERE id=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_actor IS NULL OR v_space.owner_id<>v_actor
    OR public.workspace_team_role(p_space_id)<>'owner' THEN
    RAISE EXCEPTION 'Only a team owner can manage members' USING ERRCODE='42501';
  END IF;
  SELECT role INTO v_old FROM public.workspace_team_members
    WHERE space_id=p_space_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_old='owner' THEN
    RAISE EXCEPTION 'Cannot change owner or missing membership'
      USING ERRCODE='23514';
  END IF;
  IF p_role IS NOT NULL AND p_role NOT IN('editor','viewer') THEN
    RAISE EXCEPTION 'Invalid member role' USING ERRCODE='23514';
  END IF;
  IF p_role IS NULL THEN
    -- Remove user assignments first; completed work stays on team tasks.
    UPDATE public.workspace_team_tasks SET assignee_id=NULL,updated_at=now()
      WHERE space_id=p_space_id AND assignee_id=p_user_id;
    DELETE FROM public.workspace_team_members
      WHERE space_id=p_space_id AND user_id=p_user_id;
  ELSE
    UPDATE public.workspace_team_members SET role=p_role
      WHERE space_id=p_space_id AND user_id=p_user_id;
  END IF;
  INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
    VALUES(p_space_id,v_actor,p_user_id,
      CASE WHEN p_role IS NULL THEN 'member_removed' ELSE 'role_changed' END);
  RETURN true;
END;
$team_member_change$;

CREATE OR REPLACE FUNCTION public.workspace_team_leave(p_space_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_leave$
DECLARE v_actor uuid:=(SELECT auth.uid());
BEGIN
  PERFORM 1 FROM public.workspace_team_spaces WHERE id=p_space_id FOR UPDATE;
  IF v_actor IS NULL OR public.workspace_team_role(p_space_id) NOT IN('editor','viewer') THEN
    RAISE EXCEPTION 'Only non-owner team members may leave' USING ERRCODE='42501';
  END IF;
  UPDATE public.workspace_team_tasks SET assignee_id=NULL,updated_at=now()
    WHERE space_id=p_space_id AND assignee_id=v_actor;
  DELETE FROM public.workspace_team_members
    WHERE space_id=p_space_id AND user_id=v_actor;
  INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
    VALUES(p_space_id,v_actor,v_actor,'member_removed');
  RETURN true;
END;
$team_leave$;

CREATE OR REPLACE FUNCTION public.workspace_team_set_status(
  p_space_id uuid,p_status text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_status$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_old text;
BEGIN
  IF v_actor IS NULL OR public.workspace_team_role(p_space_id)<>'owner' THEN
    RAISE EXCEPTION 'Only team owner may archive or reopen' USING ERRCODE='42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN('active','archived') THEN
    RAISE EXCEPTION 'Invalid team status' USING ERRCODE='23514';
  END IF;
  SELECT status INTO v_old FROM public.workspace_team_spaces
    WHERE id=p_space_id AND owner_id=v_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team not found' USING ERRCODE='42501'; END IF;
  IF v_old<>p_status THEN
    UPDATE public.workspace_team_spaces
      SET status=p_status,updated_at=now() WHERE id=p_space_id;
    INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
      VALUES(p_space_id,v_actor,p_space_id,
        CASE WHEN p_status='archived' THEN 'space_archived' ELSE 'space_reopened' END);
  END IF;
  RETURN true;
END;
$team_status$;

CREATE OR REPLACE FUNCTION public.workspace_team_save_task(
  p_space_id uuid,p_task_id uuid,p_title text,p_details text,
  p_status text,p_priority text,p_due_on date,
  p_assignee_id uuid,p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_save_task$
DECLARE
  v_actor uuid:=(SELECT auth.uid());
  v_space public.workspace_team_spaces%ROWTYPE;
  v_task public.workspace_team_tasks%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_actor IS NULL OR public.workspace_team_role(p_space_id) NOT IN('owner','editor') THEN
    RAISE EXCEPTION 'Only team editors can change tasks' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_space FROM public.workspace_team_spaces
    WHERE id=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_space.status<>'active' THEN
    RAISE EXCEPTION 'Archived team tasks are read-only' USING ERRCODE='23514';
  END IF;
  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 200
    OR p_details IS NULL OR char_length(p_details)>4000
    OR p_status IS NULL OR p_status NOT IN('todo','in_progress','done')
    OR p_priority IS NULL OR p_priority NOT IN('low','normal','high','urgent') THEN
    RAISE EXCEPTION 'Invalid team task fields' USING ERRCODE='23514';
  END IF;
  IF p_assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_team_members m
    WHERE m.space_id=p_space_id AND m.user_id=p_assignee_id
  ) THEN
    RAISE EXCEPTION 'Task assignee must be a current team member'
      USING ERRCODE='23514';
  END IF;
  IF p_task_id IS NULL THEN
    IF (SELECT count(*) FROM public.workspace_team_tasks
       WHERE space_id=p_space_id)>=500 THEN
      RAISE EXCEPTION 'Maximum 500 tasks per team'
        USING ERRCODE='23514';
    END IF;
    INSERT INTO public.workspace_team_tasks(
      space_id,created_by,assignee_id,title,details,status,priority,due_on,completed_at
    ) VALUES (
      p_space_id,v_actor,p_assignee_id,btrim(p_title),p_details,
      p_status,p_priority,p_due_on,
      CASE WHEN p_status='done' THEN now() ELSE NULL END
    ) RETURNING id INTO v_id;
    INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
      VALUES(p_space_id,v_actor,v_id,'task_created');
  ELSE
    SELECT * INTO v_task FROM public.workspace_team_tasks
      WHERE space_id=p_space_id AND id=p_task_id FOR UPDATE;
    IF NOT FOUND OR p_expected_updated_at IS NULL
      OR v_task.updated_at<>p_expected_updated_at THEN
      RAISE EXCEPTION 'Task changed since review. Refresh before saving'
        USING ERRCODE='23514';
    END IF;
    UPDATE public.workspace_team_tasks SET
      title=btrim(p_title),details=p_details,status=p_status,priority=p_priority,
      due_on=p_due_on,assignee_id=p_assignee_id,
      completed_at=CASE
        WHEN p_status='done' AND v_task.status<>'done' THEN now()
        WHEN p_status='done' THEN v_task.completed_at
        ELSE NULL END,
      updated_at=now()
    WHERE id=p_task_id RETURNING id INTO v_id;
    INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
      VALUES(p_space_id,v_actor,v_id,'task_updated');
  END IF;
  RETURN v_id;
END;
$team_save_task$;

CREATE OR REPLACE FUNCTION public.workspace_team_delete_task(
  p_space_id uuid,p_task_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_delete_task$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_space public.workspace_team_spaces%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR public.workspace_team_role(p_space_id) NOT IN('owner','editor') THEN
    RAISE EXCEPTION 'Only team editors can delete tasks' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_space FROM public.workspace_team_spaces
    WHERE id=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_space.status<>'active' THEN
    RAISE EXCEPTION 'Archived teams are read-only' USING ERRCODE='23514';
  END IF;
  DELETE FROM public.workspace_team_tasks
    WHERE id=p_task_id AND space_id=p_space_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task no longer exists' USING ERRCODE='23514'; END IF;
  INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
    VALUES(p_space_id,v_actor,p_task_id,'task_deleted');
  RETURN true;
END;
$team_delete_task$;

REVOKE ALL ON FUNCTION public.workspace_team_create(text,text),
  public.workspace_team_invite(uuid,text),public.workspace_team_accept_invite(text),
  public.workspace_team_revoke_invite(uuid),
  public.workspace_team_member_change(uuid,uuid,text),
  public.workspace_team_leave(uuid),public.workspace_team_set_status(uuid,text),
  public.workspace_team_save_task(uuid,uuid,text,text,text,text,date,uuid,timestamptz),
  public.workspace_team_delete_task(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_team_create(text,text),
  public.workspace_team_invite(uuid,text),public.workspace_team_accept_invite(text),
  public.workspace_team_revoke_invite(uuid),
  public.workspace_team_member_change(uuid,uuid,text),
  public.workspace_team_leave(uuid),public.workspace_team_set_status(uuid,text),
  public.workspace_team_save_task(uuid,uuid,text,text,text,text,date,uuid,timestamptz),
  public.workspace_team_delete_task(uuid,uuid)
  TO authenticated;
