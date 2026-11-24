-- Forward-only permission repair. Preserve sessions, owner RLS and service RPCs.
-- The browser needs only the same eight public fields serialized by range control.
-- Table grants override column grants; clear both, including any pre-existing drift.
REVOKE ALL PRIVILEGES ON TABLE public.ctf_range_sessions FROM PUBLIC, anon, authenticated;

DO $$
DECLARE col record;
BEGIN
  FOR col IN
    SELECT attname FROM pg_catalog.pg_attribute
    WHERE attrelid='public.ctf_range_sessions'::regclass AND attnum>0 AND NOT attisdropped
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES (%I) ON TABLE public.ctf_range_sessions FROM PUBLIC, anon, authenticated',
      col.attname
    );
  END LOOP;
END;
$$;

GRANT SELECT (id,challenge_pack,status,requested_at,updated_at,expires_at,started_at,finished_at)
  ON TABLE public.ctf_range_sessions TO authenticated;

-- Fail transaction if inherited or accidental grants still expose a column.
-- No new policy, bypass, privileged function or service-role grants are introduced.
DO $$
DECLARE col record;
DECLARE allowed boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid='public.ctf_range_sessions'::regclass AND relrowsecurity
  ) THEN RAISE EXCEPTION 'LABS sessions require RLS'; END IF;
  IF pg_catalog.has_table_privilege('authenticated','public.ctf_range_sessions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('anon','public.ctf_range_sessions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  THEN RAISE EXCEPTION 'LABS session table privilege drift'; END IF;
  FOR col IN
    SELECT attname FROM pg_catalog.pg_attribute
    WHERE attrelid='public.ctf_range_sessions'::regclass AND attnum>0 AND NOT attisdropped
  LOOP
    allowed:=col.attname=ANY(ARRAY['id','challenge_pack','status','requested_at','updated_at','expires_at','started_at','finished_at']);
    IF pg_catalog.has_column_privilege('authenticated','public.ctf_range_sessions',col.attname,'SELECT') IS DISTINCT FROM allowed
       OR pg_catalog.has_column_privilege('authenticated','public.ctf_range_sessions',col.attname,'INSERT,UPDATE,REFERENCES')
       OR pg_catalog.has_column_privilege('anon','public.ctf_range_sessions',col.attname,'SELECT,INSERT,UPDATE,REFERENCES')
    THEN RAISE EXCEPTION 'LABS session column privilege drift'; END IF;
  END LOOP;
END;
$$;
