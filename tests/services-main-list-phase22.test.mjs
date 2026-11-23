import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
async function helper() {
  const src = await read('src/lib/servicePageReadBudget.ts');
  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(js, {
    module, exports:module.exports, Promise, setTimeout, clearTimeout,
    AbortController, AbortSignal, Array, Number, Error,
  });
  return module.exports;
}

test('confirmed real pages preserve exact count including a genuine empty result', async () => {
  const { readServicePageWithinBudget:run } = await helper();
  const nonempty = await run(async () => ({data:[{id:'owned'}],count:12,error:null}), () => true);
  assert.equal(nonempty.kind,'ready');
  assert.equal(nonempty.count,12);
  assert.deepEqual([...nonempty.data], [{id:'owned'}]);
  const empty = await run(async () => ({data:[],count:0,error:null}), () => true);
  assert.equal(empty.kind,'ready');
  assert.equal(empty.count,0);
  assert.deepEqual([...empty.data],[]);
});

test('null/inconsistent API data or count is unavailable, never an invented empty inbox', async () => {
  const { readServicePageWithinBudget:run } = await helper();
  for (const response of [
    {data:[],count:null,error:null},
    {data:null,count:0,error:null},
    {data:[{id:'x'}],count:0,error:null},
    {data:[],count:-1,error:null},
    {data:[],count:1.5,error:null},
    {data:[],count:Number.NaN,error:null},
  ]) {
    const result=await run(async()=>response,()=>true);
    assert.equal(result.kind,'unavailable');
    assert.match(result.message,/verified page count/i);
  }
});

test('database permission, missing views, network and query-timeout errors are classified without raw details', async () => {
  const { readServicePageWithinBudget:run, describeServicePageError } = await helper();
  const cases=[
    ['42501',/cannot access/i],
    ['PGRST301',/cannot access/i],
    ['42P01',/view may be missing/i],
    ['PGRST205',/view may be missing/i],
    ['PGRST200',/view may be missing/i],
    ['57014',/timed out/i],
  ];
  for(const [code,message] of cases){
    const result=await run(async()=>({data:null,count:null,error:{code,message:'confidential payload'}}),()=>true);
    assert.equal(result.kind,'unavailable');
    assert.match(result.message,message);
    assert.ok(!result.message.includes('confidential'));
  }
  assert.match(describeServicePageError({message:'Failed to fetch'}),/connection/i);
  assert.match(describeServicePageError(null,true),/timed out/i);
});

test('transport rejecting unexpectedly fails closed and does not leave a loading promise hanging', async () => {
  const { readServicePageWithinBudget:run } = await helper();
  const result=await run(async()=>{throw new Error('Failed to fetch private SQL query');},()=>true);
  assert.equal(result.kind,'unavailable');
  assert.ok(!result.message.includes('private SQL query'));
});

test('shared deadline settles even when fetch never responds to abort', async () => {
  const { readServicePageWithinBudget:run } = await helper();
  let signal;
  const start=Date.now();
  const result=await run((abortSignal)=>{
    signal=abortSignal;
    return new Promise(()=>{});
  },()=>true,undefined,15);
  assert.equal(result.kind,'unavailable');
  assert.match(result.message,/timed out/i);
  assert.equal(signal.aborted,true);
  assert.ok(Date.now()-start<1000);
});

test('external cancellation and prior-account state always discard the result', async () => {
  const { readServicePageWithinBudget:run } = await helper();
  const ctl=new AbortController();
  let issued=0;
  ctl.abort();
  const noStart=await run(async()=>{issued++;return {data:[],count:0,error:null};},()=>true,ctl.signal);
  assert.equal(noStart.kind,'canceled');
  assert.equal(issued,0);

  const another=new AbortController();
  const canceled=await run(async()=>{another.abort();return {data:[{id:'old-user'}],count:1,error:null};},()=>true,another.signal);
  assert.equal(canceled.kind,'canceled');

  let current=true;
  const stale=await run(async()=>{current=false;return {data:[{id:'old-owner'}],count:1,error:null};},()=>current);
  assert.equal(stale.kind,'canceled');
});

