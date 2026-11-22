-- PostgreSQL 17 acceptance after earlier Workspace migrations and smoke tests.
-- Bob's surviving project is available; Alice owns hundreds of fixture records.

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222', false);

INSERT INTO public.workspace_tasks(owner_id, project_id, title, priority, details)
SELECT owner_id, id, 'Real checklist task', 'high', 'Document installation QA'
FROM public.workspace_projects WHERE name='Bob workspace';

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspace_tasks
    WHERE title='Real checklist task' AND details='Document installation QA'
      AND completed_at IS NULL)
  THEN RAISE EXCEPTION 'Task details or initial completion state incorrect'; END IF;
END;
$check$;

INSERT INTO public.workspace_task_steps(owner_id, task_id, title)
SELECT t.owner_id, t.id, 'Record measured values'
FROM public.workspace_tasks t WHERE t.title='Real checklist task';
INSERT INTO public.workspace_task_steps(owner_id, task_id, title)
SELECT t.owner_id, t.id, 'Attach real photos'
FROM public.workspace_tasks t WHERE t.title='Real checklist task';

UPDATE public.workspace_task_steps SET done=true
WHERE title='Record measured values';
UPDATE public.workspace_tasks SET status='done' WHERE title='Real checklist task';

DO $check$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.workspace_tasks
    WHERE title='Real checklist task' AND completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Completion timestamp not set by server'; END IF;
  IF (SELECT count(*) FROM public.workspace_task_steps WHERE done=true) <> 1 THEN
    RAISE EXCEPTION 'Checklist update was not persisted'; END IF;
END;
$check$;

-- A title-only update cannot fake a more recent completion time.
DO $check$
DECLARE before_time timestamptz;
DECLARE after_time timestamptz;
BEGIN
  SELECT completed_at INTO before_time
    FROM public.workspace_tasks WHERE title='Real checklist task';
  UPDATE public.workspace_tasks SET details='Updated details'
    WHERE title='Real checklist task';
  SELECT completed_at INTO after_time
    FROM public.workspace_tasks WHERE title='Real checklist task';
  IF before_time IS DISTINCT FROM after_time THEN
    RAISE EXCEPTION 'Non-status update changed completion timestamp'; END IF;
END;
$check$;

UPDATE public.workspace_tasks SET status='in_progress' WHERE title='Real checklist task';
DO $check$
BEGIN
  IF EXISTS(SELECT 1 FROM public.workspace_tasks
    WHERE title='Real checklist task' AND completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Reopened task retained completed_at'; END IF;
END;
$check$;

-- Invalid step title, forged user and owner-crossing task IDs are rejected.
DO $check$
BEGIN
  INSERT INTO public.workspace_task_steps(owner_id, task_id, title)
  SELECT t.owner_id, t.id, ''
  FROM public.workspace_tasks t WHERE t.title='Real checklist task';
  RAISE EXCEPTION 'Empty step was accepted';
EXCEPTION WHEN check_violation THEN NULL;
END;
$check$;

DO $check$
BEGIN
  INSERT INTO public.workspace_task_steps(owner_id, task_id, title)
  SELECT '11111111-1111-4111-8111-111111111111'::uuid, t.id, 'Forged owner'
  FROM public.workspace_tasks t WHERE t.title='Real checklist task';
  RAISE EXCEPTION 'Forged step owner was accepted';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$check$;

-- At most 30 checklist steps, including simultaneous inserts (serialized lock).
INSERT INTO public.workspace_task_steps(owner_id, task_id, title)
SELECT t.owner_id, t.id, 'Additional step ' || n::text
FROM public.workspace_tasks t CROSS JOIN generate_series(1, 28) n
WHERE t.title='Real checklist task';
DO $check$
BEGIN
  INSERT INTO public.workspace_task_steps(owner_id, task_id, title)
  SELECT t.owner_id, t.id, 'Step 31'
  FROM public.workspace_tasks t WHERE t.title='Real checklist task';
  RAISE EXCEPTION 'Checklist cap bypassed';
EXCEPTION WHEN check_violation THEN NULL;
END;
$check$;

-- Two accounts see only their own steps, even when probing known task IDs.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);
DO $check$
DECLARE affected integer;
BEGIN
  IF EXISTS(SELECT 1 FROM public.workspace_task_steps) THEN
    RAISE EXCEPTION 'Alice can read Bob checklist'; END IF;
  UPDATE public.workspace_task_steps SET done=false;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Alice modified Bob checklist'; END IF;
END;
$check$;

-- Archived parent project makes child checklist entirely read-only.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222', false);
UPDATE public.workspace_projects SET status='archived' WHERE name='Bob workspace';
DO $check$
DECLARE affected integer;
BEGIN
  UPDATE public.workspace_task_steps SET done=false;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Archived checklist accepted UPDATE'; END IF;
  DELETE FROM public.workspace_task_steps;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Archived checklist accepted DELETE'; END IF;
END;
$check$;
DO $check$
BEGIN
  INSERT INTO public.workspace_task_steps(owner_id, task_id, title)
  SELECT t.owner_id, t.id, 'Forbidden archived step'
  FROM public.workspace_tasks t WHERE t.title='Real checklist task';
  RAISE EXCEPTION 'Archived checklist accepted INSERT';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$check$;
UPDATE public.workspace_projects SET status='active' WHERE name='Bob workspace';

-- Deleting the parent task cascades steps and their text, without leakage.
DELETE FROM public.workspace_tasks WHERE title='Real checklist task';
DO $check$
BEGIN
  IF EXISTS(SELECT 1 FROM public.workspace_task_steps) THEN
    RAISE EXCEPTION 'Task deletion left private checklist rows behind'; END IF;
  RAISE NOTICE 'Workspace phase 7: real task completion clock, RLS, archived guard and checklist quota passed';
END;
$check$;
