import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

async function load() {
  const source = await read('src/lib/servicePageReadBudget.ts');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(js, {
    module, exports:module.exports, Promise, AbortController, AbortSignal, setTimeout,
    clearTimeout, Array, Error, Number,
  });
  return module.exports.readServiceWindowWithinBudget;
}

test('page lookahead preserves exactly 20 visible rows, proving Next only with a 21st row', async () => {
  const run=await load();
  const data=Array.from({length:21},(_,n)=>({id:'r'+n}));
  const result=await run(async()=>({data,error:null}),20,()=>true);
  assert.equal(result.kind,'ready');
  assert.equal(result.rows.length,20);
  assert.equal(result.hasMore,true);
  assert.equal(result.rows.some(x=>x.id==='r20'),false);
  const last=await run(async()=>({data:data.slice(0,20),error:null}),20,()=>true);
  assert.equal(last.kind,'ready');
  assert.equal(last.hasMore,false);
  const empty=await run(async()=>({data:[],error:null}),20,()=>true);
  assert.equal(empty.kind,'ready');
  assert.equal(empty.rows.length,0);
  assert.equal(empty.hasMore,false);
});

test('a page larger than the single lookahead bound fails instead of silently losing rows',async()=>{
  const run=await load();
  const data=Array.from({length:23},(_,i)=>({id:i}));
  const x=await run(async()=>({data,error:null}),20,()=>true);
  assert.equal(x.kind,'unavailable');
  assert.match(x.message,/bounded window/i);
});

test('a missing view, null payload or transport failure cannot be interpreted as an empty page',async()=>{
  const run=await load();
  const missing=await run(async()=>({data:null,error:{code:'PGRST205'}}),20,()=>true);
  assert.equal(missing.kind,'unavailable');
  assert.match(missing.message,/missing or unavailable/i);
  const nullRows=await run(async()=>({data:null,error:null}),20,()=>true);
  assert.equal(nullRows.kind,'unavailable');
  const network=await run(async()=>{throw Error('Failed to fetch secret');},20,()=>true);
  assert.equal(network.kind,'unavailable');
  assert.ok(!network.message.includes('secret'));
});

test('never-settling transport is aborted by the shared deadline',async()=>{
  const run=await load();
  let signal;
  const now=Date.now();
  const x=await run((s)=>{signal=s;return new Promise(()=>{});},20,()=>true,undefined,18);
  assert.equal(x.kind,'unavailable');
  assert.equal(signal.aborted,true);
  assert.ok(Date.now()-now<1000);
});

test('prior-account cancellation does not expose a stale window',async()=>{
  const run=await load();
  const ctl=new AbortController();
  const x=await run(async()=>{ctl.abort();return {data:[{id:'private'}],error:null};},20,()=>true,ctl.signal);
  assert.equal(x.kind,'canceled');
  let current=true;
  const y=await run(async()=>{current=false;return {data:[{id:'old'}],error:null};},20,()=>current);
  assert.equal(y.kind,'canceled');
});

test('lookahead page size must be a bounded integer',async()=>{
  const run=await load();
  let invoked=0;
  for(const n of [-1,0,0.5,101,Infinity,NaN]){
    await assert.rejects(run(async()=>{invoked++;return {data:[],error:null};},n,()=>true),/Invalid Services window size/);
  }
  assert.equal(invoked,0);
});

test('customer desk uses count-free 21-row page requests and truthful Next controls',async()=>{
  const s=await read('src/pages/MyServiceRequests.tsx');
  const main=s.slice(s.indexOf('  const load = useCallback(async () => {'),s.indexOf('\n  useEffect(() => {\n    requestGeneration.current',s.indexOf('  const load = useCallback(async () => {')));
  assert.match(main,/readServiceWindowWithinBudget<RequestRow>/);
  assert.match(main,/\.range\(page \* 20, \(page \+ 1\) \* 20\)/);
  assert.doesNotMatch(main,/count: 'exact'/);
  assert.match(main,/\.eq\('user_id', userId\)/);
  assert.match(main,/setRows\(result\.rows\)/);
  assert.match(main,/setHasMore\(result\.hasMore\)/);
  assert.match(main,/page > 0 && result\.rows\.length === 0/);
  assert.match(main,/setPage\(\(previous\) => Math\.max\(0, previous - 1\)\)/);
  assert.match(s,/additional pages \{hasMore \? 'available' : 'not detected'\}/);
  assert.match(s,/disabled=\{loading \|\| !hasMore\}/);
  assert.match(s,/full total not calculated/);
});

test('administrator desk uses the same count-free lookahead and private role/session fences',async()=>{
  const s=await read('src/pages/AdminServiceRequests.tsx');
  const main=s.slice(s.indexOf('  const load = useCallback(async () => {'),s.indexOf('\n  useEffect(() => {\n    let active',s.indexOf('  const load = useCallback(async () => {')));
  assert.match(main,/readServiceWindowWithinBudget<ServiceRow>/);
  assert.match(main,/\.range\(page \* PAGE_SIZE, \(page \+ 1\) \* PAGE_SIZE\)/);
  assert.doesNotMatch(main,/count: 'exact'/);
  assert.match(main,/authorizedFor !== user\.id/);
  assert.match(main,/useAuthStore\.getState\(\)\.user\?\.id === actor/);
  assert.match(main,/setRows\(result\.rows\)/);
  assert.match(main,/setHasMore\(result\.hasMore\)/);
  assert.match(main,/page > 0 && result\.rows\.length === 0/);
  assert.match(s,/disabled=\{loading \|\| !hasMore\}/);
});

test('optional exact counts remain manually invoked rather than firing on main list entry',async()=>{
  const admin=await read('src/pages/AdminServiceRequests.tsx');
  const owner=await read('src/pages/MyServiceRequests.tsx');
  assert.match(owner,/onRefresh=\{\(\) => void loadPulse\(\)\}/);
  assert.match(admin,/onRefresh=\{\(\) => void loadActionCounts\(\)\}/);
  assert.match(admin,/Load \/ refresh review counts/);
  assert.match(owner,/runServiceCountBudget\(/);
  assert.match(admin,/runServiceCountBudget\(/);
});

test('no database migration or production verification claim in Phase 23',async()=>{
  const doc=await read('docs/ETERNYX_SERVICES_COUNT_FREE_PAGINATION_PHASE23.md');
  assert.match(doc,/no new SQL migration/i);
  assert.match(doc,/Phase 13 before Phase 14/i);
  assert.match(doc,/customer A[\s\S]*customer B[\s\S]*administrator/i);
  assert.match(doc,/not proof of\s+production readiness/i);
});
