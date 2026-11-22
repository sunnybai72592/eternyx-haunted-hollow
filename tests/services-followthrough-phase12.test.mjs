import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('customer follow-through view inherits secured owner queue and tracks clarification changes', async () => {
  const sql = await read('supabase/migrations/20261123031500_service_clarification_followthrough.sql');
  assert.match(sql, /CREATE OR REPLACE VIEW public\.service_customer_followup_queue/);
  assert.match(sql, /WITH \(security_invoker = true\)/);
  assert.match(sql, /FROM public\.service_customer_clarification_queue q/);
  assert.match(sql, /q\.has_updates_since_check OR/);
  assert.match(sql, /max\(c\.created_at\), max\(c\.closed_at\)/);
  assert.match(sql, /q\.last_checked_at IS NULL OR recent\.last_clarification_activity_at > q\.last_checked_at/);
  assert.match(sql, /clarification_changes_since_check/);
  assert.match(sql, /count\(\*\) FILTER/);
  assert.match(sql, /REVOKE ALL ON public\.service_customer_followup_queue FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.service_customer_followup_queue TO authenticated/);
  assert.doesNotMatch(sql, /CREATE POLICY.*TO anon|DISABLE ROW LEVEL SECURITY/);
});

test('admin follow-through preserves original signals and includes saved customer answers', async () => {
  const sql = await read('supabase/migrations/20261123031500_service_clarification_followthrough.sql');
  assert.match(sql, /CREATE OR REPLACE VIEW public\.service_admin_followup_queue/);
  assert.match(sql, /FROM public\.service_admin_clarification_queue q/);
  assert.match(sql, /FROM public\.service_clarification_answers a/);
  assert.match(sql, /question\.request_id = q\.id/);
  assert.match(sql, /max\(a\.created_at\) AS last_customer_answer_at/);
  assert.match(sql, /q\.needs_my_check OR/);
  assert.match(sql, /q\.last_checked_at IS NULL OR answers\.last_customer_answer_at > q\.last_checked_at/);
  assert.match(sql, /q\.needs_follow_up OR q\.awaiting_admin_review_count > 0/);
  assert.match(sql, /AS needs_follow_up_extended/);
  assert.match(sql, /customer_answers_since_check/);
  assert.match(sql, /WHERE \(SELECT public\.is_admin\(\)\)/);
  assert.match(sql, /REVOKE ALL ON public\.service_admin_followup_queue FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.service_admin_followup_queue TO authenticated/);
});

