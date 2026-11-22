-- Phase 8 real PostgreSQL owner-only transactional restore acceptance.
-- Runs after Workspace phases 1,2,5,6,7 and their acceptance scripts.

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222', false);

INSERT INTO public.workspace_projects(owner_id,name)
VALUES('22222222-2222-4222-8222-222222222222','Restored project');

DO $check$
DECLARE
  pid uuid;
  result jsonb;
BEGIN
  SELECT id INTO pid FROM public.workspace_projects WHERE name='Restored project';
  result := public.workspace_restore_task_batch(pid,
    '[{"title":"Repeated","details":"First","status":"done","priority":"urgent","due_on":"2026-11-24",
        "checklist":[{"title":"Step A","done":true},{"title":"Step B","done":false}]},
      {"title":"Repeated","details":"Second","status":"todo","priority":"low","due_on":null,
        "checklist":[{"title":"Step C","done":false}]}]'::jsonb);
  IF result->>'tasks' <> '2' OR result->>'steps' <> '3' THEN
    RAISE EXCEPTION 'Restore result count was incorrect: %', result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_tasks t
    JOIN public.workspace_task_steps s ON s.task_id=t.id
    WHERE t.project_id=pid AND t.details='First'
      AND s.title='Step A' AND s.done) THEN
    RAISE EXCEPTION 'Checklist was not attached to first duplicate-title task';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_tasks t
    JOIN public.workspace_task_steps s ON s.task_id=t.id
    WHERE t.project_id=pid AND t.details='Second'
      AND s.title='Step C' AND NOT s.done) THEN
    RAISE EXCEPTION 'Checklist was not attached to second duplicate-title task';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_tasks t
    JOIN public.workspace_task_steps s ON s.task_id=t.id
    WHERE t.project_id=pid AND t.details='Second' AND s.title='Step A') THEN
    RAISE EXCEPTION 'Checklist crossed task boundaries';
  END IF;
END;
$check$;

-- Malformed last step must rollback ALL tasks from the batch.
DO $check$
DECLARE
  pid uuid;
  before_count integer;
BEGIN
  SELECT id INTO pid FROM public.workspace_projects WHERE name='Restored project';
  SELECT count(*) INTO before_count FROM public.workspace_tasks WHERE project_id=pid;
  BEGIN
    PERFORM public.workspace_restore_task_batch(pid,
      '[{"title":"Rollback first","details":"","status":"todo","priority":"normal",
         "checklist":[{"title":"Valid","done":true}]},
        {"title":"Rollback second","details":"","status":"todo","priority":"normal",
         "checklist":[{"title":"Invalid boolean","done":"YES"}]}]'::jsonb);
    RAISE EXCEPTION 'Invalid checklist state was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.workspace_tasks WHERE project_id=pid) <> before_count THEN
    RAISE EXCEPTION 'Partial batch survived a failed transactional restore';
  END IF;
END;
$check$;

DO $check$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM public.workspace_projects WHERE name='Restored project';
  BEGIN
    PERFORM public.workspace_restore_task_batch(pid,
      '[{"title":"Bad","status":"todo","priority":"fake","details":"","checklist":[]}]'::jsonb);
    RAISE EXCEPTION 'Invalid priority accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.workspace_restore_task_batch(pid,
      '[{"title":"Bad","status":"todo","priority":"low","details":"","checklist":42}]'::jsonb);
    RAISE EXCEPTION 'Non-array checklist accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.workspace_restore_task_batch(pid,'[]'::jsonb);
    RAISE EXCEPTION 'Zero-sized batch accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$check$;

-- Bob may not restore under Alice's project, even with a known UUID.
-- Obtain Alice's UUID with fixture superuser to bypass RLS for this one test
-- and then return to authenticated Bob.
RESET ROLE;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222', false);
CREATE TEMP TABLE workspace_alice_target AS
  SELECT id FROM public.workspace_projects WHERE name='Alice workspace';
SET ROLE authenticated;
DO $check$
DECLARE alice_project_id uuid;
BEGIN
  SELECT id INTO alice_project_id FROM pg_temp.workspace_alice_target;
  BEGIN
    PERFORM public.workspace_restore_task_batch(alice_project_id,
      '[{"title":"Cross-owner","details":"","status":"todo","priority":"low","checklist":[]}]'::jsonb);
    RAISE EXCEPTION 'Cross-owner restore was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$check$;

-- Archived projects remain read-only even through SECURITY DEFINER RPC.
UPDATE public.workspace_projects SET status='archived' WHERE name='Restored project';
DO $check$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM public.workspace_projects WHERE name='Restored project';
  BEGIN
    PERFORM public.workspace_restore_task_batch(pid,
      '[{"title":"Archived","details":"","status":"todo","priority":"normal","checklist":[]}]'::jsonb);
    RAISE EXCEPTION 'Archived-project restore was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$check$;
UPDATE public.workspace_projects SET status='active' WHERE name='Restored project';

DO $check$
BEGIN
  IF (SELECT count(*) FROM public.workspace_tasks t
      JOIN public.workspace_projects p ON p.id=t.project_id
      WHERE p.name='Restored project') <> 2
  THEN RAISE EXCEPTION 'Failed restore test changed original task count'; END IF;
  RAISE NOTICE 'Workspace v3 atomic task/checklist restore: owner locks, rollback and duplicate-title mapping pass';
END;
$check$;
