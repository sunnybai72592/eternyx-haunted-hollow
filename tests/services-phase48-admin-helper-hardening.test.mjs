import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('Phase48 exact seedless foundation guard and OID-preserving invoker wrapper',async()=>{
 const sql=await read('scripts/sql/services-staging-admin-helper-hardening-candidate.sql');
 assert.match(sql,/expected seedless administrator foundation changed/);
 assert.match(sql,/unsafe direct administrator table access/);
 assert.match(sql,/CREATE FUNCTION eternyx_admin_private\.is_current_user_admin\(\)[\s\S]*?SECURITY DEFINER SET search_path = ''/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.is_admin\(\)[\s\S]*?SECURITY INVOKER SET search_path = ''\s*RETURN eternyx_admin_private\.is_current_user_admin\(\)/);
 assert.doesNotMatch(sql,/\b(?:DROP FUNCTION|INSERT INTO|DELETE FROM|UPDATE public\.admin_users|ALTER TABLE)\b/i);
 assert.match(sql,/REVOKE ALL ON SCHEMA eternyx_admin_private FROM PUBLIC, anon, authenticated, service_role/);
 assert.match(sql,/GRANT USAGE ON SCHEMA eternyx_admin_private TO anon, authenticated, service_role/);
});
test('Phase48 catalog proof checks actual wrapper dependency, exact private body and effective grants',async()=>{
 const sql=await read('docs/sql/eternyx/services-phase48-readonly-admin-helper-verdict.sql');
 for(const key of ['administrator_table_rls','direct_table_access_denied','public_wrapper_invoker','private_definer_exact_body','owner_consistent','wrapper_bound_to_helper','implicit_public_execute_denied','compatibility_grants_without_create','private_schema_public_denied','private_schema_only_reviewed_helper'])assert.match(sql,new RegExp('AS '+key+'\\b'));
 assert.match(sql,/pg_catalog\.pg_depend/);
 assert.match(sql,/prosqlbody IS NOT NULL/);
 assert.match(sql,/has_any_column_privilege/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|DELETE FROM|ALTER TABLE|DROP FUNCTION|CREATE FUNCTION)\b/i);
});
test('Phase48 exact candidate runs after prior fixture rehearsal and preserves existing RLS tests',async()=>{
 const wf=await read('.github/workflows/services-pg17-disposable-replay.yml');
 assert.match(wf,/--network none/);
 assert.match(wf,/services-staging-admin-helper-hardening-candidate\.sql/);
 assert.match(wf,/services-phase48-disposable-admin-helper-acceptance\.sql/);
 assert.match(wf,/services-phase48-readonly-admin-helper-verdict\.sql/);
 assert.match(wf,/Phase48 public helper OID or dependent count changed/);
 assert.match(wf,/Phase48 repeated hardening unexpectedly succeeded/);
 assert.match(wf,/Phase48 hardened Services catalog/);
});

test('Phase48 cannot treat partial or malformed catalog as hardening proof',async()=>{
 const {FACTS,analyzeHardening}=await import('../scripts/services-phase48-admin-helper-proof.mjs');
 const full=Object.fromEntries(FACTS.map(k=>[k,true]));
 assert.equal(analyzeHardening(JSON.stringify(full)).factsPassed,10);
 assert.equal(analyzeHardening(JSON.stringify(full)).state,'hardened_catalog_verified');
 assert.equal(analyzeHardening(JSON.stringify(full)).liveDataApiExposureVerified,false);
 assert.equal(analyzeHardening(JSON.stringify({...full,private_definer_exact_body:false})).state,'hardening_not_verified');
 assert.throws(()=>analyzeHardening(JSON.stringify({...full,extra:true})),/incomplete_facts/);
 assert.throws(()=>analyzeHardening(JSON.stringify({...full,public_wrapper_invoker:'true'})),/incomplete_facts/);
});
