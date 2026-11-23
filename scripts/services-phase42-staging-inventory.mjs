#!/usr/bin/env node
/**
 * Phase 42: independent, manual, staging-only READ ONLY Services gap inventory.
 * Lists only known source-defined migration names and six schema booleans.
 * Never connects to production, deploys schema, creates users or reads rows.
 */
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SERVICES_REPLAY_FILES,validateServicesReplay} from './services-pg17-replay-plan.mjs';
import {verifyLiveMigrationSequence} from './services-phase40-consistent-staging-evidence.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PROD='wcncuarekaofmfurbtbh';
const REF=/^[a-z]{20}$/;
const POOLER=/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/;
const ROLE='services_staging_auditor';
const VERSION=/^20\d{12}$/;
export const SERVICES_INVENTORY_MARKERS=Object.freeze([
 'phase1_requests','phase12_customer_followup_queue',
 'phase13_amendments','phase13_customer_queue',
 'phase13_admin_queue','phase14_journal',
]);
const fail=code=>{throw Error('services_phase42_'+code)};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export function validateInventoryTarget(env){
 if(!object(env)||env.SERVICES_PREFLIGHT_CONFIRM!=='READ_ONLY_STAGING_INVENTORY')
   fail('inventory_approval_missing');
 const ref=env.SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF;
 if(typeof ref!=='string'||!REF.test(ref)||ref===PROD||
   env.SERVICES_PREFLIGHT_URL!=='https://'+ref+'.supabase.co')
   fail('invalid_staging_target');
 const host=env.SERVICES_STAGING_AUDIT_POOLER_HOST;
 if(typeof host!=='string'||!POOLER.test(host)||host.length>120)
   fail('invalid_staging_pooler');
 const password=env.SERVICES_STAGING_AUDIT_DB_PASSWORD;
 if(typeof password!=='string'||password.length<16||
   password.length>512||/[\u0000\r\n]/.test(password))
   fail('auditor_password_missing');
 return {ref,host,user:ROLE+'.'+ref,password};
}

export function buildInventorySql(schemaSource){
 if(typeof schemaSource!=='string')fail('markers_missing');
 const cleaned=schemaSource.replace(/--[^\r\n]*/g,'').trim();
 if(!/^SELECT\b/i.test(cleaned)||!cleaned.endsWith(';')||
   (cleaned.match(/;/g)||[]).length!==1||
   SERVICES_INVENTORY_MARKERS.some(k=>!cleaned.includes('AS '+k))||
   /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|COPY|CALL|EXECUTE|DO)\b/i.test(cleaned))
   fail('markers_source_not_safe');
 const marker=cleaned.slice(0,-1);
 return [
  '\\set ON_ERROR_STOP on',
  'BEGIN TRANSACTION READ ONLY;',
  'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;',
  "SET LOCAL statement_timeout = '12000ms';",
  'SELECT row_to_json(s)::text FROM ('+marker+') s;',
  'SELECT row_to_json(h)::text FROM (',
  " SELECT COALESCE(json_agg(json_build_object('version',version::text,",
  " 'name',COALESCE(name,'')) ORDER BY version),'[]'::json) AS managed_migrations",
  ' FROM supabase_migrations.schema_migrations',
  ') h;',
  'COMMIT;',
  '',
 ].join('\n');
}

