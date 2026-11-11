-- Read-only administrator directory. Never expose auth.users or private profile columns.
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  profile_id uuid,
  user_id uuid,
  username text,
  full_name text,
  avatar_url text,
  job_title text,
  location text,
  created_at timestamptz,
  access_level text,
  is_profile_public boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_search text := NULLIF(left(trim(COALESCE(p_search, '')), 80), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.job_title,
    p.location,
    p.created_at,
    COALESCE(p.access_level, 'basic'),
    p.is_profile_public,
    count(*) OVER ()
  FROM public.profiles AS p
  WHERE v_search IS NULL
    OR COALESCE(p.username, '') ILIKE '%' || v_search || '%'
    OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
    OR COALESCE(p.job_title, '') ILIKE '%' || v_search || '%'
    OR COALESCE(p.location, '') ILIKE '%' || v_search || '%'
    OR p.user_id::text ILIKE '%' || v_search || '%'
  ORDER BY p.created_at DESC, p.id
  LIMIT v_limit
  OFFSET v_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_users(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.admin_list_users(text, integer, integer) IS
  'Returns a paginated, read-only subset of profile fields to trusted administrators. Does not expose email, phone, private preferences, stats, or auth credentials.';
