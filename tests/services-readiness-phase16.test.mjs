import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL('../' + name, import.meta.url), 'utf8');

test('manual readiness checks use the signed-in account and never expose privileged access', async () => {
  const ui = await read('src/components/services/ServiceDeskReadiness.tsx');
  assert.match(ui, /supabase\.auth\.getUser\(\)/);
  assert.match(ui, /auth\.data\.user\.id !== viewerId/);
  assert.match(ui, /viewerKey = mode \+ ':' \+/);
  assert.match(ui, /viewerKeyRef\.current = viewerKey/);
  assert.match(ui, /if \(mode === 'admin'\) \{/);
  assert.match(ui, /supabase\.rpc\('is_admin'\)/);
  assert.match(ui, /isAdmin !== true/);
  assert.match(ui, /No admin-only checks were performed/);
  assert.match(ui, /if \(!viewerId \|\| running\) return/);
  assert.match(ui, /onClick=\{\(\) => void run\(\)\}/);
  assert.doesNotMatch(ui, /service_role|SUPABASE_SERVICE_ROLE|\.insert\(|\.update\(|\.delete\(/);
});

test('availability probes are read-only and cover all live Services dependencies', async () => {
  const ui = await read('src/components/services/ServiceDeskReadiness.tsx');
  for (const entity of [
    'service_requests',
    'service_request_activity',
    'service_scope_reviews',
    'service_clarification_questions',
    'service_brief_amendments',
    'service_request_journal',
    'service_customer_amendment_queue',
    'service_admin_amendment_queue',
    'service_request_triage',
  ]) assert.ok(ui.includes("from('" + entity + "')"), entity + ' not probed');
  assert.match(ui, /select\('event_key', \{ head: true \}\)/);
  assert.match(ui, /select\('request_id', \{ head: true \}\)/);
  assert.match(ui, /select\('id', \{ head: true \}\)/);
  assert.match(ui, /limit\(1\)\.abortSignal\(controller\.signal\)/);
  assert.match(ui, /mode === 'admin'\s*\? \{/);
  assert.match(ui, /if \(mode === 'admin'\) \{\s*checks\.push/);
  assert.doesNotMatch(ui, /service_triage_history|service_role|\.select\('\*'\)|count: 'exact'/);
});

test('readiness results describe queryability, not migration or RLS audit guarantees', async () => {
  const ui = await read('src/components/services/ServiceDeskReadiness.tsx');
  assert.match(ui, /A successful HEAD request means only that the resource can be queried/);
  assert.match(ui, /This is a point-in-time API check, not an RLS audit or production uptime guarantee/);
  assert.match(ui, /Empty results can still mean the API is accessible/);
  assert.match(ui, /These checks cannot prove row-level security/);
  assert.match(ui, /'Query available' : 'Query unavailable'/);
  assert.match(ui, /Not checked for this account/);
  assert.doesNotMatch(ui, /All services operational|live and fully tested|100% uptime/);
});

test('known API failure modes never become fake success or a fake zero', async () => {
  const ui = await read('src/components/services/ServiceDeskReadiness.tsx');
  assert.match(ui, /code === '42P01' \|\| code === 'PGRST205'/);
  assert.match(ui, /code === '42501' \|\| code === 'PGRST301'/);
  assert.match(ui, /code === '57014'/);
  assert.match(ui, /fetch\|network\|connect/i);
  assert.match(ui, /available: !probeError/);
  assert.match(ui, /available: false/);
  assert.match(ui, /reason: probeError \? classifyError\(probeError\.code, probeError\.message\) : null/);
  assert.match(ui, /This account cannot access the feature/);
  assert.match(ui, /Feature may be missing or not exposed/);
  assert.match(ui, /The database connection could not be reached/);
});

test('readiness checks abort after 15 seconds and cannot overwrite a switched account', async () => {
  const ui = await read('src/components/services/ServiceDeskReadiness.tsx');
  assert.match(ui, /const OVERALL_TIMEOUT_MS = 15000/);
  assert.match(ui, /const seq = \+\+requestVersion\.current/);
  assert.match(ui, /controllerRef\.current\?\.abort\(\)/);
  assert.match(ui, /new AbortController\(\)/);
  assert.match(ui, /window\.setTimeout\(\(\) => controller\.abort\(\), OVERALL_TIMEOUT_MS\)/);
  assert.match(ui, /seq === requestVersion\.current && viewerKeyRef\.current === viewerKey/);
  assert.match(ui, /!controller\.signal\.aborted/);
  assert.match(ui, /setResultsKey\(viewerKey\)/);
  assert.match(ui, /viewerId && resultsKey === viewerKey \? results : \[\]/);
  assert.match(ui, /setResults\(\[\]\)/);
  assert.match(ui, /window\.clearTimeout\(timeoutId\)/);
  assert.match(ui, /if \(controller\.signal\.aborted\) setError/);
});

test('diagnostic summary can be explicitly copied without credentials or query contents', async () => {
  const ui = await read('src/components/services/ServiceDeskReadiness.tsx');
  assert.match(ui, /const copySummary = async \(\) =>/);
  assert.match(ui, /if \(!completed \|\| !viewerId \|\| !checkedAt\) return/);
  assert.match(ui, /Query responses: /);
  assert.match(ui, /visibleResults\.map\(\(item\) => item\.title/);
  assert.match(ui, /navigator\.clipboard\.writeText\(safeLines\.join/);
  assert.match(ui, /Copy safe summary/);
  assert.match(ui, /copied without account IDs, query contents or secrets/);
  assert.match(ui, /if \(viewerKeyRef\.current === viewerKey\)/);
  assert.doesNotMatch(ui, /auth\.data\.user\.email|auth\.data\.user\.id \+|\.data\.length/);
});

test('customer request page offers diagnostics and does not misstate a failed query as no enquiries', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  assert.match(owner, /import ServiceDeskReadiness from/);
  assert.match(owner, /\{userId && <ServiceDeskReadiness mode="customer" \/>\}/);
  assert.match(owner, /The database request failed/);
  assert.match(owner, /this is not an empty inbox/);
  assert.match(owner, /Use the read-only feature checks above and retry/);
  assert.match(owner, /loadError \? <Card/);
  assert.match(owner, /Try again/);
});

test('admin desk distinguishes authorization denial from database verification failure', async () => {
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(admin, /import ServiceDeskReadiness from/);
  assert.match(admin, /\{authorized && <ServiceDeskReadiness mode="admin" \/>\}/);
  assert.match(admin, /const \[adminAccessError, setAdminAccessError\] = useState\(false\)/);
  assert.match(admin, /const \[adminAccessRetry, setAdminAccessRetry\] = useState\(0\)/);
  assert.match(admin, /supabase\.rpc\('is_admin'\)\.abortSignal\(controller\.signal\)/);
  assert.match(admin, /controller\.abort\(\)/);
  assert.match(admin, /window\.setTimeout\(\(\) => controller\.abort\(\), 15000\)/);
  assert.match(admin, /setAdminAccessError\(!!error\)/);
  assert.match(admin, /setAuthorizedFor\(!error && data === true \? user\.id : null\)/);
  assert.match(admin, /adminAccessError \? 'Administrator verification unavailable' : 'Administrator access required'/);
  assert.match(admin, /setAdminAccessRetry\(\(value\) => value \+ 1\)/);
  assert.match(admin, /Retry administrator verification/);
  assert.match(admin, /authLoading, adminAccessRetry/);
});

test('Phase 16 deployment notes explicitly require recovery of previous outstanding migrations', async () => {
  const notes = await read('docs/ETERNYX_SERVICES_RELIABILITY_PHASE16.md');
  const recovery = await read('docs/ETERNYX_SERVICES_DATABASE_RECOVERY.md');
  assert.match(notes, /no new migration/i);
  assert.match(notes, /Phase 13.*Phase 14/s);
  assert.match(notes, /ACTIVE_HEALTHY/);
  assert.match(notes, /database queries.*timed out/is);
  assert.match(notes, /customer A.*customer B.*administrator/is);
  assert.match(notes, /no read receipts/i);
  assert.match(recovery, /Phase 13.*Phase 14/s);
  assert.match(recovery, /Do not edit migration history manually/);
  assert.match(recovery, /security_invoker/);
  assert.match(recovery, /RLS/);
});
