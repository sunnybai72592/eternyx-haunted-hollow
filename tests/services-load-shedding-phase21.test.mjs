import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const budgetHelper = async () => {
  const source = await read('src/lib/serviceCountBudget.ts');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(javascript, {
    module, exports: module.exports, Promise, setTimeout, clearTimeout,
    AbortController, AbortSignal, Array, Number, Error,
  });
  return module.exports.runServiceCountBudget;
};

test('Phase 21 runs exact count probes in a strictly serialized order', async () => {
  const run = await budgetHelper();
  let inFlight = 0;
  let peak = 0;
  const sequence = [];
  const tasks = [0, 1, 2, 3].map((index) => async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    sequence.push('start-' + index);
    await new Promise((resolve) => setTimeout(resolve, 3));
    sequence.push('end-' + index);
    inFlight--;
    return { count: index, error: null };
  });
  const results = await run(tasks, () => true);
  assert.deepEqual([...results.counts], [0, 1, 2, 3]);
  assert.equal(results.attempted, 4);
  assert.equal(results.interrupted, false);
  assert.equal(peak, 1);
  assert.deepEqual(sequence, [
    'start-0','end-0', 'start-1','end-1',
    'start-2','end-2', 'start-3','end-3',
  ]);
});

test('a failed count halts all remaining work without returning invented zeros', async () => {
  const run = await budgetHelper();
  let probesRun = 0;
  const result = await run([
    async () => { probesRun++; return {count:7,error:null}; },
    async () => { probesRun++; return {count:null,error:{code:'57014'}}; },
    async () => { probesRun++; return {count:0,error:null}; },
  ], () => true);
  assert.equal(probesRun, 2);
  assert.equal(result.attempted, 2);
  assert.equal(result.interrupted, true);
  assert.deepEqual([...result.counts], [7,null,null]);
});

test('the count budget rejects malformed and negative query results', async () => {
  const run = await budgetHelper();
  for (const count of [undefined, null, -1, Number.NaN, 1.5]) {
    const result = await run([async () => ({ count, error: null })], () => true);
    assert.equal(result.interrupted, true);
    assert.deepEqual([...result.counts], [null]);
  }
});

test('the shared deadline aborts stalled requests rather than leaving a spinner', async () => {
  const run = await budgetHelper();
  let signalSeen;
  const before = Date.now();
  const result = await run([
    (signal) => { signalSeen = signal; return new Promise(() => {}); },
    async () => ({ count:1, error:null }),
  ], () => true, undefined, 12);
  assert.equal(signalSeen.aborted, true);
  assert.equal(result.interrupted, true);
  assert.equal(result.attempted, 1);
  assert.deepEqual([...result.counts], [null,null]);
  assert.ok(Date.now()-before < 1000);
});

test('account switch or explicit cancellation discards the rest of count work', async () => {
  const run = await budgetHelper();
  const stop = new AbortController();
  let requests = 0;
  const result = await run([
    async () => { requests++; stop.abort(); return { count:3, error:null }; },
    async () => { requests++; return {count:4,error:null}; },
  ], () => true, stop.signal, 1000);
  assert.equal(result.interrupted, true);
  assert.equal(requests, 1);
  assert.deepEqual([...result.counts], [null,null]);

  let current = true;
  const stale = await run([
    async () => { current = false; return {count:5,error:null}; },
    async () => ({count:6,error:null}),
  ], () => current);
  assert.equal(stale.interrupted,true);
  assert.deepEqual([...stale.counts],[null,null]);
});

test('unsafe budgets reject immediately, without issuing any service query', async () => {
  const run = await budgetHelper();
  let calls=0;
  for(const deadline of [0,-1,Infinity,30001,NaN]) {
    await assert.rejects(
      run([async()=>{calls++;return {count:1,error:null};}],()=>true,undefined,deadline),
      /Invalid Services count deadline/,
    );
  }
  assert.equal(calls,0);
});

