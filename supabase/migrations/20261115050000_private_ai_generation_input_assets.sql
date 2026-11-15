-- Private source-image storage for AI Video image-to-video requests.
-- Review-only: do not apply until the AI asset rollout is explicitly approved.
-- Upload clients must use: <auth-user-uuid>/<asset-uuid>/source.<extension>

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'ai-generation-inputs',
  'ai-generation-inputs',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- Every object is private and scoped to the authenticated user's first path segment.
DROP POLICY IF EXISTS "Users upload own AI generation inputs" ON storage.objects;
CREATE POLICY "Users upload own AI generation inputs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ai-generation-inputs'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND name ~ ('^' || auth.uid()::text || '/[0-9a-fA-F-]{36}/source\.(jpg|jpeg|png|webp)$')
);

DROP POLICY IF EXISTS "Users read own AI generation inputs" ON storage.objects;
CREATE POLICY "Users read own AI generation inputs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ai-generation-inputs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users delete own AI generation inputs" ON storage.objects;
CREATE POLICY "Users delete own AI generation inputs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'ai-generation-inputs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Deliberately no public access, anonymous policies, cross-user access,
-- update policy, or browser-visible service-role capability.
