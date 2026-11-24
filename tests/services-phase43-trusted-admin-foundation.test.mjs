import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 SERVICES_FOUNDATION_FACTS,
 buildFoundationSql,
 analyzeServicesFoundation
} from '../scripts/services-phase43-trusted-admin-foundation.mjs';
import {SERVICES_REPLAY_FILES} from '../scripts/services-pg17-replay-plan.mjs';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const facts=(value=false)=>Object.fromEntries(
 SERVICES_FOUNDATION_FACTS.map(x=>[x,value]));
const output=obj=>JSON.stringify(obj)+'\n';

test('Phase43 matches actual missing trusted-admin staging catalog and blocks rollout',()=>{
 const x=facts();
 x.auth_users_table=true;x.auth_uid_helper=true;
 const result=analyzeServicesFoundation(output(x));
 assert.equal(result.state,'blocked_trusted_admin_foundation_missing');
 assert.equal(result.factsChecked,12);
 assert.equal(result.factsPassed,2);
 assert.ok(result.missingSourceDefinedRequirements.includes('admin_users_table'));
 assert.ok(result.missingSourceDefinedRequirements.includes('is_admin_helper'));
 assert.ok(result.missingSourceDefinedRequirements.includes('is_admin_implicit_public_execute_denied'));
 assert.equal(result.adminAssignmentRowsRead,false);
 assert.equal(result.adminAccountsSeeded,false);
 assert.equal(result.adminFunctionExecuted,false);
 assert.equal(result.migrationSqlApplied,false);
 assert.equal(result.stagingDeploymentAuthorized,false);
 assert.equal(result.productionDeploymentAuthorized,false);
 assert.equal(result.realAccountAcceptancePerformed,false);
});

test('Phase43 only labels all twelve strict boolean facts eligible, NEVER deployed',()=>{
 const result=analyzeServicesFoundation(output(facts(true)));
 assert.equal(result.factsPassed,12);
 assert.equal(result.missingSourceDefinedRequirements.length,0);
 assert.equal(result.state,'eligible_for_separate_reviewed_staging_deployment');
 assert.equal(result.stagingDeploymentAuthorized,false);
 assert.equal(result.full64CatalogVerified,false);
 assert.equal(result.productionDeploymentAuthorized,false);
});

test('Phase43 a single false safety guard blocks even if everything else is green',()=>{
 for(const key of SERVICES_FOUNDATION_FACTS){
  const obj=facts(true);obj[key]=false;
  const r=analyzeServicesFoundation(output(obj));
  assert.equal(r.state,'blocked_trusted_admin_foundation_missing',key);
  assert.deepEqual(r.missingSourceDefinedRequirements,[key]);
  assert.equal(r.factsPassed,11);
 }
});

test('Phase43 rejects non-boolean verdicts, injected fields and partial facts',()=>{
 for(const key of SERVICES_FOUNDATION_FACTS){
  for(const v of ['true',null,0,1,undefined]){
   const obj=facts(true);obj[key]=v;
   assert.throws(()=>analyzeServicesFoundation(output(obj)),
     /services_phase43_catalog_facts_incomplete/);
  }
 }
 assert.throws(()=>analyzeServicesFoundation(output({...facts(true),extra:true})),
   /services_phase43_catalog_facts_incomplete/);
 const half=facts(true);delete half.admin_users_rls_enabled;
 assert.throws(()=>analyzeServicesFoundation(output(half)),
   /services_phase43_catalog_facts_incomplete/);
});

test('Phase43 strictly rejects injected stdout, oversized data and invalid JSON',()=>{
 assert.throws(()=>analyzeServicesFoundation('{}\n{}\n'),
   /services_phase43_result_shape_invalid/);
 assert.throws(()=>analyzeServicesFoundation('{broken}\n'),
   /services_phase43_invalid_json/);
 assert.throws(()=>analyzeServicesFoundation('x'.repeat(16001)),
   /services_phase43_output_oversized/);
 assert.throws(()=>analyzeServicesFoundation('true'),
   /services_phase43_catalog_facts_incomplete/);
});

test('Phase43 inspects metadata only: no direct reads from admin assignments, users, profiles or customer tables',()=>{
 const sql=buildFoundationSql();
 assert.match(sql,/pg_catalog\.pg_class/);
 assert.match(sql,/pg_catalog\.pg_proc/);
 assert.match(sql,/pg_catalog\.aclexplode/);
 assert.match(sql,/pg_catalog\.has_table_privilege/);
 assert.match(sql,/pg_catalog\.has_function_privilege/);
 assert.match(sql,/prosrc LIKE '%public\.admin_users%'/);
 assert.match(sql,/prosrc NOT LIKE '%public\.profiles%'/);
 assert.match(sql,/prosecdef/);
 assert.match(sql,/provolatile='s'/);
 assert.match(sql,/search_path=/);
 assert.match(sql,/relrowsecurity/);
 assert.match(sql,/BEGIN TRANSACTION READ ONLY/);
 assert.match(sql,/SET TRANSACTION ISOLATION LEVEL REPEATABLE READ/);
 assert.equal((sql.match(/BEGIN TRANSACTION READ ONLY;/g)||[]).length,1);
 assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
 assert.doesNotMatch(sql,/\bFROM\s+(?:public\.admin_users|public\.profiles|auth\.users|public\.service_requests)\b/i);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE public|ALTER TABLE|DROP TABLE|CREATE TABLE)\b/i);
});

