import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('journal is invoker-secured, read-only and checks owner/admin access', async () => {
  const sql = await read('supabase/migrations/20261123050000_service_request_journal.sql');
  assert.match(sql, /CREATE OR REPLACE VIEW public\.service_request_journal/);
  assert.match(sql, /WITH \(security_invoker = true\)/);
  assert.match(sql, /REVOKE ALL ON public\.service_request_journal FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.service_request_journal TO authenticated/);
  assert.match(sql, /EXISTS \([\s\S]*FROM public\.service_requests r/);
  assert.match(sql, /r\.user_id = \(SELECT auth\.uid\(\)\) OR \(SELECT public\.is_admin\(\)\)/);
  assert.doesNotMatch(sql, /GRANT (UPDATE|INSERT|DELETE)|SECURITY DEFINER|DISABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /ALTER TABLE public\.service_request_activity/);
});

test('real message and status events are included, with correct persistent keys', async () => {
  const sql = await read('supabase/migrations/20261123050000_service_request_journal.sql');
  assert.match(sql, /FROM public\.service_request_activity a/);
  assert.match(sql, /'activity:' \|\| a\.id::text/);
  assert.match(sql, /WHEN 'message' THEN 'Conversation message'/);
  assert.match(sql, /WHEN 'request_created' THEN 'Request submitted'/);
  assert.match(sql, /'Status or customer update recorded'/);
  assert.match(sql, /a\.body/);
  assert.match(sql, /a\.from_status/);
  assert.match(sql, /a\.to_status/);
});

test('scope, clarification and brief amendments appear as real independent events', async () => {
  const sql = await read('supabase/migrations/20261123050000_service_request_journal.sql');
  for (const source of [
    'service_scope_reviews', 'service_scope_responses',
    'service_clarification_questions', 'service_clarification_answers',
    'service_brief_amendments',
  ]) assert.ok(sql.includes('public.' + source), 'Missing persisted source ' + source);
  for (const kind of [
    'scope_published','scope_response','question_published','answer_submitted',
    'question_closed','amendment_submitted','amendment_reviewed',
  ]) assert.ok(sql.includes("'" + kind + "'"), 'Missing real journal kind ' + kind);
  for (const prefix of [
    'scope-review:', 'scope-response:', 'question:', 'answer:',
    'question-closed:', 'amendment:', 'amendment-reviewed:',
  ]) assert.ok(sql.includes(prefix), 'Missing stable journal key ' + prefix);
  assert.match(sql, /WHERE q\.state = 'closed' AND q\.closed_at IS NOT NULL/);
  assert.match(sql, /WHERE a\.status = 'reviewed' AND a\.reviewed_at IS NOT NULL/);
  assert.match(sql, /UNION ALL/g);
  assert.doesNotMatch(sql, /FROM public\.service_request_triage|FROM public\.service_triage_history/);
});

test('viewer journal follows actual account/request and clears private state between accounts', async () => {
  const src = await read('src/components/services/ServiceRequestJournal.tsx');
  assert.match(src, /const viewerKey = requestId \+ ':'/);
  assert.match(src, /viewerKeyRef\.current = viewerKey/);
  assert.match(src, /const seq = \+\+seqRef\.current/);
  assert.match(src, /seq !== seqRef\.current \|\| viewerKeyRef\.current !== viewerKey/);
  assert.match(src, /setLoadedKey\(null\)/);
  assert.match(src, /setItems\(\[\]\)/);
  assert.match(src, /return \(\) => \{ seqRef\.current\+\+; \}/);
  assert.match(src, /viewerId && loadedKey === activeKey \? items : \[\]/);
  assert.match(src, /viewerId && loadedKey === activeKey \? total : 0/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|Math\.random\(/);
});

test('timeline filters and cursor retrieve real server-sorted pages with no fake activity', async () => {
  const src = await read('src/components/services/ServiceRequestJournal.tsx');
  assert.match(src, /const PAGE_SIZE = 30/);
  assert.match(src, /from\('service_request_journal'\)/);
  assert.match(src, /count: 'exact'/);
  assert.match(src, /\.eq\('request_id', requestId\)/);
  assert.match(src, /if \(stream !== 'all'\) query = query\.eq\('stream', stream\)/);
  assert.match(src, /\.order\('occurred_at', \{ ascending: false \}\)/);
  assert.match(src, /\.order\('event_key', \{ ascending: false \}\)/);
  assert.match(src, /\.limit\(PAGE_SIZE\)/);
  assert.match(src, /occurred_at\.lt/);
  assert.match(src, /event_key\.lt/);
  assert.match(src, /new Set\(before\.map\(\(item\) => item\.event_key\)\)/);
  for (const kind of ['conversation','scope','clarifications','brief_changes']) {
    assert.ok(src.includes(kind));
  }
  assert.match(src, /aria-pressed=\{stream === value\}/);
});

test('export is explicit and limited to only loaded participant-visible events', async () => {
  const src = await read('src/components/services/ServiceRequestJournal.tsx');
  assert.match(src, /const exportLoaded = \(\) =>/);
  assert.match(src, /loadedKey !== activeKey \|\| visibleItems\.length === 0 \|\| !viewerId/);
  assert.match(src, /Included: ' \+ visibleItems\.length \+ ' loaded events/);
  assert.match(src, /visibleItems\.flatMap\(/);
  assert.match(src, /new Blob\(\[lines\.join/);
  assert.match(src, /type: 'text\/plain;charset=utf-8'/);
  assert.match(src, /No internal triage notes, billing records or read receipts/);
  assert.match(src, /Keep this copy secure/);
  assert.doesNotMatch(src, /fetch\(|service_role|internal_note|\.from\('service_request_triage'\)/);
});

test('both desks provide journal actions and customer private-link coverage', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(owner, /import ServiceRequestJournal from/);
  assert.match(admin, /import ServiceRequestJournal from/);
  assert.match(owner, /const \[openJournal, setOpenJournal\]/);
  assert.match(admin, /const \[openJournal, setOpenJournal\]/);
  assert.match(owner, /setOpenJournal\(null\)/);
  assert.match(admin, /setOpenJournal\(null\)/);
  assert.match(owner, /<ServiceRequestJournal requestId=\{visibleLinkedRequest\.id\} ownerId=\{user\.id\}/);
  assert.match(owner, /<ServiceRequestJournal requestId=\{item\.id\} ownerId=\{user\.id\}/);
  assert.match(admin, /<ServiceRequestJournal requestId=\{item\.id\} ownerId=\{item\.user_id\}/);
  assert.match(owner, /aria-expanded=\{openJournal === item\.id\}/);
  assert.match(admin, /aria-expanded=\{openJournal === item\.id\}/);
});

test('journal typed read-only view and staging deployment gates are documented', async () => {
  const types = await read('src/integrations/supabase/types.ts');
  const docs = await read('docs/ETERNYX_SERVICES_UNIFIED_JOURNAL_PHASE14.md');
  assert.match(types, /service_request_journal: \{/);
  assert.match(types, /event_key: string/);
  assert.match(types, /stream: "conversation" \| "scope" \| "clarifications" \| "brief_changes"/);
  assert.match(types, /occurred_at: string/);
  assert.match(types, /detail: string \| null/);
  assert.match(docs, /not deployed/i);
  assert.match(docs, /customer A[\s\S]*customer B[\s\S]*administrator/i);
  assert.match(docs, /database connection timed out/i);
  assert.match(docs, /not read receipts/i);
});
