-- Offline PostgreSQL 17 Phase 2S acceptance. Exercise >2 pages of
-- owner-only, actual persisted incident/event rows. Extra cases are SQL
-- fixture rows, not fake incidents returned by the product.
DO $$
DECLARE
 alice uuid:='11111111-1111-4111-8111-111111111111';
 bob uuid:='22222222-2222-4222-8222-222222222222';
 inc uuid;idx integer;
 p jsonb;page jsonb;cursor_data jsonb;
 seen uuid[]:=ARRAY[]::uuid[];
 n integer:=0;page_no integer:=0;
 expected_first uuid;
 before_runs integer;after_runs integer;
 observed int;owner_total integer;
BEGIN
 SELECT count(*) INTO before_runs FROM public.automation_runs WHERE user_id=alice;
 FOR idx IN 1..45 LOOP
   -- Tie some timestamps intentionally to prove UUID is a stable keyset
   -- tiebreaker even when multiple cases share an exact creation time.
   INSERT INTO public.automation_incidents(
      user_id,creation_key,source_kind,source_id,workflow_id,
      title,severity,status,revision,source_evidence,created_at,updated_at)
   VALUES(alice,gen_random_uuid(),'completed_run_review',gen_random_uuid(),NULL,
      'Actual stored SQL fixture case '||idx,'low','open',1,
      jsonb_build_object('fixture',true),
      pg_catalog.statement_timestamp()-((idx/3) * interval '1 minute'),
      pg_catalog.statement_timestamp()-((idx/3) * interval '1 minute'))
   RETURNING id INTO inc;
   INSERT INTO public.automation_incident_events(
     user_id,incident_id,request_key,kind,from_status,to_status,note,created_at)
   VALUES(alice,inc,gen_random_uuid(),'opened',NULL,'open',
      'Created by isolated database fixture only',pg_catalog.statement_timestamp());
 END LOOP;
 INSERT INTO public.automation_incidents(
      user_id,creation_key,source_kind,source_id,workflow_id,
      title,severity,status,revision,source_evidence,created_at,updated_at)
 VALUES(bob,gen_random_uuid(),'completed_run_review',gen_random_uuid(),NULL,
      'Separate Bob database fixture','medium','open',1,
      '{}'::jsonb,pg_catalog.statement_timestamp(),pg_catalog.statement_timestamp())
 RETURNING id INTO inc;
 INSERT INTO public.automation_incident_events(
   user_id,incident_id,request_key,kind,from_status,to_status,note)
 VALUES(bob,inc,gen_random_uuid(),'opened',NULL,'open',
   'Only Bob should access this owner fixture');
 SELECT count(*) INTO owner_total FROM public.automation_incidents WHERE user_id=alice;
 IF owner_total<>45 THEN RAISE EXCEPTION 'Failed creating owner case page fixtures'; END IF;
 SELECT public.automation_incident_coverage_page(bob,20,NULL,NULL) INTO p;
 IF p->>'returned'<>'1' OR p->>'ownerCaseTotalAtRead'<>'1'
    OR p->>'hasMore'<>'false' OR p->>'allOwnerCasesCheckedInSinglePage'<>'true' THEN
    RAISE EXCEPTION 'Owner two coverage incorrect: %',p;
 END IF;
 SELECT public.automation_incident_coverage_page(alice,0,NULL,NULL) INTO p;
 IF p->>'reason'<>'invalid_coverage_cursor' THEN
   RAISE EXCEPTION 'Zero page size allowed';
 END IF;
 SELECT public.automation_incident_coverage_page(alice,21,NULL,NULL) INTO p;
 IF p->>'reason'<>'invalid_coverage_cursor' THEN
   RAISE EXCEPTION 'Oversize owner page allowed';
 END IF;
 SELECT public.automation_incident_coverage_page(alice,20,now(),NULL) INTO p;
 IF p->>'reason'<>'invalid_coverage_cursor' THEN
   RAISE EXCEPTION 'Partial keyset cursor accepted';
 END IF;
 SELECT public.automation_incident_coverage_page(alice,20,NULL,gen_random_uuid()) INTO p;
 IF p->>'reason'<>'invalid_coverage_cursor' THEN
   RAISE EXCEPTION 'Missing timestamp keyset accepted';
 END IF;

 cursor_data:=NULL;
 LOOP
   SELECT public.automation_incident_coverage_page(
     alice,20,(cursor_data->>'beforeCreatedAt')::timestamptz,
     (cursor_data->>'beforeId')::uuid) INTO page;
   page_no:=page_no+1;
   IF page->>'ok'<>'true' OR page->>'source'<>'owner_case_coverage_page' OR
      page->>'ordering'<>'created_at_desc_id_desc' OR
      page->>'scope'<>'best_effort_multi_request_not_atomic_snapshot' OR
      page->>'pageSize'<>'20' OR page->>'ownerCaseTotalAtRead'<>'45' OR
      page->>'cryptographicIntegrityVerified'<>'false' OR
      page->>'transactionallyConsistentAcrossPages'<>'false' OR
      page->>'externalExecutionTriggered'<>'false' OR
      (page->'requestedCursor') IS DISTINCT FROM cursor_data THEN
      RAISE EXCEPTION 'Owner audit page source/limits incorrect: %',page;
   END IF;
   IF page->>'pageInconsistent'<>'0' OR
      page->>'pageHistoricalClosedAfterReopen'<>'0' OR
      (page->>'pageCasesWithNoEvidence')::int<>(page->>'returned')::int THEN
      RAISE EXCEPTION 'Incorrect per-page measured ledger counts: %',page;
   END IF;
   FOR p IN SELECT value FROM jsonb_array_elements(page->'rows') LOOP
     inc:=(p->>'incidentId')::uuid;
     IF inc=ANY(seen) THEN
       RAISE EXCEPTION 'Duplicate incident on owner audit pages: %',inc;
     END IF;
     IF (SELECT user_id FROM public.automation_incidents WHERE id=inc)<>alice THEN
       RAISE EXCEPTION 'Cross-tenant incident exposed: %',inc;
     END IF;
     IF p->>'consistent'<>'true' OR p->>'status'<>'open' OR
        p->>'revision'<>'1' OR p->>'evidenceCount'<>'0' OR
        p->>'hasPlan'<>'false' OR p ? 'source_evidence' OR
        p ? 'note' OR p ? 'request_key' THEN
       RAISE EXCEPTION 'Page exposed raw source or fabricated case mismatch: %',p;
     END IF;
     seen:=array_append(seen,inc);
     n:=n+1;
   END LOOP;
   IF page_no<3 THEN
     IF page->>'returned'<>'20' OR page->>'hasMore'<>'true' OR
        page->'nextCursor' IS NULL THEN
        RAISE EXCEPTION 'Expected nonterminal full page: %',page;
     END IF;
   ELSE
     IF page->>'returned'<>'5' OR page->>'hasMore'<>'false'
        OR page->'nextCursor' IS NOT NULL THEN
       RAISE EXCEPTION 'Last keyset page is not terminal: %',page;
     END IF;
   END IF;
   EXIT WHEN page->>'hasMore'<>'true';
   cursor_data:=page->'nextCursor';
   IF page_no>5 THEN RAISE EXCEPTION 'Scan did not terminate'; END IF;
 END LOOP;
 IF page_no<>3 OR n<>45 OR cardinality(seen)<>45 THEN
    RAISE EXCEPTION 'Multi-page coverage did not inspect every owner case';
 END IF;
 SELECT public.automation_incident_coverage_page(alice,20,NULL,NULL) INTO page;
 IF page->>'allOwnerCasesCheckedInSinglePage'<>'false' THEN
    RAISE EXCEPTION 'First page falsely claimed full coverage';
 END IF;
 SELECT id INTO expected_first FROM public.automation_incidents
   WHERE user_id=alice ORDER BY created_at DESC,id DESC LIMIT 1;
 UPDATE public.automation_incidents SET revision=99 WHERE id=expected_first;
 SELECT public.automation_incident_coverage_page(alice,20,NULL,NULL) INTO page;
 IF page->>'pageInconsistent'<>'1' OR
    NOT EXISTS(SELECT 1 FROM jsonb_array_elements(page->'rows') AS v(item)
      WHERE v.item->>'incidentId'=expected_first::text AND
        v.item->'findings' ? 'incident_revision_mismatch') THEN
   RAISE EXCEPTION 'Deliberate latest-case revision drift was not flagged: %',page;
 END IF;
 UPDATE public.automation_incidents SET revision=1 WHERE id=expected_first;
 SELECT public.automation_incident_coverage_page(alice,20,NULL,NULL) INTO page;
 IF page->>'pageInconsistent'<>'0' THEN
   RAISE EXCEPTION 'Restored fixture still reported inconsistency';
 END IF;
 SELECT count(*) INTO after_runs FROM public.automation_runs WHERE user_id=alice;
 IF before_runs<>after_runs THEN
   RAISE EXCEPTION 'Owner audit page created workflow runs';
 END IF;
 RAISE NOTICE 'Phase 2S: 45 owner cases, 3 stable pages, zero tenant leaks, deliberate drift and restored fixture passed';
END;
$$;
DO $$
BEGIN
 IF has_function_privilege('authenticated',
    'public.automation_incident_coverage_page(uuid,integer,timestamptz,uuid)','EXECUTE')
 OR has_function_privilege('anon',
    'public.automation_incident_coverage_page(uuid,integer,timestamptz,uuid)','EXECUTE')
 THEN
   RAISE EXCEPTION 'Browser roles may call privileged owner audit page directly';
 END IF;
END;
$$;
