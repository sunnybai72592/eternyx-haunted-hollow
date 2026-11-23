import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {concurrencySql} from '../scripts/services-pg17-concurrency-sql.mjs';

const read=(p)=>readFile(new URL('../'+p,import.meta.url),'utf8');
const worker=['a1','a2','b1','b2'];

test('Phase 34 generator accepts only fixed synthetic stages and never opens a connection',async()=>{
  for(const stage of ['seed','holder',...worker,'verify','cleanup']){
    const sql=concurrencySql(stage);
    assert.ok(sql.startsWith('-- DISPOSABLE ISOLATED PG17 ONLY.'));
    assert.equal(typeof sql,'string');
    assert.ok(sql.length>75);
  }
  for(const stage of ['','deploy','production','../../../secrets',null,undefined]){
    assert.throws(()=>concurrencySql(stage),/unknown_services_concurrency_stage/);
  }
  const script=await read('scripts/services-pg17-concurrency-sql.mjs');
  assert.doesNotMatch(script,/createClient\(|execute_sql|apply_migration|fetch\(|https\.request|execFile|spawn\(/);
});

test('seed has two distinct synthetic users and requests and exactly three owner A amendments',()=>{
  const seed=concurrencySql('seed');
  assert.match(seed,/INSERT INTO auth\.users/);
  assert.match(seed,/INSERT INTO public\.service_requests/);
  assert.match(seed,/INSERT INTO public\.service_brief_amendments/);
  assert.match(seed,/Synthetic preseed one/);
  assert.match(seed,/Synthetic preseed two/);
  assert.match(seed,/Synthetic preseed three/);
  assert.match(seed,/COMMIT;/);
  assert.match(seed,/concurrency seed mismatch/);
});

test('holder takes TWO real session-level advisory locks matching actual trigger key contract',async()=>{
  const holder=concurrencySql('holder');
  assert.equal((holder.match(/pg_catalog\.pg_advisory_lock\(/g)||[]).length,2);
  assert.match(holder,/pg_catalog\.hashtextextended/);
  assert.match(holder,/service-brief-amendment:/);
  assert.match(holder,/pg_catalog\.pg_sleep\(20\)/);
  assert.match(holder,/pg_catalog\.pg_advisory_unlock_all/);
  const migration=await read('supabase/migrations/20261123040000_service_brief_amendments.sql');
  assert.match(migration,/pg_catalog\.pg_advisory_xact_lock\(pg_catalog\.hashtextextended/);
  assert.match(migration,/'service-brief-amendment:' \|\| NEW\.request_id::text \|\| ':' \|\| NEW\.author_id::text/);
});

test('all four competing sessions use authenticated SQL role and independent JWT subject',()=>{
  for(const stage of worker){
    const sql=concurrencySql(stage);
    assert.match(sql,/^BEGIN;/m);
    assert.match(sql,/SET LOCAL ROLE authenticated/);
    assert.match(sql,/set_config\('request\.jwt\.claim\.sub'/);
    assert.match(sql,/INSERT INTO public\.service_brief_amendments/);
    assert.match(sql,/COMMIT;/);
    assert.doesNotMatch(sql,/service_role|sb_secret_|supabase\.co/);
  }
  assert.notEqual(concurrencySql('a1'),concurrencySql('a2'));
  assert.notEqual(concurrencySql('b1'),concurrencySql('b2'));
});

test('quota race uses DIFFERENT content on same owner/request, duplicate race uses normalized same content',()=>{
  const a1=concurrencySql('a1'),a2=concurrencySql('a2');
  const b1=concurrencySql('b1'),b2=concurrencySql('b2');
  assert.match(a1,/Concurrent distinct Alpha/);
  assert.match(a2,/Concurrent distinct Bravo/);
  assert.match(b1,/Concurrent same summary/);
  assert.match(b2,/CONCURRENT SAME SUMMARY/);
  assert.match(b1,/Identical content from two simultaneous owner B submissions/);
  assert.match(b2,/identical content from two simultaneous owner b submissions/);
  assert.ok(a1.includes('33333333-3333-4333-8333-333333333333')&&a2.includes('33333333-3333-4333-8333-333333333333'));
  assert.ok(b1.includes('44444444-4444-4444-8444-444444444444')&&b2.includes('44444444-4444-4444-8444-444444444444'));
});

test('persisted outcome SQL fails on extra winners, missing winners or journal leakage',()=>{
  const verify=concurrencySql('verify');
  assert.match(verify,/count_a<>4 OR count_b<>1/);
  assert.match(verify,/Concurrent distinct Alpha/);
  assert.match(verify,/Concurrent distinct Bravo/);
  assert.match(verify,/lower\(btrim\(summary\)\)='concurrent same summary'/);
  assert.match(verify,/event_kind='amendment_submitted'/);
  assert.match(verify,/journal exposes uncommitted or rejected writes/);
  const cleanup=concurrencySql('cleanup');
  assert.match(cleanup,/DELETE FROM public\.service_requests/);
  assert.match(cleanup,/DELETE FROM auth\.users/);
  assert.match(cleanup,/COMMIT;/);
  assert.match(cleanup,/disposable concurrent fixture not cleaned/);
});

test('CI shell insists on actual 4 simultaneous waiters, correct two SQLSTATE denials and cleanup',async()=>{
  const shell=await read('scripts/services-pg17-concurrency-ci.sh');
  assert.match(shell,/set -euo pipefail/);
  assert.match(shell,/HostConfig\.NetworkMode/);
  assert.match(shell,/!= "none"/);
  assert.match(shell,/Config\.Image/);
  assert.match(shell,/postgres:17-alpine/);
  assert.match(shell,/HostConfig\.PortBindings/);
  assert.match(shell,/count\(\*\) FROM pg_catalog\.pg_locks WHERE locktype='advisory' AND NOT granted/);
  assert.match(shell,/\[\[ "\$waiting" == "4" \]\]/);
  assert.match(shell,/for case_id in a1 a2 b1 b2/);
  assert.match(shell,/if wait "\$\{child_pids\[\$case_id\]\}"/);
  assert.match(shell,/P0001/);
  assert.match(shell,/Too many brief amendments/);
  assert.match(shell,/This brief amendment was already submitted recently/);
  assert.match(shell,/a_winners.*!= 1/);
  assert.match(shell,/b_rejected.*!= 1/);
  assert.match(shell,/node "\$sqlgen" verify/);
  assert.match(shell,/node "\$sqlgen" cleanup/);
  assert.match(shell,/trap 'rm -rf -- "\$workdir"' EXIT/);
  assert.doesNotMatch(shell,/--network host|--publish|supabase db push|secrets\./);
});

test('Phase 34 CI executes concurrency AFTER preceding isolated PG17 tests without secrets',async()=>{
  const wf=await read('.github/workflows/services-pg17-disposable-replay.yml');
  const prev=wf.indexOf('< docs/sql/eternyx/services-phase33-disposable-write-abuse.sql');
  const next=wf.indexOf('bash scripts/services-pg17-concurrency-ci.sh "$name"');
  assert.ok(prev>0&&next>prev);
  assert.match(wf,/--network none/);
  assert.match(wf,/tests\/services-pg17-concurrency-phase34\.test\.mjs/);
  assert.match(wf,/scripts\/services-pg17-concurrency-ci\.sh/);
  assert.match(wf,/permissions:\s*contents: read/);
  assert.doesNotMatch(wf,/secrets\.|--network host|--publish/);
});

test('Phase 34 documents staging blocker and no live deployment',async()=>{
  const notes=await read('docs/ETERNYX_SERVICES_CONCURRENCY_PHASE34.md');
  assert.match(notes,/four simultaneous/i);
  assert.match(notes,/no new migration/i);
  assert.match(notes,/Phase 13 before Phase 14/);
  assert.match(notes,/real-account staging/i);
  assert.match(notes,/not production-ready/i);
});
