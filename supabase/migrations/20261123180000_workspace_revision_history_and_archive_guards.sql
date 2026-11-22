-- Workspace Phase 2: owner-only note/link revision history and genuine read-only archives.
-- Requires 20261123050000_workspace_owner_projects_tasks_items.sql.
-- Applied through reviewed deployment; creating this PR does not change production.

ALTER TABLE public.workspace_items
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN revision integer NOT NULL DEFAULT 1
    CHECK (revision > 0);

CREATE TABLE public.workspace_item_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.workspace_items(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  kind text NOT NULL CHECK (kind IN ('note', 'link')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  note_text text,
  target_url text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_item_revisions_unique_version UNIQUE (item_id, revision)
);
CREATE INDEX workspace_revisions_item_recent_idx
  ON public.workspace_item_revisions (owner_id, item_id, revision DESC);

ALTER TABLE public.workspace_item_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_item_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workspace_item_revisions TO authenticated;
CREATE POLICY workspace_revisions_read ON public.workspace_item_revisions
FOR SELECT TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.workspace_items i
    WHERE i.id = item_id AND i.owner_id = (SELECT auth.uid())
  )
);

-- Only editable note and link content can change. The database, not the browser,
-- appends the previous content and advances the revision within the same transaction.
CREATE OR REPLACE FUNCTION public.workspace_save_item_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $workspace_revision$
BEGIN
  IF OLD.kind NOT IN ('note', 'link') OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
    OR NEW.file_size IS DISTINCT FROM OLD.file_size
    OR NEW.mime_type IS DISTINCT FROM OLD.mime_type THEN
    RAISE EXCEPTION 'Only owned note and link content may be revised' USING ERRCODE = '42501';
  END IF;

  IF ROW(NEW.title, NEW.note_text, NEW.target_url)
    IS NOT DISTINCT FROM ROW(OLD.title, OLD.note_text, OLD.target_url) THEN
    RETURN NULL; -- no-op: no new revision or synthetic audit event
  END IF;

  INSERT INTO public.workspace_item_revisions (
    item_id, owner_id, project_id, revision, kind, title, note_text, target_url
  ) VALUES (
    OLD.id, OLD.owner_id, OLD.project_id, OLD.revision,
    OLD.kind, OLD.title, OLD.note_text, OLD.target_url
  );
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$workspace_revision$;

REVOKE ALL ON FUNCTION public.workspace_save_item_revision() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER workspace_items_version_before_update
  BEFORE UPDATE ON public.workspace_items
  FOR EACH ROW EXECUTE FUNCTION public.workspace_save_item_revision();

GRANT UPDATE (title, note_text, target_url) ON public.workspace_items TO authenticated;
CREATE POLICY workspace_items_update ON public.workspace_items
FOR UPDATE TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  AND kind IN ('note', 'link')
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
      AND p.status = 'active')
)
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND kind IN ('note', 'link')
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
      AND p.status = 'active')
);

-- Extend the database-triggered activity ledger for real changes, not browser claims.
ALTER TABLE public.workspace_activity
  DROP CONSTRAINT IF EXISTS workspace_activity_event_type_check;
ALTER TABLE public.workspace_activity
  ADD CONSTRAINT workspace_activity_event_type_check
    CHECK (event_type IN (
      'project_created','project_updated','task_created','task_updated',
      'task_deleted','item_created','item_updated','item_deleted'
    ));
CREATE TRIGGER workspace_items_activity_update
  AFTER UPDATE ON public.workspace_items
  FOR EACH ROW EXECUTE FUNCTION public.workspace_record_activity();

-- "Archived · read-only" must be a server-enforced guarantee, not a disabled
-- button that can be bypassed by sending REST requests.
DROP POLICY IF EXISTS workspace_tasks_insert ON public.workspace_tasks;
DROP POLICY IF EXISTS workspace_tasks_update ON public.workspace_tasks;
DROP POLICY IF EXISTS workspace_tasks_delete ON public.workspace_tasks;
DROP POLICY IF EXISTS workspace_items_insert ON public.workspace_items;
DROP POLICY IF EXISTS workspace_items_delete ON public.workspace_items;
DROP POLICY IF EXISTS workspace_private_insert ON storage.objects;
DROP POLICY IF EXISTS workspace_private_delete ON storage.objects;

CREATE POLICY workspace_tasks_insert ON public.workspace_tasks FOR INSERT TO authenticated
WITH CHECK (owner_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
      AND p.status = 'active'));
CREATE POLICY workspace_tasks_update ON public.workspace_tasks FOR UPDATE TO authenticated
USING (owner_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
      AND p.status = 'active'))
WITH CHECK (owner_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
      AND p.status = 'active'));
CREATE POLICY workspace_tasks_delete ON public.workspace_tasks FOR DELETE TO authenticated
USING (owner_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
      AND p.status = 'active'));
CREATE POLICY workspace_items_insert ON public.workspace_items FOR INSERT TO authenticated
WITH CHECK (owner_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
      AND p.status = 'active'));
CREATE POLICY workspace_items_delete ON public.workspace_items FOR DELETE TO authenticated
USING (owner_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
      AND p.status = 'active'));

CREATE POLICY workspace_private_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'workspace-private'
  AND (storage.foldername(storage.objects.name))[1] = (SELECT auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id::text = (storage.foldername(storage.objects.name))[2]
      AND p.owner_id = (SELECT auth.uid()) AND p.status = 'active')
);
CREATE POLICY workspace_private_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'workspace-private'
  AND (storage.foldername(storage.objects.name))[1] = (SELECT auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id::text = (storage.foldername(storage.objects.name))[2]
      AND p.owner_id = (SELECT auth.uid()) AND p.status = 'active')
);
