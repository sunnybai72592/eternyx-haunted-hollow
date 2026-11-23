#!/usr/bin/env node
/**
 * Services Phase 36: protected, staging-only, REAL read-only PostgreSQL
 * catalog/history proof before any staging Auth sign-in.
 * Never creates/changes schema, migrations, business rows or Auth users.
 * Requires a dedicated, unprivileged auditor role provisioned separately
 * on a reviewed, NON-PRODUCTION staging Supabase project.
 */
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateOperatorQuery} from './services-pg17-catalog-verdict-regressions.mjs';
import {verifyServicesStagingEvidence,SERVICES_CATALOG_CHECKS} from './services-staging-release-evidence.mjs';
import {reconcileServicesHistory} from './services-phase35-managed-history-reconciler.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PRODUCTION='wcncuarekaofmfurbtbh';
const REF=/^[a-z]{20}$/;
const POOLER=/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/;
const ROLE='services_staging_auditor';
const SCHEMA_SQL='docs/sql/eternyx/services-phase35-readonly-schema-markers.sql';
const VERDICT_SQL='docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql';
const CATALOG_KEYS=[
 'phase1_requests','phase12_customer_followup_queue',
 'phase13_amendments','phase13_customer_queue','phase13_admin_queue',
 'phase14_journal',
];
const fail=(code)=>{throw Error('services_phase36_'+code)};
const record=(x)=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export function verifyAuditTarget(env,now=new Date()){
 if(!record(env))fail('environment_missing');
 // This remains an independent operator approval and source-history gate.
 // It is NOT accepted as database truth; live SQL below must prove it.
 try{verifyServicesStagingEvidence(env,now)}
 catch{fail('operator_preflight_failed')}
 const ref=env.SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF;
 if(typeof ref!=='string'||!REF.test(ref)||ref===PRODUCTION||
    env.SERVICES_PREFLIGHT_URL!=='https://'+ref+'.supabase.co')fail('staging_target_invalid');
 const host=env.SERVICES_STAGING_AUDIT_POOLER_HOST;
 if(typeof host!=='string'||!POOLER.test(host)||host.length>120)
   fail('pooler_host_invalid');
 const password=env.SERVICES_STAGING_AUDIT_DB_PASSWORD;
 if(typeof password!=='string'||password.length<16||password.length>512||
    /[\u0000\r\n]/.test(password))fail('auditor_secret_missing');
 return {ref,host,user:ROLE+'.'+ref,password};
}

function readOnlySelect(sql){
 if(typeof sql!=='string')fail('marker_query_missing');
 const clean=sql.replace(/--[^\r\n]*/g,'').trim();
 const withoutStrings=clean.replace(/'(?:''|[^'])*'/g,"''");
 if(!/^SELECT\b/i.test(clean)||!/;\s*$/.test(clean)||
    (clean.match(/;/g)||[]).length!==1||
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|COPY|CALL|EXECUTE|DO)\b/i.test(withoutStrings)||
    /\b(?:FROM|JOIN)\s+(?:public|auth)\./i.test(withoutStrings)||
    CATALOG_KEYS.some(k=>!clean.includes(k)))fail('marker_query_not_readonly');
 return clean.slice(0,-1).trim();
}

export function buildAuditSql(schemaSql,verdictSql){
 const schema=readOnlySelect(schemaSql);
 let verdict;
 try{verdict=validateOperatorQuery(verdictSql)}
 catch{fail('catalog_query_not_readonly')}
 // Exactly one read-only session with one bounded statement timeout.
 // psql -X -t -A -q returns four single-line JSON documents.
 return [
  '\\set ON_ERROR_STOP on',
  'BEGIN TRANSACTION READ ONLY;',
  "SET LOCAL statement_timeout = '12000ms';",
  "SELECT row_to_json(i)::text FROM (SELECT current_user AS role, current_database() AS db, pg_catalog.clock_timestamp() AS server_time) i;",
  'SELECT row_to_json(h)::text FROM (',
  " SELECT COALESCE(json_agg(json_build_object('version',version::text,'name',COALESCE(name,'')) ORDER BY version), '[]'::json) AS managed_migrations",
  ' FROM supabase_migrations.schema_migrations',
  ') h;',
  'SELECT row_to_json(c)::text FROM ('+schema+') c;',
  'SELECT row_to_json(v)::text FROM ('+verdict+') v;',
  'COMMIT;',
  ''
 ].join('\n');
}

