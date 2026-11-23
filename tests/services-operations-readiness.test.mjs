import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('admin services queue queries page-scoped results with exact server counts', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(src, /count: 'exact'/);
  assert.match(src, /\.range\(page \* PAGE_SIZE, \(page \+ 1\) \* PAGE_SIZE - 1\)/);
  assert.match(src, /\.order\('id', \{ ascending: false \}\)/);
  assert.match(src, /if \(filter !== 'all'\) query = query\.eq\('status', filter\)/);
  assert.match(src, /query\.ilike\(activeSearchField/);
  assert.match(src, /query\.eq\('id', activeSearch\)/);
  assert.match(src, /setActiveSearchField\(searchField\)/);
  assert.match(src, /setPage\(0\)/);
  assert.doesNotMatch(src, /limit\(250\)|most recent 250 loaded/);
  assert.match(src, /Next<\/Button>/);
});

test('customer requests are owner-filtered and paginated by Supabase', async () => {
  const src = await read('src/pages/MyServiceRequests.tsx');
  assert.match(src, /\.eq\('user_id', userId\)/);
  assert.match(src, /count: 'exact'/);
  assert.match(src, /\.range\(page \* 20, \(page \+ 1\) \* 20 - 1\)/);
  assert.match(src, /query\.ilike\('title'/);
  assert.match(src, /new URLSearchParams\(location\.search\)\.get\('request'\)/);
  assert.match(src, /\.eq\('user_id', userId\)/);
  assert.match(src, /\.eq\('id', selected\)/);
  assert.match(src, /visibleLinkedRequest && \(selectedPanel !== null \|\| !visibleRows\.some/);
  assert.match(src, /Opened by private link/);
  assert.match(src, /encodeURIComponent\(id\)/);
  assert.match(src, /navigator\.clipboard\.writeText/);
  assert.match(src, /new Blob\(\[text\], \{ type: 'text\/plain;charset=utf-8' \}\)/);
  assert.match(src, /URL\.createObjectURL\(blob\)/);
  assert.match(src, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(src, /This is an enquiry record, not a quote, contract or proof of delivery/);
});

test('service conversations load historical pages instead of discarding older data', async () => {
  const src = await read('src/components/services/ServiceRequestTimeline.tsx');
  assert.match(src, /PAGE_SIZE = 50/);
  assert.match(src, /\.range\(0, PAGE_SIZE - 1\)/);
  assert.match(src, /\.or\(/);
  assert.match(src, /created_at\.lt/);
  assert.match(src, /id\.lt/);
  assert.match(src, /const unique = new Map/);
  assert.match(src, /Load older events/);
  assert.match(src, /event_type: 'message'/);
  assert.match(src, /if \(insertError \|\| !data\?\.id\)/);
  assert.doesNotMatch(src, /Older activity requires a separate history export/);
});

test('an admin cannot represent unverified service delivery as started or finished', async () => {
  const sql = await read('supabase/migrations/20261122234000_services_delivery_gate.sql');
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(sql, /CREATE OR REPLACE FUNCTION eternyx_private\.prevent_unverified_service_delivery/);
  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /NEW\.status IN \('in_progress', 'completed'\)/);
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(sql, /BEFORE UPDATE OF status ON public\.service_requests/);
  assert.match(sql, /REVOKE ALL ON FUNCTION eternyx_private\.prevent_unverified_service_delivery/);
  assert.match(admin, /disabled=\{value === 'in_progress' \|\| value === 'completed'\}/);
  assert.match(admin, /Delivery statuses require a separately verified agreement/);
  assert.doesNotMatch(sql, /INSERT INTO.*billing|create-checkout|charge_card/i);
});

test('existing authenticated service scopes and customer feedback remain reachable', async () => {
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  const owner = await read('src/pages/MyServiceRequests.tsx');
  assert.match(admin, /supabase\.rpc\('is_admin'\)/);
  assert.match(admin, /\.eq\('updated_at', item\.updated_at\)/);
  assert.match(admin, /ServiceTriagePanel/);
  assert.match(admin, /ServiceScopeReview/);
  assert.match(owner, /openScope === item\.id && user && <ServiceScopeReview/);
  assert.match(owner, /openConversation === item\.id && user && <ServiceRequestTimeline/);
});