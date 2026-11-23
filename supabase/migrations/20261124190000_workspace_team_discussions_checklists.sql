-- ETERNYX Workspace Phase 18 — role-guarded team task discussions,
-- checklists and assignment audit. Requires Phase 17 team-space migration.
-- Does NOT change personal Workspace/private Storage permissions.
-- Deploy separately after authorized staging review.

-- Composite FK: a comment or step MUST belong to a task in the same team.
ALTER TABLE public.workspace_team_tasks
  ADD CONSTRAINT workspace_team_tasks_id_space_unique UNIQUE(id,space_id);

CREATE TABLE public.workspace_team_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  task_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  redacted_at timestamptz,
  redacted_by uuid REFERENCES auth.users(id),
  FOREIGN KEY(task_id,space_id) REFERENCES public.workspace_team_tasks(id,space_id) ON DELETE CASCADE,
  CHECK((redacted_at IS NULL) = (redacted_by IS NULL))
);
CREATE INDEX workspace_team_comments_task_recent_idx
  ON public.workspace_team_task_comments(task_id,created_at DESC,id DESC);

CREATE TABLE public.workspace_team_task_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  task_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 180),
  done boolean NOT NULL DEFAULT false,
  done_by uuid REFERENCES auth.users(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(task_id,space_id) REFERENCES public.workspace_team_tasks(id,space_id) ON DELETE CASCADE,
  CHECK((done_by IS NULL)=(completed_at IS NULL)),
  CHECK(done=(completed_at IS NOT NULL))
);
CREATE INDEX workspace_team_steps_task_recent_idx
  ON public.workspace_team_task_steps(task_id,created_at ASC,id ASC);

ALTER TABLE public.workspace_team_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_team_task_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_team_task_comments,public.workspace_team_task_steps
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.workspace_team_task_comments,public.workspace_team_task_steps TO authenticated;
CREATE POLICY workspace_team_comments_read ON public.workspace_team_task_comments
  FOR SELECT TO authenticated
  USING(public.workspace_team_role(space_id) IS NOT NULL);
CREATE POLICY workspace_team_steps_read ON public.workspace_team_task_steps
  FOR SELECT TO authenticated
  USING(public.workspace_team_role(space_id) IS NOT NULL);

-- Maintain server-only activity events; browser roles have no direct writes.
ALTER TABLE public.workspace_team_events
  DROP CONSTRAINT workspace_team_events_event_type_check;
ALTER TABLE public.workspace_team_events
  ADD CONSTRAINT workspace_team_events_event_type_check
  CHECK(event_type IN(
    'space_created','space_archived','space_reopened',
    'invite_created','invite_revoked','member_joined','member_removed','role_changed',
    'task_created','task_updated','task_deleted',
    'task_assigned','task_unassigned',
    'comment_posted','comment_redacted',
    'step_added','step_checked','step_unchecked','step_removed'
  ));

-- Track actual assignment changes including unassignment on member removal.
-- Trigger fires exclusively through trusted server mutations because team
-- task table has no authenticated INSERT/UPDATE/DELETE privileges.
CREATE OR REPLACE FUNCTION public.workspace_team_assignment_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $assignment_event$
DECLARE v_actor uuid:=(SELECT auth.uid());
BEGIN
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND v_actor IS NOT NULL THEN
    INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
    VALUES(NEW.space_id,v_actor,NEW.id,
      CASE WHEN NEW.assignee_id IS NULL THEN 'task_unassigned'
           ELSE 'task_assigned' END);
  END IF;
  RETURN NULL;
END;
$assignment_event$;
REVOKE ALL ON FUNCTION public.workspace_team_assignment_event()
  FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_team_task_assignment_event
  AFTER UPDATE OF assignee_id ON public.workspace_team_tasks
  FOR EACH ROW EXECUTE FUNCTION public.workspace_team_assignment_event();

