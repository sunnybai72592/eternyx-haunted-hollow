-- Workspace Phase 5: per-owner limits, pinned projects and real Storage upload metadata.
-- Requires 20261123050000 and 20261123180000 Workspace migrations.
-- This PR does not apply the migration to a remote Supabase project.
-- No billing tiers, team sharing, or provider APIs are added.

ALTER TABLE public.workspace_projects
  ADD COLUMN pinned boolean NOT NULL DEFAULT false;
GRANT UPDATE(pinned) ON public.workspace_projects TO authenticated;

-- Hard ceilings on *registered* owner records. These do not claim to meter
-- unregistered Storage objects: per-file limits and Storage RLS remain separate.
-- Advisory transaction locking prevents simultaneous clients from exceeding
-- the count via races between COUNT(*) and INSERT.
CREATE OR REPLACE FUNCTION public.workspace_enforce_owner_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $workspace_limits$
DECLARE
  v_count bigint;
  v_bytes bigint;
BEGIN
  -- Reject forged owner IDs before looking at another account's counts.
  -- Do not leak quota state across tenants through SECURITY DEFINER errors.
  IF NEW.owner_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Workspace owner does not match authenticated user'
      USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.owner_id::text, 20261124)
  );

  IF TG_TABLE_NAME = 'workspace_projects' THEN
    SELECT count(*) INTO v_count FROM public.workspace_projects
    WHERE owner_id = NEW.owner_id;
    IF v_count >= 100 THEN
      RAISE EXCEPTION 'Workspace project limit reached (100 per account)'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'workspace_tasks' THEN
    SELECT count(*) INTO v_count FROM public.workspace_tasks
    WHERE owner_id = NEW.owner_id;
    IF v_count >= 5000 THEN
      RAISE EXCEPTION 'Workspace task limit reached (5000 per account)'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'workspace_items' THEN
    SELECT count(*) INTO v_count FROM public.workspace_items
    WHERE owner_id = NEW.owner_id;
    IF v_count >= 5000 THEN
      RAISE EXCEPTION 'Workspace saved-item limit reached (5000 per account)'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.kind = 'file' THEN
      SELECT coalesce(sum(file_size), 0) INTO v_bytes
      FROM public.workspace_items
      WHERE owner_id = NEW.owner_id AND kind = 'file';
      IF v_bytes + NEW.file_size > 104857600 THEN
        RAISE EXCEPTION 'Registered Workspace file limit reached (100 MiB per account)'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported Workspace limit target' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$workspace_limits$;
REVOKE ALL ON FUNCTION public.workspace_enforce_owner_limits() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER workspace_projects_limits_before_insert
  BEFORE INSERT ON public.workspace_projects FOR EACH ROW
  EXECUTE FUNCTION public.workspace_enforce_owner_limits();
CREATE TRIGGER workspace_tasks_limits_before_insert
  BEFORE INSERT ON public.workspace_tasks FOR EACH ROW
  EXECUTE FUNCTION public.workspace_enforce_owner_limits();
CREATE TRIGGER workspace_items_limits_before_insert
  BEFORE INSERT ON public.workspace_items FOR EACH ROW
  EXECUTE FUNCTION public.workspace_enforce_owner_limits();

-- Tighten the existing file-registration check: a browser must not be able to
-- claim a 5 MiB uploaded file is 1 byte to bypass the registered-byte limit.
-- Uploads originate through Supabase Storage and metadata is server-populated.
CREATE OR REPLACE FUNCTION public.workspace_verify_file_upload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $workspace_verify$
DECLARE
  v_metadata jsonb;
  v_size bigint;
  v_type text;
BEGIN
  IF NEW.kind = 'file' THEN
    SELECT o.metadata INTO v_metadata FROM storage.objects o
    WHERE o.bucket_id = 'workspace-private' AND o.name = NEW.storage_path;
    IF NOT FOUND OR v_metadata IS NULL THEN
      RAISE EXCEPTION 'Upload the private file before registering it'
        USING ERRCODE = '23503';
    END IF;
    IF coalesce(v_metadata->>'size', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Uploaded file size metadata is missing or invalid'
        USING ERRCODE = '23514';
    END IF;
    v_size := (v_metadata->>'size')::bigint;
    v_type := v_metadata->>'mimetype';
    IF v_size IS DISTINCT FROM NEW.file_size
      OR v_type IS DISTINCT FROM NEW.mime_type THEN
      RAISE EXCEPTION 'Registered file bytes or MIME type disagree with Storage'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$workspace_verify$;
REVOKE ALL ON FUNCTION public.workspace_verify_file_upload() FROM PUBLIC, anon, authenticated;

-- Optional index helps pinned-project listings without weakening owner RLS.
CREATE INDEX workspace_projects_owner_pinned_updated_idx
ON public.workspace_projects (owner_id, pinned DESC, updated_at DESC);
