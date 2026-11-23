import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  auditorPrivilegeSelect,validateAuditorPrivilegeResult,
  AUDITOR_PRIVILEGE_SQL,REQUIRED_AUDITOR_ASSERTIONS
} from '../scripts/services-phase37-auditor-privileges.mjs';
import {generatePrivilegeMutationReplay}
 from '../scripts/services-phase37-auditor-privilege-replay.mjs';
import {
  validateLiveAuditOutput,buildAuditSql
} from '../scripts/services-phase36-staging-live-db-proof.mjs';

const read=(p)=>readFile(new URL('../'+p,import.meta.url),'utf8');
const safe=()=>Object.fromEntries(REQUIRED_AUDITOR_ASSERTIONS.map(k=>[k,true]));
const now=new Date('2026-11-23T21:00:00Z');
const ref='abcdefghijklmnopqrst';
const fixtures=()=>[
 {role:'services_staging_auditor',db:'postgres',server_time:'2026-11-23T21:00:00+00:00',auditor_privileges:safe(),routine_surface:{volatile_security_definer_execute_denied:true,private_helper_schema_usage_denied:true,security_definer_procedures_execute_denied:true},definer_hardening:{auditor_nonvolatile_definer_execute_denied:true,client_definer_unsafe_search_path_denied:true,definer_trigger_unsafe_search_path_denied:true}},
 {managed_migrations:[
  'service_requests','service_request_activity','service_scope_triage',
  'services_delivery_gate','service_admin_attention_queue','service_write_rate_limits',
  'service_review_planner','service_triage_history','service_request_checkpoints',
  'service_clarifications','service_clarification_followthrough',
  'service_brief_amendments','service_request_journal'
 ].map((name,i)=>({version:'202611'+String(22000000+i).padStart(8,'0'),name}))},
 {phase1_requests:true,phase12_customer_followup_queue:true,phase13_amendments:true,
  phase13_customer_queue:true,phase13_admin_queue:true,phase14_journal:true},
 {catalog_checks_passed:true,checks_evaluated:64,checks_failed:0,failed_check_ids:[]},
];
const asOutput=(rows)=>rows.map(JSON.stringify).join('\n')+'\n';

test('Phase37 PASS requires exactly seven TRUE effective privilege facts',()=>{
 const result=validateAuditorPrivilegeResult(safe());
 assert.equal(result.leastPrivilegeMetadataVerified,true);
 assert.equal(result.checksPassed,7);
 assert.equal(result.securityDefinerFunctionsReviewed,false);
 assert.equal(result.productionChangesMade,false);
 assert.throws(()=>validateAuditorPrivilegeResult(undefined),/services_phase37_privilege_proof_missing/);
 assert.throws(()=>validateAuditorPrivilegeResult(null),/services_phase37_privilege_proof_missing/);
 assert.throws(()=>validateAuditorPrivilegeResult([]),/services_phase37_privilege_proof_missing/);
 assert.throws(()=>validateAuditorPrivilegeResult({}),/services_phase37_privilege_proof_incomplete/);
 assert.throws(()=>validateAuditorPrivilegeResult({...safe(),unexpected:true}),/services_phase37_privilege_proof_incomplete/);
});

test('Phase37 rejects every individual unsafe elevated-role/write grant or nullable/untyped assertion',()=>{
 for(const key of REQUIRED_AUDITOR_ASSERTIONS){
  for(const value of [false,null,'true',1,0,undefined]){
   assert.throws(()=>validateAuditorPrivilegeResult({...safe(),[key]:value}),
     /services_phase37_privilege_proof_failed/,key+'='+String(value));
  }
 }
});

test('Phase37 SQL directly examines PostgreSQL role flags and privileged membership (not names alone)',()=>{
 const sql=auditorPrivilegeSelect();
 assert.equal(sql,AUDITOR_PRIVILEGE_SQL);
 assert.ok(sql.startsWith('SELECT\n'));
 assert.doesNotMatch(sql,/;/);
 for(const marker of [
  'pg_catalog.pg_roles','rolcanlogin','rolsuper','rolcreatedb',
  'rolcreaterole','rolreplication','rolbypassrls','rolinherit',
  'pg_catalog.pg_has_role','pg_write_all_data','pg_database_owner',
  'pg_execute_server_program','pg_read_server_files','pg_write_server_files',
 ])assert.ok(sql.includes(marker),marker);
});

test('Phase37 SQL tests effective ALL-SCHEMA database/table/sequence write privileges',()=>{
 const sql=auditorPrivilegeSelect();
 for(const marker of [
  'has_database_privilege','has_schema_privilege','has_table_privilege',
  'has_sequence_privilege',
  "'CREATE'","'INSERT'","'UPDATE'","'DELETE'","'TRUNCATE'",
  "'REFERENCES'","'TRIGGER'","'USAGE'",
  'pg_catalog.pg_namespace','pg_catalog.pg_class',
  "c.relkind='S'","c.relkind IN ('r','p','v','m','f')",
  "pg_catalog.current_setting('transaction_read_only')",
  "pg_catalog.current_setting('default_transaction_read_only')",
 ])assert.ok(sql.includes(marker),marker);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE\s+public|DROP TABLE|ALTER TABLE|CREATE ROLE|GRANT ON)\b/i);
 assert.doesNotMatch(sql,/https?:\/\/|supabase\.co|customer_email|password/);
});

