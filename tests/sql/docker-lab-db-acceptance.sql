-- Live SQL acceptance in disposable PostgreSQL only; no real Docker operations.
\set ON_ERROR_STOP on
DO $accept$
DECLARE
 alice uuid:='11111111-1111-4111-8111-111111111111';
 bob uuid:='22222222-2222-4222-8222-222222222222';
 aw uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 bw uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 aa uuid:='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
 ba uuid:='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
 first_request uuid; failed_request uuid;queued_request uuid;bob_request uuid;
 first_claim uuid;failed_claim uuid;incident uuid;
 result jsonb; n integer;
 note text:='Operator checked the isolated staging receipt and incident evidence.';
BEGIN
 INSERT INTO public.docker_identity_workspaces(id,owner_id,name)
 VALUES(aw,alice,'Alice staging lab'),(bw,bob,'Bob staging lab');
 INSERT INTO public.docker_agent_registrations(
 id,owner_id,workspace_id,display_name,public_key,status,key_verified_at)
 VALUES
 (aa,alice,aw,'Alice agent',repeat('A',43),'key_verified',now()),
 (ba,bob,bw,'Bob agent',repeat('B',43),'key_verified',now());
 INSERT INTO public.docker_agent_reports(
 agent_id,owner_id,last_signed_at,last_received_at,last_nonce_hash,
 engine_available,engine_version,container_count)
 VALUES
 (aa,alice,now(),now(),repeat('a',64),true,'25.0',1),
 (ba,bob,now(),now(),repeat('b',64),true,'25.0',1);

 SELECT public.docker_set_control_policy(alice,true,5) INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Owner A opt-in: %',result; END IF;
 SELECT public.docker_set_control_policy(bob,true,5) INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Owner B opt-in: %',result; END IF;

 SELECT public.docker_create_control_request(alice,ba,gen_random_uuid(),
 'stop',repeat('a',64)) INTO result;
 IF result->>'reason'<>'agent_unavailable' THEN RAISE EXCEPTION 'Cross-owner agent accepted: %',result; END IF;
 SELECT public.docker_create_control_request(alice,aa,gen_random_uuid(),
 'stop',repeat('a',64)) INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Owner A plan not created: %',result; END IF;
 first_request:=(result->>'request_id')::uuid;
 SELECT public.docker_decide_control_request(bob,first_request,'approve') INTO result;
 IF result->>'reason'<>'not_found' THEN RAISE EXCEPTION 'B changed A plan: %',result; END IF;
 SELECT public.docker_decide_control_request(alice,first_request,'approve') INTO result;
 IF result->>'execution_status'<>'not_executed' THEN RAISE EXCEPTION 'Approval falsely said executed'; END IF;

 SELECT public.docker_command_consume_nonce(aa,repeat('c',64),now()) INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'First nonce rejected: %',result; END IF;
 SELECT public.docker_command_consume_nonce(aa,repeat('c',64),now()) INTO result;
 IF result->>'reason'<>'replayed' THEN RAISE EXCEPTION 'Nonce replay permitted: %',result; END IF;
 SELECT public.docker_command_consume_nonce(aa,repeat('d',64),now()-interval '50 seconds') INTO result;
 IF result->>'reason'<>'invalid_or_expired' THEN RAISE EXCEPTION 'Old signed nonce accepted: %',result; END IF;

 SELECT public.docker_command_claim(aa) INTO result;
 IF result->>'ok'<>'true' OR result->'job'->>'requestId'<>first_request::text THEN
   RAISE EXCEPTION 'Approved claim failed: %',result; END IF;
 first_claim:=(result->'job'->>'claimId')::uuid;
 SELECT public.docker_command_claim(aa) INTO result;
 IF result->'job'<>'null'::jsonb THEN RAISE EXCEPTION 'Duplicate outstanding claim: %',result; END IF;
 SELECT public.docker_command_authorize(ba,first_claim) INTO result;
 IF result->>'reason'<>'claim_unavailable' THEN RAISE EXCEPTION 'B authorized A claim: %',result; END IF;
 SELECT public.docker_command_authorize(aa,first_claim) INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Permit not granted: %',result; END IF;
 SELECT public.docker_command_authorize(aa,first_claim) INTO result;
 IF result->>'reason'<>'claim_unavailable' THEN RAISE EXCEPTION 'Duplicate permit granted: %',result; END IF;
 SELECT public.docker_command_finish(ba,first_claim,'completed') INTO result;
 IF result->>'reason'<>'claim_unavailable' THEN RAISE EXCEPTION 'B finished A claim: %',result; END IF;
 SELECT public.docker_command_finish(aa,first_claim,'completed') INTO result;
 IF result->>'ok'<>'true' OR result->>'reused'<>'false' THEN RAISE EXCEPTION 'First receipt invalid: %',result; END IF;
 SELECT public.docker_command_finish(aa,first_claim,'completed') INTO result;
 IF result->>'reused'<>'true' THEN RAISE EXCEPTION 'Duplicate receipt not idempotent: %',result; END IF;
 SELECT public.docker_command_finish(aa,first_claim,'failed') INTO result;
 IF result->>'reason'<>'claim_unavailable' THEN RAISE EXCEPTION 'Conflicting receipt accepted: %',result; END IF;
 SELECT public.docker_lab_open_incident(alice,first_claim,note) INTO result;
 IF result->>'reason'<>'not_actionable' THEN RAISE EXCEPTION 'Success generated false incident: %',result; END IF;

 SELECT public.docker_create_control_request(alice,aa,gen_random_uuid(),
 'restart',repeat('a',64)) INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Second plan failed: %',result; END IF;
 failed_request:=(result->>'request_id')::uuid;
 SELECT public.docker_decide_control_request(alice,failed_request,'approve') INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Second approval failed: %',result; END IF;
 SELECT public.docker_command_claim(aa) INTO result;
 IF result->'job'->>'requestId'<>failed_request::text THEN RAISE EXCEPTION 'Wrong second job: %',result; END IF;
 failed_claim:=(result->'job'->>'claimId')::uuid;
 SELECT public.docker_command_authorize(aa,failed_claim) INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Second permit failed: %',result; END IF;
 SELECT public.docker_command_finish(aa,failed_claim,'failed') INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Failed receipt not accepted: %',result; END IF;

 SELECT public.docker_lab_open_incident(bob,failed_claim,note) INTO result;
 IF result->>'reason'<>'not_found' THEN RAISE EXCEPTION 'B opened A case: %',result; END IF;
 SELECT public.docker_lab_open_incident(alice,failed_claim,note) INTO result;
 IF result->>'ok'<>'true' OR result->>'reason'<>'reported_failed' THEN
   RAISE EXCEPTION 'Legitimate incident not created: %',result; END IF;
 incident:=(result->>'incident_id')::uuid;
 SELECT public.docker_lab_open_incident(alice,failed_claim,note) INTO result;
 IF result->>'reused'<>'true' OR result->>'incident_id'<>incident::text THEN
   RAISE EXCEPTION 'Duplicate case inserted: %',result; END IF;
 SELECT public.docker_lab_triage_incident(bob,incident,'reviewed',note) INTO result;
 IF result->>'reason'<>'not_found' THEN RAISE EXCEPTION 'B triaged A incident: %',result; END IF;

 SELECT public.docker_create_control_request(alice,aa,gen_random_uuid(),
 'stop',repeat('a',64)) INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Pending plan failed: %',result; END IF;
 queued_request:=(result->>'request_id')::uuid;
 SELECT public.docker_create_control_request(bob,ba,gen_random_uuid(),
 'stop',repeat('b',64)) INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Owner B independent plan failed: %',result; END IF;
 bob_request:=(result->>'request_id')::uuid;
 SELECT public.docker_lab_escalate_incident(alice,incident,note) INTO result;
 IF result->>'ok'<>'true' OR result->>'incident_hold'<>'true' OR
   result->>'already_issued_permits_revoked'<>'false' THEN
   RAISE EXCEPTION 'Containment not fail closed: %',result; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.docker_control_requests WHERE id=queued_request AND state='cancelled')
 THEN RAISE EXCEPTION 'Queue not cancelled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.docker_control_requests WHERE id=bob_request AND state='pending')
 THEN RAISE EXCEPTION 'Bob plan changed by Alice hold'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.docker_command_claims WHERE id=first_claim AND state='reported_completed')
 THEN RAISE EXCEPTION 'Containment rewrote completed receipt'; END IF;
 SELECT public.docker_set_control_policy(alice,true,5) INTO result;
 IF result->>'reason'<>'incident_hold' THEN RAISE EXCEPTION 'Policy enabled under hold: %',result; END IF;
 SELECT public.docker_command_claim(aa) INTO result;
 IF result->>'reason'<>'not_ready' THEN RAISE EXCEPTION 'New job under hold: %',result; END IF;
 SELECT public.docker_lab_triage_incident(alice,incident,'reviewed',note) INTO result;
 IF result->>'reason'<>'release_required' THEN RAISE EXCEPTION 'Ordinary triage bypassed hold: %',result; END IF;
 SELECT public.docker_lab_escalate_incident(alice,incident,note) INTO result;
 IF result->>'reused'<>'true' THEN RAISE EXCEPTION 'Escalation not idempotent'; END IF;
 SELECT public.docker_lab_release_incident_hold(alice,incident,note) INTO result;
 IF result->>'ok'<>'true' OR result->>'incident_hold'<>'false' OR
   result->>'review_policy_reenabled'<>'false' THEN
   RAISE EXCEPTION 'Release not fail closed: %',result; END IF;
 IF EXISTS(SELECT 1 FROM public.docker_control_policies WHERE owner_id=alice AND (enabled OR incident_hold))
 THEN RAISE EXCEPTION 'Release left policy active'; END IF;
 SELECT count(*) INTO n FROM public.docker_lab_incident_events WHERE incident_id=incident;
 IF n<>3 THEN RAISE EXCEPTION 'Incorrect incident audit history: %',n; END IF;

 UPDATE public.docker_agent_registrations SET status='revoked',revoked_at=now()
 WHERE id=aa AND owner_id=alice;
 SELECT public.docker_command_consume_nonce(aa,repeat('e',64),now()) INTO result;
 IF result->>'reason'<>'agent_unavailable' THEN RAISE EXCEPTION 'Revoked key can act: %',result; END IF;
 RAISE NOTICE 'Live Docker database checks passed: A/B, replay, claims, receipts, holds, revocation';
