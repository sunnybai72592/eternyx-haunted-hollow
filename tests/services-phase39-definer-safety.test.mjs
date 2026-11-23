import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {phase39Sql,validatePhase39Facts,PHASE39_FACTS}
 from '../scripts/services-phase39-definer-safety.mjs';
import {generatePhase39DisposableSql}
 from '../scripts/services-phase39-definer-mutation-replay.mjs';
import {buildAuditSql,validateLiveAuditOutput}
 from '../scripts/services-phase36-staging-live-db-proof.mjs';
import {REQUIRED_AUDITOR_ASSERTIONS}
 from '../scripts/services-phase37-auditor-privileges.mjs';
import {EXPOSED_ROUTINE_CHECKS}
 from '../scripts/services-phase38-executable-definer-guard.mjs';
import {SERVICES_REPLAY_FILES}
 from '../scripts/services-pg17-replay-plan.mjs';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const safe=()=>Object.fromEntries(PHASE39_FACTS.map(x=>[x,true]));
const now=new Date('2026-11-23T22:00:00Z');
const ref='abcdefghijklmnopqrst';
const identity=()=>({
 role:'services_staging_auditor',db:'postgres',server_time:'2026-11-23T22:00:00+00:00',
 auditor_privileges:Object.fromEntries(REQUIRED_AUDITOR_ASSERTIONS.map(x=>[x,true])),
 routine_surface:Object.fromEntries(EXPOSED_ROUTINE_CHECKS.map(x=>[x,true])),
 definer_hardening:safe(),
});
const rows=()=>[
 identity(),
 {managed_migrations:SERVICES_REPLAY_FILES.map((file,i)=>({
   name:file.slice(15,-4),version:'202611'+String(22000000+i).padStart(8,'0'),
 }))},
 {phase1_requests:true,phase12_customer_followup_queue:true,phase13_amendments:true,
  phase13_customer_queue:true,phase13_admin_queue:true,phase14_journal:true},
 {catalog_checks_passed:true,checks_evaluated:64,checks_failed:0,failed_check_ids:[]},
];
const out=data=>data.map(JSON.stringify).join('\n')+'\n';