test('customer page no longer launches four expensive count queries automatically', async () => {
  const owner=await read('src/pages/MyServiceRequests.tsx');
  assert.match(owner,/import \{ runServiceCountBudget \}/);
  assert.match(owner,/const pulseAbortRef = useRef<AbortController \| null>\(null\)/);
  assert.match(owner,/const loadPulse = useCallback/);
  assert.match(owner,/runServiceCountBudget\(/);
  assert.match(owner,/const queries = \[/);
  assert.match(owner,/\.select\('id', \{ head: true, count: 'exact' \}\)/);
  assert.match(owner,/\.abortSignal\(signal\)/);
  assert.match(owner,/pulseAbortRef\.current\?\.abort\(\)/);
  assert.match(owner,/pulseGeneration\.current\+\+/);
  assert.match(owner,/const invalidatePulse = \(\) =>/);
  assert.match(owner,/onRefresh=\{\(\) => void loadPulse\(\)\}/);
  assert.doesNotMatch(owner,/if \(userId\) void loadPulse\(\)/);
  assert.doesNotMatch(owner,/Promise\.all\(queries\)/);
  assert.match(owner,/setPulseCounts\(\{ all: null, newActivity: null, answers: null, pendingReviews: null \}\)/);
  assert.match(owner,/onChanged=\{\(\) => \{ void load\(\); invalidatePulse\(\); \}\}/);
});

test('admin nine count probes are opt-in with one shared in-flight cancellation budget', async () => {
  const admin=await read('src/pages/AdminServiceRequests.tsx');
  assert.match(admin,/import \{ runServiceCountBudget \}/);
  assert.match(admin,/const sharedCountAbortRef = useRef<AbortController \| null>\(null\)/);
  assert.match(admin,/const \[reviewCountLoading, setReviewCountLoading\]/);
  assert.match(admin,/const loadQueueCounts = useCallback/);
  assert.match(admin,/const loadActionCounts = useCallback/);
  assert.match(admin,/runServiceCountBudget\(/g);
  assert.match(admin,/sharedCountAbortRef\.current\?\.abort\(\)/);
  assert.match(admin,/const invalidateCountCards = \(\) =>/);
  assert.match(admin,/onRefresh=\{\(\) => void loadActionCounts\(\)\}/);
  assert.match(admin,/Load \/ refresh review counts/);
  assert.match(admin,/onSaved=\{\(\) => \{ void load\(\); invalidateCountCards\(\); \}\}/);
  assert.match(admin,/onChanged=\{\(\) => \{ void load\(\); invalidateCountCards\(\); \}\}/);
  assert.doesNotMatch(admin,/if \(authorized\) void loadQueueCounts\(\)/);
  assert.doesNotMatch(admin,/if \(authorized\) void loadActionCounts\(\)/);
  assert.doesNotMatch(admin,/Promise\.all\(buckets/);
  assert.doesNotMatch(admin,/Promise\.all\(queries\)/);
});

test('load-shedding UI distinguishes unknown totals from actual zero, while keeping filters', async () => {
  const pulse=await read('src/components/services/ServiceActionPulse.tsx');
  const owner=await read('src/pages/MyServiceRequests.tsx');
  const admin=await read('src/pages/AdminServiceRequests.tsx');
  assert.match(pulse,/item\.count === null \? '—' : item\.count/);
  assert.match(pulse,/Not loaded or unavailable · filter still works/);
  assert.match(pulse,/Load \/ refresh counts/);
  assert.match(pulse,/onClick=\{item\.onSelect\}/);
  assert.match(owner,/Cards still filter the server when counts are unavailable/);
  assert.match(admin,/Task cards continue to apply real server filters even when counts are unknown/);
  assert.match(admin,/Review.*counts|review counts/i);
});

test('Phase 21 contains no schema writes and separates timeout correlation from root cause', async () => {
  const docs=await read('docs/ETERNYX_SERVICES_DB_LOAD_SHEDDING_PHASE21.md');
  assert.match(docs,/no new SQL migration/i);
  assert.match(docs,/customer A[\s\S]*customer B[\s\S]*administrator/i);
  assert.match(docs,/not proven.*cause/i);
  assert.match(docs,/Phase 13 before Phase 14/i);
  assert.match(docs,/read receipts/i);
  const audit=await read('docs/sql/eternyx/services-phase21-db-load-audit.sql');
  assert.match(audit,/pg_catalog\.pg_stat_activity/);
  assert.match(audit,/pg_catalog\.pg_stat_database/);
  assert.doesNotMatch(audit,/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b\s+(?:TABLE|FROM|public\.)/i);
});