test('Phase37 automatically blocks live Stage 36 if actual privilege proof is missing or false',()=>{
 assert.equal(validateLiveAuditOutput(asOutput(fixtures()),{ref},now).accepted,true);
 for(const key of REQUIRED_AUDITOR_ASSERTIONS){
  const r=fixtures();r[0].auditor_privileges[key]=false;
  assert.throws(()=>validateLiveAuditOutput(asOutput(r),{ref},now),
   /services_phase36_auditor_privileges_not_verified/,key);
 }
 const x=fixtures();delete x[0].auditor_privileges;
 assert.throws(()=>validateLiveAuditOutput(asOutput(x),{ref},now),
  /services_phase36_auditor_privileges_not_verified/);
});

test('Phase37 source query is embedded in the existing single Phase36 READ ONLY transaction',async()=>{
 const markers=await read('docs/sql/eternyx/services-phase35-readonly-schema-markers.sql');
 const catalog=await read('docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql');
 const sql=buildAuditSql(markers,catalog);
 assert.match(sql,/BEGIN TRANSACTION READ ONLY;/);
 assert.match(sql,/SELECT row_to_json\(p\) FROM \(SELECT\n/);
 assert.match(sql,/rolbypassrls/);
 assert.match(sql,/pg_catalog\.has_table_privilege/);
 assert.match(sql,/pg_catalog\.current_setting\('transaction_read_only'\)/);
 assert.equal((sql.match(/BEGIN TRANSACTION READ ONLY;/g)||[]).length,1);
 assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
 const source=await read('scripts/services-phase36-staging-live-db-proof.mjs');
 assert.match(source,/validateAuditorPrivilegeResult\(identity\.auditor_privileges\)/);
 assert.match(source,/auditor_privileges_not_verified/);
 assert.match(source,/connectionRoleLeastPrivilegeVerified:true/);
});

test('Phase37 disposable runner asserts an initial safe role and five deliberate privilege escalations',()=>{
 const sql=generatePrivilegeMutationReplay();
 assert.match(sql,/CREATE ROLE services_staging_auditor LOGIN NOSUPERUSER/);
 assert.match(sql,/NOINHERIT/);
 assert.equal((sql.match(/BEGIN TRANSACTION READ ONLY;/g)||[]).length,7);
 assert.equal((sql.match(/SET LOCAL ROLE services_staging_auditor;/g)||[]).length,7);
 assert.match(sql,/GRANT INSERT ON public\.service_requests/);
 assert.match(sql,/GRANT CREATE ON SCHEMA public/);
 assert.match(sql,/ALTER ROLE services_staging_auditor CREATEDB/);
 assert.match(sql,/GRANT pg_write_all_data TO services_staging_auditor/);
 assert.match(sql,/GRANT USAGE ON SEQUENCE public\.services_phase37_disposable_seq/);
 assert.match(sql,/DROP SEQUENCE public\.services_phase37_disposable_seq/);
 assert.match(sql,/DROP ROLE services_staging_auditor/);
 assert.match(sql,/DISPOSABLE container-only synthetic role/);
});

test('Phase37 CI executes local privilege tests and isolated real PG17 mutation suite, never Supabase',async()=>{
 const wf=await read('.github/workflows/services-pg17-disposable-replay.yml');
 assert.match(wf,/tests\/services-phase37-auditor-privileges\.test\.mjs/);
 assert.match(wf,/node scripts\/services-phase37-auditor-privilege-replay\.mjs --stdout/);
 assert.match(wf,/services-phase37-auditor-privilege-regressions\.sql/);
 assert.match(wf,/--network none/);
 assert.match(wf,/postgres:17-alpine/);
 const staging=await read('.github/workflows/services-staging-acceptance.yml');
 assert.match(staging,/node scripts\/services-phase36-staging-live-db-proof\.mjs/);
 assert.match(staging,/environment: services-staging/);
 assert.doesNotMatch(staging,/supabase db push|migration repair/);
});

test('Phase37 documents effective metadata checks and explicitly unproven security-definer behavior',async()=>{
 const doc=await read('docs/ETERNYX_SERVICES_AUDITOR_LEAST_PRIVILEGE_PHASE37.md');
 assert.match(doc,/seven/i);
 assert.match(doc,/security.definer/i);
 assert.match(doc,/no new migration/i);
 assert.match(doc,/Phase 13 before Phase 14/);
 assert.match(doc,/real-account staging/i);
 assert.match(doc,/not production-ready/i);
});
