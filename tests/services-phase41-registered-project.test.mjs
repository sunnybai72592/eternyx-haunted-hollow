import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 validateRegisteredStagingTarget,validateRegisteredProject,
 proveRegisteredStagingProject
} from '../scripts/services-phase41-registered-staging-project.mjs';

const REF='abcdefghijklmnopqrst';
const PROD='wcncuarekaofmfurbtbh';
const TOKEN='sbp_long_synthetic_test_token_with_zero_real_access';
const env=()=>({
 SERVICES_PREFLIGHT_CONFIRM:'READ_ONLY_STAGING_ACCEPTANCE',
 SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF:REF,
 SERVICES_PREFLIGHT_URL:'https://'+REF+'.supabase.co',
 SERVICES_STAGING_AUDIT_POOLER_HOST:'aws-0-us-east-1.pooler.supabase.com',
 SERVICES_STAGING_EXPECTED_ORG_SLUG:'eternyx-staging-org',
 SERVICES_STAGING_EXPECTED_PROJECT_NAME:'Eternyx Staging',
 SERVICES_STAGING_MANAGEMENT_API_TOKEN:TOKEN,
});
const registered=()=>({
 id:'example-project-db-id',ref:REF,
 organization_id:'deprecated-synthetic-id',
 organization_slug:'eternyx-staging-org',name:'Eternyx Staging',
 region:'us-east-1',status:'ACTIVE_HEALTHY',
 database:{host:'db.'+REF+'.supabase.co',version:'17'},
});
const response=(data=registered(),status=200,kind='application/json')=>({
 status,ok:status===200,
 headers:{get(name){
  if(name==='content-type')return kind;
  if(name==='content-length')return null;
  return null;
 }},
 text:async()=>JSON.stringify(data),
});
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('Phase41 requires explicit staging approval, separate known production ref and exact Supabase URL',()=>{
 const result=validateRegisteredStagingTarget(env());
 assert.equal(result.ref,REF);
 assert.equal(result.region,'us-east-1');
 assert.equal(result.org,'eternyx-staging-org');
 assert.equal(result.projectName,'Eternyx Staging');
 assert.equal(result.token,TOKEN);
 const invalid=[
  {SERVICES_PREFLIGHT_CONFIRM:'NOT_APPROVED'},
  {SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF:PROD,
   SERVICES_PREFLIGHT_URL:'https://'+PROD+'.supabase.co'},
  {SERVICES_PREFLIGHT_URL:'http://'+REF+'.supabase.co'},
  {SERVICES_PREFLIGHT_URL:'https://'+REF+'.supabase.co.evil.test'},
  {SERVICES_PREFLIGHT_URL:'https://'+REF+'.supabase.co/path'},
  {SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF:'../other'},
  {SERVICES_STAGING_AUDIT_POOLER_HOST:'db.'+REF+'.supabase.co'},
  {SERVICES_STAGING_AUDIT_POOLER_HOST:'aws-0-us-east-1.pooler.supabase.com.evil'},
  {SERVICES_STAGING_AUDIT_POOLER_HOST:'aws-0-us-east-1.pooler.supabase.com:5432'},
  {SERVICES_STAGING_EXPECTED_ORG_SLUG:'not/valid'},
  {SERVICES_STAGING_EXPECTED_ORG_SLUG:''},
  {SERVICES_STAGING_EXPECTED_PROJECT_NAME:''},
  {SERVICES_STAGING_EXPECTED_PROJECT_NAME:'Staging\nInjected'},
  {SERVICES_STAGING_MANAGEMENT_API_TOKEN:''},
  {SERVICES_STAGING_MANAGEMENT_API_TOKEN:'short'},
  {SERVICES_STAGING_MANAGEMENT_API_TOKEN:'bad\nwithnewline'},
 ];
 for(const patch of invalid)
  assert.throws(()=>validateRegisteredStagingTarget({...env(),...patch}),
   /services_phase41_/);
});

test('Phase41 independently matches Supabase-returned ref, organization, exact project name, region, active state and database host',()=>{
 const result=validateRegisteredProject(registered(),validateRegisteredStagingTarget(env()));
 assert.deepEqual(result,{
  gate:'services-phase41-management-api-project-identity',
  accepted:true,projectRefMatched:true,expectedOrganizationMatched:true,
  expectedNameMatched:true,activeHealthy:true,poolerRegionMatched:true,
  databaseHostMatched:true,managementApiGetOnly:true,
  managementApiProjectAccessVerified:true,
  separateFromKnownProductionProjectRef:true,
  projectIntendedPurposeIndependentlyAttested:false,
  stagingDatabaseSchemaPassed:false,realAccountStagingPassed:false,
  remoteProjectCreated:false,remoteSqlExecuted:false,
  productionDeploymentAuthorized:false,
 });
 assert.equal(JSON.stringify(result).includes(REF),false);
 assert.equal(JSON.stringify(result).includes(TOKEN),false);
 assert.equal(JSON.stringify(result).includes('eternyx-staging-org'),false);
});

test('Phase41 fails closed on misregistered or untrusted project identities',()=>{
 const target=validateRegisteredStagingTarget(env());
 for(const patch of [
  {ref:PROD},{ref:'otherprojectrefother'}, {ref:undefined},
  {organization_slug:'other-org'},{organization_slug:null},
  {name:'Eternyx Production'}, {name:null},
  {status:'INACTIVE'}, {status:'ACTIVE_UNHEALTHY'}, {status:'CREATING_PROJECT'},
  {region:'eu-west-1'}, {region:null},
  {database:{host:'db.'+PROD+'.supabase.co'}},
  {database:{host:'db.'+REF+'.supabase.co.evil'}},
  {database:null},
 ]){
  assert.throws(()=>validateRegisteredProject({...registered(),...patch},target),
   /services_phase41_/);
 }
 assert.throws(()=>validateRegisteredProject(null,target),/services_phase41_/);
});