END $accept$;

DO $grants$
DECLARE signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'docker_set_control_policy(uuid,boolean,integer)',
 'docker_create_control_request(uuid,uuid,uuid,text,text)',
 'docker_decide_control_request(uuid,uuid,text)',
 'docker_command_claim(uuid)',
 'docker_command_authorize(uuid,uuid)',
 'docker_command_finish(uuid,uuid,text)',
 'docker_command_consume_nonce(uuid,text,timestamptz)',
 'docker_lab_open_incident(uuid,uuid,text)',
 'docker_lab_triage_incident(uuid,uuid,text,text)',
 'docker_lab_escalate_incident(uuid,uuid,text)',
 'docker_lab_release_incident_hold(uuid,uuid,text)'
 ] LOOP
  IF pg_catalog.has_function_privilege('authenticated','public.'||signature,'EXECUTE') OR
     pg_catalog.has_function_privilege('anon','public.'||signature,'EXECUTE') THEN
     RAISE EXCEPTION 'Client RPC privilege leaked: %',signature;
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role','public.'||signature,'EXECUTE')
  THEN RAISE EXCEPTION 'Service grant missing: %',signature; END IF;
 END LOOP;
END $grants$;

SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $owner_a$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.docker_identity_workspaces;
 IF n<>1 THEN RAISE EXCEPTION 'Alice workspace RLS: %',n; END IF;
 SELECT count(*) INTO n FROM public.docker_agent_registrations;
 IF n<>1 THEN RAISE EXCEPTION 'Alice agent RLS: %',n; END IF;
 SELECT count(*) INTO n FROM public.docker_control_requests;
 IF n<>3 THEN RAISE EXCEPTION 'Alice plans RLS: %',n; END IF;
 SELECT count(*) INTO n FROM public.docker_command_claims;
 IF n<>2 THEN RAISE EXCEPTION 'Alice claims RLS: %',n; END IF;
 SELECT count(*) INTO n FROM public.docker_lab_incidents;
 IF n<>1 THEN RAISE EXCEPTION 'Alice cases RLS: %',n; END IF;
 SELECT count(*) INTO n FROM public.docker_lab_incident_events;
 IF n<>3 THEN RAISE EXCEPTION 'Alice audit events RLS: %',n; END IF;
 IF has_table_privilege('authenticated','public.docker_command_claims','UPDATE') OR
    has_table_privilege('authenticated','public.docker_lab_incidents','UPDATE') OR
    has_table_privilege('authenticated','public.docker_control_requests','INSERT') THEN
    RAISE EXCEPTION 'Client gained Docker write privilege'; END IF;
END $owner_a$;
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $owner_b$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.docker_identity_workspaces;
 IF n<>1 THEN RAISE EXCEPTION 'Bob workspace RLS: %',n; END IF;
 SELECT count(*) INTO n FROM public.docker_agent_registrations;
 IF n<>1 THEN RAISE EXCEPTION 'Bob agent RLS: %',n; END IF;
 SELECT count(*) INTO n FROM public.docker_control_requests;
 IF n<>1 THEN RAISE EXCEPTION 'Bob plans RLS: %',n; END IF;
 SELECT count(*) INTO n FROM public.docker_command_claims;
 IF n<>0 THEN RAISE EXCEPTION 'Bob saw Alice claims: %',n; END IF;
 SELECT count(*) INTO n FROM public.docker_lab_incidents;
 IF n<>0 THEN RAISE EXCEPTION 'Bob saw Alice cases: %',n; END IF;
 SELECT count(*) INTO n FROM public.docker_lab_incident_events;
 IF n<>0 THEN RAISE EXCEPTION 'Bob saw Alice notes: %',n; END IF;
END $owner_b$;
RESET ROLE;
RESET request.jwt.claim.sub;
