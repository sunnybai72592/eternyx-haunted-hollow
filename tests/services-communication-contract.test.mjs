import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('request activity is owner/admin scoped and cannot be forged as a status update', async () => {
  const sql = await read('supabase/migrations/20261122213000_service_request_activity.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.service_request_activity/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.service_request_activity FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.service_request_activity TO authenticated/);
  assert.match(sql, /GRANT INSERT \(request_id, actor_id, event_type, body\)/);
  assert.match(sql, /actor_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /AND event_type = 'message'/);
  assert.match(sql, /sr\.user_id = \(SELECT auth\.uid\(\)\) OR \(SELECT public\.is_admin\(\)\)/);
  assert.doesNotMatch(sql, /GRANT (UPDATE|DELETE).*service_request_activity TO authenticated/i);
});

test('status history and timestamp are server-authored rather than user forged', async () => {
  const sql = await read('supabase/migrations/20261122213000_service_request_activity.sql');
  assert.match(sql, /REVOKE UPDATE \(updated_at\) ON public\.service_requests FROM authenticated/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION eternyx_private\.service_request_update_time\(\)/);
  assert.match(sql, /NEW\.updated_at := now\(\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION eternyx_private\.record_service_request_activity\(\)/);
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(sql, /OLD\.status IS DISTINCT FROM NEW\.status/);
  assert.match(sql, /OLD\.client_update IS DISTINCT FROM NEW\.client_update/);
  assert.match(sql, /'request_created'/);
  assert.match(sql, /'status_changed'/);
  assert.match(sql, /REVOKE ALL ON SCHEMA eternyx_private FROM PUBLIC, anon, authenticated/);
});

test('customer messages require a verified authenticated insert and are not simulated', async () => {
  const file = await read('src/components/services/ServiceRequestTimeline.tsx');
  assert.match(file, /from\('service_request_activity'\)/);
  assert.match(file, /supabase\.auth\.getUser\(\)/);
  assert.match(file, /event_type: 'message'/);
  assert.match(file, /\.select\('id'\)/);
  assert.match(file, /if \(insertError \|\| !data\?\.id\)/);
  assert.match(file, /length < 10 \|\| content\.length > 1500/);
  assert.match(file, /aria-live="polite"/);
  assert.match(file, /Message not saved/);
  assert.doesNotMatch(file, /setTimeout|mockMessages|Math\.random/);
});

test('owner and admin expose a single lazy conversation per request', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(owner, /openConversation === item\.id && user && <ServiceRequestTimeline/);
  assert.match(admin, /openConversation === item\.id && <ServiceRequestTimeline/);
  assert.match(owner, /aria-expanded=\{openConversation === item\.id\}/);
  assert.match(admin, /aria-expanded=\{openConversation === item\.id\}/);
  assert.match(admin, /supabase\.rpc\('is_admin'\)/);
  assert.match(admin, /\.eq\('updated_at', item\.updated_at\)/);
  assert.match(admin, /setSearch/);
  assert.doesNotMatch(admin, /updated_at: new Date\(\)\.toISOString\(\)/);
});