test('Phase41 performs exactly one GET at fixed Supabase Management hostname without redirects',async()=>{
 let requests=0;
 const result=await proveRegisteredStagingProject(env(),async(url,opts)=>{
  requests++;
  assert.equal(url,'https://api.supabase.com/v1/projects/'+REF);
  assert.equal(opts.method,'GET');
  assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
  assert.equal(opts.headers.Accept,'application/json');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.cache,'no-store');
  assert.ok(opts.signal instanceof AbortSignal);
  assert.equal(opts.signal.aborted,false);
  assert.equal(Object.keys(opts).includes('body'),false);
  return response();
 });
 assert.equal(result.accepted,true);
 assert.equal(requests,1);
});

test('Phase41 never calls Supabase or DNS for invalid, unapproved or production targets',async()=>{
 let called=0;
 for(const patch of [
  {SERVICES_PREFLIGHT_CONFIRM:'NOT_APPROVED'},
  {SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF:PROD,
   SERVICES_PREFLIGHT_URL:'https://'+PROD+'.supabase.co'},
  {SERVICES_STAGING_EXPECTED_ORG_SLUG:''},
  {SERVICES_STAGING_MANAGEMENT_API_TOKEN:''},
 ]){
  await assert.rejects(
   proveRegisteredStagingProject({...env(),...patch},async()=>{called++;return response()}),
   /services_phase41_/);
 }
 assert.equal(called,0);
});

test('Phase41 returns stable codes only for API authentication failures, redirects, 429, malformed and oversized results',async()=>{
 for(const status of [301,302,400,401,403,404,429,500,503]){
  await assert.rejects(proveRegisteredStagingProject(env(),async()=>response({secret:TOKEN},status)),
   /services_phase41_management_project_request_rejected/);
 }
 await assert.rejects(proveRegisteredStagingProject(env(),async()=>response(registered(),200,'text/html')),
  /services_phase41_response_not_json/);
 await assert.rejects(proveRegisteredStagingProject(env(),async()=>({
  ...response(),text:async()=>'{invalid'
 })),/services_phase41_response_malformed/);
 await assert.rejects(proveRegisteredStagingProject(env(),async()=>({
  ...response(),headers:{get:name=>name==='content-type'?'application/json':name==='content-length'?'30000':null},
 })),/services_phase41_response_oversized/);
 await assert.rejects(proveRegisteredStagingProject(env(),async()=>({
  ...response(),text:async()=>'x'.repeat(20001),
 })),/services_phase41_response_oversized/);
 for(const unexpected of [
  Error('sensitive token '+TOKEN+' failed'),
  Error('https://api.supabase.com/v1/projects/'+REF+' sensitive'),
 ]){
  await assert.rejects(
   proveRegisteredStagingProject(env(),async()=>{throw unexpected}),
   err=>err.message==='services_phase41_management_api_unavailable'&&
     !err.message.includes(REF)&&!err.message.includes(TOKEN));
 }
});

test('Phase41 blocks Auth and all SQL until independent management identity proof succeeds',async()=>{
 const wf=await read('.github/workflows/services-staging-acceptance.yml');
 const evidence=wf.indexOf('node scripts/services-staging-release-evidence.mjs');
 const identity=wf.indexOf('run: node scripts/services-phase41-registered-staging-project.mjs');
 const sql=wf.indexOf('node scripts/services-phase36-staging-live-db-proof.mjs');
 const install=wf.indexOf('run: npm ci');
 const auth=wf.indexOf('npm run services:staging:acceptance');
 assert.ok(evidence>0&&identity>evidence&&sql>identity&&
   install>sql&&auth>install);
 assert.match(wf,/environment: services-staging/);
 assert.match(wf,/vars\.SERVICES_STAGING_EXPECTED_ORG_SLUG/);
 assert.match(wf,/vars\.SERVICES_STAGING_EXPECTED_PROJECT_NAME/);
 assert.match(wf,/secrets\.SERVICES_STAGING_MANAGEMENT_API_TOKEN/);
 assert.match(wf,/permissions:\s*contents: read/);
 assert.doesNotMatch(wf,/supabase\s+db\s+push|supabase\s+migration\s+repair/);
});

test('Phase41 tests run in networkless isolated PG17 CI, with no Management API secret dependency',async()=>{
 const wf=await read('.github/workflows/services-pg17-disposable-replay.yml');
 assert.match(wf,/tests\/services-phase41-registered-project.test.mjs/);
 assert.match(wf,/scripts\/services-phase41-registered-staging-project.mjs/);
 assert.match(wf,/--network none/);
 assert.match(wf,/postgres:17-alpine/);
 assert.doesNotMatch(wf,/secrets\.SERVICES_STAGING_MANAGEMENT_API_TOKEN/);
});

test('Phase41 docs explain manual protected project provisioning and no false release assurance',async()=>{
 const docs=await read('docs/ETERNYX_SERVICES_REGISTERED_STAGING_PROOF_PHASE41.md');
 assert.match(docs,/projects:read/);
 assert.match(docs,/GET \/v1\/projects\/\{ref\}/);
 assert.match(docs,/ACTIVE_HEALTHY/);
 assert.match(docs,/Phase 13 before Phase 14/);
 assert.match(docs,/No staging project is created/);
 assert.match(docs,/not production-ready/i);
 assert.match(docs,/real-account staging/i);
});
