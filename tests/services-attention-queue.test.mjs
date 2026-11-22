import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('admin attention view is security-invoker and not a customer data exposure', async () => {
  const sql = await read('supabase/migrations/20261122235500_service_admin_attention_queue.sql');
  assert.match(sql, /CREATE OR REPLACE VIEW public\.service_admin_attention_queue/);
  assert.match(sql, /WITH \(security_invoker = true\)/);
  assert.match(sql, /WHERE \(SELECT public\.is_admin\(\)\)/);
  assert.match(sql, /REVOKE ALL ON public\.service_admin_attention_queue FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.service_admin_attention_queue TO authenticated/);
  assert.doesNotMatch(sql, /SECURITY DEFINER|GRANT (UPDATE|INSERT|DELETE) ON public\.service_admin_attention_queue/);
  assert.match(sql, /FROM public\.service_request_triage t|JOIN public\.service_request_triage t/);
});

test('follow-up signals use confirmed activity, not fabricated or unread claims', async () => {
  const sql = await read('supabase/migrations/20261122235500_service_admin_attention_queue.sql');
  assert.match(sql, /FROM public\.service_request_activity a/);
  assert.match(sql, /FROM public\.service_scope_responses s/);
  assert.match(sql, /FROM public\.service_scope_reviews v/);
  assert.match(sql, /q\.last_customer_activity_at > q\.last_admin_activity_at/);
  assert.match(sql, /q\.status = 'submitted'/);
  assert.match(sql, /AS needs_follow_up/);
  assert.match(sql, /AS priority_rank/);
  assert.match(sql, /service_request_activity_customer_message_idx/);
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(admin, /Follow-up includes actual customer messages, scope responses and clarification answers/);
  assert.match(admin, /Needs follow-up/);
  assert.match(admin, /new Date\(item\.last_customer_activity_at\)\.toLocaleString\(\)/);
});

test('admin filters priority, owner assignment, and follow-up on the server', async () => {
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(admin, /from\('service_admin_followup_queue'\)/);
  assert.match(admin, /if \(priorityFilter !== 'all'\) query = query\.eq\('priority', priorityFilter\)/);
  assert.match(admin, /query\.eq\('assigned_admin_id', user\.id\)/);
  assert.match(admin, /query\.is\('assigned_admin_id', null\)/);
  assert.match(admin, /query\.eq\('needs_follow_up_extended', true\)/);
  assert.match(admin, /query\.order\('priority_rank', \{ ascending: false \}\)/);
  assert.match(admin, /query\.order\('last_customer_activity_at', \{ ascending: false, nullsFirst: false \}\)/);
  assert.match(admin, /\.range\(page \* PAGE_SIZE, \(page \+ 1\) \* PAGE_SIZE - 1\)/);
  assert.match(admin, /count: 'exact'/);
  assert.match(admin, /setPage\(0\)/);
  assert.doesNotMatch(admin, /limit\(250\)|mockRows|Math\.random/);
});

test('admin auth cache is tied to authenticated user ID and stale fetch results ignored', async () => {
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(admin, /const authorized = !!user && authorizedFor === user\.id/);
  assert.match(admin, /setAuthorizedFor\(null\)/);
  assert.match(admin, /setRows\(\[\]\)/);
  assert.match(admin, /setDrafts\(\{\}\)/);
  assert.match(admin, /supabase\.rpc\('is_admin'\)/);
  assert.match(admin, /const generation = \+\+fetchGeneration\.current/);
  assert.match(admin, /if \(generation !== fetchGeneration\.current\) return/);
  assert.match(admin, /return \(\) => \{ active = false; fetchGeneration\.current \+= 1; \}/);
});

test('privileged updates still hit original request table, and triage saves refresh queue', async () => {
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  const triage = await read('src/components/services/ServiceTriagePanel.tsx');
  assert.match(admin, /\.from\('service_requests'\)/);
  assert.match(admin, /\.eq\('updated_at', item\.updated_at\)/);
  assert.match(admin, /<ServiceTriagePanel requestId=\{item\.id\} onSaved=\{\(\) => \{ void load\(\); void loadQueueCounts\(\); \}\}/);
  assert.match(triage, /onSaved\?: \(\) => void/);
  assert.match(triage, /onSaved\?\.\(\)/);
  assert.match(admin, /disabled=\{value === 'in_progress' \|\| value === 'completed'\}/);
  assert.match(admin, /ServiceScopeReview/);
});
