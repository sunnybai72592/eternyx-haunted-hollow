import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('quote and acceptance are participant-private append-only client records',async()=>{
 const sql=await read('scripts/sql/services-staging-quotation-agreements-candidate.sql');
 for(const table of ['service_quotations','service_quote_acceptances']){
  assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' ENABLE ROW LEVEL SECURITY'));
 }
 assert.match(sql,/REVOKE ALL ON public\.service_quotations,public\.service_quote_acceptances FROM PUBLIC,anon,authenticated,service_role/);
 assert.doesNotMatch(sql,/GRANT (?:ALL|UPDATE|DELETE|TRUNCATE)/i);
 assert.match(sql,/UNIQUE\(request_id,revision\)/);
 assert.match(sql,/UNIQUE\(request_id\)/);
 assert.match(sql,/FOREIGN KEY\(request_id,quotation_id\)/);
 assert.match(sql,/WITH\(security_invoker=true\)/);
 assert.doesNotMatch(sql,/\bSECURITY DEFINER\b/i);
});
test('quote issuance and acceptance share serialization and check expiry on the server',async()=>{
 const sql=await read('scripts/sql/services-staging-quotation-agreements-candidate.sql');
 assert.equal(sql.match(/hashtextextended\('services-commercial-quote:'\|\|NEW\.request_id::text,0\)/g)?.length,2);
 assert.equal(sql.match(/current_setting\('transaction_isolation'\)<>'read committed'/g)?.length,2);
 assert.match(sql,/q\.valid_until<=NEW\.accepted_at/);
 assert.match(sql,/NEW\.acknowledged IS DISTINCT FROM true/);
 assert.match(sql,/q\.id IS DISTINCT FROM NEW\.quotation_id/);
 assert.match(sql,/NEW\.revision:=latest\+1/);
 assert.match(sql,/amount_minor BETWEEN 1 AND 100000000/);
 assert.doesNotMatch(sql,/ALTER TABLE public\.service_requests|DROP TRIGGER|CREATE OR REPLACE FUNCTION eternyx_private\.prevent_unverified_service_delivery/i);
});
test('workflow replays exact candidate and tests real role denials after previous lifecycle',async()=>{
 const w=await read('.github/workflows/services-pg17-disposable-replay.yml');
 assert.match(w,/--network none/);
 assert.match(w,/services-staging-quotation-agreements-candidate\.sql/);
 assert.match(w,/services-phase51-disposable-quote-acceptance\.sql/);
 const s=await read('docs/sql/eternyx/services-phase51-disposable-quote-acceptance.sql');
 for(const denial of ['cross-account acceptance allowed','superseded acceptance allowed','expired acceptance allowed','duplicate acceptance allowed','accepted quote superseded','quotation acceptance bypassed delivery gate','anonymous quote read allowed','auditor acceptance read allowed']) assert.ok(s.includes(denial));
 assert.match(s,/ROLLBACK;/);
});
