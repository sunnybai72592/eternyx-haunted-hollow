import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('six scoped service categories without fictional checkout', async () => {
  const catalog = await read('src/lib/serviceOfferings.ts');
  const hub = await read('src/pages/ServicesHub.tsx');
  for (const key of [
    'security-review', 'web-app-development', 'ai-solutions',
    'cloud-devops', 'workflow-automation', 'enterprise-projects',
  ]) assert.ok(catalog.includes("key: '" + key + "'"), key);
  assert.match(hub, /serviceOfferings\.map/);
  assert.match(hub, /\/services\/request/);
  assert.match(hub, /\/services\/requests/);
  assert.match(hub, /No charges are collected here/);
});

test('request routes require auth and submission requires confirmed insertion', async () => {
  const app = await read('src/App.tsx');
  for (const path of ['/services/request', '/services/requests']) {
    assert.ok(app.includes('path="' + path + '" element={<RequireAuth>'), path);
  }
  assert.ok(app.includes('path="/services"'));
  assert.ok(app.includes('path="/services-hub"'));
  const intake = await read('src/pages/ServiceRequestPage.tsx');
  assert.match(intake, /supabase\.auth\.getUser\(\)/);
  assert.match(intake, /from\('service_requests'\)\.insert/);
  assert.match(intake, /\.select\('id'\)\.single\(\)/);
  assert.match(intake, /if \(error \|\| !data\?\.id\)/);
  const owner = await read('src/pages/MyServiceRequests.tsx');
  assert.match(owner, /\.eq\('user_id', userId\)/);
});

test('migration restricts reads inserts and admin status updates', async () => {
  const sql = await read('supabase/migrations/20261122201000_service_requests.sql');
  assert.match(sql, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.service_requests FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT INSERT \(user_id, service_key, title, description, contact_email, company\)/);
  assert.match(sql, /GRANT UPDATE \(status, client_update, updated_at\)/);
  assert.match(sql, /FOR INSERT TO authenticated\s+WITH CHECK \(\(SELECT auth\.uid\(\)\) = user_id\)/);
  assert.match(sql, /FOR SELECT TO authenticated\s+USING \(\(SELECT auth\.uid\(\)\) = user_id OR \(SELECT public\.is_admin\(\)\)\)/);
  assert.match(sql, /FOR UPDATE TO authenticated\s+USING \(\(SELECT public\.is_admin\(\)\)\)\s+WITH CHECK \(\(SELECT public\.is_admin\(\)\)\)/);
  assert.doesNotMatch(sql, /GRANT (DELETE|ALL PRIVILEGES) .*authenticated/i);
});

test('administrator view gates reading and verifies updates', async () => {
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(admin, /supabase\.rpc\('is_admin'\)/);
  assert.match(admin, /if \(!authorized \|\| !user\)/);
  assert.match(admin, /\.update\(\{ status: draft\.status/);
  assert.match(admin, /if \(error \|\| !data\)/);
  const nav = await read('src/components/admin/AdminWorkspaceNav.tsx');
  assert.match(nav, /\/admin\/service-requests/);
});