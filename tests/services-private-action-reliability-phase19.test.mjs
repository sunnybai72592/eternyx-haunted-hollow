import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (name) => readFile(new URL('../' + name, import.meta.url), 'utf8');

async function failureClassifier() {
  const src = await read('src/lib/servicePrivateRequestReliability.ts');
  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(js, { exports: module.exports, module });
  return module.exports.describePrivateRequestRead;
}

test('private request responses distinguish readable, missing and permission denied', async () => {
  const classify = await failureClassifier();
  assert.equal(classify(null, true).kind, 'ready');
  assert.equal(classify(null, true).retryable, false);
  assert.equal(classify(null, false).kind, 'inaccessible');
  assert.equal(classify(null, false).retryable, false);
  assert.equal(classify({ code: '42501' }, false).kind, 'inaccessible');
  assert.equal(classify({ code: 'PGRST301' }, false).retryable, false);
  assert.equal(classify({ message: 'permission denied for table x' }, false).kind, 'inaccessible');
  assert.ok(!classify(null, false).message.includes('exists'));
});

test('private request outages are retryable but never mistaken for a missing row', async () => {
  const classify = await failureClassifier();
  for (const error of [
    { code: '42P01', message: 'relation unavailable' },
    { code: 'PGRST205' }, { code: 'PGRST200' },
    { code: '57014' }, { message: 'Connection terminated due to connection timeout' },
    { message: 'Failed to fetch' }, { message: 'Unexpected service backend error' },
  ]) {
    const result = classify(error, false);
    assert.equal(result.kind, 'unavailable', JSON.stringify(error));
    assert.equal(result.retryable, true, JSON.stringify(error));
    assert.ok(result.message.length > 15);
    assert.ok(!result.message.includes('secret'));
  }
});

test('customer private link lookup aborts, cleans up and suppresses old-account results', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  assert.match(owner, /const \[linkedRetryable, setLinkedRetryable\] = useState\(false\)/);
  assert.match(owner, /const \[linkedRetry, setLinkedRetry\] = useState\(0\)/);
  assert.match(owner, /const controller = new AbortController\(\)/);
  assert.match(owner, /window\.setTimeout\(\(\) => controller\.abort\(\), 15000\)/);
  assert.match(owner, /\.abortSignal\(controller\.signal\)/);
  assert.match(owner, /if \(!active \|\| useAuthStore\.getState\(\)\.user\?\.id !== userId\) return/);
  assert.match(owner, /setLinkedError\(status\.message\)/);
  assert.match(owner, /setLinkedRetryable\(status\.retryable\)/);
  assert.match(owner, /window\.clearTimeout\(deadline\)/);
  assert.match(owner, /return \(\) => \{\s*active = false;\s*controller\.abort\(\)/);
  assert.match(owner, /\[userId, location\.search, linkedRetry\]/);
  assert.match(owner, /if \(active && useAuthStore\.getState\(\)\.user\?\.id === userId\) setLinkedLoading\(false\)/);
});

test('customer distinguishes temporary linked request failures with a real retry control', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  assert.match(owner, /describePrivateRequestRead\(error, !!data\)/);
  assert.match(owner, /status\.kind !== 'ready'/);
  assert.match(owner, /linkedRetryable && <Button/);
  assert.match(owner, /Retry private request/);
  assert.match(owner, /onClick=\{\(\) => setLinkedRetry\(\(count\) => count \+ 1\)\}/);
  assert.match(owner, /role="alert"/);
  assert.match(owner, /supabase\.from\('service_customer_amendment_queue'\)/);
  assert.match(owner, /\.eq\('user_id', userId\)/);
  assert.match(owner, /\.eq\('id', selected\)/);
});

test('legacy customer link copying only occurs after fresh current owner verification', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  const action = owner.slice(owner.indexOf('  const copyLink = async (id: string) => {'),owner.indexOf('  const exportBrief = async'));
  assert.match(action, /rowsOwner !== userId/);
  assert.match(action, /visibleRows\.some\(\(item\) => item\.id === id\)/);
  assert.match(action, /supabase\.auth\.getUser\(\)/);
  assert.match(action, /verified\?\.id !== userId/);
  assert.match(action, /useAuthStore\.getState\(\)\.user\?\.id !== userId/);
  assert.match(action, /navigator\.clipboard\.writeText/);
  assert.match(action, /\/services\/requests\?request=/);
  assert.match(action, /Recipients still need authorized account access/);
});

