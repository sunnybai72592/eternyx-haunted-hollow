import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('customer requests hide previous account rows before cleanup effects run', async () => {
  const source = await read('src/pages/MyServiceRequests.tsx');
  assert.match(source, /const userId = user\?\.id \?\? null/);
  assert.match(source, /const visibleRows = rowsOwner === userId && userId \? rows : \[\]/);
  assert.match(source, /const visibleLinkedRequest = linkedOwner === userId && userId \? linkedRequest : null/);
  assert.match(source, /setRowsOwner\(null\)/);
  assert.match(source, /setLinkedOwner\(null\)/);
  assert.match(source, /setOpenConversation\(null\)/);
  assert.match(source, /setOpenScope\(null\)/);
  assert.match(source, /setRows\(\[\]\)/);
  assert.match(source, /setTotal\(0\)/);
  assert.match(source, /setPage\(0\)/);
  assert.match(source, /setActiveSearch\(''\)/);
});

test('request filter changes and account transitions discard stale fetch completions', async () => {
  const source = await read('src/pages/MyServiceRequests.tsx');
  assert.match(source, /const generation = \+\+requestGeneration\.current/);
  assert.match(source, /if \(generation !== requestGeneration\.current \|\| useAuthStore\.getState\(\)\.user\?\.id !== userId\) return/);
  assert.match(source, /requestGeneration\.current \+= 1;\s*requestAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /\.eq\('user_id', userId\)/);
  assert.match(source, /setRowsOwner\(userId\)/);
  assert.match(source, /if \(page > 0 && page \* 20 >= result\.count\)/);
  assert.match(source, /No requests match this view/);
});

test('private deep links do not display data from a different authenticated user', async () => {
  const source = await read('src/pages/MyServiceRequests.tsx');
  assert.match(source, /setLinkedOwner\(null\)/);
  assert.match(source, /setLinkedOwner\(userId\)/);
  assert.match(source, /\.eq\('user_id', userId\)/);
  assert.match(source, /\.eq\('id', selected\)/);
  assert.match(source, /visibleLinkedRequest && \(selectedPanel !== null \|\| !visibleRows\.some/);
  assert.match(source, /describePrivateRequestRead\(error, !!data\)/);
  const classifier = await read('src/lib/servicePrivateRequestReliability.ts');
  assert.match(classifier, /This request was not found or the signed-in account cannot access it/);
});

test('cursor history uses timestamp plus id and ignores superseded responses', async () => {
  const source = await read('src/components/services/ServiceRequestTimeline.tsx');
  assert.match(source, /const oldest = visibleActivity\[0\]/);
  assert.match(source, /created_at\.lt\./);
  assert.match(source, /created_at\.eq\./);
  assert.match(source, /id\.lt\./);
  assert.match(source, /\.limit\(PAGE_SIZE\)/);
  assert.doesNotMatch(source, /\.range\(activity\.length/);
  assert.match(source, /const generation = \+\+queryGeneration\.current/);
  assert.match(source, /if \(generation !== queryGeneration\.current\) return/);
  assert.match(source, /queryGeneration\.current \+= 1/);
  assert.match(source, /setOlderLoading\(false\)/);
  assert.match(source, /Earlier pages use stable event cursors/);
});

test('production preflight only inspects catalogs and migration history', async () => {
  const sql = await read('scripts/sql/services-live-preflight.sql');
  assert.match(sql, /pg_policies/);
  assert.match(sql, /pg_trigger/);
  assert.match(sql, /relrowsecurity/);
  assert.match(sql, /security_invoker=true/);
  assert.match(sql, /has_table_privilege\('anon'/);
  assert.match(sql, /has_table_privilege\('authenticated'/);
  assert.match(sql, /supabase_migrations\.schema_migrations/);
  assert.match(sql, /service_requests_delivery_gate/);
  assert.doesNotMatch(sql, /\b(CREATE|INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\s+(TABLE|INTO|SET|FROM|POLICY|FUNCTION|TRIGGER|VIEW)\b/i);
});

test('activation docs distinguish applied database schema from unverified user E2E', async () => {
  const doc = await read('docs/ETERNYX_SERVICES_LIVE_PHASE6.md');
  assert.match(doc, /20261122203201/);
  assert.match(doc, /migration-repair procedure/);
  assert.match(doc, /NOT proof of real two-account isolation/);
  assert.match(doc, /No payment, binding contract/);
});
