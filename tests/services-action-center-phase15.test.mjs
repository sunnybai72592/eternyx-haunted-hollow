import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('action cards are accessible, display real counts and never fabricate unavailable zeros', async () => {
  const ui = await read('src/components/services/ServiceActionPulse.tsx');
  assert.match(ui, /export type ServicePulseItem/);
  assert.match(ui, /count: number \| null/);
  assert.match(ui, /aria-label=\{heading\}/);
  assert.match(ui, /aria-pressed=\{item\.active\}/);
  assert.match(ui, /onClick=\{item\.onSelect\}/);
  assert.match(ui, /aria-pressed/);
  assert.match(ui, /item\.count === null \? '—' : item\.count/);
  assert.match(ui, /Not loaded or unavailable · filter still works/);
  assert.match(ui, /Exact database results for requests|Counts are exact database results for requests/);
  assert.match(ui, /onClick=\{onRefresh\}/);
  assert.doesNotMatch(ui, /Math\.random|localStorage|mock|sampleCount/);
});

test('owner action center makes exact independent account-scoped count requests', async () => {
  const src = await read('src/pages/MyServiceRequests.tsx');
  assert.match(src, /const loadPulse = useCallback/);
  assert.match(src, /const seq = \+\+pulseGeneration\.current/);
  assert.match(src, /head: true, count: 'exact'/);
  assert.match(src, /from\('service_customer_amendment_queue'\)/);
  assert.match(src, /\.eq\('user_id', userId\)/);
  assert.match(src, /\.eq\('has_updates_since_check_complete', true\)/);
  assert.match(src, /\.gt\('awaiting_customer_count', 0\)/);
  assert.match(src, /\.gt\('pending_amendment_count', 0\)/);
  assert.match(src, /setPulseCounts\(/);
  assert.match(src, /all: counts\[0\], newActivity: counts\[1\]/);
  assert.match(src, /useAuthStore\.getState\(\)\.user\?\.id !== userId/);
  assert.match(src, /pulseOwner === userId \? pulseCounts/);
  assert.match(src, /return \(\) => \{\s*pulseGeneration\.current\+\+;\s*pulseAbortRef\.current\?\.abort\(\)/);
});

test('owner shortcuts select exclusive real filters, preserving server pagination', async () => {
  const src = await read('src/pages/MyServiceRequests.tsx');
  assert.match(src, /const choosePulse = \(kind:/);
  assert.match(src, /setFilter\('all'\)/);
  assert.match(src, /setActiveSearch\(''\)/);
  assert.match(src, /setUpdatesOnly\(kind === 'newActivity'\)/);
  assert.match(src, /setAnswersOnly\(kind === 'answers'\)/);
  assert.match(src, /setPendingReviewsOnly\(kind === 'pendingReviews'\)/);
  assert.match(src, /setPage\(0\)/);
  assert.match(src, /if \(pendingReviewsOnly\) query = query\.gt\('pending_amendment_count', 0\)/);
  assert.match(src, /Brief changes pending review/);
  assert.match(src, /onRefresh=\{\(\) => void loadPulse\(\)\}/);
  assert.match(src, /onChanged=\{\(\) => \{ void load\(\); invalidatePulse\(\); \}\}/);
});

test('owner sort options use real request timestamps and stable server-side ties', async () => {
  const src = await read('src/pages/MyServiceRequests.tsx');
  assert.match(src, /sortOrder === 'oldest'/);
  assert.match(src, /query\.order\('created_at', \{ ascending: true \}\)/);
  assert.match(src, /sortOrder === 'request_updated'/);
  assert.match(src, /query\.order\('updated_at', \{ ascending: false \}\)/);
  assert.match(src, /sorted\.order\('id', \{ ascending: false \}\)/);
  assert.match(src, /Recently edited request records/);
  assert.doesNotMatch(src, /query\.order\('last_admin_activity_at'/);
});

test('owner deep links query the correct amendment view with its newer fields', async () => {
  const src = await read('src/pages/MyServiceRequests.tsx');
  assert.doesNotMatch(src, /from\('service_customer_followup_queue'\)/);
  assert.match(src, /const \{ data, error \} = await supabase\.from\('service_customer_amendment_queue'\)/);
  assert.match(src, /amendment_count,pending_amendment_count,last_amendment_reviewed_at,has_updates_since_check_complete'/);
  assert.match(src, /\.eq\('user_id', userId\)\s*\.eq\('id', selected\)\s*\.abortSignal\(controller\.signal\)\s*\.maybeSingle\(\)/);
  assert.match(src, /setLinkedOwner\(userId\)/);
  assert.match(src, /linkedOwner === userId/);
});

test('admin action center derives exact counts from real access-controlled queues', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(src, /const loadActionCounts = useCallback/);
  assert.match(src, /const seq = \+\+actionCountGeneration\.current/);
  assert.match(src, /if \(!authorized \|\| !user\?\.id\)/);
  assert.match(src, /head: true, count: 'exact'/);
  assert.match(src, /from\('service_admin_amendment_queue'\)/);
  assert.match(src, /\.eq\('needs_follow_up_complete', true\)/);
  assert.match(src, /\.gt\('pending_amendment_count', 0\)/);
  assert.match(src, /\.gt\('awaiting_admin_review_count', 0\)/);
  assert.match(src, /\.is\('assigned_admin_id', null\)/);
  assert.match(src, /unassigned: counts\[4\]/);
  assert.match(src, /actionCountOwner === user\?\.id \? actionCounts\.all : null/);
  assert.match(src, /useAuthStore\.getState\(\)\.user\?\.id !== actor/);
});

test('admin focus cards reset incompatible filters and offer real queue sorting', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(src, /const chooseActionFocus = \(kind:/);
  assert.match(src, /clearFilters\(\)/);
  assert.match(src, /setAttentionOnly\(kind === 'followUp'\)/);
  assert.match(src, /setPendingAmendmentsOnly\(kind === 'amendments'\)/);
  assert.match(src, /setClarificationFilter\(kind === 'clarifications' \? 'needs_review' : 'all'\)/);
  assert.match(src, /setAssignmentFilter\(kind === 'unassigned' \? 'unassigned' : 'all'\)/);
  assert.match(src, /onSelect: \(\) => chooseActionFocus\('unassigned'\)/);
  assert.match(src, /sortOrder === 'amendments'/);
  assert.match(src, /query\.order\('pending_amendment_count', \{ ascending: false \}\)/);
  assert.match(src, /sortOrder === 'clarifications'/);
  assert.match(src, /query\.order\('awaiting_admin_review_count', \{ ascending: false \}\)/);
  assert.match(src, /Most pending brief changes/);
  assert.match(src, /Most answers awaiting review/);
});

test('counts invalidate after real writes and never persist across account changes', async () => {
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  const owner = await read('src/pages/MyServiceRequests.tsx');
  assert.match(admin, /return \(\) => \{\s*countGeneration\.current\+\+;\s*actionCountGeneration\.current\+\+;/);
  assert.match(admin, /setActionCountOwner\(null\)/);
  assert.match(admin, /setActionCountLoading\(false\)/);
  assert.match(admin, /void loadActionCounts\(\);/);
  assert.match(admin, /onSaved=\{\(\) => \{ void load\(\); invalidateCountCards\(\); \}\}/);
  assert.match(admin, /onChanged=\{\(\) => \{ void load\(\); invalidateCountCards\(\); \}\}/);
  assert.match(owner, /setPulseOwner\(null\)/);
  assert.match(owner, /void loadPulse\(\);/);
  assert.match(owner, /pulseGeneration\.current\+\+/);
  assert.doesNotMatch(admin, /sessionStorage\.setItem|localStorage\.setItem/);
});

test('Phase 15 is a no-new-migration frontend upgrade, while Phase 13/14 rollout remains blocked', async () => {
  const doc = await read('docs/ETERNYX_SERVICES_ACTION_CENTER_PHASE15.md');
  assert.match(doc, /no new SQL migration/i);
  assert.match(doc, /Phase 13.*Phase 14/s);
  assert.match(doc, /connection timeout/i);
  assert.match(doc, /customer A.*customer B.*administrator/s);
  assert.match(doc, /not read receipts/i);
  assert.match(doc, /dash rather than zero/i);
});
