-- Private storage destination for completed AI generation outputs.
-- Review-only: do not apply until AI execution rollout is explicitly approved.
-- Objects are written by trusted server-side workers using service_role.
-- Authenticated users receive read-only access to objects under their own UUID folder.

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
  'ai-generation-outputs',
  'ai-generation-outputs',
  false,
  ARRAY[
    'video/mp4',
    'video/webm',
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/mpeg',
    'audio/wav',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/json'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Object names are deterministic: <user UUID>/<job UUID>/output.<extension>.
-- No client upload, update, delete, anonymous, or public policy is created.
DROP POLICY IF EXISTS "Users read own AI generation outputs" ON storage.objects;
CREATE POLICY "Users read own AI generation outputs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ai-generation-outputs'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND name ~ (
    '^' || auth.uid()::text ||
    '/[0-9a-fA-F-]{36}/output[.](mp4|webm|jpg|png|webp|mp3|wav|pdf|txt|md|json)$'
  )
);

-- The database independently enforces that a finalized output key belongs to
-- the same user and job, even if a future trusted caller is implemented badly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_generation_jobs_output_owner_key_check'
      AND conrelid = 'public.ai_generation_jobs'::regclass
  ) THEN
    ALTER TABLE public.ai_generation_jobs
      ADD CONSTRAINT ai_generation_jobs_output_owner_key_check
      CHECK (
        output_object_key IS NULL
        OR output_object_key ~ (
          '^' || user_id::text || '/' || id::text ||
          '/output[.](mp4|webm|jpg|png|webp|mp3|wav|pdf|txt|md|json)$'
        )
      );
  END IF;
END;
$$;

COMMENT ON POLICY "Users read own AI generation outputs" ON storage.objects IS
  'Read-only access to private AI outputs scoped to the authenticated owner UUID.';
