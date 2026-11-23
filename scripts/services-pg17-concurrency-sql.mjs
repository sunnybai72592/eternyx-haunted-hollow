#!/usr/bin/env node
/* Phase 34. Synthetic SQL text ONLY; never connects to any DB or network.
 * Execute solely inside the reviewed --network none PG17 test container.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const aUser='11111111-1111-4111-8111-111111111111';
const bUser='22222222-2222-4222-8222-222222222222';
const aRequest='33333333-3333-4333-8333-333333333333';
const bRequest='44444444-4444-4444-8444-444444444444';
const pref='-- DISPOSABLE ISOLATED PG17 ONLY. Never run on a shared or remote DB.\n';
const sqlLines=(a)=>pref+a.join('\n')+'\n';
const lock=(r,u)=>'service-brief-amendment:'+r+':'+u;
const seed=sqlLines([
'BEGIN;',
"INSERT INTO auth.users(id) VALUES ('"+aUser+"'),('"+bUser+"');",
'INSERT INTO public.service_requests(id,user_id,service_key,title,description,contact_email) VALUES',
" ('"+aRequest+"','"+aUser+"','security-review','Concurrent test A','Entirely synthetic first request used only for the SQL concurrency test.','synthetic-a@invalid.example'),",
" ('"+bRequest+"','"+bUser+"','security-review','Concurrent test B','Entirely synthetic second request used only for the SQL concurrency test.','synthetic-b@invalid.example');",
"SELECT set_config('request.jwt.claim.sub','"+aUser+"',true);",
'INSERT INTO public.service_brief_amendments(request_id,author_id,category,summary,details) VALUES',
" ('"+aRequest+"','"+aUser+"','requirements','Synthetic preseed one','Completely synthetic first approved preseed amendment for SQL test.'),",
" ('"+aRequest+"','"+aUser+"','requirements','Synthetic preseed two','Completely synthetic second approved preseed amendment for SQL test.'),",
" ('"+aRequest+"','"+aUser+"','requirements','Synthetic preseed three','Completely synthetic third approved preseed amendment for SQL test.');",
'COMMIT;',
'DO $verify_seed$ BEGIN',
" IF (SELECT count(*) FROM public.service_brief_amendments) <> 3 OR",
"    (SELECT count(*) FROM public.service_requests) <> 2 THEN",
" RAISE EXCEPTION 'concurrency seed mismatch'; END IF;",
'END $verify_seed$;'
]);
const holder=sqlLines([
"SELECT pg_catalog.pg_advisory_lock(pg_catalog.hashtextextended('"+lock(aRequest,aUser)+"',0));",
"SELECT pg_catalog.pg_advisory_lock(pg_catalog.hashtextextended('"+lock(bRequest,bUser)+"',0));",
'-- Hold both lock keys for four genuinely queued worker sessions.',
'SELECT pg_catalog.pg_sleep(20);',
'SELECT pg_catalog.pg_advisory_unlock_all();'
]);
const workers=Object.freeze({
 a1:{r:aRequest,u:aUser,s:'Concurrent distinct Alpha',d:'The first unique amendment racing at owner A quota boundary.'},
 a2:{r:aRequest,u:aUser,s:'Concurrent distinct Bravo',d:'The second unique amendment racing at owner A quota boundary.'},
 b1:{r:bRequest,u:bUser,s:'Concurrent same summary',d:'Identical content from two simultaneous owner B submissions.'},
 b2:{r:bRequest,u:bUser,s:'  CONCURRENT SAME SUMMARY ',d:' identical content from two simultaneous owner b submissions. '}
});
const verify=sqlLines([
'DO $check_concurrency$ DECLARE count_a integer; count_b integer; BEGIN',
" SELECT count(*) INTO count_a FROM public.service_brief_amendments WHERE request_id='"+aRequest+"';",
" SELECT count(*) INTO count_b FROM public.service_brief_amendments WHERE request_id='"+bRequest+"';",
" IF count_a<>4 OR count_b<>1 THEN RAISE EXCEPTION 'concurrent quota or duplicate race violated'; END IF;",
" IF (SELECT count(*) FROM public.service_brief_amendments WHERE request_id='"+aRequest+"' AND summary IN ('Concurrent distinct Alpha','Concurrent distinct Bravo')) <> 1 OR",
"    (SELECT count(*) FROM public.service_brief_amendments WHERE request_id='"+bRequest+"' AND lower(btrim(summary))='concurrent same summary') <> 1",
" THEN RAISE EXCEPTION 'concurrent write accepted forbidden second winner'; END IF;",
" IF (SELECT count(*) FROM public.service_request_journal WHERE request_id='"+aRequest+"' AND event_kind='amendment_submitted')<>4 OR",
"    (SELECT count(*) FROM public.service_request_journal WHERE request_id='"+bRequest+"' AND event_kind='amendment_submitted')<>1",
" THEN RAISE EXCEPTION 'journal exposes uncommitted or rejected writes'; END IF;",
'END $check_concurrency$;'
]);
const cleanup=sqlLines([
'BEGIN;',
"DELETE FROM public.service_requests WHERE id IN ('"+aRequest+"','"+bRequest+"');",
"DELETE FROM auth.users WHERE id IN ('"+aUser+"','"+bUser+"');",
'COMMIT;',
'DO $check_cleanup$ BEGIN',
" IF (SELECT count(*) FROM public.service_requests)<>0 OR",
" (SELECT count(*) FROM public.service_brief_amendments)<>0 OR",
" (SELECT count(*) FROM public.service_request_activity)<>0 OR",
" (SELECT count(*) FROM auth.users)<>0 THEN",
" RAISE EXCEPTION 'disposable concurrent fixture not cleaned'; END IF;",
'END $check_cleanup$;'
]);
export function concurrencySql(stage){
 if(stage==='seed')return seed;
 if(stage==='holder')return holder;
 if(stage==='verify')return verify;
 if(stage==='cleanup')return cleanup;
 if(Object.hasOwn(workers,stage)){
   const {r,u,s,d}=workers[stage];
   return sqlLines([
    'BEGIN;',
    'SET LOCAL ROLE authenticated;',
    "SELECT set_config('request.jwt.claim.sub','"+u+"',true);",
    'INSERT INTO public.service_brief_amendments(request_id,author_id,category,summary,details) VALUES',
    " ('"+r+"','"+u+"','requirements','"+s+"','"+d+"');",
    'COMMIT;'
   ]);
 }
 throw Error('unknown_services_concurrency_stage');
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{if(process.argv.length!==3)throw Error('bad_args');process.stdout.write(concurrencySql(process.argv[2]));}
 catch{process.stderr.write('Invalid disposable concurrency SQL stage\n');process.exitCode=2;}
}
