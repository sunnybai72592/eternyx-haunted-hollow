-- Server-owned lifecycle records for private AI generation input assets.
-- Review-only: do not apply until the AI asset rollout is explicitly approved.

CREATE TABLE IF NOT EXISTS public.ai_generation_input_assets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_id text NOT NULL DEFAULT 'ai-generation-inputs'
    CHECK (bucket_id = 'ai-generation-inputs'),
  object_path text NOT NULL UNIQUE,
  declared_content_type text NOT NULL
    CHECK (declared_content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  declared_size bigint NOT NULL
    CHECK (declared_size BETWEEN 1 AND 10485760),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'rejected')),
  verified_content_type text
    CHECK (verified_content_type IS NULL OR verified_content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  verified_size bigint
    CHECK (verified_size IS NULL OR verified_size BETWEEN 1 AND 10485760),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  CONSTRAINT ai_generation_input_assets_path_owner_check
    CHECK (split_part(object_path, '/', 1) = user_id::text),
  CONSTRAINT ai_generation_input_assets_verified_state_check
    CHECK (
      (status = 'ready' AND verified_content_type IS NOT NULL AND verified_size IS NOT NULL AND verified_at IS NOT NULL)
      OR status IN ('pending', 'rejected')
    )
);

CREATE INDEX IF NOT EXISTS ai_generation_input_assets_user_status_idx
  ON public.ai_generation_input_assets (user_id, status, created_at DESC);

ALTER TABLE public.ai_generation_input_assets ENABLE ROW LEVEL SECURITY;

-- Deliberately no client policies: only authenticated Edge Functions using the
-- server-side Supabase secret may create, inspect, or transition asset records.
COMMENT ON TABLE public.ai_generation_input_assets IS
  'Server-owned lifecycle for private AI generation input assets; clients have no direct table access.';
