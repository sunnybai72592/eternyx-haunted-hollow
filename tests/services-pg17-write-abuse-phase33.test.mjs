import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const file='docs/sql/eternyx/services-phase33-disposable-write-abuse.sql';

test('Phase 33 SQL executes only in disposable fixture transaction and independently verifies cleanup',async()=>{
  const sql=await read(file);
  assert.match(sql,/^BEGIN;\nSET LOCAL statement_timeout = '15000ms';/);
  assert.match(sql,/\nROLLBACK;\nDO \$cleanup\$/);
  assert.match(sql,/fixture did not roll back/);
  assert.match(sql,/INSERT INTO auth\.users/);
  assert.match(sql,/INSERT INTO public\.service_requests/);
  assert.doesNotMatch(sql,/\b(?:CREATE|DROP|GRANT|REVOKE|ALTER)\s+(?:ROLE|TABLE|SCHEMA|FUNCTION|POLICY|VIEW|DATABASE)\b/i);
  assert.doesNotMatch(sql,/https?:\/\/|supabase\.co|sb_secret_|service_role/);
});

test('Phase 33 uses actual authenticated A/B/admin roles and anonymous denial',async()=>{
  const sql=await read(file);
  assert.equal((sql.match(/^SET LOCAL ROLE authenticated;$/gm)||[]).length,3);
  assert.equal((sql.match(/^SET LOCAL ROLE anon;$/gm)||[]).length,1);
  assert.equal((sql.match(/^RESET ROLE;$/gm)||[]).length,4);
  for(const label of [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ]) assert.ok(sql.includes(label));
  assert.match(sql,/set_config\('request\.jwt\.claim\.sub'/);
});

test('Phase 33 rejects case/whitespace duplicates with exact server SQLSTATE and message',async()=>{
  const sql=await read(file);
  assert.match(sql,/SYNTHETIC REVISION ALPHA/);
  assert.match(sql,/EXCEPTION WHEN SQLSTATE 'P0001'/);
  assert.match(sql,/GET STACKED DIAGNOSTICS message = MESSAGE_TEXT/);
  assert.match(sql,/This brief amendment was already submitted recently\./);
  assert.match(sql,/duplicate normalization guard failed/);
  assert.match(sql,/rejected insert changed persisted state/);
});

test('Phase 33 rejects forged author, cross-account inserts, timestamps and immutable edits',async()=>{
  const sql=await read(file);
  for(const label of [
    'forged amendment author succeeded',
    'cross-owner amendment insert succeeded',
    'client timestamp forgery allowed',
    'owner edited immutable summary',
    'owner deleted immutable amendment',
    'owner self-reviewed an amendment',
    'admin modified immutable customer details',
    'anonymous amendment read accepted',
  ])assert.ok(sql.includes(label),label);
  assert.match(sql,/EXCEPTION WHEN insufficient_privilege/);
  assert.match(sql,/GET DIAGNOSTICS changed = ROW_COUNT/);
});

test('Phase 33 proves exactly four allowed amendments, fifth throttled and other owner unaffected',async()=>{
  const sql=await read(file);
  assert.match(sql,/Synthetic revision Alpha/);
  assert.match(sql,/Synthetic revision Bravo/);
  assert.match(sql,/Synthetic revision Charlie/);
  assert.match(sql,/Synthetic revision Delta/);
  assert.match(sql,/Synthetic revision Echo/);
  assert.match(sql,/Too many brief amendments\. Try again in ten minutes\./);
  assert.match(sql,/fifth owner amendment bypassed burst limit/);
  assert.match(sql,/burst or rejected attempts changed row count/);
  assert.match(sql,/owner-specific burst\/journal isolation failed/);
});

test('Phase 33 audits real admin review stamping, idempotency, no reopen, and journal lineage',async()=>{
  const sql=await read(file);
  assert.match(sql,/reviewed_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'/);
  assert.match(sql,/reviewer\/time not stamped by server/);
  assert.match(sql,/idempotent admin review changed timestamp/);
  assert.match(sql,/admin reopened reviewed amendment/);
  assert.match(sql,/event_kind='amendment_reviewed'/);
  assert.match(sql,/event_kind='amendment_submitted'/);
  assert.match(sql,/admin review created duplicate or lost source journal event/);
});

test('Phase 33 executes after catalog mutation replay inside network-isolated real PG17 CI',async()=>{
  const wf=await read('.github/workflows/services-pg17-disposable-replay.yml');
  const catalog=wf.indexOf('< "$RUNNER_TEMP/services-phase32-catalog-regressions.sql"');
  const abuse=wf.indexOf('< docs/sql/eternyx/services-phase33-disposable-write-abuse.sql');
  assert.ok(catalog>0 && abuse>catalog);
  assert.match(wf,/--network none/);
  assert.match(wf,/postgres:17-alpine/);
  assert.match(wf,/permissions:\s*contents: read/);
  assert.match(wf,/services-pg17-write-abuse-phase33\.test\.mjs/);
  assert.doesNotMatch(wf,/secrets\.|supabase\s+db\s+push|--network host/);
});

test('Phase 33 operator notes never equate isolated SQL acceptance with live production',async()=>{
  const doc=await read('docs/ETERNYX_SERVICES_WRITE_ABUSE_PHASE33.md');
  assert.match(doc,/no new migration/i);
  assert.match(doc,/Phase 13 before Phase 14/);
  assert.match(doc,/real-account staging/i);
  assert.match(doc,/not production-ready/i);
  assert.match(doc,/transaction rollback/i);
});
