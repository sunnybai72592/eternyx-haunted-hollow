import test from 'node:test';
import assert from 'node:assert/strict';
import { config21, sessionClaims, rowDenied, runFence } from '../scripts/security-wave21-live-fence.mjs';
import { ORIGIN } from '../scripts/security-wave18-real-auth.mjs';
const owner='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const now=1700000000000,claims={sub:owner,session_id:sid,role:'authenticated',exp:1700000120};
const jwt=(c)=>'header.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.signature';
const env={ETERNYX_W21_ACK:'I_APPROVE_STAGING_LIVE_SESSION_FENCE_TEST',ETERNYX_W18_ACK:'I_APPROVE_PERSISTENT_SYNTHETIC_STAGING_FIXTURES',ETERNYX_STAGING_ONLY:'yes',ETERNYX_STAGING_URL:ORIGIN,ETERNYX_STAGING_PROJECT_REF:'mhodwvypfbxafamkrgsk',ETERNYX_PRODUCTION_PROJECT_REF:'wcncuarekaofmfurbtbh',ETERNYX_STAGING_PUBLIC_KEY:'sb_publishable_'+'x'.repeat(24),ETERNYX_W18_EMAIL_A:'a@example.invalid',ETERNYX_W18_EMAIL_B:'b@example.invalid',ETERNYX_W18_PASSWORD_A:'a'.repeat(15),ETERNYX_W18_PASSWORD_B:'b'.repeat(15)};
test('requires explicit staging fence consent; invalid config performs no network',async()=>{
 assert.equal(config21(env).accounts.length,2);
 for(const delta of [{ETERNYX_W21_ACK:''},{ETERNYX_STAGING_URL:'https://wcncuarekaofmfurbtbh.supabase.co'},{ETERNYX_W18_ACK:''}]){
  let calls=0;
  await assert.rejects(runFence({...env,...delta},async()=>{calls++;throw Error('unexpected');}));
  assert.equal(calls,0);
 }
});
test('require verified owner binding, valid distinct session shape and unexpired JWT',()=>{
 assert.deepEqual(sessionClaims(jwt(claims),owner,now),{session:sid,expiry:1700000120000});
 for(const delta of [{sub:sid},{session_id:'bad'},{session_id:null},{role:'anon'},{is_anonymous:true},{exp:1700000001},{exp:'1700000120'}])assert.throws(()=>sessionClaims(jwt({...claims,...delta}),owner,now));
 assert.throws(()=>sessionClaims('bad',owner,now));
});
test('row denial does not accept outages, token expiry or visible rows',()=>{
 assert.equal(rowDenied({ok:true,status:200,data:[]}),true);
 assert.equal(rowDenied({ok:false,status:403,data:{code:'42501'}}),true);
 for(const response of [{ok:true,status:200,data:[{id:owner}]},{ok:false,status:401,data:{code:'PGRST303'}},{ok:false,status:429,data:[]},{ok:false,status:500,data:[]},{ok:false,status:403,data:{code:'other'}}])assert.equal(rowDenied(response),false);
});
test('unsuccessful sign-in cannot reach fixtures or logout',async()=>{
 const calls=[];
 await assert.rejects(runFence(env,async(url)=>{calls.push(url);return new Response('{}',{status:400});}),/login-A/);
 assert.equal(calls.length,1);assert.ok(calls[0].includes('/auth/v1/token?'));
});
