-- Digital Workspace: real owner-scoped projects, tasks, saved items and server-recorded activity.
-- This migration is committed for review; it is NOT applied to a remote project by this PR.
-- No organization/team sharing, public files, billing, or third-party connectors are enabled.

CREATE TABLE public.workspace_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id)
);
CREATE INDEX workspace_projects_owner_updated_idx ON public.workspace_projects(owner_id, updated_at DESC);

CREATE TABLE public.workspace_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  due_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, owner_id) REFERENCES public.workspace_projects(id, owner_id)
);
CREATE INDEX workspace_tasks_owner_project_idx ON public.workspace_tasks(owner_id, project_id, created_at DESC);

CREATE TABLE public.workspace_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('note', 'link', 'file')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  note_text text,
  target_url text,
  storage_path text UNIQUE,
  file_size bigint,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, owner_id) REFERENCES public.workspace_projects(id, owner_id),
  CONSTRAINT workspace_items_payload_check CHECK (
    (kind = 'note'
      AND char_length(btrim(coalesce(note_text, ''))) BETWEEN 1 AND 12000
      AND target_url IS NULL AND storage_path IS NULL AND file_size IS NULL AND mime_type IS NULL)
    OR
    (kind = 'link'
      AND note_text IS NULL AND storage_path IS NULL AND file_size IS NULL AND mime_type IS NULL
      AND char_length(coalesce(target_url, '')) BETWEEN 2 AND 2000
      AND (target_url ~ '^https://[^[:space:]]+$'
           OR target_url ~ '^/[^/[:space:]][^[:space:]]*$'))
    OR
    (kind = 'file'
      AND note_text IS NULL AND target_url IS NULL
      AND file_size BETWEEN 1 AND 5242880
      AND mime_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp',
                        'text/plain', 'text/csv', 'application/json')
      AND storage_path LIKE owner_id::text || '/' || project_id::text || '/%')
  )
);
CREATE INDEX workspace_items_owner_project_idx ON public.workspace_items(owner_id, project_id, created_at DESC);

CREATE TABLE public.workspace_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'project_created','project_updated','task_created','task_updated',
    'task_deleted','item_created','item_deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_activity_owner_recent_idx ON public.workspace_activity(owner_id, created_at DESC);

ALTER TABLE public.workspace_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_activity ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.workspace_projects, public.workspace_tasks,
  public.workspace_items, public.workspace_activity FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.workspace_projects, public.workspace_tasks,
  public.workspace_items, public.workspace_activity TO authenticated;
GRANT INSERT(owner_id, name, description) ON public.workspace_projects TO authenticated;
GRANT UPDATE(name, description, status) ON public.workspace_projects TO authenticated;
GRANT INSERT(owner_id, project_id, title, status, due_on) ON public.workspace_tasks TO authenticated;
GRANT UPDATE(title, status, due_on) ON public.workspace_tasks TO authenticated;
GRANT DELETE ON public.workspace_tasks TO authenticated;
GRANT INSERT(owner_id, project_id, kind, title, note_text, target_url,
  storage_path, file_size, mime_type) ON public.workspace_items TO authenticated;
GRANT DELETE ON public.workspace_items TO authenticated;

CREATE POLICY workspace_projects_read ON public.workspace_projects FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));
CREATE POLICY workspace_projects_insert ON public.workspace_projects FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY workspace_projects_update ON public.workspace_projects FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY workspace_tasks_read ON public.workspace_tasks FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));
CREATE POLICY workspace_tasks_insert ON public.workspace_tasks FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY workspace_tasks_update ON public.workspace_tasks FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY workspace_tasks_delete ON public.workspace_tasks FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));

CREATE POLICY workspace_items_read ON public.workspace_items FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));
CREATE POLICY workspace_items_insert ON public.workspace_items FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY workspace_items_delete ON public.workspace_items FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));

CREATE POLICY workspace_activity_read ON public.workspace_activity FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- Activity writes happen only via database triggers: browser clients cannot forge history.
CREATE OR REPLACE FUNCTION public.workspace_record_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_action text;
  v_owner uuid;
  v_project uuid;
  v_entity uuid;
BEGIN
  v_action := CASE
    WHEN TG_TABLE_NAME = 'workspace_projects' THEN 'project_'
    WHEN TG_TABLE_NAME = 'workspace_tasks' THEN 'task_'
    ELSE 'item_'
  END || CASE WHEN TG_OP = 'INSERT' THEN 'created'
    WHEN TG_OP = 'UPDATE' THEN 'updated' ELSE 'deleted' END;
  v_owner := CASE WHEN TG_OP = 'DELETE' THEN OLD.owner_id ELSE NEW.owner_id END;
  v_entity := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_project := CASE WHEN TG_TABLE_NAME = 'workspace_projects' THEN v_entity
    WHEN TG_OP = 'DELETE' THEN OLD.project_id ELSE NEW.project_id END;
  INSERT INTO public.workspace_activity(owner_id, project_id, entity_id, event_type)
    VALUES (v_owner, v_project, v_entity, v_action);
  -- AFTER triggers ignore the return value.
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.workspace_record_activity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER workspace_projects_activity AFTER INSERT OR UPDATE ON public.workspace_projects
  FOR EACH ROW EXECUTE FUNCTION public.workspace_record_activity();
CREATE TRIGGER workspace_tasks_activity AFTER INSERT OR UPDATE OR DELETE ON public.workspace_tasks
  FOR EACH ROW EXECUTE FUNCTION public.workspace_record_activity();
CREATE TRIGGER workspace_items_activity AFTER INSERT OR DELETE ON public.workspace_items
  FOR EACH ROW EXECUTE FUNCTION public.workspace_record_activity();

CREATE OR REPLACE FUNCTION public.workspace_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.workspace_touch_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER workspace_projects_touch BEFORE UPDATE ON public.workspace_projects
  FOR EACH ROW EXECUTE FUNCTION public.workspace_touch_updated_at();
CREATE TRIGGER workspace_tasks_touch BEFORE UPDATE ON public.workspace_tasks
  FOR EACH ROW EXECUTE FUNCTION public.workspace_touch_updated_at();

-- Private files are scoped by authenticated owner AND an existing owned project.
-- 5 MiB per file; only explicitly supported MIME types; never create public URLs.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('workspace-private', 'workspace-private', false, 5242880,
  ARRAY['application/pdf','image/png','image/jpeg','image/webp',
        'text/plain','text/csv','application/json'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- A file row cannot claim an object that was never uploaded.
-- This restricted trigger sees the storage catalog but exposes no callable RPC.
CREATE OR REPLACE FUNCTION public.workspace_verify_file_upload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $workspace_verify$
BEGIN
  IF NEW.kind = 'file' AND NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'workspace-private' AND o.name = NEW.storage_path
  ) THEN
    RAISE EXCEPTION 'Upload the private file before registering it'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$workspace_verify$;
REVOKE ALL ON FUNCTION public.workspace_verify_file_upload() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER workspace_items_verify_upload BEFORE INSERT ON public.workspace_items
  FOR EACH ROW EXECUTE FUNCTION public.workspace_verify_file_upload();

CREATE POLICY workspace_private_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'workspace-private'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id::text = (storage.foldername(name))[2] AND p.owner_id = (SELECT auth.uid()))
);
CREATE POLICY workspace_private_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'workspace-private'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id::text = (storage.foldername(name))[2] AND p.owner_id = (SELECT auth.uid()))
);
CREATE POLICY workspace_private_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'workspace-private'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.workspace_projects p
    WHERE p.id::text = (storage.foldername(name))[2] AND p.owner_id = (SELECT auth.uid()))
);
