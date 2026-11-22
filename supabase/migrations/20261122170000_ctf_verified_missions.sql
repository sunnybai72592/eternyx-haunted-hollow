-- CTF verified mission foundation: per-account, server-only awarded solves.
-- IMPORTANT: no intentionally exploitable service or runtime is installed by this migration.
-- Flag secrets must never be put in SQL, client bundles, Git history or the public API.

CREATE TABLE IF NOT EXISTS public.ctf_verified_solves (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id text NOT NULL CHECK (mission_id IN (
    'encoded-access-log', 'header-evidence', 'reversed-manifest'
  )),
  solved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_id)
);

CREATE INDEX IF NOT EXISTS ctf_verified_solves_user_time_idx
  ON public.ctf_verified_solves (user_id, solved_at DESC);

ALTER TABLE public.ctf_verified_solves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ctf_verified_solves FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ctf_verified_solves TO authenticated;
GRANT ALL ON TABLE public.ctf_verified_solves TO service_role;

DROP POLICY IF EXISTS "CTF users read only their verified solves" ON public.ctf_verified_solves;
CREATE POLICY "CTF users read only their verified solves"
  ON public.ctf_verified_solves FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

COMMENT ON TABLE public.ctf_verified_solves IS
  'Server-granted training casefile solves. Not proof of vulnerability exploitation. Clients may view only their own solves and cannot award points.';

-- Do not expose attempt counters to a public client.
CREATE TABLE IF NOT EXISTS public.ctf_verify_rate (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id text NOT NULL CHECK (mission_id IN (
    'encoded-access-log', 'header-evidence', 'reversed-manifest'
  )),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 12),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_id)
);

ALTER TABLE public.ctf_verify_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ctf_verify_rate FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ctf_verify_rate TO service_role;

-- Atomic upsert prevents parallel requests from racing the attempt quota.
-- SECURITY INVOKER; only service_role may call this public-schema RPC.
CREATE OR REPLACE FUNCTION public.ctf_claim_verification_attempt(
  p_user_id uuid,
  p_mission_id text
)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH slot AS (
    INSERT INTO public.ctf_verify_rate AS existing (
      user_id, mission_id, window_started_at, attempts, last_attempt_at
    )
    VALUES (p_user_id, p_mission_id, statement_timestamp(), 1, statement_timestamp())
    ON CONFLICT (user_id, mission_id) DO UPDATE SET
      window_started_at = CASE
        WHEN existing.window_started_at <= statement_timestamp() - interval '15 minutes'
          THEN statement_timestamp()
        ELSE existing.window_started_at
      END,
      attempts = CASE
        WHEN existing.window_started_at <= statement_timestamp() - interval '15 minutes'
          THEN 1
        ELSE existing.attempts + 1
      END,
      last_attempt_at = statement_timestamp()
    WHERE existing.window_started_at <= statement_timestamp() - interval '15 minutes'
       OR (
         existing.attempts < 12
         AND existing.last_attempt_at <= statement_timestamp() - interval '3 seconds'
       )
    RETURNING true
  )
  SELECT EXISTS (SELECT 1 FROM slot);
$$;

REVOKE ALL ON FUNCTION public.ctf_claim_verification_attempt(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_claim_verification_attempt(uuid, text) TO service_role;

COMMENT ON FUNCTION public.ctf_claim_verification_attempt(uuid, text) IS
  'Service-key-only atomic 12 attempts/15 minutes + 3-second minimum spacing for CTF verified mission submissions.';
