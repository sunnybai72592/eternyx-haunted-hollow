-- Disposable Postgres 17 acceptance. No Github write and no real secrets.
DO $$
DECLARE
  alice uuid := '11111111-1111-4111-8111-111111111111';
  bob uuid := '22222222-2222-4222-8222-222222222222';
  k1 uuid:=gen_random_uuid();
  d1 uuid;d2 uuid;d3 uuid;d4 uuid;d5 uuid;stale uuid;
  r jsonb;v integer;drafts int;i int;
BEGIN
  -- Credential is a test-only fake AES-like hex blob. Never a live PAT.
  SELECT public.automation_connect_github_issues(
    alice,'octocat','Hello-World','octocat',repeat('a',200),repeat('b',24)) INTO r;
  IF r->>'ok'<>'true' OR r->>'enabled'<>'false' THEN
    RAISE EXCEPTION 'credential was not stored disabled by default: %',r;
  END IF;
  v:=(r->>'version')::int;
  SELECT public.automation_toggle_github_issues(bob,true) INTO r;
  IF r->>'reason'<>'not_connected' THEN RAISE EXCEPTION 'cross-user toggle accepted'; END IF;
  SELECT public.automation_prepare_github_issue(
    alice,k1,repeat('a',64),repeat('f',100),repeat('c',24)) INTO r;
  IF r->>'reason'<>'disabled' THEN RAISE EXCEPTION 'draft accepted while disabled'; END IF;
  SELECT public.automation_toggle_github_issues(alice,true) INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'owner enable refused'; END IF;

  SELECT public.automation_prepare_github_issue(
    alice,k1,repeat('a',64),repeat('f',100),repeat('c',24)) INTO r;
  IF r->>'ok'<>'true' OR r->>'status'<>'pending' OR r->>'replayed'<>'false' THEN
    RAISE EXCEPTION 'encrypted draft was not stored pending: %',r;
  END IF;
  d1:=(r->>'draft_id')::uuid;
  SELECT public.automation_prepare_github_issue(
    alice,k1,repeat('a',64),repeat('f',100),repeat('c',24)) INTO r;
  IF r->>'replayed'<>'true' OR r->>'draft_id'<>d1::text THEN
    RAISE EXCEPTION 'duplicate draft key not replay safe';
  END IF;
  SELECT public.automation_prepare_github_issue(
    alice,k1,repeat('b',64),repeat('f',100),repeat('c',24)) INTO r;
  IF r->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'draft id reuse with changed input accepted';
  END IF;
  IF (SELECT count(*) FROM public.automation_github_issue_drafts
      WHERE user_id=alice AND status<>'pending')<>0 THEN
    RAISE EXCEPTION 'unapproved draft created an external write claim';
  END IF;
  SELECT public.automation_claim_github_issue(bob,d1,v) INTO r;
  IF r->>'reason'<>'not_found' THEN RAISE EXCEPTION 'Bob claimed Alice draft'; END IF;
  SELECT public.automation_claim_github_issue(alice,d1,v) INTO r;
  IF r->>'reason'<>'not_reviewed' THEN
    RAISE EXCEPTION 'unpreviewed draft was allowed to invoke GitHub';
  END IF;
  SELECT public.automation_mark_github_issue_previewed(bob,d1,v) INTO r;
  IF r->>'reason'<>'not_pending' THEN RAISE EXCEPTION 'Bob previewed Alice draft'; END IF;
  SELECT public.automation_mark_github_issue_previewed(alice,d1,v) INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'real owner could not mark preview'; END IF;
  SELECT public.automation_claim_github_issue(alice,d1,v+1) INTO r;
  IF r->>'reason'<>'connection_changed' THEN RAISE EXCEPTION 'wrong version allowed write'; END IF;

  SELECT public.automation_prepare_github_issue(
    alice,gen_random_uuid(),repeat('c',64),repeat('f',100),repeat('c',24)) INTO r;
  d2:=(r->>'draft_id')::uuid;
  SELECT public.automation_prepare_github_issue(
    alice,gen_random_uuid(),repeat('d',64),repeat('f',100),repeat('c',24)) INTO r;
  d3:=(r->>'draft_id')::uuid;
  IF d2 IS NULL OR d3 IS NULL THEN RAISE EXCEPTION 'pending setup failed'; END IF;
  PERFORM public.automation_mark_github_issue_previewed(alice,d2,v);
  PERFORM public.automation_mark_github_issue_previewed(alice,d3,v);
  SELECT public.automation_prepare_github_issue(
    alice,gen_random_uuid(),repeat('e',64),repeat('f',100),repeat('c',24)) INTO r;
  IF r->>'reason'<>'pending_limit' THEN RAISE EXCEPTION '3-pending limit bypassed: %',r; END IF;

  SELECT public.automation_claim_github_issue(alice,d1,v) INTO r;
  IF r->>'ok'<>'true' OR r->>'state'<>'submitting' THEN RAISE EXCEPTION 'owner approved claim refused'; END IF;
  IF EXISTS(SELECT 1 FROM public.automation_github_issue_drafts
    WHERE id=d1 AND (payload_ciphertext IS NOT NULL OR payload_nonce IS NOT NULL)) THEN
    RAISE EXCEPTION 'claimed issue retained encrypted draft payload';
  END IF;
  SELECT public.automation_claim_github_issue(alice,d1,v) INTO r;
  IF r->>'reason'<>'not_pending' THEN RAISE EXCEPTION 'claimed draft was resubmittable'; END IF;
  SELECT public.automation_claim_github_issue(alice,d2,v) INTO r;
  IF r->>'reason'<>'issue_in_flight' THEN
    RAISE EXCEPTION 'concurrent external write accepted';
  END IF;
  SELECT public.automation_finish_github_issue(
    bob,d1,'succeeded',42,'https://github.com/octocat/Hello-World/issues/42',NULL) INTO r;
  IF r->>'reason'<>'stale_submission' THEN RAISE EXCEPTION 'cross-owner finish accepted'; END IF;
  SELECT public.automation_finish_github_issue(
    alice,d1,'succeeded',42,'https://evil.example/issues/42',NULL) INTO r;
  IF r->>'reason'<>'invalid_result' THEN RAISE EXCEPTION 'external result redirect accepted'; END IF;
  SELECT public.automation_finish_github_issue(
    alice,d1,'succeeded',42,'https://github.com/octocat/Hello-World/issues/42',NULL) INTO r;
  IF r->>'ok'<>'true' OR r->>'status'<>'succeeded' THEN
    RAISE EXCEPTION 'verified external write could not be confirmed: %',r;
  END IF;
  SELECT public.automation_finish_github_issue(
    alice,d1,'succeeded',42,'https://github.com/octocat/Hello-World/issues/42',NULL) INTO r;
  IF r->>'reason'<>'stale_submission' THEN RAISE EXCEPTION 'issue finish replay accepted'; END IF;

  SELECT public.automation_claim_github_issue(alice,d2,v) INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'second issue claim refused'; END IF;
  SELECT public.automation_finish_github_issue(
    alice,d2,'failed',NULL,NULL,'github_forbidden') INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'GitHub forbidden outcome was not audited'; END IF;
  SELECT public.automation_claim_github_issue(alice,d3,v) INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'third issue claim refused'; END IF;
  SELECT public.automation_finish_github_issue(
    alice,d3,'uncertain',NULL,NULL,'network_uncertain') INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'uncertain write outcome was not audited'; END IF;

  SELECT public.automation_prepare_github_issue(
    alice,gen_random_uuid(),repeat('e',64),repeat('f',100),repeat('c',24)) INTO r;
  d4:=(r->>'draft_id')::uuid;
  PERFORM public.automation_mark_github_issue_previewed(alice,d4,v);
  SELECT public.automation_claim_github_issue(alice,d4,v) INTO r;
  IF r->>'reason'<>'write_limit' THEN
    RAISE EXCEPTION '3/day external write budget bypassed: %',r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.automation_github_issue_drafts
    WHERE id=d4 AND status<>'pending') THEN
    RAISE EXCEPTION 'rejected quota unexpectedly consumed the draft';
  END IF;

  -- Rotating tokens changes connection version and disables all new writes.
  SELECT public.automation_connect_github_issues(
    alice,'octocat','Hello-World','octocat',repeat('d',200),repeat('e',24)) INTO r;
  IF (r->>'version')::int<=v OR r->>'enabled'<>'false' THEN
    RAISE EXCEPTION 'token rotation was not disabled and version fenced';
  END IF;
  PERFORM public.automation_toggle_github_issues(alice,true);
  SELECT public.automation_claim_github_issue(alice,d4,v) INTO r;
  IF r->>'reason'<>'connection_changed' THEN
    RAISE EXCEPTION 'old token draft was approved after key rotation';
  END IF;
  SELECT public.automation_reject_github_issue(bob,d4) INTO r;
  IF r->>'reason'<>'not_pending' THEN
    RAISE EXCEPTION 'other user rejected sensitive draft';
  END IF;
  SELECT public.automation_reject_github_issue(alice,d4) INTO r;
  IF r->>'status'<>'rejected' THEN RAISE EXCEPTION 'draft rejection failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.automation_github_issue_drafts
    WHERE id=d4 AND payload_ciphertext IS NOT NULL) THEN
    RAISE EXCEPTION 'rejected draft retained ciphertext';
  END IF;
  SELECT public.automation_prepare_github_issue(
    alice,gen_random_uuid(),repeat('f',64),repeat('f',100),repeat('c',24)) INTO r;
  stale:=(r->>'draft_id')::uuid;
  UPDATE public.automation_github_issue_drafts
    SET created_at=now()-interval '23 hours',
      expires_at=now()-interval '1 second'
    WHERE id=stale;
  SELECT public.automation_housekeep_github_issues(alice) INTO r;
  IF (r->>'expired')::int<1 THEN RAISE EXCEPTION '24h expiry was not processed'; END IF;
  IF EXISTS(SELECT 1 FROM public.automation_github_issue_drafts
     WHERE id=stale AND (status<>'expired' OR payload_ciphertext IS NOT NULL)) THEN
    RAISE EXCEPTION 'expired draft retained private input';
  END IF;
  SELECT public.automation_prepare_github_issue(
    alice,gen_random_uuid(),repeat('f',64),repeat('f',100),repeat('c',24)) INTO r;
  d5:=(r->>'draft_id')::uuid;
  IF d5 IS NULL THEN RAISE EXCEPTION 'pending disconnect fixture failed'; END IF;
  SELECT public.automation_disconnect_github_issues(bob) INTO r;
  IF r->>'disconnected'<>'false' THEN RAISE EXCEPTION 'Bob disconnected Alice'; END IF;
  SELECT public.automation_disconnect_github_issues(alice) INTO r;
  IF r->>'disconnected'<>'true' OR
    EXISTS(SELECT 1 FROM public.automation_github_issue_connections WHERE user_id=alice) THEN
    RAISE EXCEPTION 'owner token not erased on disconnect';
  END IF;
  IF (SELECT status FROM public.automation_github_issue_drafts WHERE id=d5)<>'rejected' OR
     EXISTS(SELECT 1 FROM public.automation_github_issue_drafts
       WHERE id=d5 AND payload_ciphertext IS NOT NULL) THEN
    RAISE EXCEPTION 'pending draft survived credential disconnect';
  END IF;
  -- Reconnect could restart the connection version at 1. Stale draft must
  -- remain one-way rejected even if new connection points to the same repo.
  SELECT public.automation_connect_github_issues(
    alice,'octocat','Hello-World','octocat',repeat('a',200),repeat('b',24)) INTO r;
  PERFORM public.automation_toggle_github_issues(alice,true);
  SELECT public.automation_claim_github_issue(alice,d5,(r->>'version')::int) INTO r;
  IF r->>'reason'<>'not_pending' THEN
    RAISE EXCEPTION 'stale draft reauthorized across disconnect/reconnect';
  END IF;
  PERFORM public.automation_disconnect_github_issues(alice);
  -- Previous approved attempts must survive disconnect for owner audit.
  IF (SELECT count(*) FROM public.automation_github_issue_drafts
      WHERE user_id=alice AND status IN ('succeeded','failed','uncertain'))<>3 THEN
    RAISE EXCEPTION 'disconnect erased previously committed audit';
  END IF;
  UPDATE public.automation_github_issue_drafts
    SET created_at=now()-interval '8 days',
      expires_at=now()-interval '7 days'
    WHERE id=d1;
  SELECT public.automation_housekeep_github_issues(bob) INTO r;
  IF r->>'deleted'<>'0' THEN RAISE EXCEPTION 'Bob erased Alice audit'; END IF;
  SELECT public.automation_housekeep_github_issues(alice) INTO r;
  IF (r->>'deleted')::int<1 OR
    EXISTS(SELECT 1 FROM public.automation_github_issue_drafts WHERE id=d1) THEN
    RAISE EXCEPTION '7-day owner audit cleanup failed';
  END IF;
  RAISE NOTICE 'GitHub issues: encrypted disabled connections, approval claims, quotas, idempotency, uncertain outcomes and tenant isolation verified';
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated','public.automation_github_issue_connections','SELECT')
    OR has_table_privilege('anon','public.automation_github_issue_connections','SELECT')
    OR has_table_privilege('authenticated','public.automation_github_issue_drafts','SELECT')
    OR has_table_privilege('anon','public.automation_github_issue_drafts','INSERT')
    OR has_function_privilege('authenticated',
      'public.automation_claim_github_issue(uuid,uuid,integer)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.automation_connect_github_issues(uuid,text,text,text,text,text)','EXECUTE')
    OR has_function_privilege('anon',
      'public.automation_finish_github_issue(uuid,uuid,text,integer,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'browser gained privileged GitHub credential or external write RPC access';
  END IF;
END;
$$;
