import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('immutable original brief and owner-scoped append-only amendments have strict grants', async () => {
  const sql = await read('supabase/migrations/20261123040000_service_brief_amendments.sql');
  assert.match(sql, /CREATE TABLE public\.service_brief_amendments/);
  assert.match(sql, /request_id uuid NOT NULL REFERENCES public\.service_requests\(id\) ON DELETE CASCADE/);
  assert.match(sql, /author_id uuid NOT NULL REFERENCES auth\.users\(id\)/);
  assert.match(sql, /category IN \('scope', 'requirements', 'timeframe', 'constraints', 'other'\)/);
  assert.match(sql, /char_length\(btrim\(summary\)\) BETWEEN 10 AND 160/);
  assert.match(sql, /char_length\(btrim\(details\)\) BETWEEN 30 AND 2500/);
  assert.match(sql, /ALTER TABLE public\.service_brief_amendments ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.service_brief_amendments FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT INSERT \(request_id, author_id, category, summary, details\)/);
  assert.match(sql, /GRANT UPDATE \(status\)/);
  assert.match(sql, /service_brief_amendments_owner_insert/);
  assert.match(sql, /r\.user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /author_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /service_brief_amendments_admin_review/);
  assert.doesNotMatch(sql, /GRANT (DELETE|UPDATE \((summary|details|category|created_at))/);
  assert.doesNotMatch(sql, /UPDATE public\.service_requests|ALTER TABLE public\.service_requests/);
});

test('review state is one-way and stamped by server with actual administrator actor', async () => {
  const sql = await read('supabase/migrations/20261123040000_service_brief_amendments.sql');
  assert.match(sql, /status IN \('pending','reviewed'\)/);
  assert.match(sql, /service_brief_amendment_review_consistency/);
  assert.match(sql, /status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL/);
  assert.match(sql, /status = 'reviewed' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL/);
  assert.match(sql, /FUNCTION eternyx_private\.stamp_service_brief_review\(\)/);
  assert.match(sql, /SECURITY INVOKER SET search_path = ''/);
  assert.match(sql, /OLD\.status <> 'pending' OR NEW\.status <> 'reviewed'/);
  assert.match(sql, /NOT \(SELECT public\.is_admin\(\)\)/);
  assert.match(sql, /NEW\.reviewed_at := pg_catalog\.clock_timestamp\(\)/);
  assert.match(sql, /NEW\.reviewed_by := auth\.uid\(\)/);
  assert.match(sql, /BEFORE UPDATE OF status ON public\.service_brief_amendments/);
  assert.match(sql, /REVOKE ALL ON FUNCTION eternyx_private\.stamp_service_brief_review\(\)/);
});

test('repeat owner amendment submission is serialized, rate limited and duplicate guarded', async () => {
  const sql = await read('supabase/migrations/20261123040000_service_brief_amendments.sql');
  assert.match(sql, /guard_service_brief_amendment_burst\(\)/);
  assert.match(sql, /NEW\.author_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(sql, /pg_catalog\.hashtextextended/);
  assert.match(sql, /interval '10 minutes'/);
  assert.match(sql, /\) >= 4 THEN/);
  assert.match(sql, /interval '5 minutes'/);
  assert.match(sql, /pg_catalog\.lower\(pg_catalog\.btrim\(a\.summary\)\)/);
  assert.match(sql, /pg_catalog\.lower\(pg_catalog\.btrim\(a\.details\)\)/);
  assert.match(sql, /BEFORE INSERT ON public\.service_brief_amendments/);
  assert.match(sql, /REVOKE ALL ON FUNCTION eternyx_private\.guard_service_brief_amendment_burst\(\)/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
});

test('customer and admin views retain secure previous queues and reflect real review work', async () => {
  const sql = await read('supabase/migrations/20261123040000_service_brief_amendments.sql');
  assert.match(sql, /CREATE VIEW public\.service_customer_amendment_queue/);
  assert.match(sql, /CREATE VIEW public\.service_admin_amendment_queue/);
  assert.match(sql, /WITH \(security_invoker = true\)/);
  assert.match(sql, /FROM public\.service_customer_followup_queue q/);
  assert.match(sql, /FROM public\.service_admin_followup_queue q/);
  assert.match(sql, /count\(\*\) FILTER \(WHERE status = 'pending'\)/);
  assert.match(sql, /max\(reviewed_at\) AS last_amendment_reviewed_at/);
  assert.match(sql, /max\(created_at\) AS last_amendment_submitted_at/);
  assert.match(sql, /q\.has_updates_since_check_extended/);
  assert.match(sql, /q\.needs_my_check_extended/);
  assert.match(sql, /q\.needs_follow_up_extended OR a\.pending_amendment_count > 0/);
  assert.match(sql, /AS needs_follow_up_complete/);
  assert.match(sql, /WHERE \(SELECT public\.is_admin\(\)\)/);
  assert.match(sql, /REVOKE ALL ON public\.service_admin_amendment_queue FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON public\.service_customer_amendment_queue FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY|CREATE POLICY.*TO anon/);
});

test('component loads real history and does not leak old account data or drafts', async () => {
  const ui = await read('src/components/services/ServiceBriefAmendments.tsx');
  assert.match(ui, /viewerKey = requestId \+ ':'/);
  assert.match(ui, /viewerKeyRef\.current = viewerKey/);
  assert.match(ui, /const seq = \+\+generation\.current/);
  assert.match(ui, /if \(generation\.current !== seq\) return/);
  assert.match(ui, /loadedKey === viewerKey \? items : \[\]/);
  assert.match(ui, /setLoadedKey\(null\)/);
  assert.match(ui, /setSummary\(''\)/);
  assert.match(ui, /setDetails\(''\)/);
  assert.match(ui, /setBusy\(null\)/);
  assert.match(ui, /from\('service_brief_amendments'\)/);
  assert.match(ui, /\.eq\('request_id', requestId\)/);
  assert.match(ui, /count: 'exact'/);
  assert.match(ui, /\.limit\(limit\)/);
  assert.match(ui, /Load older brief changes/);
  assert.match(ui, /Original request text remains unchanged/);
  assert.doesNotMatch(ui, /localStorage\.setItem|from\('service_requests'\)\.update/);
});

test('owner can submit immutable change; only a verified admin can acknowledge once', async () => {
  const ui = await read('src/components/services/ServiceBriefAmendments.tsx');
  assert.match(ui, /supabase\.auth\.getUser\(\)/);
  assert.match(ui, /verifiedActor|verifyActor/);
  assert.match(ui, /user\.id !== ownerId/);
  assert.match(ui, /supabase\.rpc\('is_admin'\)/);
  assert.match(ui, /authorized !== true/);
  assert.match(ui, /cleanSummary\.length < 10/);
  assert.match(ui, /cleanDetails\.length < 30/);
  assert.match(ui, /\.insert\(\{ request_id: requestId, author_id: actor, category, summary: cleanSummary, details: cleanDetails \}\)/);
  assert.match(ui, /\.update\(\{ status: 'reviewed' \}\)/);
  assert.match(ui, /\.eq\('request_id', requestId\)\.eq\('status', 'pending'\)/);
  assert.match(ui, /\.select\('id'\)\.maybeSingle\(\)/);
  assert.match(ui, /viewerKeyRef\.current !== viewerKey/);
  assert.match(ui, /Mark reviewed/);
  assert.match(ui, /not approve a scope, price or delivery/);
  assert.match(ui, /onChanged\?\.\(\)/);
});

test('owner and admin request lists expose actual amendment tasks and review activity', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(owner, /from\('service_customer_amendment_queue'\)/);
  assert.match(owner, /query\.eq\('has_updates_since_check_complete', true\)/);
  assert.match(owner, /has_updates_since_check_complete: boolean/);
  assert.match(owner, /pending_amendment_count > 0/);
  assert.match(owner, /<ServiceBriefAmendments requestId=\{visibleLinkedRequest\.id\} ownerId=\{user\.id\}/);
  assert.match(owner, /<ServiceBriefAmendments requestId=\{item\.id\} ownerId=\{user\.id\}/);
  assert.match(owner, /setOpenAmendments\(null\)/);
  assert.match(admin, /from\('service_admin_amendment_queue'\)/);
  assert.match(admin, /if \(pendingAmendmentsOnly\) query = query\.gt\('pending_amendment_count', 0\)/);
  assert.match(admin, /query\.eq\('needs_follow_up_complete', true\)/);
  assert.match(admin, /query\.eq\('needs_my_check_complete', true\)/);
  assert.match(admin, /Brief changes to review:/);
  assert.match(admin, /<ServiceBriefAmendments requestId=\{item\.id\} ownerId=\{item\.user_id\} isAdmin/);
  assert.match(admin, /setPendingAmendmentsOnly\(false\)/);
  assert.match(admin, /setOpenAmendments\(null\)/);
});

test('typed view fields and documented release gate are explicit', async () => {
  const types = await read('src/integrations/supabase/types.ts');
  const docs = await read('docs/ETERNYX_SERVICES_BRIEF_AMENDMENTS_PHASE13.md');
  for (const name of ['service_brief_amendments','service_customer_amendment_queue','service_admin_amendment_queue']) {
    assert.ok(types.includes(name), name + ' missing');
  }
  assert.match(types, /has_updates_since_check_complete: boolean/);
  assert.match(types, /needs_my_check_complete: boolean/);
  assert.match(types, /needs_follow_up_complete: boolean/);
  assert.match(types, /pending_amendment_count: number/);
  assert.match(docs, /not deployed/i);
  assert.match(docs, /customer A.*customer B.*administrator/i);
  assert.match(docs, /four per ten minutes/i);
  assert.match(docs, /not a contract/i);
});
