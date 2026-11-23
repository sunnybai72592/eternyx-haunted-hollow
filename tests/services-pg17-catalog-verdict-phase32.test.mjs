import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  PHASE27_SQL,catalogMutations,validateOperatorQuery,
  createServicesCatalogReplay,planCatalogReplay,
} from '../scripts/services-pg17-catalog-verdict-regressions.mjs';
import {SERVICES_CATALOG_CHECKS} from '../scripts/services-staging-release-evidence.mjs';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('Phase 32 uses exactly the Phase 27 operator SQL, executes 64 actual checks',async()=>{
  const original=await read(PHASE27_SQL);
  const emitted=await planCatalogReplay();
  const query=validateOperatorQuery(original);
  assert.equal(SERVICES_CATALOG_CHECKS,64);
  assert.equal((emitted.match(/CREATE TEMP TABLE services_catalog_verdict ON COMMIT DROP AS/g)||[]).length,7);
  assert.equal(emitted.split(query+';').length-1,7);
  assert.equal((emitted.match(/^BEGIN;$/gm)||[]).length,7);
  assert.equal((emitted.match(/^ROLLBACK;$/gm)||[]).length,7);
  assert.equal((emitted.match(/FROM pg_temp\.services_catalog_verdict/g)||[]).length,7);
  assert.match(emitted,/catalog_checks_passed IS TRUE/);
  assert.match(emitted,/checks_evaluated = 64/);
  assert.match(emitted,/checks_failed = 0/);
  assert.match(emitted,/cardinality\(failed_check_ids\)/);
  assert.match(emitted,/catalog_checks_passed IS FALSE/);
  assert.match(emitted,/checks_failed >= 1/);
});

test('Phase 32 rejects any attempt to append SQL commands or query business rows',async()=>{
  const sql=await read(PHASE27_SQL);
  for(const invalid of [
    '',
    'SELECT 1;',
    sql+' DELETE FROM public.service_requests;',
    sql.replace(/WITH\s+/, 'INSERT INTO public.service_requests '),
    sql.replace(/FROM pg_catalog\.pg_class/, 'FROM public.service_requests'),
    sql.replace(/COUNT\(\*\) FILTER \(WHERE passed IS NOT TRUE\)/, 'COUNT(*)'),
    sql.replace(/COALESCE\(bool_and\(passed IS TRUE\), false\)/, 'true'),
  ])assert.throws(()=>validateOperatorQuery(invalid));
  assert.doesNotThrow(()=>validateOperatorQuery(sql));
});

test('six actual SQL mutation cases cover grants, RLS, invoker views, policies and triggers',()=>{
  assert.equal(catalogMutations.length,6);
  const ids=catalogMutations.map(x=>x.id);
  assert.equal(new Set(ids).size,ids.length);
  for(const code of [
    'anon_journal_grant',
    'missing_activity_authenticated_grant',
    'amendment_rls_disabled',
    'journal_no_longer_invoker',
    'amendment_burst_trigger_disabled',
    'amendment_owner_policy_dropped',
  ])assert.ok(ids.includes(code),code);
  for(const m of catalogMutations){
    assert.match(m.sql,/^(?:GRANT|REVOKE|ALTER|DROP) /);
    assert.match(m.sql,/;$/);
    assert.match(m.failedCheck,/^[a-z_]+\/[a-z0-9_]+(?:\/[a-z0-9_]+)?$/);
  }
});

test('Phase 27 now audits authenticated SELECT on every one of the 11 required resources',async()=>{
  const sql=await read(PHASE27_SQL);
  const entries=[...sql.matchAll(/\('service_[a-z_]+', '(?:view|table)', (?:true|false), (?:true|false), (?:true|false), (true|false)\)/g)];
  assert.equal(entries.length,11);
  assert.ok(entries.every(e=>e[1]==='true'));
  assert.match(sql,/has_table_privilege\('authenticated', c\.oid, 'SELECT'\)/);
  assert.match(sql,/has_table_privilege\('anon', c\.oid, 'SELECT'\)/);
  assert.match(sql,/COALESCE\(bool_and\(passed IS TRUE\), false\)/);
});

test('shared Phase 31 staging gate consumes same 64-check constant, without accepting incomplete evidence',async()=>{
  const src=await read('scripts/services-staging-release-evidence.mjs');
  assert.match(src,/export const SERVICES_CATALOG_CHECKS = 64;/);
  assert.match(src,/c\.checks_evaluated !== SERVICES_CATALOG_CHECKS/);
  assert.match(src,/c\.checks_failed !== 0/);
  assert.match(src,/c\.failed_check_ids\.length !== 0/);
  assert.match(src,/operator_supplied_not_independently_authenticated/);
});

test('replay workflow checks Phase 27 only after four-actor SQL, and never uses live Supabase',async()=>{
  const wf=await read('.github/workflows/services-pg17-disposable-replay.yml');
  const a=wf.indexOf('services-phase30-disposable-rls-acceptance.sql');
  const b=wf.indexOf('node scripts/services-pg17-catalog-verdict-regressions.mjs --stdout');
  const c=wf.indexOf('services-phase32-catalog-regressions.sql');
  assert.ok(a>0 && b>a && c>b);
  assert.match(wf,/--network none/);
  assert.match(wf,/postgres:17-alpine/);
  assert.match(wf,/permissions:\s*contents: read/);
  assert.match(wf,/services-pg17-catalog-verdict-phase32\.test\.mjs/);
  assert.doesNotMatch(wf,/secrets\.|supabase\s+db\s+push|--network host/);
  const gen=await read('scripts/services-pg17-catalog-verdict-regressions.mjs');
  assert.doesNotMatch(gen,/createClient\(|execute_sql|apply_migration|fetch\(|https\.request/);
});

test('Phase 32 operational notes do not equate isolated catalog success to live release',async()=>{
  const doc=await read('docs/ETERNYX_SERVICES_CATALOG_RUNTIME_PHASE32.md');
  assert.match(doc,/Phase 13 before Phase 14/);
  assert.match(doc,/64 checks/i);
  assert.match(doc,/six security regressions/i);
  assert.match(doc,/not production-ready/i);
  assert.match(doc,/no new migration/i);
  assert.match(doc,/real-account staging/i);
});
