import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (p) => readFile(new URL('../' + p, import.meta.url), 'utf8');

test('message flood protection is enforced inside Postgres and skips system audit rows', async () => {
  const sql = await read('supabase/migrations/20261123000500_service_write_rate_limits.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION eternyx_private\.limit_service_message_bursts/);
  assert.match(sql, /SECURITY INVOKER SET search_path = ''/);
  assert.match(sql, /IF NEW\.event_type <> 'message' THEN/);
  assert.match(sql, /NEW\.actor_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /hashtextextended\('service-message:'/);
  assert.match(sql, /a\.request_id = NEW\.request_id/);
  assert.match(sql, /a\.actor_id = NEW\.actor_id/);
  assert.match(sql, /a\.event_type = 'message'/);
  assert.match(sql, /interval '60 seconds'/);
  assert.match(sql, /interval '30 seconds'/);
  assert.match(sql, />= 8 THEN/);
  assert.match(sql, /service_activity_message_burst_guard/);
  assert.match(sql, /REVOKE ALL ON FUNCTION eternyx_private\.limit_service_message_bursts\(\)/);
  assert.doesNotMatch(sql, /GRANT INSERT .*service_request_activity|DISABLE ROW LEVEL SECURITY/);
});

test('scope feedback has separate serialized repeat and burst protection', async () => {
  const sql = await read('supabase/migrations/20261123000500_service_write_rate_limits.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION eternyx_private\.limit_service_scope_feedback_bursts/);
  assert.match(sql, /NEW\.user_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(sql, /hashtextextended\('service-feedback:'/);
  assert.match(sql, /s\.review_id = NEW\.review_id/);
  assert.match(sql, /s\.user_id = NEW\.user_id/);
  assert.match(sql, /s\.kind = NEW\.kind/);
  assert.match(sql, /pg_catalog\.btrim\(s\.note\) = pg_catalog\.btrim\(NEW\.note\)/);
  assert.match(sql, />= 4 THEN/);
  assert.match(sql, /service_scope_feedback_burst_guard/);
  assert.match(sql, /REVOKE ALL ON FUNCTION eternyx_private\.limit_service_scope_feedback_bursts\(\)/);
  assert.doesNotMatch(sql, /GRANT UPDATE|GRANT DELETE|DROP POLICY/);
});

test('scoped review history and feedback can be expanded without 100/200 hard truncation', async () => {
  const component = await read('src/components/services/ServiceScopeReview.tsx');
  assert.match(component, /setReviewLimit\(\(n\) => n \+ 20\)/);
  assert.match(component, /setFeedbackLimit\(\(n\) => n \+ 50\)/);
  assert.match(component, /count: 'exact'/);
  assert.match(component, /\.limit\(reviewLimit\)/);
  assert.match(component, /\.limit\(feedbackLimit\)/);
  assert.match(component, /Load older scope reviews/);
  assert.match(component, /Load older customer feedback/);
  assert.match(component, /loadedKey === viewerKey/);
  assert.doesNotMatch(component, /\.limit\(100\)|\.limit\(200\)/);
});

test('scope memo publication checks real administrator permission before insert', async () => {
  const component = await read('src/components/services/ServiceScopeReview.tsx');
  assert.match(component, /supabase\.auth\.getUser\(\)/);
  assert.match(component, /supabase\.rpc\('is_admin'\)/);
  assert.match(component, /adminAllowed !== true/);
  assert.match(component, /user\.id !== viewerId/);
  assert.match(component, /\.from\('service_scope_reviews'\)\.insert/);
  assert.match(component, /setLoadedKey\(null\)/);
  assert.match(component, /setDraft\(emptyDraft\)/);
  assert.match(component, /setReviewCount\(0\)/);
  assert.match(component, /setFeedbackCount\(0\)/);
  assert.match(component, /if \(generation !== loadGeneration\.current\) return/);
});

test('scope feedback provides explicit duplicate and rate-limit errors', async () => {
  const component = await read('src/components/services/ServiceScopeReview.tsx');
  assert.match(component, /already submitted recently/i);
  assert.match(component, /too many scope responses/i);
  assert.match(component, /Scope feedback rate limit reached/);
  assert.match(component, /if \(submitError \|\| !data\?\.id\)/);
  assert.match(component, /user\.id !== ownerId/);
});

test('conversation history is account-scoped and displays actionable rate-limits', async () => {
  const timeline = await read('src/components/services/ServiceRequestTimeline.tsx');
  assert.match(timeline, /const visibleActivity = viewerId && loadedKey === viewerKey \? activity : \[\]/);
  assert.match(timeline, /const visibleCount = viewerId && loadedKey === viewerKey \? totalCount : 0/);
  assert.match(timeline, /setLoadedKey\(null\)/);
  assert.match(timeline, /setMessage\(''\)/);
  assert.match(timeline, /verifiedUser\.id !== viewerId/);
  assert.match(timeline, /Message rate limit reached/);
  assert.match(timeline, /already submitted recently/);
  assert.match(timeline, /const oldest = visibleActivity\[0\]/);
  assert.match(timeline, /if \(generation !== queryGeneration\.current\) return/);
});

test('admin triage clears old notes and verifies rights on every new session', async () => {
  const triage = await read('src/components/services/ServiceTriagePanel.tsx');
  assert.match(triage, /supabase\.rpc\('is_admin'\)/);
  assert.match(triage, /allowed !== true/);
  assert.match(triage, /setSaved\(null\)/);
  assert.match(triage, /setNote\(''\)/);
  assert.match(triage, /setLoadedKey\(null\)/);
  assert.match(triage, /if \(generation !== loadGeneration\.current\) return/);
  assert.match(triage, /loadedKey !== viewerKey/);
  assert.match(triage, /\.eq\('updated_at', saved\.updated_at\)/);
});
