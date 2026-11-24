import test from 'node:test';
import assert from 'node:assert/strict';
import { ORIGIN } from '../scripts/security-wave18-real-auth.mjs';
import { wave19Config, signedPath, revokedRefresh, invalidSignature, lifecycle } from '../scripts/security-wave19-session-evidence.mjs';
const env={
 ETERNYX_STAGING_URL:ORIGIN, ETERNYX_STAGING_PROJECT_REF:'mhodwvypfbxafamkrgsk',
 ETERNYX_PRODUCTION_PROJECT_REF:'wcncuarekaofmfurbtbh', ETERNYX_STAGING_ONLY:'yes',
 ETERNYX_W18_ACK:'I_APPROVE_PERSISTENT_SYNTHETIC_STAGING_FIXTURES',
 ETERNYX_W19_ACK:'I_APPROVE_DISPOSABLE_SESSION_AND_EVIDENCE_TESTS',
 ETERNYX_STAGING_PUBLIC_KEY:'sb_publishable_'+'x'.repeat(24),
 ETERNYX_W18_EMAIL_A:'a@example.invalid', ETERNYX_W18_EMAIL_B:'b@example.invalid',
 ETERNYX_W18_PASSWORD_A:'a'.repeat(15), ETERNYX_W18_PASSWORD_B:'b'.repeat(15)
};
test('requires explicit Wave 19 approval in addition to all Wave 18 staging guards',async()=>{
 assert.equal(wave19Config(env).accounts.length,2);
 for(const changes of [{ETERNYX_W19_ACK:''},{ETERNYX_W18_ACK:''},{ETERNYX_STAGING_URL:'https://wcncuarekaofmfurbtbh.supabase.co'},{ETERNYX_STAGING_PUBLIC_KEY:'sb_secret_'+'x'.repeat(24)}]){
  let n=0;
  await assert.rejects(lifecycle({...env,...changes},async()=>{n++;throw Error('unexpected');}));
  assert.equal(n,0);
 }
});
test('signed capability stays on exact staging origin and exact synthetic object',()=>{
 const path='a/b/file.txt';
 const root='/storage/v1/object/sign/pentest-evidence/'+path;
 assert.equal(signedPath(root+'?token=abc',path),root+'?token=abc');
 assert.equal(signedPath('/object/sign/pentest-evidence/'+path+'?token=abc',path),root+'?token=abc');
 assert.equal(signedPath(ORIGIN+root+'?token=abc',path),root+'?token=abc');
 for(const bad of ['https://other.invalid'+root+'?token=abc',root+'?token=',root+'?token=a&token=b',root+'?token=a#secret',root+'?token=a&extra=x',root.replace('file.txt','other.txt')+'?token=a','//evil.invalid'+root+'?token=a']) assert.throws(()=>signedPath(bad,path));
});
test('refresh rejection must be a defined Auth error, not a generic HTTP failure',()=>{
 assert.equal(revokedRefresh(400,{error_code:'refresh_token_not_found'}),true);
 assert.equal(revokedRefresh(400,{code:'session_not_found'}),true);
 for(const status of [200,401,403,404,429,500]) assert.equal(revokedRefresh(status,{error_code:'refresh_token_not_found'}),false);
 assert.equal(revokedRefresh(400,{error_code:'invalid_credentials'}),false);
});
test('signed token rejection excludes outages and unrelated validation errors',()=>{
 assert.equal(invalidSignature(400,{error:'InvalidJWT'}),true);
 assert.equal(invalidSignature(400,{statusCode:'403'}),true);
 assert.equal(invalidSignature(400,{error:'invalid_input'}),false);
 for(const status of [200,429,500,503]) assert.equal(invalidSignature(status,{error:'InvalidJWT'}),false);
});
test('failed login makes no evidence or logout calls',async()=>{
 const urls=[];
 await assert.rejects(lifecycle(env,async(url)=>{urls.push(url);return new Response('{}',{status:400});}),/login-A/);
 assert.equal(urls.length,1);
 assert.ok(urls[0].startsWith(ORIGIN+'/auth/v1/token?'));
});
test('identical verified accounts cannot mutate storage or revoke sessions',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const urls=[];
 await assert.rejects(lifecycle(env,async(url,options)=>{
  urls.push(url);assert.equal(options.redirect,'error');
  return new Response(JSON.stringify(url.includes('/token?')?{access_token:'test',refresh_token:'test-refresh',user:{id}}:{id}),{status:200});
 }),/distinct-users/);
 assert.equal(urls.length,4);
 assert.ok(urls.every(url=>url.startsWith(ORIGIN+'/auth/v1/')));
});