export function analyzeServicesInventory(raw){
 validateServicesReplay();
 if(typeof raw!=='string'||raw.length>250_000)fail('output_oversized');
 const lines=raw.trim().split(/\r?\n/);
 if(lines.length!==2)fail('output_shape_invalid');
 let rows;
 try{rows=lines.map(s=>JSON.parse(s))}catch{fail('output_json_invalid')}
 const [catalog,history]=rows;
 if(!object(catalog)||!object(history)||
   Object.keys(catalog).length!==SERVICES_INVENTORY_MARKERS.length||
   SERVICES_INVENTORY_MARKERS.some(k=>typeof catalog[k]!=='boolean')||
   !Array.isArray(history.managed_migrations)||
   Object.keys(history).length!==1)
   fail('catalog_or_history_incomplete');
 const list=history.managed_migrations;
 if(list.length>2000)fail('managed_history_oversized');
 const seenNames=new Set(),seenVersions=new Set();
 for(const m of list){
  if(!object(m)||Object.keys(m).length!==2||
    typeof m.version!=='string'||!VERSION.test(m.version)||
    typeof m.name!=='string'||!/^([a-z0-9][a-z0-9_-]{0,127})?$/.test(m.name)||
    seenVersions.has(m.version)||(m.name!==''&&seenNames.has(m.name)))
   fail('invalid_managed_history');
  seenVersions.add(m.version);
  if(m.name!=='')seenNames.add(m.name);
 }
 const sourceNames=SERVICES_REPLAY_FILES.map(file=>file.slice(15,-4));
 const missingNames=sourceNames.filter(name=>!seenNames.has(name));
 const actualCount=sourceNames.length-missingNames.length;
 const markerNames=SERVICES_INVENTORY_MARKERS.filter(k=>catalog[k]);
 const markerCount=markerNames.length;
 const noServices=actualCount===0&&markerCount===0;
 const full=actualCount===13&&markerCount===6;
 let ordered=false;
 if(full){
  try{
   ordered=verifyLiveMigrationSequence(list).actualManagedVersionOrderStrictlyIncreasing;
  }catch{
   // Named history and schema coexist but recorded application order differs.
   ordered=false;
  }
 }
 const status=noServices?'awaiting_services_staging_deployment':
   full&&ordered?'eligible_for_protected_services_safety_audit':
   'partial_or_inconsistent_services_staging_schema';
 return {
  schema:'eternyx-services-phase42-staging-inventory-v1',
  status,serviceMigrationsExpected:13,serviceNamesObserved:actualCount,
  missingSourceDefinedServiceNames:missingNames,
  independentSchemaMarkersObserved:markerCount,
  schemaMarkersAbsent:SERVICES_INVENTORY_MARKERS.filter(k=>!catalog[k]),
  recordedServiceOrderVerified:ordered,
  otherManagedMigrationsObserved:list.length-actualCount,
  manualCollisionReconciliationRequired:!full||!ordered,
  fullSecurityCatalog64Passed:false,
  serviceSchemaContentAuthenticated:false,
  realAccountStagingPassed:false,
  productionDeploymentAuthorized:false,
  liveDatabaseWritePerformed:false,
 };
}

export async function runInventory(env=process.env){
 const target=validateInventoryTarget(env);
 const markerSource=await readFile(path.join(ROOT,'docs/sql/eternyx/services-phase35-readonly-schema-markers.sql'),'utf8');
 const sql=buildInventorySql(markerSource);
 const child=spawnSync('psql',[
  '-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1',
  '-h',target.host,'-p','5432','-U',target.user,'-d','postgres',
 ],{
  input:sql,encoding:'utf8',timeout:40000,maxBuffer:262144,
  env:{
   PATH:process.env.PATH??'/usr/bin:/bin',HOME:process.env.HOME??'/tmp',
   PGPASSWORD:target.password,PGSSLMODE:'verify-full',
   PGSSLROOTCERT:'/etc/ssl/certs/ca-certificates.crt',PGCONNECT_TIMEOUT:'8',
   PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=12000',
   PGAPPNAME:'eternyx-services-phase42-inventory-readonly',
  },
 });
 // No raw psql stderr, migration history, SQL text, credentials or project refs.
 if(child.error||child.signal||child.status!==0)fail('staging_auditor_unavailable');
 return analyzeServicesInventory(child.stdout);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('arguments_invalid');
  const result=await runInventory();
  process.stdout.write('Services read-only staging inventory (not deployment approval)\n');
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(err){
  const code=err instanceof Error&&/^services_phase42_[a-z_]+$/.test(err.message)
   ?err.message:'services_phase42_unavailable';
  process.stderr.write('BLOCKED '+code+'\n');
  process.exitCode=1;
 }
}