test('budget refuses invalid deadlines without performing private query', async () => {
  const { readServicePageWithinBudget:run } = await helper();
  let calls=0;
  for(const time of [-1,0,1.5,30001,Infinity,NaN]){
    await assert.rejects(run(async()=>{calls++;return {data:[],count:0,error:null};},()=>true,undefined,time),/Invalid Services page deadline/);
  }
  assert.equal(calls,0);
});

test('customer list is account-bound, abortable, paginated, exact, retryable and never auto-retried', async () => {
  const owner=await read('src/pages/MyServiceRequests.tsx');
  assert.match(owner,/import \{ readServiceWindowWithinBudget \}/);
  assert.match(owner,/requestAbortRef = useRef<AbortController \| null>/);
  assert.match(owner,/requestAbortRef\.current\?\.abort\(\)/);
  assert.match(owner,/const generation = \+\+requestGeneration\.current/);
  assert.match(owner,/readServiceWindowWithinBudget<RequestRow>\(/);
  assert.match(owner,/\.eq\('user_id', userId\)/);
  assert.match(owner,/setHasMore\(result\.hasMore\)/);
  assert.match(owner,/\.range\(page \* 20, \(page \+ 1\) \* 20\)/);
  assert.match(owner,/\.range\(page \* 20, \(page \+ 1\) \* 20\)\.abortSignal\(signal\)/);
  assert.match(owner,/generation === requestGeneration\.current && useAuthStore\.getState\(\)\.user\?\.id === userId/);
  assert.match(owner,/if \(result\.kind === 'unavailable'\)/);
  assert.match(owner,/setLoadErrorDetail\(result\.message\)/);
  assert.match(owner,/setRowsOwner\(null\)/);
  assert.match(owner,/setPage\(\(previous\) => Math\.max\(0, previous - 1\)\)/);
  assert.match(owner,/role="status" className="mt-2 text-sm text-muted-foreground">\{loadErrorDetail\}/);
  assert.match(owner,/onClick=\{\(\) => void load\(\)\}>Try again/);
  assert.doesNotMatch(owner,/setTimeout\(\(\) => void load/);
});

test('administrator list has the same bounded cancellation and admin-account safeguards', async () => {
  const admin=await read('src/pages/AdminServiceRequests.tsx');
  assert.match(admin,/import \{ readServicePageWithinBudget \}/);
  assert.match(admin,/adminListAbortRef = useRef<AbortController \| null>/);
  assert.match(admin,/adminListAbortRef\.current\?\.abort\(\)/);
  assert.match(admin,/const generation = \+\+fetchGeneration\.current/);
  assert.match(admin,/readServiceWindowWithinBudget<ServiceRow>\(/);
  assert.match(admin,/setHasMore\(result\.hasMore\)/);
  assert.match(admin,/\.range\(page \* PAGE_SIZE, \(page \+ 1\) \* PAGE_SIZE\)/);
  assert.match(admin,/\.range\(page \* PAGE_SIZE, \(page \+ 1\) \* PAGE_SIZE\)\s*\.abortSignal\(signal\)/);
  assert.match(admin,/useAuthStore\.getState\(\)\.user\?\.id === actor && authorizedFor === actor/);
  assert.match(admin,/if \(result\.kind === 'unavailable'\)/);
  assert.match(admin,/setLoadErrorDetail\(result\.message\)/);
  assert.match(admin,/setDrafts\(\{\}\)/);
  assert.match(admin,/setHasMore\(false\)/);
  assert.match(admin,/setPage\(\(previous\) => Math\.max\(0, previous - 1\)\)/);
  assert.match(admin,/onClick=\{\(\) => void load\(\)\}>Retry/);
  assert.match(admin,/supabase\.rpc\('is_admin'\)/);
});

test('Phase 22 release notes preserve production outage and staging acceptance gates',async()=>{
  const notes=await read('docs/ETERNYX_SERVICES_MAIN_LIST_RECOVERY_PHASE22.md');
  assert.match(notes,/no new SQL migration/i);
  assert.match(notes,/Phase 13 before Phase 14/i);
  assert.match(notes,/customer A[\s\S]*customer B[\s\S]*administrator/i);
  assert.match(notes,/connection timeout/i);
  assert.match(notes,/not proof of production readiness/i);
  assert.match(notes,/15.seconds?/i);
});