-- Strictly bounded, non-editable comment posting. Never trust IDs, role,
-- active status or task ownership from browser-supplied fields.
CREATE OR REPLACE FUNCTION public.workspace_team_post_comment(
  p_space_id uuid,p_task_id uuid,p_body text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_comment_post$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_space public.workspace_team_spaces%ROWTYPE; v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sign in before posting a team comment' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_space FROM public.workspace_team_spaces
    WHERE id=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_space.status<>'active' THEN
    RAISE EXCEPTION 'Archived or missing team cannot accept comments' USING ERRCODE='23514';
  END IF;
  IF COALESCE(public.workspace_team_role(p_space_id),'') NOT IN ('owner','editor') THEN
    RAISE EXCEPTION 'Team viewer or nonmember cannot post comments' USING ERRCODE='42501';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 2000
    OR NOT EXISTS(SELECT 1 FROM public.workspace_team_tasks t
      WHERE t.id=p_task_id AND t.space_id=p_space_id) THEN
    RAISE EXCEPTION 'Invalid team task or comment body' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM public.workspace_team_task_comments c
     WHERE c.task_id=p_task_id)>=200 THEN
    RAISE EXCEPTION 'Limit of 200 task comments reached' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.workspace_team_task_comments(space_id,task_id,author_id,body)
    VALUES(p_space_id,p_task_id,v_actor,btrim(p_body)) RETURNING id INTO v_id;
  INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
    VALUES(p_space_id,v_actor,p_task_id,'comment_posted');
  RETURN v_id;
END;
$team_comment_post$;