export function validateLiveAuditOutput(output,target,now=new Date()){
 if(typeof output!=='string'||output.length>250_000)fail('output_oversized');
 const lines=output.trim().split(/\r?\n/);
 if(lines.length!==4)fail('output_not_four_json_rows');
 let rows;
 try{rows=lines.map(s=>JSON.parse(s))}
 catch{fail('output_invalid_json')}
 if(rows.some(x=>!record(x)))fail('output_invalid_shape');
 const [identity,history,catalog,verdict]=rows;
 if(identity.role!==ROLE||identity.db!=='postgres'||
    typeof identity.server_time!=='string')fail('incorrect_auditor_role');
 const skew=Math.abs(now.getTime()-Date.parse(identity.server_time));
 if(!Number.isFinite(skew)||skew>5*60*1000)fail('database_clock_invalid');
 if(!Array.isArray(history.managed_migrations)||history.managed_migrations.length===0)
   fail('history_missing');
 if(Object.keys(catalog).length!==CATALOG_KEYS.length||
    CATALOG_KEYS.some(k=>typeof catalog[k]!=='boolean'))fail('catalog_incomplete');
 if(verdict.catalog_checks_passed!==true ||
    Number(verdict.checks_evaluated)!==SERVICES_CATALOG_CHECKS ||
    Number(verdict.checks_failed)!==0||
    !Array.isArray(verdict.failed_check_ids)||
    verdict.failed_check_ids.length!==0)fail('live_catalog_not_passed');
 let reviewed;
 try{
  reviewed=reconcileServicesHistory({
   schema:'eternyx-services-phase35-readonly-evidence-v1',
   projectRef:target.ref,
   capturedAt:now.toISOString(),
   historyComplete:true,
   managedMigrations:history.managed_migrations,
   catalog,
  },now);
 }catch{fail('history_not_reconciled')}
 if(!reviewed.observedFoundation.allFirstElevenNamedMigrationsObserved||
    !reviewed.observedFoundation.requestTablePresent||
    !reviewed.observedFoundation.followupQueuePresent||
    reviewed.phase13.status!=='history_name_and_objects_present_not_sql_content_proof'||
    reviewed.phase14.status!=='history_name_and_objects_present_not_sql_content_proof')
    fail('history_or_schema_missing');
 // All conclusions are direct results of real SELECTs, NOT a deployment
 // signature or proof of actual SQL contents of historically colliding files.
 return {
   gate:'services-phase36-staging-live-readonly-db-proof',
   accepted:true,
   connectionRoleLeastPrivilegeDeclared:true,
   sqlTransactionReadOnly:true,
   remoteHistoryByNameObserved:true,
   liveCatalogChecksEvaluated:SERVICES_CATALOG_CHECKS,
   liveCatalogChecksFailed:0,
   sourceContentProvenByLiveQuery:false,
   historicalCollisionFilesAuthenticated:false,
   stagingProjectIndependentlyRegisteredByManagementApi:false,
   realAccountStagingPassed:false,
   productionDeploymentAuthorized:false,
   remoteMigrationPerformed:false,
 };
}

export async function runStagingAudit(env=process.env,now=new Date()){
 const target=verifyAuditTarget(env,now);
 const [markers,verdict]=await Promise.all([
  readFile(path.join(ROOT,SCHEMA_SQL),'utf8'),
  readFile(path.join(ROOT,VERDICT_SQL),'utf8'),
 ]);
 const sql=buildAuditSql(markers,verdict);
 // Only derived target parameters; NEVER accept a connection URI, user,
 // port, SQL argument or command from environment input.
 const child=spawnSync('psql',[
  '-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1',
  '-h',target.host,'-p','5432',
  '-U',target.user,'-d','postgres',
 ],{
  input:sql,encoding:'utf8',timeout:50_000,maxBuffer:262144,
  env:{
   PATH:process.env.PATH??'/usr/bin:/bin',
   HOME:process.env.HOME??'/tmp',
   PGPASSWORD:target.password,
   PGSSLMODE:'verify-full',
   PGSSLROOTCERT:'/etc/ssl/certs/ca-certificates.crt',
   PGCONNECT_TIMEOUT:'8',
   PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=12000',
   PGAPPNAME:'eternyx-services-phase36-staging-readonly',
  },
 });
 // Do not print stderr, connection strings, network errors, query contents,
 // project refs, migration names, or raw catalog/history records.
 if(child.error||child.signal||child.status!==0)fail('database_probe_failed');
 return validateLiveAuditOutput(child.stdout,target,new Date());
}

const invoked=process.argv[1]&&
 path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{
  if(process.argv.length!==2)fail('arguments_invalid');
  const result=await runStagingAudit();
  process.stdout.write('PASS Services real staging database read-only gate\n');
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(err){
  const code=err instanceof Error&&/^services_phase36_[a-z_]+$/.test(err.message)
    ?err.message:'services_phase36_unavailable';
  process.stderr.write('BLOCKED '+code+'\n');
  process.exitCode=1;
 }
}
