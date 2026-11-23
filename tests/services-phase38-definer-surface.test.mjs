import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  exposedRoutineSql,verifyRoutineExposure,EXPOSED_ROUTINE_CHECKS
} from '../scripts/services-phase38-executable-definer-guard.mjs';
import {buildPhase38DisposableSql}
 from '../scripts/services-phase38-definer-mutation-replay.mjs';
import {buildAuditSql,validateLiveAuditOutput}
 from '../scripts/services-phase36-staging-live-db-proof.mjs';
import {REQUIRED_AUDITOR_ASSERTIONS}
 from '../scripts/services-phase37-auditor-privileges.mjs';
import {SERVICES_REPLAY_FILES}
 from '../scripts/services-pg17-replay-plan.mjs';

const read=(p)=>readFile(new URL('../'+p,import.meta.url),'utf8');
const ok=()=>Object.fromEntries(EXPOSED_ROUTINE_CHECKS.map(key=>[key,true]));
const fakeTime=new Date('2026-11-23T21:30:00Z');
const ref='abcdefghijklmnopqrst';
const fixture=()=>[
  {role:'services_staging_auditor',db:'postgres',
   server_time:'2026-11-23T21:30:00+00:00',
   auditor_privileges:Object.fromEntries(REQUIRED_AUDITOR_ASSERTIONS.map(k=>[k,true])),
   routine_surface:ok(),definer_hardening:{auditor_nonvolatile_definer_execute_denied:true,client_definer_unsafe_search_path_denied:true,definer_trigger_unsafe_search_path_denied:true}},
  {managed_migrations:SERVICES_REPLAY_FILES.map((file,i)=>({
   name:file.slice(15,-4),version:'202611'+String(22000000+i).padStart(8,'0')
  }))},
  {phase1_requests:true,phase12_customer_followup_queue:true,
   phase13_amendments:true,phase13_customer_queue:true,
   phase13_admin_queue:true,phase14_journal:true},
  {catalog_checks_passed:true,checks_evaluated:64,checks_failed:0,failed_check_ids:[]},
];
const render=(data)=>data.map(JSON.stringify).join('\n')+'\n';

