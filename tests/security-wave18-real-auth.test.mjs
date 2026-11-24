import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptance, configuration, deniedDatabase, deniedStorage, ORIGIN } from '../scripts/security-wave18-real-auth.mjs';
const env = {
  ETERNYX_STAGING_URL: ORIGIN, ETERNYX_STAGING_PROJECT_REF:'mhodwvypfbxafamkrgsk',
  ETERNYX_PRODUCTION_PROJECT_REF:'wcncuarekaofmfurbtbh', ETERNYX_STAGING_ONLY:'yes',
  ETERNYX_W18_ACK:'I_APPROVE_PERSISTENT_SYNTHETIC_STAGING_FIXTURES',
  ETERNYX_STAGING_PUBLIC_KEY:'sb_publishable_'+ 'x'.repeat(24),
  ETERNYX_W18_EMAIL_A:'a@example.invalid', ETERNYX_W18_EMAIL_B:'b@example.invalid',
  ETERNYX_W18_PASSWORD_A:'a'.repeat(15), ETERNYX_W18_PASSWORD_B:'b'.repeat(15)
};
test('staging configuration rejects production, redirected origin, missing ack, same account and secret keys',()=>{
  assert.equal(configuration(env).accounts.length,2);
  for(const changes of [
    {ETERNYX_STAGING_URL:'https://wcncuarekaofmfurbtbh.supabase.co'},
    {ETERNYX_STAGING_URL:ORIGIN+'.evil.invalid'},
    {ETERNYX_STAGING_URL:ORIGIN+'/'},
    {ETERNYX_W18_ACK:''},
    {ETERNYX_W18_EMAIL_B:'A@example.invalid'},
    {ETERNYX_STAGING_PUBLIC_KEY:'sb_secret_'+ 'x'.repeat(24)},
    {ETERNYX_PRODUCTION_PROJECT_REF:'mhodwvypfbxafamkrgsk'}
  ]) assert.throws(()=>configuration({...env,...changes}));
});
test('malformed config makes no HTTP requests',async()=>{
  let n=0;
  await assert.rejects(acceptance({...env,ETERNYX_W18_ACK:''},async()=>{n++;throw Error('unexpected');}));
  assert.equal(n,0);
});
test('explicit RLS denials only; outages, malformed requests and auth failure never count',()=>{
  assert.equal(deniedDatabase(403,{code:'42501'}),true);
  for(const status of [200,400,401,404,429,500]) assert.equal(deniedDatabase(status,{code:'42501'}),false);
  assert.equal(deniedDatabase(403,{code:'other'}),false);
  assert.equal(deniedStorage(400,{statusCode:'404'}),true);
  assert.equal(deniedStorage(403,{}),true);
  for(const status of [200,401,429,500]) assert.equal(deniedStorage(status,{}),false);
  assert.equal(deniedStorage(400,{statusCode:'500'}),false);
});
test('same verified auth user stops before fixture mutation',async()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const paths=[];
  await assert.rejects(acceptance(env,async(url,options)=>{
    paths.push(url);
    assert.equal(options.redirect,'error');
    return new Response(JSON.stringify(url.includes('/token?')?{access_token:'test',user:{id}}:{id}),{status:200});
  }),/distinct-auth-identities/);
  assert.equal(paths.length,4);
  assert.ok(paths.every(path=>path.startsWith(ORIGIN+'/auth/v1/')));
});
test('failed password authentication never creates fixtures',async()=>{
  const paths=[];
  await assert.rejects(acceptance(env,async(url)=>{paths.push(url);return new Response('{}',{status:400});}),/password-login/);
  assert.ok(paths.every(path=>path.includes('/auth/v1/token?')));
});
