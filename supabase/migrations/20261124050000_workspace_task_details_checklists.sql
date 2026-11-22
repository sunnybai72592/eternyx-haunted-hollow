-- Workspace Phase 7: real task details, honest completion dates and private steps.
-- Requires earlier Workspace Phase 1, 2, 5 and 6 migrations. Do not deploy from PR.

ALTER TABLE public.workspace_tasks
  ADD COLUMN details text NOT NULL DEFAULT ''
    CHECK (char_length(details) <= 4000),
  ADD COLUMN completed_at timestamptz;
GRANT INSERT(details), UPDATE(details) ON public.workspace_tasks TO authenticated;

-- The timestamp is system-set, never writable from the browser.
CREATE OR REPLACE FUNCTION public.workspace_task_completion_clock()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $workspace_clock$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.completed_at := CASE WHEN NEW.status = 'done' THEN now() ELSE NULL END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.completed_at := CASE WHEN NEW.status = 'done' THEN now() ELSE NULL END;
  ELSE
    NEW.completed_at := OLD.completed_at;
  END IF;
  RETURN NEW;
END;
$workspace_clock$;
REVOKE ALL ON FUNCTION public.workspace_task_completion_clock() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER workspace_task_completion_clock
  BEFORE INSERT OR UPDATE ON public.workspace_tasks
  FOR EACH ROW EXECUTE FUNCTION public.workspace_task_completion_clock();

-- Existing completed tasks intentionally retain NULL completed_at. Inventing a
-- historical completion time during migration would misrepresent actual work.
COMMENT ON COLUMN public.workspace_tasks.completed_at
IS 'Actual completion transition time recorded after Phase 7; historical done tasks may have NULL.';

CREATE TABLE public.workspace_task_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.workspace_tasks(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_task_steps_owner_task_idx
ON public.workspace_task_steps(owner_id, task_id, created_at, id);

ALTER TABLE public.workspace_task_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_task_steps FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workspace_task_steps TO authenticated;
GRANT INSERT(owner_id, task_id, title, done) ON public.workspace_task_steps TO authenticated;
GRANT UPDATE(title, done) ON public.workspace_task_steps TO authenticated;
GRANT DELETE ON public.workspace_task_steps TO authenticated;

CREATE POLICY workspace_task_steps_select ON public.workspace_task_steps
  FOR SELECT TO authenticated USING (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workspace_tasks t
      WHERE t.id = task_id AND t.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY workspace_task_steps_insert ON public.workspace_task_steps
  FOR INSERT TO authenticated WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workspace_tasks t
      JOIN public.workspace_projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
      WHERE t.id = task_id AND t.owner_id = (SELECT auth.uid()) AND p.status = 'active'
    )
  );
CREATE POLICY workspace_task_steps_update ON public.workspace_task_steps
  FOR UPDATE TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workspace_tasks t
      JOIN public.workspace_projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
      WHERE t.id = task_id AND t.owner_id = (SELECT auth.uid()) AND p.status = 'active'
    )
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workspace_tasks t
      JOIN public.workspace_projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
      WHERE t.id = task_id AND t.owner_id = (SELECT auth.uid()) AND p.status = 'active'
    )
  );
CREATE POLICY workspace_task_steps_delete ON public.workspace_task_steps
  FOR DELETE TO authenticated USING (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workspace_tasks t
      JOIN public.workspace_projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
      WHERE t.id = task_id AND t.owner_id = (SELECT auth.uid()) AND p.status = 'active'
    )
  );

CREATE OR REPLACE FUNCTION public.workspace_check_step_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $workspace_step_quota$
DECLARE
  v_count integer;
BEGIN
  IF NEW.owner_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Checklist owner does not match signed-in account' USING ERRCODE='42501';
  END IF;
  -- Serialize even concurrent browser tabs: never exceed 30 steps per task.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.task_id::text, 20261125));
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_tasks t
      JOIN public.workspace_projects p ON p.id=t.project_id AND p.owner_id=t.owner_id
    WHERE t.id=NEW.task_id AND t.owner_id=NEW.owner_id AND p.status='active'
  ) THEN
    RAISE EXCEPTION 'Checklist task is not editable by this account' USING ERRCODE='42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.workspace_task_steps s
    WHERE s.task_id=NEW.task_id;
  IF v_count >= 30 THEN
    RAISE EXCEPTION 'A task supports a maximum of 30 checklist steps' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$workspace_step_quota$;
REVOKE ALL ON FUNCTION public.workspace_check_step_limit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER workspace_task_steps_insert_limit
  BEFORE INSERT ON public.workspace_task_steps FOR EACH ROW
  EXECUTE FUNCTION public.workspace_check_step_limit();

CREATE TRIGGER workspace_task_steps_touch
  BEFORE UPDATE ON public.workspace_task_steps FOR EACH ROW
  EXECUTE FUNCTION public.workspace_touch_updated_at();
