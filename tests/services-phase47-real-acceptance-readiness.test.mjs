import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildRecordedBlobReview,verifyRecordedBlobReview} from '../scripts/services-phase47-recorded-sql-review.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('Phase47 exact history source query emits only aggregate checksum/order evidence',async()=>{
 const m=JSON.parse(await read('scripts/services-phase45-rollout-manifest.json'));
 const q=buildRecordedBlobReview(m);
 for(const s of m.steps){assert.ok(q.includes(s.gitBlobSha));assert.ok(q.includes(s.managedName));}
 assert.match(q,/BEGIN TRANSACTION READ ONLY/);
 assert.match(q,/cardinality\(h.statements\)=1/);
 assert.match(q,/lag\(version\) OVER \(ORDER BY step\)/);
 assert.doesNotMatch(q,/SELECT h\.statements/);
 const ok={expected_rows:14,matches:14,mismatches:0,mismatch_steps:[],managed_order_verified:true};
 assert.equal(verifyRecordedBlobReview(ok).recordedSqlBlobsMatched,14);
 for(const bad of [{matches:13},{mismatches:1},{managed_order_verified:false},{mismatch_steps:[1]},{extra:true}]){
  assert.throws(()=>verifyRecordedBlobReview({...ok,...bad}),/review_failed/);
 }
});
test('Phase47 one-time fixture candidate cannot create accounts or overwrite existing business data',async()=>{
 const sql=await read('scripts/sql/services-staging-acceptance-fixtures-candidate.sql');
 assert.match(sql,/SEED_DEDICATED_SERVICES_STAGING_FIXTURES/);
 assert.match(sql,/LOCK TABLE public\.admin_users, public\.service_requests/);
 assert.match(sql,/Exactly three dedicated staging Auth users/);
 assert.match(sql,/fixture target is not empty/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO auth\.users|DELETE FROM|TRUNCATE|DROP TABLE|UPDATE auth\.users)\b/i);
 for(const name of ['service_requests','service_request_triage','service_scope_reviews','service_scope_responses','service_clarification_questions','service_clarification_answers','service_brief_amendments']){
  assert.match(sql,new RegExp('INSERT INTO public\\.'+name+'\\b'));
 }
 assert.match(sql,/service_request_journal/);
 assert.match(sql,/INSERT INTO public\.admin_users\(user_id\) VALUES \(adm\)/);
});
test('Phase47 staged auditor candidate is NOLOGIN and only history columns are granted',async()=>{
 const sql=await read('scripts/sql/services-staging-auditor-candidate.sql');
 assert.match(sql,/NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
 assert.match(sql,/GRANT SELECT \(version, name\) ON supabase_migrations\.schema_migrations/);
 assert.match(sql,/default_transaction_read_only = on/);
 assert.doesNotMatch(sql,/GRANT (?:ALL|SELECT ON|EXECUTE)|PASSWORD\s+'|GRANT .* TO .* WITH ADMIN OPTION/i);
});
test('Phase47 actual candidate is rehearsed in existing networkless replay before positive SQL roles',async()=>{
 const wf=await read('.github/workflows/services-pg17-disposable-replay.yml');
 assert.match(wf,/--network none/);
 assert.match(wf,/services-staging-acceptance-fixtures-candidate\.sql/);
 assert.match(wf,/services-phase47-disposable-fixture-acceptance\.sql/);
 assert.match(wf,/services-staging-auditor-candidate\.sql/);
 assert.match(wf,/Phase47 fixture repeat unexpectedly succeeded/);
 assert.match(wf,/tests\/services-phase47-real-acceptance-readiness.test.mjs/);
});
