import test from 'node:test';
import assert from 'node:assert/strict';
import {admitScanner,verifiedSessionClaims} from '../supabase/functions/_shared/scanner-admission.mjs';
const owner='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
const token=(delta={})=>'Bearer a.'+Buffer.from(JSON.stringify({sub:owner,session_id:session,role:'authenticated',exp:Math.floor(Date.now()/1000)+300,...delta})).toString('base64url')+'.b';
const args={authorization:token(),user:{id:owner},url:'https://staging.example.invalid',publicKey:'public-fixture',serviceKey:'private-fixture'};
test('only matching, nonanonymous, fresh verified session claims are admitted',()=>{
 assert.deepEqual(verifiedSessionClaims(token(),args.user),{p_owner:owner,p_session:session});
 for(const delta of [{sub:session},{session_id:'invalid'},{role:'anon'},{is_anonymous:true},{exp:1}])assert.equal(verifiedSessionClaims(token(delta),args.user),null);
 assert.equal(verifiedSessionClaims(token(),{...args.user,is_anonymous:true}),null);
});
test('invalid claims and unavailable configuration cannot reach network',async()=>{
 for(const [delta,status] of [[{authorization:token({sub:session})},401],[{serviceKey:'public-fixture'},503],[{url:'http://invalid'},503]]){
  let count=0;assert.equal((await admitScanner({...args,...delta,fetcher:async()=>{count++;throw Error('unexpected');}})).status,status);assert.equal(count,0);
 }
});
test('server RPC results are exact and failures fail closed',async()=>{
 for(const [result,status] of [['admitted',200],['quota',429],['revoked',401],['unknown',503]]){
  const out=await admitScanner({...args,fetcher:async(url,opts)=>{
   assert.equal(url,args.url+'/rest/v1/rpc/security_scanner_admit');
   assert.equal(opts.headers.Authorization,'Bearer private-fixture');
   assert.equal(opts.redirect,'error');assert.deepEqual(JSON.parse(opts.body),{p_owner:owner,p_session:session});
   return new Response(JSON.stringify(result));
  }});assert.equal(out.status,status);
 }
 assert.equal((await admitScanner({...args,fetcher:async()=>new Response('secret error',{status:500})})).status,503);
 assert.equal((await admitScanner({...args,fetcher:async()=>{throw Error('secret error');}})).error,'Scanner admission unavailable');
});