-- Redact rather than delete. No browser can restore or edit a redacted body.
-- Own author can redact; owner can moderate; viewers/outsiders cannot.
CREATE OR REPLACE FUNCTION public.workspace_team_redact_comment(
  p_space_id uuid,p_comment_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_comment_redact$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_space public.workspace_team_spaces%ROWTYPE;
  v_comment public.workspace_team_task_comments%ROWTYPE; v_role text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sign in to moderate a comment' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_space FROM public.workspace_team_spaces
    WHERE id=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_space.status<>'active' THEN
    RAISE EXCEPTION 'Archived team comments cannot be changed' USING ERRCODE='23514';
  END IF;
  v_role:=COALESCE(public.workspace_team_role(p_space_id),'');
  IF v_role NOT IN('owner','editor') THEN
    RAISE EXCEPTION 'Team viewers and outsiders cannot redact comments' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_comment FROM public.workspace_team_task_comments
    WHERE id=p_comment_id AND space_id=p_space_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comment not found in this team' USING ERRCODE='23514';
  END IF;
  IF v_role<>'owner' AND v_comment.author_id<>v_actor THEN
    RAISE EXCEPTION 'Only the author or owner may redact this comment' USING ERRCODE='42501';
  END IF;
  IF v_comment.redacted_at IS NULL THEN
    UPDATE public.workspace_team_task_comments
      SET body='[Comment redacted]',redacted_at=now(),redacted_by=v_actor
      WHERE id=p_comment_id;
    INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
      VALUES(p_space_id,v_actor,v_comment.task_id,'comment_redacted');
  END IF;
  RETURN true;
END;
$team_comment_redact$;

-- Step addition and actual completion state transitions. The team row is
-- locked first to serialize editor role changes and step cap enforcement.
CREATE OR REPLACE FUNCTION public.workspace_team_add_step(
  p_space_id uuid,p_task_id uuid,p_title text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_step_add$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_space public.workspace_team_spaces%ROWTYPE; v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sign in to edit team steps' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_space FROM public.workspace_team_spaces WHERE id=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_space.status<>'active' THEN
    RAISE EXCEPTION 'Team is archived or missing' USING ERRCODE='23514';
  END IF;
  IF COALESCE(public.workspace_team_role(p_space_id),'') NOT IN('owner','editor') THEN
    RAISE EXCEPTION 'Only team editors can add checklist steps' USING ERRCODE='42501';
  END IF;
  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 180
    OR NOT EXISTS(SELECT 1 FROM public.workspace_team_tasks t
      WHERE id=p_task_id AND t.space_id=p_space_id) THEN
    RAISE EXCEPTION 'Invalid checklist step or team task' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM public.workspace_team_task_steps WHERE task_id=p_task_id)>=30 THEN
    RAISE EXCEPTION 'Maximum 30 checklist steps per task' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.workspace_team_task_steps(space_id,task_id,created_by,title)
    VALUES(p_space_id,p_task_id,v_actor,btrim(p_title)) RETURNING id INTO v_id;
  INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
    VALUES(p_space_id,v_actor,p_task_id,'step_added');
  RETURN v_id;
END;
$team_step_add$;

CREATE OR REPLACE FUNCTION public.workspace_team_check_step(
  p_space_id uuid,p_step_id uuid,p_done boolean,p_expected_updated_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_step_check$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_space public.workspace_team_spaces%ROWTYPE;
  v_step public.workspace_team_task_steps%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sign in to complete steps' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_space FROM public.workspace_team_spaces WHERE id=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_space.status<>'active' THEN
    RAISE EXCEPTION 'Team is archived or missing' USING ERRCODE='23514';
  END IF;
  IF COALESCE(public.workspace_team_role(p_space_id),'') NOT IN('owner','editor') THEN
    RAISE EXCEPTION 'Only team editors can complete steps' USING ERRCODE='42501';
  END IF;
  IF p_done IS NULL OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Step update needs an expected version and explicit state' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_step FROM public.workspace_team_task_steps
    WHERE id=p_step_id AND space_id=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_step.updated_at<>p_expected_updated_at THEN
    RAISE EXCEPTION 'Step changed since review; reload before editing' USING ERRCODE='23514';
  END IF;
  IF v_step.done IS DISTINCT FROM p_done THEN
    UPDATE public.workspace_team_task_steps
      SET done=p_done,done_by=CASE WHEN p_done THEN v_actor ELSE NULL END,
        completed_at=CASE WHEN p_done THEN now() ELSE NULL END,
        updated_at=now()
      WHERE id=p_step_id;
    INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
      VALUES(p_space_id,v_actor,v_step.task_id,
        CASE WHEN p_done THEN 'step_checked' ELSE 'step_unchecked' END);
  END IF;
  RETURN true;
END;
$team_step_check$;

CREATE OR REPLACE FUNCTION public.workspace_team_remove_step(
  p_space_id uuid,p_step_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_step_remove$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_space public.workspace_team_spaces%ROWTYPE;
  v_step public.workspace_team_task_steps%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sign in to remove a step' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_space FROM public.workspace_team_spaces WHERE id=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_space.status<>'active' THEN
    RAISE EXCEPTION 'Team is archived or missing' USING ERRCODE='23514';
  END IF;
  IF COALESCE(public.workspace_team_role(p_space_id),'') NOT IN('owner','editor') THEN
    RAISE EXCEPTION 'Only team editors can delete checklist steps' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_step FROM public.workspace_team_task_steps
    WHERE id=p_step_id AND space_id=p_space_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team step not found' USING ERRCODE='23514'; END IF;
  DELETE FROM public.workspace_team_task_steps WHERE id=p_step_id;
  INSERT INTO public.workspace_team_events(space_id,actor_id,entity_id,event_type)
    VALUES(p_space_id,v_actor,v_step.task_id,'step_removed');
  RETURN true;
END;
$team_step_remove$;

REVOKE ALL ON FUNCTION public.workspace_team_post_comment(uuid,uuid,text),
  public.workspace_team_redact_comment(uuid,uuid),
  public.workspace_team_add_step(uuid,uuid,text),
  public.workspace_team_check_step(uuid,uuid,boolean,timestamptz),
  public.workspace_team_remove_step(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_team_post_comment(uuid,uuid,text),
  public.workspace_team_redact_comment(uuid,uuid),
  public.workspace_team_add_step(uuid,uuid,text),
  public.workspace_team_check_step(uuid,uuid,boolean,timestamptz),
  public.workspace_team_remove_step(uuid,uuid)
  TO authenticated;
