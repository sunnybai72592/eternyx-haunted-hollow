-- Phase45 offline only: demonstrate the staging-shaped permissive defaults
-- are still present, while the reviewed source migrations remove client grants.
DO $checks$
DECLARE
  obj record;
  priv text;
  d record;
BEGIN
  FOR d IN SELECT * FROM (VALUES ('r','SELECT'),('f','EXECUTE')) AS x(kind,privilege) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_default_acl a
      CROSS JOIN LATERAL pg_catalog.aclexplode(a.defaclacl) acl
      WHERE a.defaclnamespace='public'::regnamespace
        AND a.defaclrole=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
        AND a.defaclobjtype::text=d.kind
        AND acl.grantee='anon'::regrole
        AND acl.privilege_type=d.privilege
    ) THEN RAISE EXCEPTION 'Phase45 permissive staging-shaped defaults were removed'; END IF;
  END LOOP;
  FOR obj IN SELECT c.oid,c.relname,c.relkind FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'service\_%' ESCAPE '\'
      AND c.relkind IN ('r','p','v')
  LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      IF pg_catalog.has_table_privilege('anon',obj.oid,priv) THEN
        RAISE EXCEPTION 'Phase45 anonymous inherited default table privilege: % / %',obj.relname,priv;
      END IF;
    END LOOP;
    IF pg_catalog.has_any_column_privilege('anon',obj.oid,'SELECT,INSERT,UPDATE,REFERENCES') THEN
      RAISE EXCEPTION 'Phase45 anonymous inherited column privilege: %',obj.relname;
    END IF;
    -- The existing source grants authenticated writes by explicit column only.
    FOREACH priv IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      IF pg_catalog.has_table_privilege('authenticated',obj.oid,priv) THEN
        RAISE EXCEPTION 'Phase45 authenticated inherited broad table privilege: % / %',obj.relname,priv;
      END IF;
    END LOOP;
  END LOOP;
  IF pg_catalog.has_function_privilege('anon','public.mark_service_request_checked(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Phase45 anonymous inherited service RPC EXECUTE';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated','public.mark_service_request_checked(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Phase45 legitimate service RPC EXECUTE missing';
  END IF;
END
$checks$;
SELECT 'PASS: Phase45 preserved staging-shaped defaults and explicit client ACL boundaries';
