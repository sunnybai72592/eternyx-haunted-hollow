import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('structured intake captures real project objectives, planning constraints, and security acknowledgement', async () => {
  const form = await read('src/pages/ServiceRequestPage.tsx');
  const sql = await read('supabase/migrations/20261122223000_service_scope_triage.sql');
  for (const field of ['expected_outcome', 'timeframe', 'constraints', 'authorization_understood']) {
    assert.ok(form.includes(field), 'Missing submitted intake field: ' + field);
    assert.ok(sql.includes(field), 'Missing database column: ' + field);
  }
  assert.match(form, /serviceKey === 'security-review' && !authorizationUnderstood/);
  assert.match(form, /active security testing is not authorized by this request/);
  assert.match(sql, /GRANT INSERT \(expected_outcome, timeframe, constraints, authorization_understood\)/);
});

test('admin triage notes live in separate admin-only table, not customer-readable requests', async () => {
  const sql = await read('supabase/migrations/20261122223000_service_scope_triage.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.service_request_triage/);
  assert.match(sql, /service_triage_admin_read/);
  assert.match(sql, /service_triage_admin_create/);
  assert.match(sql, /service_triage_admin_update/);
  assert.match(sql, /USING \(\(SELECT public\.is_admin\(\)\)\)/);
  assert.match(sql, /WITH CHECK \(\(SELECT public\.is_admin\(\)\)\)/);
  assert.match(sql, /REVOKE ALL ON public\.service_request_triage FROM PUBLIC, anon, authenticated/);
  const admin = await read('src/components/services/ServiceTriagePanel.tsx');
  assert.match(admin, /from\('service_request_triage'\)/);
  assert.match(admin, /\.eq\('updated_at', saved\.updated_at\)/);
  assert.doesNotMatch(admin, /\.upsert\(/);
  assert.match(admin, /assign(ed|ment)|Assign/);
  const customer = await read('src/pages/MyServiceRequests.tsx');
  assert.doesNotMatch(customer, /service_request_triage|internal_note|assigned_admin_id/);
});

test('published scope reviews are immutable, admin-authored and readable by request owner', async () => {
  const sql = await read('supabase/migrations/20261122223000_service_scope_triage.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.service_scope_reviews/);
  assert.match(sql, /GRANT INSERT \(request_id, author_id, scope_summary, deliverables, exclusions, assumptions, next_steps\)/);
  assert.match(sql, /author_id = \(SELECT auth\.uid\(\)\) AND \(SELECT public\.is_admin\(\)\)/);
  assert.match(sql, /r\.user_id = \(SELECT auth\.uid\(\)\) OR \(SELECT public\.is_admin\(\)\)/);
  assert.doesNotMatch(sql, /GRANT (UPDATE|DELETE).*service_scope_reviews TO authenticated/);
  assert.match(sql, /require_published_scope/);
  const component = await read('src/components/services/ServiceScopeReview.tsx');
  assert.match(component, /supabase\.auth\.getUser\(\)/);
  assert.match(component, /\.from\('service_scope_reviews'\)\.insert/);
  assert.match(component, /\.select\('id'\)\.single\(\)/);
  assert.match(component, /if \(publishError \|\| !data\?\.id\)/);
  assert.doesNotMatch(component, /submitPayment|create-checkout|Stripe|setTimeout/);
});

test('customer feedback is non-binding and restricted to owner', async () => {
  const sql = await read('supabase/migrations/20261122223000_service_scope_triage.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.service_scope_responses/);
  assert.match(sql, /kind IN \('ready_to_discuss', 'request_changes', 'not_proceeding'\)/);
  assert.match(sql, /user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /WHERE v\.id = review_id AND r\.user_id = \(SELECT auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /GRANT (UPDATE|DELETE).*service_scope_responses TO authenticated/);
  const component = await read('src/components/services/ServiceScopeReview.tsx');
  assert.match(component, /user\.id !== ownerId/);
  assert.match(component, /\.from\('service_scope_responses'\)\.insert/);
  assert.match(component, /if \(submitError \|\| !data\?\.id\)/);
  assert.match(component, /does not accept a contract or create a payment/);
});

test('scope reviews and triage only mount for one selected request; recent activity is visible', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  const timeline = await read('src/components/services/ServiceRequestTimeline.tsx');
  assert.match(owner, /openScope === item\.id && user && <ServiceScopeReview/);
  assert.match(admin, /openTriage === item\.id && <ServiceTriagePanel/);
  assert.match(admin, /openScope === item\.id && <ServiceScopeReview/);
  assert.match(admin, /supabase\.rpc\('is_admin'\)/);
  assert.match(timeline, /\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(timeline, /Showing the latest 200 events/);
});
