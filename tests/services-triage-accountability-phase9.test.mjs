import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('private triage history is append-only, authenticated read-only and RLS guarded', async () => {
  const sql = await read('supabase/migrations/20261123011500_service_triage_history.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.service_triage_history/);
  assert.match(sql, /request_id uuid NOT NULL REFERENCES public\.service_requests\(id\) ON DELETE CASCADE/);
  assert.match(sql, /actor_id uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS service_triage_history_request_latest_idx/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.service_triage_history FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.service_triage_history TO authenticated/);
  assert.match(sql, /service_triage_history_admin_read/);
  assert.match(sql, /USING \(\(SELECT public\.is_admin\(\)\)\)/);
  assert.doesNotMatch(sql, /GRANT (INSERT|UPDATE|DELETE) ON (TABLE )?public\.service_triage_history TO authenticated/);
  assert.doesNotMatch(sql, /CREATE POLICY .*FOR (INSERT|UPDATE|DELETE)/);
});

test('server authored audit records before/after values, not confidential note text', async () => {
  const sql = await read('supabase/migrations/20261123011500_service_triage_history.sql');
  assert.match(sql, /record_service_triage_history\(\)/);
  assert.match(sql, /LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''/);
  assert.match(sql, /IF TG_OP = 'UPDATE' THEN/);
  assert.match(sql, /IS NOT DISTINCT FROM/);
  assert.match(sql, /ROW\(NEW\.priority, NEW\.assigned_admin_id, NEW\.internal_note, NEW\.next_action_kind, NEW\.next_review_on\)/);
  assert.match(sql, /previous_priority, NEW\.priority/);
  assert.match(sql, /previous_admin, NEW\.assigned_admin_id/);
  assert.match(sql, /previous_action, NEW\.next_action_kind/);
  assert.match(sql, /previous_review, NEW\.next_review_on/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /internal_note_changed/);
  assert.doesNotMatch(sql, /old_internal_note|new_internal_note/);
  assert.match(sql, /REVOKE ALL ON FUNCTION eternyx_private\.record_service_triage_history\(\)/);
  assert.match(sql, /AFTER INSERT OR UPDATE ON public\.service_request_triage/);
});

test('history viewer is admin-only, owner/session-scoped and cursor paginated', async () => {
  const src = await read('src/components/services/ServiceTriageHistory.tsx');
  assert.match(src, /const viewerKey = requestId \+ ':' \+ \(viewerId \?\? 'signed-out'\)/);
  assert.match(src, /const visibleRows = viewerId && loadedKey === viewerKey \? rows : \[\]/);
  assert.match(src, /supabase\.rpc\('is_admin'\)/);
  assert.match(src, /permitted !== true/);
  assert.match(src, /from\('service_triage_history'\)/);
  assert.match(src, /\.eq\('request_id', requestId\)/);
  assert.match(src, /count: 'exact'/);
  assert.match(src, /const PAGE_SIZE = 20/);
  assert.match(src, /created_at\.lt\./);
  assert.match(src, /created_at\.eq\./);
  assert.match(src, /id\.lt\./);
  assert.match(src, /\.limit\(PAGE_SIZE\)/);
  assert.match(src, /if \(seq !== generation\.current\) return/);
  assert.match(src, /loadOlder/);
  assert.match(src, /private note text itself/);
  assert.doesNotMatch(src, /from\('service_request_triage'\)\.update|\.insert\(/);
});

test('triage save validates live administrator rights and reloads history', async () => {
  const src = await read('src/components/services/ServiceTriagePanel.tsx');
  assert.match(src, /supabase\.auth\.getUser\(\)/);
  assert.match(src, /supabase\.rpc\('is_admin'\)/);
  assert.match(src, /permitted !== true/);
  assert.match(src, /viewerKeyRef\.current !== viewerKey/);
  assert.match(src, /setHistoryRevision\(\(n\) => n \+ 1\)/);
  assert.match(src, /<ServiceTriageHistory requestId=\{requestId\} refreshToken=\{historyRevision\} \/>/);
  assert.match(src, /View decision history/);
  assert.match(src, /Close decision history/);
  assert.match(src, /Clear planned follow-up \(save to confirm\)/);
  assert.match(src, /\.eq\('updated_at', saved\.updated_at\)/);
  assert.match(src, /onSaved\?\.\(\)/);
});

test('queue workload counts come from verified database head/count queries', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(src, /const loadQueueCounts = useCallback/);
  assert.match(src, /if \(!authorized \|\| !user\?\.id\) return/);
  assert.match(src, /Promise\.all\(buckets\.map/);
  assert.match(src, /from\('service_admin_amendment_queue'\)/);
  assert.match(src, /select\('id', \{ head: true, count: 'exact' \}\)/);
  assert.match(src, /\.eq\('review_bucket', bucket\)/);
  assert.match(src, /if \(seq !== countGeneration\.current\) return/);
  assert.match(src, /data\[0\]\.error \? null : data\[0\]\.count/);
  assert.match(src, /queueCounts\[bucket\] \?\? '—'/);
  assert.match(src, /onClick=\{\(\) => \{ setReviewBucket\(/);
  assert.match(src, /loadQueueCounts\(\)/);
  assert.match(src, /setQueueCounts\(\{ unscheduled: null, overdue: null, due_today: null, upcoming: null \}\)/);
  assert.doesNotMatch(src, /mockQueueCounts|Math\.random\(\)/);
});

test('owner-facing service desk does not receive admin notes, history or metrics', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  for (const secret of ['service_triage_history', 'internal_note', 'service_admin_review_queue', 'queueCounts']) {
    assert.ok(!owner.includes(secret), 'Unexpected admin-only content: ' + secret);
  }
  const type = await read('src/integrations/supabase/types.ts');
  assert.match(type, /service_triage_history: \{/);
  assert.match(type, /Insert: never/);
  assert.match(type, /Update: never/);
});
