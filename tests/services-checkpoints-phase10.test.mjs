import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('check-in table is user-owned with strict column permissions and RLS', async () => {
  const sql = await read('supabase/migrations/20261123014500_service_request_checkpoints.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.service_request_checks/);
  assert.match(sql, /PRIMARY KEY \(request_id, user_id\)/);
  assert.match(sql, /REFERENCES public\.service_requests\(id\) ON DELETE CASCADE/);
  assert.match(sql, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /ALTER TABLE public\.service_request_checks ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.service_request_checks FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT INSERT \(request_id, user_id\)/);
  assert.match(sql, /GRANT UPDATE \(checked_at\)/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.service_request_checks TO authenticated/);
  assert.match(sql, /user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /r\.user_id = \(SELECT auth\.uid\(\)\) OR \(SELECT public\.is_admin\(\)\)/);
  assert.match(sql, /FOR SELECT TO authenticated/);
  assert.match(sql, /FOR INSERT TO authenticated/);
  assert.match(sql, /FOR UPDATE TO authenticated/);
  assert.doesNotMatch(sql, /GRANT DELETE|DISABLE ROW LEVEL SECURITY|FOR ALL TO public/);
});

test('timestamps are server-owned, and the only advertised RPC is security invoker', async () => {
  const sql = await read('supabase/migrations/20261123014500_service_request_checkpoints.sql');
  assert.match(sql, /eternyx_private\.touch_service_request_check\(\)/);
  assert.match(sql, /NEW\.checked_at := pg_catalog\.clock_timestamp\(\)/);
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.service_request_checks/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.mark_service_request_checked\(p_request_id uuid\)/);
  assert.match(sql, /LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''/);
  assert.match(sql, /v_actor uuid := auth\.uid\(\)/);
  assert.match(sql, /p_request_id IS NULL/);
  assert.match(sql, /r\.id = p_request_id/);
  assert.match(sql, /r\.user_id = v_actor OR \(SELECT public\.is_admin\(\)\)/);
  assert.match(sql, /ON CONFLICT \(request_id, user_id\) DO UPDATE/);
  assert.match(sql, /RETURNING checked_at INTO v_checked_at/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.mark_service_request_checked\(uuid\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.mark_service_request_checked\(uuid\)/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
});

test('owner view is RLS invoker and detects only real admin updates or scopes', async () => {
  const sql = await read('supabase/migrations/20261123014500_service_request_checkpoints.sql');
  assert.match(sql, /CREATE OR REPLACE VIEW public\.service_customer_check_queue/);
  assert.match(sql, /WITH \(security_invoker = true\)/);
  assert.match(sql, /r\.id, r\.user_id, r\.service_key/);
  assert.match(sql, /FROM public\.service_request_activity a/);
  assert.match(sql, /a\.event_type = 'status_changed'/);
  assert.match(sql, /a\.event_type = 'message' AND a\.actor_id IS DISTINCT FROM r\.user_id/);
  assert.match(sql, /FROM public\.service_scope_reviews v/);
  assert.match(sql, /r\.user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /c\.user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /has_updates_since_check/);
  assert.match(sql, /REVOKE ALL ON public\.service_customer_check_queue FROM PUBLIC, anon, authenticated/);
});

test('admin view retains independent follow-up and personal check-in signals', async () => {
  const sql = await read('supabase/migrations/20261123014500_service_request_checkpoints.sql');
  assert.match(sql, /CREATE OR REPLACE VIEW public\.service_admin_check_queue/);
  assert.match(sql, /FROM public\.service_admin_review_queue q/);
  assert.match(sql, /c\.checked_at IS NULL/);
  assert.match(sql, /q\.last_customer_activity_at > c\.checked_at/);
  assert.match(sql, /needs_my_check/);
  assert.match(sql, /WHERE \(SELECT public\.is_admin\(\)\)/);
  assert.match(sql, /REVOKE ALL ON public\.service_admin_check_queue FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.service_admin_check_queue TO authenticated/);
  assert.doesNotMatch(sql, /UPDATE public\.service_requests|UPDATE public\.service_request_triage/);
});

test('customers can filter actual updates and explicitly check their own request', async () => {
  const src = await read('src/pages/MyServiceRequests.tsx');
  assert.match(src, /from\('service_customer_check_queue'\)/);
  assert.match(src, /\.eq\('user_id', userId\)/);
  assert.match(src, /query\.eq\('has_updates_since_check', true\)/);
  assert.match(src, /has_updates_since_check: boolean/);
  assert.match(src, /last_checked_at: string \| null/);
  assert.match(src, /supabase\.rpc\('mark_service_request_checked', \{ p_request_id: id \}\)/);
  assert.match(src, /supabase\.auth\.getUser\(\)/);
  assert.match(src, /useAuthStore\.getState\(\)\.user\?\.id !== userId/);
  assert.match(src, /Mark checked/);
  assert.match(src, /Updates since my check/);
  assert.match(src, /New administrator activity since your last check/);
  assert.match(src, /setUpdatesOnly\(false\)/);
  assert.match(src, /visibleLinkedRequest\.last_checked_at/);
  assert.doesNotMatch(src, /localStorage\.setItem\(/);
});

test('admins can filter personal check-ins separately from workflow follow-up', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(src, /from\('service_admin_check_queue'\)/);
  assert.match(src, /if \(mineCheckOnly\) query = query\.eq\('needs_my_check', true\)/);
  assert.match(src, /if \(attentionOnly\) query = query\.eq\('needs_follow_up', true\)/);
  assert.match(src, /supabase\.rpc\('mark_service_request_checked', \{ p_request_id: id \}\)/);
  assert.match(src, /useAuthStore\.getState\(\)\.user\?\.id !== user\.id/);
  assert.match(src, /const authorized = !!user && authorizedFor === user\.id/);
  assert.match(src, /Needs my check/);
  assert.match(src, /Not checked by you since latest customer activity/);
  assert.match(src, /Personal marker, not a read receipt/);
  assert.match(src, /setMineCheckOnly\(false\)/);
  assert.match(src, /last_checked_at: string \| null/);
});

test('types and documentation describe manual check-ins, not read receipts', async () => {
  const types = await read('src/integrations/supabase/types.ts');
  const doc = await read('docs/ETERNYX_SERVICES_CHECKPOINTS_PHASE10.md');
  for (const name of ['service_request_checks', 'service_customer_check_queue', 'service_admin_check_queue', 'mark_service_request_checked']) {
    assert.ok(types.includes(name), 'Missing typed relation or RPC: ' + name);
  }
  assert.match(doc, /not verified read receipts/i);
  assert.match(doc, /real customer A.*customer B.*admin/i);
  assert.match(doc, /migration.*not deployed/i);
});