test('original customer brief export rejects old account and only exports loaded owned rows', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  const action = owner.slice(owner.indexOf('  const exportBrief = async (item: RequestRow) => {'), owner.indexOf('  const choosePulse ='));
  assert.match(action, /rowsOwner !== userId/);
  assert.match(action, /visibleRows\.some\(\(row\) => row\.id === item\.id\)/);
  assert.match(action, /supabase\.auth\.getUser\(\)/);
  assert.match(action, /verified\?\.id !== userId/);
  assert.match(action, /useAuthStore\.getState\(\)\.user\?\.id !== userId\) return/);
  assert.match(action, /item\.description/);
  assert.match(action, /item\.constraints/);
  assert.match(action, /new Blob\(\[text\]/);
  assert.match(action, /URL\.createObjectURL\(blob\)/);
  assert.match(action, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(owner, /onClick=\{\(\) => void exportBrief\(item\)\}/);
});

test('customer and administrator check-in completions do not mutate other sessions', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(owner, /if \(useAuthStore\.getState\(\)\.user\?\.id === userId\) setCheckingId\(null\)/);
  assert.match(admin, /if \(useAuthStore\.getState\(\)\.user\?\.id === user\.id\) setCheckingId\(null\)/);
  assert.match(owner, /supabase\.rpc\('mark_service_request_checked'/);
  assert.match(admin, /supabase\.rpc\('mark_service_request_checked'/);
});

test('admin private link copy requires current verified administrator and loaded request', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  const segment = src.slice(src.indexOf('  const copyAdminLink = async'),src.indexOf('  const filtered = rows;'));
  assert.match(segment, /!authorized/);
  assert.match(segment, /!rows\.some\(\(row\) => row\.id === id\)/);
  assert.match(segment, /confirmAdminForLocalAction\(\)/);
  assert.match(segment, /useAuthStore\.getState\(\)\.user\?\.id !== actor/);
  assert.match(segment, /navigator\.clipboard\.writeText/);
  assert.match(segment, /Private administrator link copied/);
  assert.match(src, /supabase\.rpc\('is_admin'\)/);
});

test('admin verified saves retain optimistic conflict detection and account-scoped feedback', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  const start = src.indexOf('  const save = async (item: ServiceRow) => {');
  const end = src.indexOf('  if (checking || authLoading)', start);
  const action = src.slice(start,end);
  assert.match(action, /!authorized \|\| !actor \|\| !draft \|\| saving/);
  assert.match(action, /confirmAdminForLocalAction\(\)/);
  assert.match(action, /if \(useAuthStore\.getState\(\)\.user\?\.id !== actor\) return/);
  assert.match(action, /supabase\.from\('service_requests'\)/);
  assert.match(action, /\.update\(\{ status: draft\.status, client_update: draft\.client_update\.trim\(\) \|\| null \}\)/);
  assert.match(action, /\.eq\('id', item\.id\)/);
  assert.match(action, /\.eq\('updated_at', item\.updated_at\)/);
  assert.match(action, /\.maybeSingle\(\)/);
  assert.match(action, /Delivery statuses require a separately verified agreement/);
  assert.match(action, /if \(useAuthStore\.getState\(\)\.user\?\.id === actor\) setSaving\(null\)/);
  assert.match(action, /invalidateCountCards\(\)/);
  assert.doesNotMatch(action, /void loadActionCounts\(\)/);
});

test('Phase 19 requires real multi-account database verification and no migration', async () => {
  const doc = await read('docs/ETERNYX_SERVICES_PRIVATE_ACTION_RELIABILITY_PHASE19.md');
  assert.match(doc, /No new SQL migration/i);
  assert.match(doc, /Phase 13 before Phase 14/i);
  assert.match(doc, /connection timeout/i);
  assert.match(doc, /customer A[\s\S]*customer B[\s\S]*administrator/);
  assert.match(doc, /no production E2E readiness claim/i);
});
