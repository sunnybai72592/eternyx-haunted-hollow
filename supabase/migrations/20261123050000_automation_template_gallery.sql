-- ETERNYX Automation Phase 2I: immutable, curated server-side workflow
-- templates with one-click account-owned copies and metered no-side-effect
-- workflow previews. No background task, outbound URL or AI action added.
CREATE TABLE public.automation_template_catalog (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{2,40}$'),
  version smallint NOT NULL DEFAULT 1 CHECK (version=1),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  category text NOT NULL CHECK (category IN ('operations','developer','security','engineering')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 8 AND 240),
  sample_input text NOT NULL CHECK (octet_length(sample_input) BETWEEN 1 AND 2000),
  steps jsonb NOT NULL CHECK (jsonb_typeof(steps)='array'
    AND jsonb_array_length(steps) BETWEEN 1 AND 12
    AND char_length(steps::text)<=12000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_template_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_template_catalog FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.automation_template_catalog TO service_role;

INSERT INTO public.automation_template_catalog
  (id,version,name,category,description,sample_input,steps)
VALUES
('clean-lines',1,'Clean & deduplicate','operations','Normalize, remove blanks and case-insensitive duplicates.','  Pump A  

pump a
Pump B','[{"id":"a1","kind":"trim"},{"id":"a2","kind":"remove_blanks"},{"id":"a3","kind":"unique","caseSensitive":false}]'::jsonb),
('sort-inventory',1,'Sorted unique inventory','operations','Normalize repeated lines and sort inventory lexically.','  valve-3  
valve-1
valve-3
valve-2','[{"id":"a1","kind":"trim"},{"id":"a2","kind":"remove_blanks"},{"id":"a3","kind":"unique","caseSensitive":false},{"id":"a4","kind":"sort_asc"}]'::jsonb),
('triage-errors',1,'ERROR log triage','developer','Keep and deduplicate log messages containing ERROR.','INFO starting
ERROR disk low
WARN retry
error disk low
ERROR auth failure','[{"id":"a1","kind":"trim"},{"id":"a2","kind":"keep_contains","value":"ERROR","caseSensitive":false},{"id":"a3","kind":"unique","caseSensitive":false}]'::jsonb),
('review-queue',1,'Review queue extractor','operations','Extract lines mentioning review without creating any tasks.','approved item
review inspection
REVIEW material
done','[{"id":"a1","kind":"trim"},{"id":"a2","kind":"keep_contains","value":"review","caseSensitive":false},{"id":"a3","kind":"unique","caseSensitive":false}]'::jsonb),
('security-missing',1,'Missing security controls','security','Identify lines with the literal term missing; no active scanning.','Content-Security-Policy missing
HSTS present
X-Frame-Options MISSING','[{"id":"a1","kind":"trim"},{"id":"a2","kind":"keep_contains","value":"missing","caseSensitive":false},{"id":"a3","kind":"unique","caseSensitive":false}]'::jsonb),
('cp-rectifiers',1,'CP rectifier notes','engineering','Extract TR- prefixed inspection records as plain text.','TR-01 4.5A
Pump A 5A
tr-02 6.1A
TR-01 4.5A','[{"id":"a1","kind":"trim"},{"id":"a2","kind":"keep_contains","value":"TR-","caseSensitive":false},{"id":"a3","kind":"unique","caseSensitive":false}]'::jsonb),
('coating-holds',1,'Coating hold points','engineering','Extract coating notes containing HOLD for manual review.','DFT accepted
HOLD dew point
Blast complete
HOLD salt test','[{"id":"a1","kind":"trim"},{"id":"a2","kind":"keep_contains","value":"HOLD","caseSensitive":false},{"id":"a3","kind":"unique","caseSensitive":false}]'::jsonb),
('release-tags',1,'Release tag list','developer','Extract lines beginning with deploy:, preserving order.','deploy: v1.2
work: pending
DEPLOY: v1.3
ship later','[{"id":"a1","kind":"trim"},{"id":"a2","kind":"keep_contains","value":"deploy:","caseSensitive":false},{"id":"a3","kind":"unique","caseSensitive":false}]'::jsonb);
-- Template rows are curated by migration only, not editable from the client.
ALTER TABLE public.automation_workflows
  ADD COLUMN source_template_id text
    REFERENCES public.automation_template_catalog(id) ON DELETE RESTRICT,
  ADD COLUMN source_template_version smallint
    CHECK (source_template_version IS NULL OR source_template_version=1),
  ADD CONSTRAINT automation_template_source_pair CHECK(
    (source_template_id IS NULL AND source_template_version IS NULL)
    OR (source_template_id IS NOT NULL AND source_template_version IS NOT NULL)
  );

-- Survives deletion of an installed copy so retrying a known request ID
-- never creates an unexpected new workflow.
CREATE TABLE public.automation_template_instantiations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  template_id text NOT NULL REFERENCES public.automation_template_catalog(id),
  workflow_id uuid REFERENCES public.automation_workflows(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_key)
);
ALTER TABLE public.automation_template_instantiations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_template_instantiations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automation_template_instantiations TO service_role;

CREATE OR REPLACE FUNCTION public.automation_instantiate_template(
  p_user_id uuid,p_template_id text,p_request_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $install$
DECLARE t public.automation_template_catalog%ROWTYPE;
  claim public.automation_template_instantiations%ROWTYPE;
  wf public.automation_workflows%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_template_id IS NULL
    OR char_length(p_template_id)>40 OR p_request_key IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO claim FROM public.automation_template_instantiations
    WHERE user_id=p_user_id AND request_key=p_request_key;
  IF FOUND THEN
    IF claim.template_id<>p_template_id THEN
      RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
    END IF;
    IF claim.workflow_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.automation_workflows
        WHERE id=claim.workflow_id AND user_id=p_user_id) THEN
      RETURN jsonb_build_object('ok',false,'reason','template_copy_deleted');
    END IF;
    RETURN jsonb_build_object('ok',true,'replayed',true,
      'workflow_id',claim.workflow_id,'template_id',claim.template_id);
  END IF;
  SELECT * INTO t FROM public.automation_template_catalog
    WHERE id=p_template_id AND version=1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','unknown_template'); END IF;
  IF (SELECT count(*) FROM public.automation_workflows WHERE user_id=p_user_id)>=20 THEN
    RETURN jsonb_build_object('ok',false,'reason','workflow_limit');
  END IF;
  INSERT INTO public.automation_workflows(
    user_id,name,steps,source_template_id,source_template_version
  ) VALUES (p_user_id,t.name,t.steps,t.id,t.version)
  RETURNING * INTO wf;
  INSERT INTO public.automation_template_instantiations(
    user_id,request_key,template_id,workflow_id
  ) VALUES(p_user_id,p_request_key,t.id,wf.id);
  RETURN jsonb_build_object('ok',true,'replayed',false,'workflow_id',wf.id,
    'template_id',t.id,'revision',wf.revision,'active',wf.active);
END;
$install$;
REVOKE ALL ON FUNCTION public.automation_instantiate_template(uuid,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_instantiate_template(uuid,text,uuid)
  TO service_role;

-- Privacy-preserving ephemeral dry runs: only metadata; never raw text.
CREATE TABLE public.automation_workflow_previews (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  workflow_id uuid REFERENCES public.automation_workflows(id) ON DELETE SET NULL,
  workflow_revision integer NOT NULL CHECK(workflow_revision>0),
  request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
  input_bytes integer NOT NULL CHECK(input_bytes BETWEEN 0 AND 2000),
  output_bytes integer NOT NULL CHECK(output_bytes BETWEEN 0 AND 10000),
  output_lines integer NOT NULL CHECK(output_lines BETWEEN 0 AND 2500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_key)
);
CREATE INDEX automation_preview_owner_time
  ON public.automation_workflow_previews(user_id,created_at DESC);
ALTER TABLE public.automation_workflow_previews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_workflow_previews FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automation_workflow_previews TO service_role;

CREATE OR REPLACE FUNCTION public.automation_record_workflow_preview(
 p_user_id uuid,p_workflow_id uuid,p_revision integer,p_request_key uuid,
 p_fingerprint text,p_input_bytes integer,p_output_bytes integer,p_output_lines integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $preview$
DECLARE w public.automation_workflows%ROWTYPE;
  previous public.automation_workflow_previews%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_workflow_id IS NULL OR p_revision IS NULL OR
    p_revision<1 OR p_request_key IS NULL OR
    p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR
    p_input_bytes IS NULL OR p_input_bytes NOT BETWEEN 0 AND 2000 OR
    p_output_bytes IS NULL OR p_output_bytes NOT BETWEEN 0 AND 10000 OR
    p_output_lines IS NULL OR p_output_lines NOT BETWEEN 0 AND 2500 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO w FROM public.automation_workflows WHERE id=p_workflow_id
    AND user_id=p_user_id AND active=true AND revision=p_revision;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','stale_workflow'); END IF;
  SELECT * INTO previous FROM public.automation_workflow_previews
    WHERE user_id=p_user_id AND request_key=p_request_key;
  IF FOUND THEN
    IF previous.workflow_id IS DISTINCT FROM p_workflow_id OR
       previous.workflow_revision<>p_revision OR
       previous.request_fingerprint<>p_fingerprint OR
       previous.input_bytes<>p_input_bytes OR
       previous.output_bytes<>p_output_bytes OR
       previous.output_lines<>p_output_lines THEN
      RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('ok',true,'replayed',true,'created_at',previous.created_at);
  END IF;
  IF (SELECT count(*) FROM public.automation_workflow_previews
    WHERE user_id=p_user_id AND created_at>
      pg_catalog.statement_timestamp()-interval '24 hours')>=20 THEN
    RETURN jsonb_build_object('ok',false,'reason','preview_limit');
  END IF;
  INSERT INTO public.automation_workflow_previews(
    user_id,request_key,workflow_id,workflow_revision,request_fingerprint,
    input_bytes,output_bytes,output_lines
  ) VALUES(p_user_id,p_request_key,p_workflow_id,p_revision,p_fingerprint,
    p_input_bytes,p_output_bytes,p_output_lines);
  RETURN jsonb_build_object('ok',true,'replayed',false,
    'created_at',pg_catalog.statement_timestamp());
END;
$preview$;
REVOKE ALL ON FUNCTION public.automation_record_workflow_preview(
  uuid,uuid,integer,uuid,text,integer,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_record_workflow_preview(
  uuid,uuid,integer,uuid,text,integer,integer,integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_preview_usage(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $usage$
DECLARE num integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
  SELECT count(*) INTO num FROM public.automation_workflow_previews
    WHERE user_id=p_user_id AND created_at>
      pg_catalog.statement_timestamp()-interval '24 hours';
  RETURN jsonb_build_object('ok',true,'used',num,'limit',20,
    'window','rolling_24_hours');
END;
$usage$;
REVOKE ALL ON FUNCTION public.automation_preview_usage(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_preview_usage(uuid)
  TO service_role;

-- No scheduled cron introduced. Owner opens this screen to prune old metadata.
CREATE OR REPLACE FUNCTION public.automation_prune_template_metadata(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $clean$
DECLARE previews_deleted integer;install_deleted integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  DELETE FROM public.automation_workflow_previews
    WHERE user_id=p_user_id AND created_at<
      pg_catalog.statement_timestamp()-interval '7 days';
  GET DIAGNOSTICS previews_deleted=ROW_COUNT;
  DELETE FROM public.automation_template_instantiations
    WHERE user_id=p_user_id AND created_at<
      pg_catalog.statement_timestamp()-interval '7 days';
  GET DIAGNOSTICS install_deleted=ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'previews_deleted',previews_deleted,
    'instantiations_deleted',install_deleted);
END;
$clean$;
REVOKE ALL ON FUNCTION public.automation_prune_template_metadata(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_prune_template_metadata(uuid)
  TO service_role;