test('question burst throttle is serialized, bounded, duplicate-aware and private', async () => {
  const sql = await read('supabase/migrations/20261123031500_service_clarification_followthrough.sql');
  assert.match(sql, /CREATE INDEX IF NOT EXISTS service_clarification_admin_burst_lookup_idx/);
  assert.match(sql, /guard_service_clarification_question_burst\(\)/);
  assert.match(sql, /SECURITY INVOKER SET search_path = ''/);
  assert.match(sql, /NEW\.author_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(sql, /NOT \(SELECT public\.is_admin\(\)\)/);
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(sql, /pg_catalog\.hashtextextended/);
  assert.match(sql, /created_at >= pg_catalog\.clock_timestamp\(\) - interval '60 seconds'/);
  assert.match(sql, /\) >= 6 THEN/);
  assert.match(sql, /created_at >= pg_catalog\.clock_timestamp\(\) - interval '90 seconds'/);
  assert.match(sql, /pg_catalog\.lower\(pg_catalog\.btrim\(q\.prompt\)\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION eternyx_private\.guard_service_clarification_question_burst\(\)/);
  assert.match(sql, /BEFORE INSERT ON public\.service_clarification_questions/);
  assert.doesNotMatch(sql, /SECURITY DEFINER|GRANT EXECUTE ON FUNCTION eternyx_private/);
});

test('owner desk filters persisted activity including new and closed clarifications', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  assert.match(owner, /from\('service_customer_amendment_queue'\)/);
  assert.match(owner, /query\.eq\('has_updates_since_check_complete', true\)/);
  assert.match(owner, /has_updates_since_check_extended: boolean/);
  assert.match(owner, /last_clarification_activity_at: string \| null/);
  assert.match(owner, /clarification_changes_since_check: number/);
  assert.match(owner, /item\.has_updates_since_check_complete/);
  assert.match(owner, /visibleLinkedRequest\.has_updates_since_check_complete/);
  assert.match(owner, /clarification item\(s\) created or closed since your last check/);
  assert.match(owner, /Activity since my check/);
  assert.match(owner, /supabase\.rpc\('mark_service_request_checked'/);
  assert.match(owner, /clarification_changes_since_check: 0/);
  assert.match(owner, /if \(page > 0 && page \* 20 >= size\).*setLoading\(false\)/);
  assert.doesNotMatch(owner, /localStorage\.setItem/);
});

test('admin desk filters real customer replies in the personal and attention queues', async () => {
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(admin, /from\('service_admin_amendment_queue'\)/);
  assert.match(admin, /if \(attentionOnly\) query = query\.eq\('needs_follow_up_complete', true\)/);
  assert.match(admin, /if \(mineCheckOnly\) query = query\.eq\('needs_my_check_complete', true\)/);
  assert.match(admin, /needs_my_check_extended: boolean/);
  assert.match(admin, /needs_follow_up_extended: boolean/);
  assert.match(admin, /customer_answers_since_check: number/);
  assert.match(admin, /item\.customer_answers_since_check > 0/);
  assert.match(admin, /item\.needs_follow_up_complete/);
  assert.match(admin, /item\.needs_my_check_complete/);
  assert.match(admin, /customer clarification answer\(s\) since your check/);
  assert.match(admin, /awaiting_admin_review_count > 0/);
  assert.match(admin, /supabase\.rpc\('mark_service_request_checked'/);
  assert.match(admin, /verified/);
});

test('clarification forms explain actual duplicate/rate limits and clear account-scoped pending state', async () => {
  const ui = await read('src/components/services/ServiceClarifications.tsx');
  assert.match(ui, /setBusy\(null\)/);
  assert.match(ui, /if \(viewerKeyRef\.current === viewerKey\) setBusy\(null\)/);
  assert.match(ui, /already submitted recently/i);
  assert.match(ui, /Too many clarification questions/);
  assert.match(ui, /about a minute/);
  assert.match(ui, /viewerKeyRef\.current !== viewerKey/);
  assert.match(ui, /supabase\.auth\.getUser\(\)/);
  assert.match(ui, /verified\.id !== ownerId/);
  assert.match(ui, /supabase\.rpc\('is_admin'\)/);
});

test('Phase 12 view types preserve all existing queue columns', async () => {
  const types = await read('src/integrations/supabase/types.ts');
  assert.match(types, /service_customer_followup_queue: \{/);
  assert.match(types, /service_admin_followup_queue: \{/);
  assert.match(types, /last_clarification_activity_at: string \| null/);
  assert.match(types, /has_updates_since_check_extended: boolean/);
  assert.match(types, /last_customer_answer_at: string \| null/);
  assert.match(types, /needs_my_check_extended: boolean/);
  assert.match(types, /needs_follow_up_extended: boolean/);
  assert.match(types, /customer_answers_since_check: number/);
  assert.match(types, /service_customer_clarification_queue: \{/);
  assert.match(types, /service_admin_clarification_queue: \{/);
});

test('release plan requires real multi-account testing and does not claim migration deployed', async () => {
  const docs = await read('docs/ETERNYX_SERVICES_FOLLOWTHROUGH_PHASE12.md');
  assert.match(docs, /not deployed/i);
  assert.match(docs, /customer A.*customer B.*administrator/i);
  assert.match(docs, /security-invoker/i);
  assert.match(docs, /six per minute/i);
  assert.match(docs, /not read receipts/i);
});
