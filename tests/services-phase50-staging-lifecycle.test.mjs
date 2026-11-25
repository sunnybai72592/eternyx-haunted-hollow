import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {config,one,denied} from '../scripts/services-phase50-staging-lifecycle.mjs';
const env={SERVICES_LIFECYCLE_CONFIRM:'WRITE_SYNTHETIC_SERVICES_STAGING_LIFECYCLE',SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF:'mhodwvypfbxafamkrgsk',SERVICES_PREFLIGHT_URL:'https://mhodwvypfbxafamkrgsk.supabase.co',SERVICES_PREFLIGHT_PUBLISHABLE_KEY:'sb_publishable_synthetic_test_only'};
for(const [i,role] of ['CUSTOMER_A','CUSTOMER_B','ADMIN'].entries()){
 env['SERVICES_LIFECYCLE_'+role+'_ID']='00000000-0000-4000-8000-00000000000'+(i+1);
 env['SERVICES_PREFLIGHT_'+role+'_EMAIL']='fixture'+i+'@invalid.example';
 env['SERVICES_PREFLIGHT_'+role+'_PASSWORD']='synthetic-password-'+i;
}
test('only exact staging target and distinct independently pinned actors are accepted',()=>{
 assert.equal(config(env).people.length,3);
 for(const patch of [{SERVICES_LIFECYCLE_CONFIRM:'NOT_APPROVED'},{SERVICES_PREFLIGHT_URL:'https://wcncuarekaofmfurbtbh.supabase.co'},{SERVICES_PREFLIGHT_PUBLISHABLE_KEY:'sb_secret_not_allowed'},{SERVICES_LIFECYCLE_ADMIN_ID:env.SERVICES_LIFECYCLE_CUSTOMER_A_ID},{SERVICES_PREFLIGHT_ADMIN_EMAIL:env.SERVICES_PREFLIGHT_CUSTOMER_A_EMAIL}]){
  assert.throws(()=>config({...env,...patch}),/services_phase50_/);
 }
});
test('strict negative evidence rejects network failures, wrong errors and leaked rows',()=>{
 denied({error:{code:'42501'},data:null,status:403},'deny');
 denied({error:{code:'23514'},data:null,status:400},'deny',false,'23514');
 denied({error:null,data:[],status:200},'deny',true);
 for(const value of [{error:{code:'PGRST205'},status:404,data:null},{error:{code:'42501'},status:500,data:null},{error:null,status:200,data:[{id:'leaked'}]},{error:null,status:200,data:null}]){
  assert.throws(()=>denied(value,'deny',true),/services_phase50_deny/);
 }
 assert.throws(()=>denied({error:null,data:[],status:200},'deny'),/services_phase50_deny/);
 assert.throws(()=>one({data:[],error:null},'missing'),/services_phase50_missing/);
});
test('workflow is manual, protected, main-only, uses no privileged API key',async()=>{
 const w=await readFile(new URL('../.github/workflows/services-staging-review-lifecycle.yml',import.meta.url),'utf8');
 assert.match(w,/workflow_dispatch:/);
 assert.match(w,/environment: services-staging/);
 assert.match(w,/github\.ref == 'refs\/heads\/main'/);
 assert.match(w,/services-phase41-registered-staging-project\.mjs/);
 assert.doesNotMatch(w,/SERVICE_ROLE|service_role|sb_secret_/);
 const s=await readFile(new URL('../scripts/services-phase50-staging-lifecycle.mjs',import.meta.url),'utf8');
 assert.match(s,/for\(const next of \['in_progress','completed'\]\)/);
 assert.match(s,/await status\('declined'/);
 assert.match(s,/scope:'local'/);
 assert.doesNotMatch(s,/\.delete\(|\.upsert\(|auth\.admin/);
});
