-- Run AFTER Phase 1, Phase 2 and Phase 5 migrations and Phase 2 acceptance.
-- Executes as real authenticated user and verifies RLS, upload metadata and caps.

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);

-- Owner can pin, but pinned must not grant any cross-account visibility.
UPDATE public.workspace_projects SET pinned = true WHERE name = 'Alice workspace';
DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspace_projects
    WHERE name='Alice workspace' AND pinned) THEN
    RAISE EXCEPTION 'Project pinning failed';
  END IF;
END;
$check$;

-- Registration must verify Storage's actual byte size and MIME metadata
-- instead of trusting an arbitrary browser-supplied file_size.
INSERT INTO storage.objects(bucket_id, name, metadata)
SELECT 'workspace-private', owner_id::text || '/' || id::text || '/accurate.txt',
  '{"size": 1234, "mimetype": "text/plain"}'::jsonb
FROM public.workspace_projects WHERE name='Alice workspace';

DO $check$
BEGIN
  INSERT INTO public.workspace_items(owner_id, project_id, kind, title, storage_path, mime_type, file_size)
  SELECT owner_id, id, 'file', 'false-size.txt',
    owner_id::text || '/' || id::text || '/accurate.txt', 'text/plain', 1
  FROM public.workspace_projects WHERE name='Alice workspace';
  RAISE EXCEPTION 'Fabricated small file size was accepted';
EXCEPTION WHEN check_violation THEN NULL;
END;
$check$;

DO $check$
BEGIN
  INSERT INTO public.workspace_items(owner_id, project_id, kind, title, storage_path, mime_type, file_size)
  SELECT owner_id, id, 'file', 'false-type.txt',
    owner_id::text || '/' || id::text || '/accurate.txt', 'image/png', 1234
  FROM public.workspace_projects WHERE name='Alice workspace';
  RAISE EXCEPTION 'Fabricated MIME type was accepted';
EXCEPTION WHEN check_violation THEN NULL;
END;
$check$;

INSERT INTO public.workspace_items(owner_id, project_id, kind, title, storage_path, mime_type, file_size)
SELECT owner_id, id, 'file', 'accurate.txt',
  owner_id::text || '/' || id::text || '/accurate.txt', 'text/plain', 1234
FROM public.workspace_projects WHERE name='Alice workspace';

-- Cross-owner pinned update cannot target Alice records.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222', false);
DO $check$
DECLARE n integer;
BEGIN
  UPDATE public.workspace_projects SET pinned = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Bob unpinned Alice project'; END IF;
  IF EXISTS(SELECT 1 FROM public.workspace_projects WHERE pinned) THEN
    RAISE EXCEPTION 'Bob can see Alice pinned projects'; END IF;
END;
$check$;
DO $check$
BEGIN
  INSERT INTO public.workspace_projects(owner_id, name)
  VALUES('11111111-1111-4111-8111-111111111111', 'Bob forged owner');
  RAISE EXCEPTION 'Forged owner accepted by privileged quota function';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$check$;
INSERT INTO public.workspace_projects(owner_id, name)
VALUES('22222222-2222-4222-8222-222222222222', 'Bob workspace');
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);

-- Fill account to project quota; then attempt one over the limit.
INSERT INTO public.workspace_projects(owner_id, name)
SELECT '11111111-1111-4111-8111-111111111111'::uuid,
  'quota fixture ' || n::text
FROM generate_series(1, 99) n;
DO $check$
BEGIN
  INSERT INTO public.workspace_projects(owner_id, name)
  VALUES ('11111111-1111-4111-8111-111111111111', 'Too many');
  RAISE EXCEPTION 'More than 100 projects accepted';
EXCEPTION WHEN check_violation THEN NULL;
END;
$check$;

-- Verify counts are scoped per owner and Bob can still create a project.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222', false);
INSERT INTO public.workspace_projects(owner_id, name)
VALUES('22222222-2222-4222-8222-222222222222', 'Bob second');
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);

-- Seed the remaining task/item quota in privileged fixture mode, with *only*
-- the quota trigger temporarily disabled. Ordinary owner inserts above prove
-- the server accepts valid records; the next owner insert tests the cap.
RESET ROLE;
ALTER TABLE public.workspace_tasks DISABLE TRIGGER workspace_tasks_limits_before_insert;
ALTER TABLE public.workspace_items DISABLE TRIGGER workspace_items_limits_before_insert;
INSERT INTO public.workspace_tasks(owner_id, project_id, title)
SELECT '11111111-1111-4111-8111-111111111111'::uuid, p.id, 'fixture task ' || g.n
FROM public.workspace_projects p CROSS JOIN generate_series(1, 4999) g(n)
WHERE p.name = 'Alice workspace';
INSERT INTO public.workspace_items(owner_id, project_id, kind, title, note_text)
SELECT '11111111-1111-4111-8111-111111111111'::uuid, p.id,
  'note', 'fixture note ' || g.n, 'test'
FROM public.workspace_projects p CROSS JOIN generate_series(1, 4997) g(n)
WHERE p.name = 'Alice workspace';
ALTER TABLE public.workspace_tasks ENABLE TRIGGER workspace_tasks_limits_before_insert;
ALTER TABLE public.workspace_items ENABLE TRIGGER workspace_items_limits_before_insert;

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);
DO $check$
BEGIN
  INSERT INTO public.workspace_tasks(owner_id, project_id, title)
  SELECT owner_id, id, 'Too many tasks' FROM public.workspace_projects
  WHERE name='Alice workspace';
  RAISE EXCEPTION 'Task cap exceeded without rejection';
EXCEPTION WHEN check_violation THEN NULL;
END;
$check$;
DO $check$
BEGIN
  INSERT INTO public.workspace_items(owner_id, project_id, kind, title, note_text)
  SELECT owner_id, id, 'note', 'Too many saved items', 'test'
  FROM public.workspace_projects WHERE name='Alice workspace';
  RAISE EXCEPTION 'Saved-item cap exceeded without rejection';
EXCEPTION WHEN check_violation THEN NULL;
END;
$check$;

DO $check$
BEGIN
  IF (SELECT count(*) FROM public.workspace_projects) <> 100
     OR (SELECT count(*) FROM public.workspace_tasks) <> 5000
     OR (SELECT count(*) FROM public.workspace_items) <> 5000 THEN
    RAISE EXCEPTION 'Quota fixture did not reach exact account caps';
  END IF;
  RAISE NOTICE 'Workspace Phase 5: owner-only pinning, file-size integrity and quotas all passed';
END;
$check$;