test('Phase39 accepts EXACT three true facts and openly limits its security claim',()=>{
 const r=validatePhase39Facts(safe());
 assert.equal(r.passed,true);
 assert.equal(r.catalogFacts,3);
 assert.equal(r.functionBodiesReviewed,false);
 assert.equal(r.fullAuditOfAllSchemas,false);
 assert.equal(r.noRemoteMutation,true);
 assert.throws(()=>validatePhase39Facts(null),/services_phase39_evidence_missing/);
 assert.throws(()=>validatePhase39Facts([]),/services_phase39_evidence_missing/);
 assert.throws(()=>validatePhase39Facts({}),/services_phase39_evidence_incomplete/);
 assert.throws(()=>validatePhase39Facts({...safe(),unexpected:true}),/services_phase39_evidence_incomplete/);
});
test('Phase39 rejects each bad, null, numeric, fake or omitted asserted fact',()=>{
 for(const key of PHASE39_FACTS){
  for(const bad of [false,null,'true','false',0,1,undefined]){
   assert.throws(()=>validatePhase39Facts({...safe(),[key]:bad}),
    /services_phase39_definer_risk_detected/,key);
  }
  const missing=safe();delete missing[key];
  assert.throws(()=>validatePhase39Facts(missing),/services_phase39_evidence_incomplete/);
 }
});
test('Phase39 SQL checks actual nonvolatile auditor execute and client function effective grants',()=>{
 const sql=phase39Sql();
 assert.match(sql,/^SELECT\n/);
 assert.match(sql,/p\.provolatile IN \('s','i'\)/);
 assert.match(sql,/p\.prosecdef/);
 assert.match(sql,/has_function_privilege\(current_user,p\.oid,'EXECUTE'\)/);
 assert.match(sql,/has_function_privilege\('anon',p\.oid,'EXECUTE'\)/);
 assert.match(sql,/has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
 assert.match(sql,/has_schema_privilege\(current_user,n\.oid,'USAGE'\)/);
 assert.match(sql,/unnest\(p\.proconfig\)/);
 assert.match(sql,/search_path=/);
 assert.match(sql,/p\.prorettype='pg_catalog\.trigger'::regtype/);
 assert.match(sql,/pg_catalog\.pg_proc/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE\s+public|DELETE FROM|DROP TABLE|ALTER TABLE|GRANT EXECUTE|CALL)\b/i);
 assert.doesNotMatch(sql,/prosrc|pg_get_functiondef/);
 assert.equal(sql.includes(';'),false);
});
test('Phase39 same single staging READ ONLY transaction binds all three facts',async()=>{
 const markers=await read('docs/sql/eternyx/services-phase35-readonly-schema-markers.sql');
 const verdict=await read('docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql');
 const sql=buildAuditSql(markers,verdict);
 assert.match(sql,/AS definer_hardening/);
 assert.match(sql,/auditor_nonvolatile_definer_execute_denied/);
 assert.match(sql,/client_definer_unsafe_search_path_denied/);
 assert.match(sql,/definer_trigger_unsafe_search_path_denied/);
 assert.equal((sql.match(/BEGIN TRANSACTION READ ONLY;/g)||[]).length,1);
 assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
});
test('Phase39 blocks staging even if earlier privilege, definer and 64 catalog checks pass',()=>{
 const good=validateLiveAuditOutput(out(rows()),{ref},now);
 assert.equal(good.accepted,true);
 assert.equal(good.definerHardeningCatalogChecksPassed,3);
 assert.equal(good.insecureDefinerSearchPathDenied,true);
 for(const key of PHASE39_FACTS){
  const bad=rows();bad[0].definer_hardening[key]=false;
  assert.throws(()=>validateLiveAuditOutput(out(bad),{ref},now),
   /services_phase36_definer_searchpath_risk_detected/,key);
 }
 const absent=rows();delete absent[0].definer_hardening;
 assert.throws(()=>validateLiveAuditOutput(out(absent),{ref},now),
  /services_phase36_definer_searchpath_risk_detected/);
});
test('Phase39 disposable PostgreSQL replay covers STABLE, PUBLIC EXECUTE, mutable path and triggers',()=>{
 const sql=generatePhase39DisposableSql();
 for(const marker of [
  'CREATE ROLE services_staging_auditor',
  'GRANT EXECUTE ON FUNCTION public.services_phase39_disposable_definer() TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.services_phase39_disposable_definer() TO services_staging_auditor',
  'ALTER FUNCTION public.services_phase39_disposable_definer() SET search_path = public;',
  'ALTER FUNCTION public.services_phase39_disposable_definer() RESET search_path;',
  'default_public_execute_is_unsafe',
  'GRANT EXECUTE ON FUNCTION public.services_phase39_disposable_weak() TO authenticated',
  'RETURNS trigger',
  'definer_trigger_unsafe_search_path_denied',
  'DROP ROLE services_staging_auditor',
  'PASS: Phase39 hardened client and trigger-definer search paths',
 ])assert.ok(sql.includes(marker),marker);
 assert.ok((sql.match(/BEGIN TRANSACTION READ ONLY;/g)||[]).length>=10);
 assert.match(sql,/-- CRITICAL: network-isolated disposable CI PostgreSQL ONLY/);
 assert.doesNotMatch(sql,/supabase db push|supabase migration repair/);
});
test('Phase39 networkless CI runs exact catalog query after Phase38 security replay',async()=>{
 const wf=await read('.github/workflows/services-pg17-disposable-replay.yml');
 assert.match(wf,/tests\/services-phase39-definer-safety\.test\.mjs/);
 assert.match(wf,/node scripts\/services-phase39-definer-mutation-replay\.mjs --stdout/);
 assert.match(wf,/services-phase39-definer-mutations\.sql/);
 assert.match(wf,/--network none/);
 const protectedWorkflow=await read('.github/workflows/services-staging-acceptance.yml');
 assert.match(protectedWorkflow,/environment: services-staging/);
 assert.match(protectedWorkflow,/scripts\/services-phase36-staging-live-db-proof\.mjs/);
 assert.doesNotMatch(protectedWorkflow,/supabase\s+db\s+push|migration\s+repair/);
});
test('Phase39 runbook covers historical is_admin search_path, no live changes and staging truth',async()=>{
 const text=await read('docs/ETERNYX_SERVICES_DEFINER_SEARCH_PATH_PHASE39.md');
 assert.match(text,/is_admin\(\)/);
 assert.match(text,/SECURITY DEFINER/);
 assert.match(text,/Phase 13 before Phase 14/);
 assert.match(text,/real-account staging/);
 assert.match(text,/not.*production-ready/i);
 assert.match(text,/No new migration/);
});
