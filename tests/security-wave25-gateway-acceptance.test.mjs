import test from 'node:test';
import assert from 'node:assert/strict';
import { config25, explicitDenial, gatewayAcceptance } from '../scripts/security-wave25-gateway-acceptance.mjs';
import { ORIGIN } from '../scripts/security-wave18-real-auth.mjs';
const env={ETERNYX_W25_ACK:'I_APPROVE_SYNTHETIC_STAGING_GATEWAY_FIXTURES',ETERNYX_W25_PHASE:'pre-cutover',ETERNYX_W18_ACK:'I_APPROVE_PERSISTENT_SYNTHETIC_STAGING_FIXTURES',ETERNYX_STAGING_ONLY:'yes',ETERNYX_STAGING_URL:ORIGIN,ETERNYX_STAGING_PROJECT_REF:'mhodwvypfbxafamkrgsk',ETERNYX_PRODUCTION_PROJECT_REF:'wcncuarekaofmfurbtbh',ETERNYX_STAGING_PUBLIC_KEY:'sb_publishable_'+'x'.repeat(24),ETERNYX_W18_EMAIL_A:'a@example.invalid',ETERNYX_W18_EMAIL_B:'b@example.invalid',ETERNYX_W18_PASSWORD_A:'a'.repeat(15),ETERNYX_W18_PASSWORD_B:'b'.repeat(15)};
test('explicit staging phase and consent required before any network operation',async()=>{
 assert.equal(config25(env).phase,'pre-cutover');
 assert.equal(config25({...env,ETERNYX_W25_PHASE:'post-cutover'}).phase,'post-cutover');
 for(const changes of [{ETERNYX_W25_ACK:''},{ETERNYX_W25_PHASE:'production'},{ETERNYX_STAGING_URL:'https://wcncuarekaofmfurbtbh.supabase.co'},{ETERNYX_STAGING_PUBLIC_KEY:'sb_secret_'+'x'.repeat(24)}]){
  let count=0;await assert.rejects(gatewayAcceptance({...env,...changes},async()=>{count++;throw Error('unexpected');}));assert.equal(count,0);
 }
});
test('denial assertions require exact status and explicit gateway code',()=>{
 assert.equal(explicitDenial({status:404,data:{code:'evidence-unavailable'}},404,'evidence-unavailable'),true);
 for(const response of [{status:404,data:{code:'other'}},{status:503,data:{code:'gateway-disabled'}},{status:200,data:{code:'evidence-unavailable'}}])assert.equal(explicitDenial(response,404,'evidence-unavailable'),false);
});
test('failed real login never creates fixtures or calls gateway',async()=>{
 const paths=[];await assert.rejects(gatewayAcceptance(env,async(url)=>{paths.push(url);return new Response('{}',{status:401});}),/login-A/);
 assert.equal(paths.length,1);assert.ok(paths[0].startsWith(ORIGIN+'/auth/v1/token?'));
});