test('Phase38 requires exact three literal boolean TRUE security facts',()=>{
 const x=verifyRoutineExposure(ok());
 assert.equal(x.privilegedRoutineCatalogSafe,true);
 assert.equal(x.checksPassed,3);
 assert.equal(x.callableCodeInspected,false);
 assert.equal(x.securityDefinerSideEffectsProvenSafe,false);
 assert.equal(x.remoteWritePerformed,false);
 assert.throws(()=>verifyRoutineExposure(null),/services_phase38_routine_evidence_missing/);
 assert.throws(()=>verifyRoutineExposure([]),/services_phase38_routine_evidence_missing/);
 assert.throws(()=>verifyRoutineExposure({}),/services_phase38_routine_evidence_incomplete/);
 assert.throws(()=>verifyRoutineExposure({...ok(),extra:true}),/services_phase38_routine_evidence_incomplete/);
});
test('Phase38 denies false, null, missing, string and numeric versions of each proof',()=>{
 for(const key of EXPOSED_ROUTINE_CHECKS){
  for(const bad of [false,null,'true','false',1,0,undefined]){
   const value={...ok(),[key]:bad};
   assert.throws(()=>verifyRoutineExposure(value),/services_phase38_routine_exposure_blocked/);
  }
  const missing=ok();delete missing[key];
  assert.throws(()=>verifyRoutineExposure(missing),/services_phase38_routine_evidence_incomplete/);
 }
});
test('Phase38 SQL checks actually callable privileged routines, not raw existence or source body',()=>{
 const sql=exposedRoutineSql();
 assert.match(sql,/^SELECT\n/);
 assert.match(sql,/pg_catalog\.pg_proc/);
 assert.match(sql,/pg_catalog\.pg_namespace/);
 assert.match(sql,/p\.prosecdef AND p\.provolatile='v'/);
 assert.match(sql,/p\.prosecdef AND p\.prokind='p'/);
 assert.match(sql,/has_function_privilege\(current_user,p\.oid,'EXECUTE'\)/);
 assert.match(sql,/has_schema_privilege\(current_user,n\.oid,'USAGE'\)/);
 assert.match(sql,/pg_catalog\.to_regnamespace\('eternyx_private'\)/);
 assert.match(sql,/p\.prorettype NOT IN \('pg_catalog\.trigger'::regtype, 'pg_catalog\.event_trigger'::regtype\)/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE|DELETE FROM|DROP|ALTER|CREATE|GRANT|REVOKE|CALL|DO)\b/i);
 assert.doesNotMatch(sql,/prosrc|pg_get_functiondef|http|customer_email|password/);
 assert.ok(!sql.includes(';'));
});
test('Phase38 embeds three extra facts inside the one existing live read-only transaction',async()=>{
 const markers=await read('docs/sql/eternyx/services-phase35-readonly-schema-markers.sql');
 const verdict=await read('docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql');
 const sql=buildAuditSql(markers,verdict);
 assert.match(sql,/BEGIN TRANSACTION READ ONLY;/);
 assert.match(sql,/AS routine_surface/);
 assert.match(sql,/volatile_security_definer_execute_denied/);
 assert.match(sql,/private_helper_schema_usage_denied/);
 assert.match(sql,/security_definer_procedures_execute_denied/);
 assert.match(sql,/SELECT row_to_json\(s\) FROM \(SELECT\n/);
 assert.equal((sql.match(/BEGIN TRANSACTION READ ONLY;/g)||[]).length,1);
 assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
});
test('Phase38 blocks real staging even if catalog, migration and Phase37 flags are all green',()=>{
 assert.equal(validateLiveAuditOutput(render(fixture()),{ref},fakeTime).accepted,true);
 for(const key of EXPOSED_ROUTINE_CHECKS){
  const a=fixture();a[0].routine_surface[key]=false;
  assert.throws(()=>validateLiveAuditOutput(render(a),{ref},fakeTime),
   /services_phase36_dangerous_callable_routines_detected/,key);
 }
 const b=fixture();delete b[0].routine_surface;
 assert.throws(()=>validateLiveAuditOutput(render(b),{ref},fakeTime),
  /services_phase36_dangerous_callable_routines_detected/);
});
test('Phase38 disposable SQL tests baseline, deliberate function/procedure/private schema exposure and cleanup',()=>{
 const sql=buildPhase38DisposableSql();
 for(const fragment of [
  'CREATE ROLE services_staging_auditor',
  'BEGIN TRANSACTION READ ONLY;',
  'CREATE FUNCTION public.services_phase38_disposable_definer',
  'SECURITY DEFINER',
  'REVOKE ALL ON FUNCTION',
  'GRANT EXECUTE ON FUNCTION',
  'GRANT EXECUTE ON PROCEDURE',
  'GRANT USAGE ON SCHEMA eternyx_private',
  'REVOKE USAGE ON SCHEMA eternyx_private',
  'DROP PROCEDURE public.services_phase38_disposable_proc',
  'DROP FUNCTION public.services_phase38_disposable_definer',
  'DROP ROLE services_staging_auditor',
  'PASS: disposable PG17',
 ])assert.ok(sql.includes(fragment),fragment);
 assert.ok((sql.match(/BEGIN TRANSACTION READ ONLY;/g)||[]).length>=6);
 assert.match(sql,/volatile_privileged_exposure failed/);
 assert.match(sql,/privileged_procedure_exposure failed/);
 assert.match(sql,/private_helper_schema_exposure failed/);
 assert.doesNotMatch(sql,/supabase db push|https?:\/\/|service_role.*password/);
});
test('Phase38 suite is wired after the seven Phase37 checks in networkless PG17',async()=>{
 const wf=await read('.github/workflows/services-pg17-disposable-replay.yml');
 assert.match(wf,/tests\/services-phase38-definer-surface\.test\.mjs/);
 assert.match(wf,/node scripts\/services-phase38-definer-mutation-replay\.mjs --stdout/);
 assert.match(wf,/services-phase38-definer-mutations\.sql/);
 assert.match(wf,/--network none/);
 assert.match(wf,/postgres:17-alpine/);
 const staging=await read('.github/workflows/services-staging-acceptance.yml');
 assert.match(staging,/environment: services-staging/);
 assert.match(staging,/node scripts\/services-phase36-staging-live-db-proof\.mjs/);
});
test('Phase38 runbook discloses that this is not full SECURITY DEFINER code review',async()=>{
 const note=await read('docs/ETERNYX_SERVICES_PRIVILEGED_ROUTINE_PHASE38.md');
 assert.match(note,/trigger functions/i);
 assert.match(note,/SECURITY DEFINER/i);
 assert.match(note,/three/i);
 assert.match(note,/not production-ready/i);
 assert.match(note,/Phase 13 before Phase 14/);
 assert.match(note,/real-account staging/i);
});
