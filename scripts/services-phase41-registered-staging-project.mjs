#!/usr/bin/env node
/**
 * Services Phase 41: independently confirm a separately approved staging
 * project's identity via Supabase's GET-only Management API.
 * No project creation, SQL, credential printing, or production mutation.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const fail=(code)=>{throw Error('services_phase41_'+code)};
const PROD='wcncuarekaofmfurbtbh';
const REF=/^[a-z]{20}$/;
const SLUG=/^[a-z0-9][a-z0-9-]{2,79}$/;
const POOLER=/^aws-[0-9]+-([a-z0-9-]+)\.pooler\.supabase\.com$/;
const TOKEN=/^[A-Za-z0-9._~-]{24,2048}$/;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export function validateRegisteredStagingTarget(env){
 if(!record(env))fail('config_missing');
 if(env.SERVICES_PREFLIGHT_CONFIRM!=='READ_ONLY_STAGING_ACCEPTANCE')
   fail('operator_approval_missing');
 const ref=env.SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF;
 if(typeof ref!=='string'||!REF.test(ref)||ref===PROD||
   env.SERVICES_PREFLIGHT_URL!=='https://'+ref+'.supabase.co')
   fail('project_ref_or_url_invalid');
 const org=env.SERVICES_STAGING_EXPECTED_ORG_SLUG;
 if(typeof org!=='string'||!SLUG.test(org))
   fail('organization_pin_missing');
 const projectName=env.SERVICES_STAGING_EXPECTED_PROJECT_NAME;
 if(typeof projectName!=='string'||projectName.length<3||
    projectName.length>120||projectName.trim()!==projectName||
    /[\r\n\u0000-\u001f]/.test(projectName))
   fail('project_name_pin_missing');
 const pooler=env.SERVICES_STAGING_AUDIT_POOLER_HOST;
 const match=typeof pooler==='string'?pooler.match(POOLER):null;
 if(!match||pooler.length>120)fail('pooler_region_pin_missing');
 const token=env.SERVICES_STAGING_MANAGEMENT_API_TOKEN;
 if(typeof token!=='string'||!TOKEN.test(token))fail('management_token_missing');
 return {ref,org,projectName,region:match[1],token};
}

export function validateRegisteredProject(result,target){
 if(!record(target)||!REF.test(target.ref)||target.ref===PROD)
   fail('target_not_staging');
 if(!record(result)||result.ref!==target.ref)
   fail('project_not_registered_as_expected');
 if(result.organization_slug!==target.org||
    result.name!==target.projectName)
   fail('project_ownership_or_name_mismatch');
 if(result.status!=='ACTIVE_HEALTHY')
   fail('project_unhealthy');
 if(result.region!==target.region)
   fail('project_pooler_region_mismatch');
 if(!record(result.database)||
   result.database.host!=='db.'+target.ref+'.supabase.co')
   fail('database_host_mismatch');
 return {
  gate:'services-phase41-management-api-project-identity',
  accepted:true,
  projectRefMatched:true,
  expectedOrganizationMatched:true,
  expectedNameMatched:true,
  activeHealthy:true,
  poolerRegionMatched:true,
  databaseHostMatched:true,
  managementApiGetOnly:true,
  managementApiProjectAccessVerified:true,
  separateFromKnownProductionProjectRef:true,
  projectIntendedPurposeIndependentlyAttested:false,
  stagingDatabaseSchemaPassed:false,
  realAccountStagingPassed:false,
  remoteProjectCreated:false,
  remoteSqlExecuted:false,
  productionDeploymentAuthorized:false,
 };
}

export async function proveRegisteredStagingProject(env=process.env,fetchFn=fetch){
 const target=validateRegisteredStagingTarget(env);
 const url='https://api.supabase.com/v1/projects/'+target.ref;
 try{
  const response=await fetchFn(url,{
   method:'GET',
   headers:{
    Authorization:'Bearer '+target.token,
    Accept:'application/json',
   },
   redirect:'error',
   cache:'no-store',
   signal:AbortSignal.timeout(8000),
  });
  if(!response||response.status!==200||response.ok!==true)
    fail('management_project_request_rejected');
  const kind=response.headers?.get?.('content-type');
  if(typeof kind!=='string'||!/^application\/json(?:\s*;|$)/i.test(kind))
    fail('response_not_json');
  const size=response.headers?.get?.('content-length');
  if(size!==null&&size!==undefined&&
    (!/^\d+$/.test(size)||Number(size)>20000))
    fail('response_oversized');
  const raw=await response.text();
  if(typeof raw!=='string'||raw.length>20000)
    fail('response_oversized');
  let data;
  try{data=JSON.parse(raw)}catch{fail('response_malformed')}
  return validateRegisteredProject(data,target);
 }catch(err){
  // Never surface fetch error text, response bodies, token, org, target URL,
  // project identity, network diagnostics or credentials into GitHub logs.
  if(err instanceof Error&&/^services_phase41_[a-z_]+$/.test(err.message))
   throw err;
  fail('management_api_unavailable');
 }
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{
  if(process.argv.length!==2)fail('args_invalid');
  const result=await proveRegisteredStagingProject();
  process.stdout.write('PASS Services staging project registered and identity matched (read-only)\n');
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(err){
  const code=err instanceof Error&&/^services_phase41_[a-z_]+$/.test(err.message)
    ?err.message:'services_phase41_unavailable';
  process.stderr.write('BLOCKED '+code+'\n');
  process.exitCode=1;
 }
}
