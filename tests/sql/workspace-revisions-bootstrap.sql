-- Isolated PostgreSQL-only storage stand-in, never a production Supabase migration.
-- Use after tests/sql/ctf-range-db-bootstrap.sql.
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO authenticated, service_role;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL,
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
CREATE FUNCTION storage.foldername(input_name text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = ''
AS $fixture$
 SELECT pg_catalog.string_to_array(
   pg_catalog.regexp_replace(input_name, '/[^/]+$', ''), '/');
$fixture$;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;
