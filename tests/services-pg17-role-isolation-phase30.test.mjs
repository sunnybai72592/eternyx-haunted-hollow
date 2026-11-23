import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const source = 'docs/sql/eternyx/services-phase30-disposable-rls-acceptance.sql';

test('Phase 30 SQL uses only synthetic records inside a transaction rolled back at end', async () => {
  const sql=await read(source);
  assert.match(sql, /^BEGIN;\s*SET LOCAL statement_timeout/m);
  assert.match(sql, /INSERT INTO auth\.users\(id\)/);
  assert.match(sql, /INSERT INTO public\.admin_users\(user_id\)/);
  assert.match(sql, /INSERT INTO public\.service_requests/);
  assert.match(sql, /INSERT INTO public\.service_request_triage/);
  assert.match(sql, /INSERT INTO public\.service_brief_amendments/);
  assert.match(sql, /ROLLBACK;\s*SELECT 'PASS:/);
  assert.doesNotMatch(sql, /BEGIN;\s*COMMIT;/);
  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|TRUNCATE|COPY|GRANT|REVOKE)\s+(?:ROLE|TABLE|SCHEMA|DATABASE)\b/i);
  assert.doesNotMatch(sql, /https?:\/\/|supabase\.co|sb_secret_|service_role/);
});

test('real SQL impersonates authenticated A/B/admin and anonymous roles, not superuser assertions',async()=>{
  const sql=await read(source);
  assert.equal((sql.match(/^SET LOCAL ROLE authenticated;$/gm)||[]).length,3);
  assert.equal((sql.match(/^SET LOCAL ROLE anon;$/gm)||[]).length,1);
  assert.equal((sql.match(/^RESET ROLE;$/gm)||[]).length,4);
  for (const id of [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ]) assert.ok(sql.includes(id));
  assert.match(sql,/set_config\('request\.jwt\.claim\.sub'/);
  assert.match(sql,/DO \$owner_a\$/);
  assert.match(sql,/DO \$owner_b\$/);
  assert.match(sql,/DO \$admin\$/);
  assert.match(sql,/DO \$anonymous\$/);
});

test('positive ownership reads and forbidden customer cross-account reads both execute',async()=>{
  const sql=await read(source);
  for (const name of [
    'public.service_requests',
    'public.service_request_activity',
    'public.service_brief_amendments',
    'public.service_request_journal',
    'public.service_customer_amendment_queue',
    'public.service_admin_amendment_queue',
    'public.service_request_triage',
  ]) assert.ok(sql.includes(name),name);
  assert.match(sql,/owner A request RLS read violated/);
  assert.match(sql,/owner B role isolation violated/);
  assert.match(sql,/owner A journal source\/row privacy violated/);
  assert.match(sql,/owner A customer\/admin queue boundary violated/);
  assert.match(sql,/owner A can see admin-only triage/);
  assert.match(sql,/internal triage leaked through participant journal to admin/);
});

test('real forbidden writes, delivery protection and anonymous SQL permission denials are asserted',async()=>{
  const sql=await read(source);
  assert.match(sql,/owner A cross-account amendment INSERT succeeded/);
  assert.match(sql,/owner A changed another customer amendment status/);
  assert.match(sql,/customer B reviewed own amendment/);
  assert.match(sql,/unverified delivery status incorrectly accepted/);
  assert.match(sql,/EXCEPTION WHEN check_violation THEN NULL/);
  assert.match(sql,/EXCEPTION WHEN insufficient_privilege THEN NULL/);
  assert.match(sql,/anonymous journal SELECT unexpectedly succeeded/);
  assert.match(sql,/anonymous service request SELECT unexpectedly succeeded/);
  assert.match(sql,/reviewed_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'/);
});

test('isolated replay workflow executes actual RLS test after all migration and catalog steps',async()=>{
  const workflow=await read('.github/workflows/services-pg17-disposable-replay.yml');
  const replay=workflow.indexOf('done < "$RUNNER_TEMP/services-isolated-files.txt"');
  const catalog=workflow.indexOf('< docs/sql/eternyx/services-phase29-disposable-catalog-assert.sql');
  const roles=workflow.indexOf('< docs/sql/eternyx/services-phase30-disposable-rls-acceptance.sql');
  assert.ok(replay>0 && catalog>replay && roles>catalog);
  assert.match(workflow,/postgres:17-alpine/);
  assert.match(workflow,/docker run --detach --rm --network none/);
  assert.match(workflow,/node --test tests\/services-pg17-replay-plan.test.mjs tests\/services-pg17-role-isolation-phase30.test.mjs/);
  assert.match(workflow,/permissions:\s*contents: read/);
  assert.doesNotMatch(workflow,/\bsecrets\.|supabase\s+db\s+push|--publish|--network host/);
});

test('Phase 30 notes explain synthetic limits and independent live release gates',async()=>{
  const notes=await read('docs/ETERNYX_SERVICES_RLS_ACCEPTANCE_PHASE30.md');
  assert.match(notes,/no new migration/i);
  assert.match(notes,/Phase 13 before Phase 14/);
  assert.match(notes,/real-account staging/i);
  assert.match(notes,/not production-ready/i);
  assert.match(notes,/transaction rollback/i);
});
