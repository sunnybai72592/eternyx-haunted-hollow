#!/usr/bin/env node
/**
 * Phase 43: inspect ONLY catalog metadata for a secure prerequisite of the
 * existing Services migrations: trusted admin_users and public.is_admin().
 * Never execute an admin helper, read admin assignments, seed Auth users,
 * deploy a migration or connect to the known production database.
 */
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateInventoryTarget} from './services-phase42-staging-inventory.mjs';

export const SERVICES_FOUNDATION_FACTS=Object.freeze([
 'auth_users_table',
 'auth_uid_helper',
 'admin_users_table',
 'admin_users_rls_enabled',
 'admin_users_client_reads_denied',
 'is_admin_helper',
 'is_admin_security_definer',
 'is_admin_stable',
 'is_admin_fixed_search_path',
 'is_admin_checks_trusted_assignments',
 'is_admin_authenticated_execute',
 'is_admin_implicit_public_execute_denied',
]);
const fail=code=>{throw Error('services_phase43_'+code)};
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export function buildFoundationSql(){
 // Every expression accesses ONLY pg_catalog and information_schema metadata.
 // No SELECT from public.admin_users and no execution of public.is_admin().
 const statement=[
  'SELECT row_to_json(f)::text FROM (SELECT',
  " EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='users' AND c.relkind IN ('r','p')) AS auth_users_table,",
  " EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname='uid' AND p.pronargs=0) AS auth_uid_helper,",
  " EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='admin_users' AND c.relkind IN ('r','p')) AS admin_users_table,",
  " COALESCE((SELECT c.relrowsecurity FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='admin_users' AND c.relkind IN ('r','p')),false) AS admin_users_rls_enabled,",
  " COALESCE((SELECT NOT pg_catalog.has_table_privilege('anon',c.oid,'SELECT') AND NOT pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='admin_users' AND c.relkind IN ('r','p')),false) AS admin_users_client_reads_denied,",
  " EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin' AND p.pronargs=0) AS is_admin_helper,",
  " COALESCE((SELECT p.prosecdef FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin' AND p.pronargs=0),false) AS is_admin_security_definer,",
  " COALESCE((SELECT p.provolatile='s' FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin' AND p.pronargs=0),false) AS is_admin_stable,",
  " COALESCE((SELECT ('search_path='=ANY(p.proconfig) OR 'search_path=\"\"'=ANY(p.proconfig)) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin' AND p.pronargs=0),false) AS is_admin_fixed_search_path,",
  " COALESCE((SELECT p.prosrc LIKE '%public.admin_users%' AND p.prosrc LIKE '%auth.uid()%' AND p.prosrc NOT LIKE '%public.profiles%' FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin' AND p.pronargs=0),false) AS is_admin_checks_trusted_assignments,",
  " COALESCE((SELECT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin' AND p.pronargs=0),false) AS is_admin_authenticated_execute,",
  " COALESCE((SELECT NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin' AND p.pronargs=0),false) AS is_admin_implicit_public_execute_denied",
  ') f;',
 ].join('\n');
 return [
  '\\set ON_ERROR_STOP on',
  'BEGIN TRANSACTION READ ONLY;',
  'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;',
  "SET LOCAL statement_timeout = '12000ms';",
  statement,
  'COMMIT;',
  '',
 ].join('\n');
}

export function analyzeServicesFoundation(output){
 if(typeof output!=='string'||output.length>16000)fail('output_oversized');
 const rows=output.trim().split(/\r?\n/);
 if(rows.length!==1)fail('result_shape_invalid');
 let facts;
 try{facts=JSON.parse(rows[0])}catch{fail('invalid_json')}
 if(!isObject(facts)||Object.keys(facts).length!==SERVICES_FOUNDATION_FACTS.length||
    SERVICES_FOUNDATION_FACTS.some(key=>typeof facts[key]!=='boolean')||
    Object.keys(facts).some(key=>!SERVICES_FOUNDATION_FACTS.includes(key)))
   fail('catalog_facts_incomplete');
 const missing=SERVICES_FOUNDATION_FACTS.filter(key=>!facts[key]);
 return {
  schema:'eternyx-services-phase43-admin-foundation-readiness-v1',
  state:missing.length===0?'eligible_for_separate_reviewed_staging_deployment':
   'blocked_trusted_admin_foundation_missing',
  factsChecked:SERVICES_FOUNDATION_FACTS.length,
  factsPassed:SERVICES_FOUNDATION_FACTS.length-missing.length,
  missingSourceDefinedRequirements:missing,
  queryMetadataOnly:true,
  adminAssignmentRowsRead:false,
  adminAccountsSeeded:false,
  adminFunctionExecuted:false,
  migrationSqlApplied:false,
  stagingDeploymentAuthorized:false,
  productionDeploymentAuthorized:false,
  full64CatalogVerified:false,
  realAccountAcceptancePerformed:false,
 };
}

export function runServicesFoundationReadiness(env=process.env){
 let target;
 try{target=validateInventoryTarget(env)}catch{fail('staging_target_or_approval_invalid')}
 const child=spawnSync('psql',[
  '-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1',
  '-h',target.host,'-p','5432','-U',target.user,'-d','postgres',
 ],{
  input:buildFoundationSql(),encoding:'utf8',timeout:40000,maxBuffer:32768,
  env:{
   PATH:process.env.PATH??'/usr/bin:/bin',
   HOME:process.env.HOME??'/tmp',
   PGPASSWORD:target.password,
   PGSSLMODE:'verify-full',
   PGSSLROOTCERT:'/etc/ssl/certs/ca-certificates.crt',
   PGCONNECT_TIMEOUT:'8',
   PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=12000',
   PGAPPNAME:'eternyx-services-phase43-foundation-readonly',
  },
 });
 // Never print untrusted psql stderr, connection targets or Auth identifiers.
 if(child.error||child.signal||child.status!==0)
   fail('staging_auditor_or_catalog_unavailable');
 return analyzeServicesFoundation(child.stdout);
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{
  if(process.argv.length!==2 && !(process.argv.length===3&&process.argv[2]==='--assert-ready'))
   fail('arguments_invalid');
  const result=runServicesFoundationReadiness();
  process.stdout.write(JSON.stringify(result)+'\n');
  if(process.argv.includes('--assert-ready')&&
    result.state!=='eligible_for_separate_reviewed_staging_deployment')
    process.exitCode=1;
 }catch(err){
  const code=err instanceof Error&&/^services_phase43_[a-z_]+$/.test(err.message)
   ?err.message:'services_phase43_unavailable';
  process.stderr.write('BLOCKED '+code+'\n');
  process.exitCode=1;
 }
}
