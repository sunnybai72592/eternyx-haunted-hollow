-- Workspace Phase 8: server-side task/checklist restore with positional mapping.
-- Requires Phase 7 workspace_task_steps. No direct database deployment from PR.
-- This owner-scoped, transactional batch RPC ensures that tasks and their
-- checklists cannot be mismatched by ambiguous titles or REST result ordering.

CREATE OR REPLACE FUNCTION public.workspace_restore_task_batch(
  p_project_id uuid,
  p_tasks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $workspace_restore_batch$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_task jsonb;
  v_step jsonb;
  v_task_id uuid;
  v_count integer := 0;
  v_steps integer := 0;
  v_due date;
BEGIN
  IF v_owner IS NULL OR p_project_id IS NULL THEN
    RAISE EXCEPTION 'Sign in and choose a private Workspace project'
      USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.jsonb_typeof(p_tasks) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_tasks) NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Restore batches must contain 1 to 25 tasks'
      USING ERRCODE = '23514';
  END IF;

  -- Lock the owned, active project against concurrent archiving/deletion.
  -- Never trust owner, task ID, project ID or Storage paths supplied by JSON.
  PERFORM 1 FROM public.workspace_projects p
    WHERE p.id = p_project_id AND p.owner_id = v_owner
      AND p.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restore requires an owned, active Workspace project'
      USING ERRCODE = '42501';
  END IF;

  FOR v_task IN SELECT value FROM pg_catalog.jsonb_array_elements(p_tasks)
  LOOP
    IF pg_catalog.jsonb_typeof(v_task) IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(v_task->'title') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(v_task->'status') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(v_task->'priority') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(v_task->'details') IS DISTINCT FROM 'string'
      OR (v_task ? 'due_on' AND v_task->'due_on' <> 'null'::jsonb
        AND pg_catalog.jsonb_typeof(v_task->'due_on') IS DISTINCT FROM 'string')
      OR pg_catalog.jsonb_typeof(v_task->'checklist') IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_array_length(v_task->'checklist') > 30 THEN
      RAISE EXCEPTION 'Restore contains invalid task fields or checklist count'
        USING ERRCODE = '23514';
    END IF;

    v_due := NULLIF(v_task->>'due_on', '')::date;
    INSERT INTO public.workspace_tasks(
      project_id, owner_id, title, details, status, priority, due_on
    ) VALUES (
      p_project_id, v_owner, v_task->>'title', v_task->>'details',
      v_task->>'status', v_task->>'priority', v_due
    ) RETURNING id INTO v_task_id;
    v_count := v_count + 1;

    FOR v_step IN SELECT value FROM pg_catalog.jsonb_array_elements(v_task->'checklist')
    LOOP
      IF pg_catalog.jsonb_typeof(v_step) IS DISTINCT FROM 'object'
        OR pg_catalog.jsonb_typeof(v_step->'title') IS DISTINCT FROM 'string'
        OR pg_catalog.jsonb_typeof(v_step->'done') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'Restore checklist step has an invalid title or completion state'
          USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.workspace_task_steps(
        task_id, owner_id, title, done
      ) VALUES (
        v_task_id, v_owner, v_step->>'title', (v_step->>'done')::boolean
      );
      v_steps := v_steps + 1;
    END LOOP;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object('tasks', v_count, 'steps', v_steps);
END;
$workspace_restore_batch$;

REVOKE ALL ON FUNCTION public.workspace_restore_task_batch(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_restore_task_batch(uuid,jsonb)
  TO authenticated;
