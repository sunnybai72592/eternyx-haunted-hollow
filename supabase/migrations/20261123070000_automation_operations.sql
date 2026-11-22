-- ETERNYX Automation Phase 2K: safe batch pause/resume and truthful
-- owner-only run history. No external requests, recurring tasks or new writes
-- outside the existing account's saved workflow active flag.

CREATE TABLE public.automation_bulk_workflow_receipts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  items jsonb NOT NULL CHECK(jsonb_typeof(items)='array'
    AND jsonb_array_length(items) BETWEEN 1 AND 5),
  target_active boolean NOT NULL,
  affected_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,request_key)
);
CREATE INDEX automation_bulk_owner_recent
  ON public.automation_bulk_workflow_receipts(user_id,created_at DESC);
ALTER TABLE public.automation_bulk_workflow_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_bulk_workflow_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automation_bulk_workflow_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.automation_bulk_toggle_workflows(
  p_user_id uuid,p_request_key uuid,p_items jsonb,p_active boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE receipt public.automation_bulk_workflow_receipts%ROWTYPE;
  item jsonb; wf public.automation_workflows%ROWTYPE;
  target uuid; expected_revision integer; expected_active boolean;
  seen uuid[]:=ARRAY[]::uuid[]; changed uuid[]:=ARRAY[]::uuid[];
  n integer;
BEGIN
  IF p_user_id IS NULL OR p_request_key IS NULL OR p_active IS NULL OR
     p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR
     jsonb_array_length(p_items) NOT BETWEEN 1 AND 5 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item)<>'object' OR
       (SELECT count(*) FROM jsonb_object_keys(item))<>3 OR
       item->>'id' IS NULL OR
       item->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR
       jsonb_typeof(item->'revision')<>'number' OR
       (item->>'revision') !~ '^[0-9]{1,10}$' OR
       jsonb_typeof(item->'active')<>'boolean' THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_items');
    END IF;
    BEGIN
      expected_revision:=(item->>'revision')::integer;
    EXCEPTION WHEN numeric_value_out_of_range THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_items');
    END;
    IF expected_revision<1 THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_items');
    END IF;
    target:=(item->>'id')::uuid;
    IF target=ANY(seen) THEN
      RETURN jsonb_build_object('ok',false,'reason','duplicate_workflow');
    END IF;
    seen:=array_append(seen,target);
  END LOOP;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO receipt FROM public.automation_bulk_workflow_receipts
    WHERE user_id=p_user_id AND request_key=p_request_key;
  IF FOUND THEN
    IF receipt.items IS DISTINCT FROM p_items OR receipt.target_active IS DISTINCT FROM p_active THEN
      RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('ok',true,'replayed',true,'affected_ids',receipt.affected_ids,
      'active',receipt.target_active,'count',cardinality(receipt.affected_ids));
  END IF;
  SELECT count(*) INTO n FROM public.automation_bulk_workflow_receipts
    WHERE user_id=p_user_id AND
      created_at>pg_catalog.statement_timestamp()-interval '24 hours';
  IF n>=10 THEN RETURN jsonb_build_object('ok',false,'reason','daily_bulk_limit'); END IF;
  -- Validate ALL ownership and state/revisions BEFORE updating any workflow.
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    target:=(item->>'id')::uuid;
    expected_revision:=(item->>'revision')::integer;
    expected_active:=(item->>'active')::boolean;
    SELECT * INTO wf FROM public.automation_workflows
      WHERE id=target AND user_id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok',false,'reason','not_found');
    END IF;
    IF wf.revision<>expected_revision OR wf.active IS DISTINCT FROM expected_active THEN
      RETURN jsonb_build_object('ok',false,'reason','stale_workflow');
    END IF;
  END LOOP;
  UPDATE public.automation_workflows SET
    active=p_active,updated_at=pg_catalog.statement_timestamp()
    WHERE user_id=p_user_id AND id=ANY(seen);
  INSERT INTO public.automation_bulk_workflow_receipts(
    user_id,request_key,items,target_active,affected_ids
  ) VALUES(p_user_id,p_request_key,p_items,p_active,seen);
  RETURN jsonb_build_object('ok',true,'replayed',false,'affected_ids',seen,
    'active',p_active,'count',cardinality(seen));
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_bulk_toggle_workflows(uuid,uuid,jsonb,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_bulk_toggle_workflows(uuid,uuid,jsonb,boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_bulk_operation_usage(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE used_count integer;
BEGIN
 IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
 SELECT count(*) INTO used_count FROM public.automation_bulk_workflow_receipts
   WHERE user_id=p_user_id AND created_at>pg_catalog.statement_timestamp()-interval '24 hours';
 RETURN jsonb_build_object('ok',true,'used',used_count,'limit',10,
   'window','rolling_24_hours');
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_bulk_operation_usage(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_bulk_operation_usage(uuid)
 TO service_role;

-- A single owner-scoped keyset page; no user-supplied arbitrary SQL or offsets.
-- Only metadata/trace already collected by the existing run recorder.
CREATE OR REPLACE FUNCTION public.automation_query_run_history(
 p_user_id uuid,p_workflow_id uuid,p_channel text,
 p_before_time timestamptz,p_before_id uuid,p_page_size integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE page jsonb;has_more boolean:=false; total_count integer;
  last_run jsonb;cnt integer;
BEGIN
 IF p_user_id IS NULL OR
   (p_channel IS NOT NULL AND p_channel NOT IN ('manual','webhook','scheduled')) OR
   p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 30 OR
   ((p_before_time IS NULL) <> (p_before_id IS NULL)) THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 IF p_workflow_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.automation_workflows
     WHERE user_id=p_user_id AND id=p_workflow_id) THEN
   RETURN jsonb_build_object('ok',false,'reason','not_found');
 END IF;
 WITH records AS (
   SELECT id,workflow_id,workflow_revision,trigger_type,
     webhook_trigger_id,schedule_id,status,input_lines,output_lines,
     input_characters,output_characters,trace,created_at
   FROM public.automation_runs
   WHERE user_id=p_user_id
     AND (p_workflow_id IS NULL OR workflow_id=p_workflow_id)
     AND (p_channel IS NULL OR trigger_type=p_channel)
     AND (p_before_time IS NULL OR
       (created_at,id)<(p_before_time,p_before_id))
   ORDER BY created_at DESC,id DESC
   LIMIT p_page_size+1
 ), numbered AS (
   SELECT records.*,row_number() OVER (ORDER BY created_at DESC,id DESC) AS rn
   FROM records
 )
 SELECT count(*),COALESCE(jsonb_agg(to_jsonb(numbered) - 'rn' ORDER BY rn)
   FILTER(WHERE rn<=p_page_size),'[]'::jsonb)
 INTO cnt,page FROM numbered;
 has_more:=cnt>p_page_size;
 IF jsonb_array_length(page)>0 THEN
   last_run:=page->(jsonb_array_length(page)-1);
 END IF;
 SELECT count(*) INTO total_count FROM public.automation_runs
   WHERE user_id=p_user_id
     AND (p_workflow_id IS NULL OR workflow_id=p_workflow_id)
     AND (p_channel IS NULL OR trigger_type=p_channel);
 RETURN jsonb_build_object('ok',true,'source','database_completed_runs',
   'rows',page,'hasMore',has_more,'totalMatching',total_count,
   'nextBeforeTime',CASE WHEN has_more THEN last_run->>'created_at' ELSE NULL END,
   'nextBeforeId',CASE WHEN has_more THEN last_run->>'id' ELSE NULL END,
   'rawInputsStored',false,'rawOutputsStored',false,
   'pageSize',p_page_size);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_query_run_history(
 uuid,uuid,text,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_query_run_history(
 uuid,uuid,text,timestamptz,uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_prune_bulk_receipts(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE erased integer;
BEGIN
 IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 DELETE FROM public.automation_bulk_workflow_receipts
  WHERE user_id=p_user_id AND created_at<pg_catalog.statement_timestamp()-interval '7 days';
 GET DIAGNOSTICS erased=ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'deleted',erased);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_prune_bulk_receipts(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_prune_bulk_receipts(uuid)
 TO service_role;
