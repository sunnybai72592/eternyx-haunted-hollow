import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('admin questions are private, bounded and changeable only by verified admins', async () => {
  const sql = await read('supabase/migrations/20261123023000_service_clarifications.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.service_clarification_questions/);
  assert.match(sql, /REFERENCES public\.service_requests\(id\) ON DELETE CASCADE/);
  assert.match(sql, /char_length\(btrim\(prompt\)\) BETWEEN 15 AND 1500/);
  assert.match(sql, /state IN \('open','closed'\)/);
  assert.match(sql, /closed_at timestamptz/);
  assert.match(sql, /closed_by uuid REFERENCES auth\.users\(id\)/);
  assert.match(sql, /service_clarification_close_consistency/);
  assert.match(sql, /ALTER TABLE public\.service_clarification_questions ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.service_clarification_questions FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT INSERT \(request_id, author_id, prompt\)/);
  assert.match(sql, /GRANT UPDATE \(state\)/);
  assert.match(sql, /service_clarification_question_create_admin/);
  assert.match(sql, /author_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /AND \(SELECT public\.is_admin\(\)\)/);
  assert.match(sql, /service_clarification_question_close_admin/);
  assert.doesNotMatch(sql, /GRANT DELETE ON public\.service_clarification_questions/);
});

test('closure records a real actor and server time, and cannot be reopened', async () => {
  const sql = await read('supabase/migrations/20261123023000_service_clarifications.sql');
  assert.match(sql, /FUNCTION eternyx_private\.close_service_clarification\(\)/);
  assert.match(sql, /SECURITY INVOKER SET search_path = ''/);
  assert.match(sql, /OLD\.state <> 'open' OR NEW\.state <> 'closed'/);
  assert.match(sql, /NEW\.closed_at := pg_catalog\.clock_timestamp\(\)/);
  assert.match(sql, /NEW\.closed_by := auth\.uid\(\)/);
  assert.match(sql, /BEFORE UPDATE OF state ON public\.service_clarification_questions/);
  assert.match(sql, /REVOKE ALL ON FUNCTION eternyx_private\.close_service_clarification\(\)/);
});

test('customer answers are immutable, unique per question, and owner-scoped', async () => {
  const sql = await read('supabase/migrations/20261123023000_service_clarifications.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.service_clarification_answers/);
  assert.match(sql, /question_id uuid NOT NULL UNIQUE REFERENCES public\.service_clarification_questions\(id\) ON DELETE CASCADE/);
  assert.match(sql, /char_length\(btrim\(answer\)\) BETWEEN 10 AND 2500/);
  assert.match(sql, /ALTER TABLE public\.service_clarification_answers ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.service_clarification_answers FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.service_clarification_answers TO authenticated/);
  assert.match(sql, /GRANT INSERT \(question_id, author_id, answer\)/);
  assert.match(sql, /service_clarification_answer_create_owner/);
  assert.match(sql, /q\.state = 'open'/);
  assert.match(sql, /r\.user_id = \(SELECT auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /GRANT (UPDATE|DELETE) ON public\.service_clarification_answers/);
});

test('clarification queues contain actual unanswered and answered-open counts behind invoker RLS', async () => {
  const sql = await read('supabase/migrations/20261123023000_service_clarifications.sql');
  assert.match(sql, /CREATE OR REPLACE VIEW public\.service_customer_clarification_queue/);
  assert.match(sql, /FROM public\.service_customer_check_queue q/);
  assert.match(sql, /CREATE OR REPLACE VIEW public\.service_admin_clarification_queue/);
  assert.match(sql, /FROM public\.service_admin_check_queue q/);
  assert.match(sql, /WITH \(security_invoker = true\)/);
  assert.match(sql, /COUNT\(\*\) FILTER \(WHERE c\.state = 'open'\)/);
  assert.match(sql, /c\.state = 'open' AND a\.id IS NULL/);
  assert.match(sql, /c\.state = 'open' AND a\.id IS NOT NULL/);
  assert.match(sql, /awaiting_customer_count/);
  assert.match(sql, /awaiting_admin_review_count/);
  assert.match(sql, /WHERE \(SELECT public\.is_admin\(\)\)/);
  assert.match(sql, /REVOKE ALL ON public\.service_admin_clarification_queue FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON public\.service_customer_clarification_queue FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /SECURITY DEFINER|DISABLE ROW LEVEL SECURITY/);
});

test('workspace fetches owned questions and answers with page limits and session isolation', async () => {
  const ui = await read('src/components/services/ServiceClarifications.tsx');
  assert.match(ui, /const viewerKey = requestId \+ ':'/);
  assert.match(ui, /const visibleQuestions = loadedKey === viewerKey && viewerId \? questions : \[\]/);
  assert.match(ui, /const visibleAnswers = loadedKey === viewerKey && viewerId \? answers : \[\]/);
  assert.match(ui, /const seq = \+\+generation\.current/);
  assert.match(ui, /if \(seq !== generation\.current\) return/);
  assert.match(ui, /return \(\) => \{ generation\.current \+= 1; \}/);
  assert.match(ui, /\.from\('service_clarification_questions'\)/);
  assert.match(ui, /\.from\('service_clarification_answers'\)/);
  assert.match(ui, /\.eq\('request_id', requestId\)/);
  assert.match(ui, /count: 'exact'/);
  assert.match(ui, /\.limit\(limit\)/);
  assert.match(ui, /setLimit\(\(current\) => current \+ PAGE_SIZE\)/);
  assert.match(ui, /setAnswerDrafts\(\{\}\)/);
  assert.match(ui, /setQuestionDraft\(''\)/);
  assert.match(ui, /onChanged\?\.\(\)/);
});

test('actions verify authenticated owner/admin and record only confirmed database writes', async () => {
  const ui = await read('src/components/services/ServiceClarifications.tsx');
  assert.match(ui, /supabase\.auth\.getUser\(\)/);
  assert.match(ui, /verified\.id !== viewerId/);
  assert.match(ui, /viewerKeyRef\.current !== viewerKey/);
  assert.match(ui, /supabase\.rpc\('is_admin'\)/);
  assert.match(ui, /verified\.id !== ownerId/);
  assert.match(ui, /if \(prompt\.length < 15 \|\| prompt\.length > 1500\)/);
  assert.match(ui, /if \(answer\.length < 10 \|\| answer\.length > 2500\)/);
  assert.match(ui, /\.insert\(\{ request_id: requestId, author_id: actorId, prompt \}\)/);
  assert.match(ui, /\.insert\(\{ question_id: questionId, author_id: actorId, answer \}\)/);
  assert.match(ui, /\.update\(\{ state: 'closed' \}\)/);
  assert.match(ui, /\.eq\('state', 'open'\)/);
  assert.match(ui, /\.select\('id'\)\.maybeSingle\(\)/);
  assert.match(ui, /visibleAnswers\.some\(\(item\) => item\.question_id === questionId\)/);
  assert.match(ui, /Only one answer is allowed per question/);
  assert.match(ui, /No contractual acceptance implied/);
});

test('owner page uses real clarification counts, filters and linked request workspace', async () => {
  const src = await read('src/pages/MyServiceRequests.tsx');
  assert.match(src, /from\('service_customer_amendment_queue'\)/);
  assert.match(src, /\.eq\('user_id', userId\)/);
  assert.match(src, /if \(answersOnly\) query = query\.gt\('awaiting_customer_count', 0\)/);
  assert.match(src, /setAnswersOnly\(false\)/);
  assert.match(src, /setOpenClarifications\(null\)/);
  assert.match(src, /awaiting_customer_count > 0/);
  assert.match(src, /awaiting_admin_review_count > 0/);
  assert.match(src, /Questions awaiting my answer/);
  assert.match(src, /visibleLinkedRequest\.id/);
  assert.match(src, /<ServiceClarifications requestId=\{item\.id\} ownerId=\{user\.id\}/);
  assert.doesNotMatch(src, /service_clarification_questions.*insert|service_clarification_questions.*update/);
});

test('admin queue filters real owner and reviewer work without fake deadlines', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(src, /from\('service_admin_amendment_queue'\)/);
  assert.match(src, /query\.gt\('awaiting_customer_count', 0\)/);
  assert.match(src, /query\.gt\('awaiting_admin_review_count', 0\)/);
  assert.match(src, /query\.gt\('open_clarification_count', 0\)/);
  assert.match(src, /setClarificationFilter\('all'\)/);
  assert.match(src, /Clarifications to review/);
  assert.match(src, /<ServiceClarifications requestId=\{item\.id\} ownerId=\{item\.user_id\} isAdmin/);
  assert.match(src, /const authorized = !!user && authorizedFor === user\.id/);
  assert.match(src, /setOpenClarifications\(null\)/);
});

test('SQL types remain private and Phase 11 is not represented as deployed', async () => {
  const types = await read('src/integrations/supabase/types.ts');
  const docs = await read('docs/ETERNYX_SERVICES_CLARIFICATIONS_PHASE11.md');
  for (const name of ['service_clarification_questions','service_clarification_answers','service_customer_clarification_queue','service_admin_clarification_queue']) {
    assert.ok(types.includes(name), name + ' is not typed');
  }
  assert.match(types, /service_clarification_answers: \{/);
  assert.match(types, /Update: never/);
  assert.match(docs, /not deployed/i);
  assert.match(docs, /customer A.*customer B.*administrator/i);
});