test('Phase43 rejects default PUBLIC EXECUTE even if is_admin is SECURITY DEFINER',()=>{
 const sql=buildFoundationSql();
 assert.match(sql,/COALESCE\(p\.proacl,\s*pg_catalog\.acldefault\('f',p\.proowner\)\)/);
 assert.match(sql,/a\.grantee=0 AND a\.privilege_type='EXECUTE'/);
 assert.match(sql,/has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
});

test('Phase43 checks underlying trusted authorization, not user-editable profile roles',()=>{
 const source=await read('supabase/migrations/20261109231500_trusted_admin_authorization.sql');
 assert.match(source,/CREATE TABLE IF NOT EXISTS public\.admin_users/);
 assert.match(source,/ALTER TABLE public\.admin_users ENABLE ROW LEVEL SECURITY/);
 assert.match(source,/REVOKE ALL ON TABLE public\.admin_users FROM PUBLIC, anon, authenticated/);
 assert.match(source,/CREATE OR REPLACE FUNCTION public\.is_admin\(\)/);
 assert.match(source,/SECURITY DEFINER/);
 assert.match(source,/SET search_path = ''/);
 assert.match(source,/REVOKE ALL ON FUNCTION public\.is_admin\(\) FROM PUBLIC/);
 assert.match(source,/FROM public\.admin_users/);
 assert.match(source,/VALUES\s*\(\s*'[0-9a-f-]{36}'::uuid\)/);
 // The original trusted-admin migration has live account UUID seeds.
 // NEVER run it unmodified on the newly isolated staging project.
 assert.match(source,/INSERT INTO public\.admin_users \(user_id\)/);
 const sql=buildFoundationSql();
 assert.doesNotMatch(sql,/INSERT INTO public\.admin_users/);
});

test('Phase43 verified prerequisite is required by real Services source',async()=>{
 assert.equal(SERVICES_REPLAY_FILES.length,13);
 const phase1=await read('supabase/migrations/'+SERVICES_REPLAY_FILES[0]);
 const phase3=await read('supabase/migrations/'+SERVICES_REPLAY_FILES[2]);
 const phase14=await read('supabase/migrations/'+SERVICES_REPLAY_FILES[12]);
 assert.match(phase1,/public\.is_admin\(\)/);
 assert.match(phase3,/public\.admin_users/);
 assert.match(phase14,/public\.is_admin\(\)/);
});

test('Phase43 is attached to separate manual read-only inventory, never to automatic migration execution',async()=>{
 const workflow=await read('.github/workflows/services-staging-readonly-inventory.yml');
 const management=workflow.indexOf('run: node scripts/services-phase41-registered-staging-project.mjs');
 const inventory=workflow.indexOf('run: node scripts/services-phase42-staging-inventory.mjs');
 const foundation=workflow.indexOf('run: node scripts/services-phase43-trusted-admin-foundation.mjs');
 assert.ok(management>0&&inventory>management&&foundation>inventory);
 assert.match(workflow,/READ_ONLY_STAGING_INVENTORY/);
 assert.match(workflow,/environment: services-staging/);
 assert.doesNotMatch(workflow,/services:staging:acceptance|supabase db push|apply_migration/);
 const module=await read('scripts/services-phase43-trusted-admin-foundation.mjs');
 assert.match(module,/validateInventoryTarget/);
 assert.match(module,/spawnSync\('psql'/);
 assert.match(module,/PGSSLMODE:'verify-full'/);
 assert.match(module,/PGOPTIONS:'-c default_transaction_read_only=on/);
 assert.doesNotMatch(module,/shell:\s*true|console\.log\(child\.stderr\)/);
});

test('Phase43 is tested in isolated PG17 CI without staging credentials',async()=>{
 const wf=await read('.github/workflows/services-pg17-disposable-replay.yml');
 assert.match(wf,/tests\/services-phase43-trusted-admin-foundation.test.mjs/);
 assert.match(wf,/scripts\/services-phase43-trusted-admin-foundation.mjs/);
 assert.match(wf,/--network none/);
 assert.doesNotMatch(wf,/secrets\.SERVICES_STAGING_AUDIT_DB_PASSWORD/);
});

test('Phase43 instructions explicitly block unreviewed account seeding',async()=>{
 const docs=await read('docs/ETERNYX_SERVICES_TRUSTED_ADMIN_FOUNDATION_PHASE43.md');
 assert.match(docs,/production admin user IDs/i);
 assert.match(docs,/Phase 13 before Phase 14/);
 assert.match(docs,/No staging SQL was applied/i);
 assert.match(docs,/not production-ready/i);
 assert.match(docs,/12 catalog facts/i);
});
