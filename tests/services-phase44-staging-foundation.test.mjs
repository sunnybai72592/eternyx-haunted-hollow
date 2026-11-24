import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const path='scripts/sql/services-staging-trusted-admin-foundation-candidate.sql';
const uncomment=s=>s.replace(/--[^\r\n]*/g,'');

test('Phase44 exact candidate creates only the missing shared admin table and helper, no seeds or replacements',async()=>{
 const s=uncomment(await read(path));
 assert.match(s,/CREATE TABLE public\.admin_users\s*\(/);
 assert.match(s,/user_id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
 assert.match(s,/CREATE FUNCTION public\.is_admin\(\)/);
 assert.doesNotMatch(s,/\b(?:INSERT INTO|UPDATE\s+public|DELETE FROM|DROP\s+(?:TABLE|FUNCTION)|CREATE OR REPLACE|IF NOT EXISTS)\b/i);
 assert.doesNotMatch(s,/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
 assert.doesNotMatch(s,/public\.(?:profiles|user_roles)\b|user_metadata|app_metadata/);
});
test('Phase44 candidate locks down table and caller-bound definer helper',async()=>{
 const s=uncomment(await read(path));
 assert.match(s,/ALTER TABLE public\.admin_users ENABLE ROW LEVEL SECURITY/);
 assert.match(s,/REVOKE ALL ON TABLE public\.admin_users FROM PUBLIC, anon, authenticated, service_role/);
 assert.match(s,/RETURNS boolean\s+LANGUAGE sql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = ''/);
 assert.match(s,/FROM public\.admin_users AS au\s+WHERE au\.user_id = \(SELECT auth\.uid\(\)\)/);
 assert.match(s,/REVOKE ALL ON FUNCTION public\.is_admin\(\) FROM PUBLIC, anon, authenticated, service_role/);
 assert.match(s,/GRANT EXECUTE ON FUNCTION public\.is_admin\(\) TO anon, authenticated, service_role/);
 assert.doesNotMatch(s,/WITH GRANT OPTION|GRANT .* ON TABLE/i);
});
test('Phase44 tests hostile default ACLs and synthetic roles using actual PostgreSQL assertions',async()=>{
 const boot=await read('docs/sql/eternyx/services-phase44-disposable-auth-primitives.sql');
 const sql=await read('docs/sql/eternyx/services-phase44-disposable-admin-acceptance.sql');
 assert.match(boot,/CREATE ROLE service_role NOLOGIN BYPASSRLS/);
 assert.match(boot,/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES/);
 assert.match(sql,/has_any_column_privilege/);
 assert.match(sql,/SET LOCAL ROLE authenticated/);
 assert.match(sql,/SET LOCAL ROLE anon/);
 assert.match(sql,/SET LOCAL ROLE service_role/);
 assert.match(sql,/EXCEPTION WHEN insufficient_privilege/);
 assert.match(sql,/ROLLBACK;/);
 assert.match(sql,/DELETE FROM auth\.users/);
});
test('Phase44 workflow runs seedless candidate before real catalog, role and full migration tests, offline only',async()=>{
 const wf=await read('.github/workflows/services-pg17-disposable-replay.yml');
 const db=wf.indexOf('createdb -U postgres services_phase44');
 const candidate=wf.indexOf('< '+path,db);
 const facts=wf.indexOf('services-phase44-foundation.json',candidate);
 const roles=wf.indexOf('< docs/sql/eternyx/services-phase44-disposable-admin-acceptance.sql',facts);
 const replay=wf.indexOf('index44=0',roles);
 const acceptance=wf.indexOf('< docs/sql/eternyx/services-phase30-disposable-rls-acceptance.sql',replay);
 assert.ok(db>0&&candidate>db&&facts>candidate&&roles>facts&&replay>roles&&acceptance>replay);
 assert.match(wf,/--network none/);
 assert.match(wf,/Phase44 candidate unexpectedly accepted occupied foundation/);
 assert.match(wf,/test "\$index44" -eq 13/);
 assert.doesNotMatch(wf,/secrets\.SERVICES_STAGING_|supabase db push/);
});
test('Phase44 candidate is not an automatically deployed migration and preserves explicit staging approval',async()=>{
 const doc=await read('docs/ETERNYX_SERVICES_STAGING_FOUNDATION_PHASE44.md');
 assert.match(doc,/outside .?supabase\/migrations/);
 assert.match(doc,/explicit staging-only approval/i);
 assert.match(doc,/zero admin assignments/i);
 assert.match(doc,/no remote migration was applied/i);
 assert.match(doc,/Phase 13 before Phase 14/);
});
