#!/usr/bin/env node
/**
 * Real deployment dependency gate for ETERNYX's four absent backend functions.
 * Derives exact .rpc() / .from() references from REVIEWED source; no secrets,
 * credentials, arbitrary user-provided SQL, database access, writes or deploys.
 */
import {readFile,readdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const SLUGS=Object.freeze([
  "automation-control","automation-webhook",
  "automation-scheduler-worker","ctf-verified",
]);
const SAFE=/^[a-z][a-z0-9_]{1,95}$/;
const RPC=/\.\s*rpc\s*\(\s*["']([a-z][a-z0-9_]*)["']/g;
const TABLE=/\.\s*from\s*\(\s*["']([a-z][a-z0-9_]*)["']/g;
const CALL=/\.\s*(rpc|from)\s*\(/g;
function deny(code){throw Error("eternyx_backend_dependency_"+code);}
function checkedNames(input){
  const names=[...new Set(input)].sort();
  if(!names.length||names.some(x=>!SAFE.test(x)))deny("invalid_identifier");
  return names;
}
export function extractServiceDependencies(source,slug="checked-in-handler"){
  if(typeof source!=="string"||source.length<500||source.length>200000)
    deny("invalid_source");
  const allCalls=[...source.matchAll(CALL)];
  const rpcs=checkedNames([...source.matchAll(RPC)].map(m=>m[1]));
  const tables=checkedNames([...source.matchAll(TABLE)].map(m=>m[1]));
  const literalCount=[...source.matchAll(RPC)].length+[...source.matchAll(TABLE)].length;
  // Every RPC/table call must be a source literal; a dynamic key would make
  // the read-only release catalog incomplete and must block deployment.
  if(allCalls.length!==literalCount)deny("dynamic_database_access");
  return {slug,rpcs,tables};
}
export async function inspectFourRuntimeDependencies(root=ROOT){
  const found=await Promise.all(SLUGS.map(async slug=>{
    const code=await readFile(path.join(root,"supabase/functions",slug,"index.ts"),"utf8");
    return extractServiceDependencies(code,slug);
  }));
  const rpcs=checkedNames(found.flatMap(x=>x.rpcs));
  const tables=checkedNames(found.flatMap(x=>x.tables));
  if(rpcs.length<60||tables.length<7)deny("incomplete_service_surface");
  if(!rpcs.includes("ctf_claim_verification_attempt")||
     !rpcs.includes("automation_claim_due_schedule")||
     !rpcs.includes("automation_record_run")||
     !tables.includes("ctf_verified_solves")||
     !tables.includes("automation_workflows"))
    deny("required_dependency_missing");
  return {schema:"eternyx-four-backend-source-surface-v1",
    slugs:[...SLUGS],rpcCount:rpcs.length,tableCount:tables.length,
    rpcs,tables,sourceBound:true,productionReady:false,
    databaseChecked:false,deploymentAuthorized:false};
}
export async function inspectDefinedFunctions(root=ROOT){
  const names=(await readdir(path.join(root,"supabase/migrations")))
    .filter(x=>/^20\d{12}_.+\.sql$/.test(x));
  const created=new Set();
  for(const filename of names){
    const sql=await readFile(path.join(root,"supabase/migrations",filename),"utf8");
    for(const m of sql.matchAll(
      /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?([a-z][a-z0-9_]*)"?\s*\(/gi
    ))created.add(m[1].toLowerCase());
  }
  return {migrationCount:names.length,definedFunctions:created};
}
export async function inspectSourceCompleteness(root=ROOT){
  const surface=await inspectFourRuntimeDependencies(root);
  const definitions=await inspectDefinedFunctions(root);
  const missingDefinitions=surface.rpcs.filter(name=>!definitions.definedFunctions.has(name));
  return {...surface,sourceMigrationCount:definitions.migrationCount,
    missingSqlDefinitions:missingDefinitions,
    allRuntimeRpcDefinitionsPresent:missingDefinitions.length===0,
    stagingCatalogExecuted:false};
}
function values(names){
  for(const name of names)if(!SAFE.test(name))deny("invalid_identifier");
  return names.map(name=>"('"+name+"')").join(",\n      ");
}
export function buildReadonlySql(surface){
  if(!surface||surface.schema!=="eternyx-four-backend-source-surface-v1"||
     surface.sourceBound!==true||surface.productionReady!==false||
     surface.databaseChecked!==false||surface.deploymentAuthorized!==false)
    deny("invalid_source_manifest");
  const rpcs=checkedNames(surface.rpcs??[]);
  const tables=checkedNames(surface.tables??[]);
  if(rpcs.length!==surface.rpcCount||tables.length!==surface.tableCount||
     rpcs.length<60||tables.length<7)deny("incomplete_manifest");
  return [
    "-- Generated from reviewed ETERNYX four-function source; CATALOG SELECT only.",
    "\\set ON_ERROR_STOP on",
    "BEGIN READ ONLY;",
    "SET LOCAL statement_timeout='5s';",
    "SET LOCAL lock_timeout='2s';",
    "SELECT 'rpc_count=' || (SELECT count(*) FROM (VALUES",
    "      "+values(rpcs),
    "    ) required(name) WHERE EXISTS (",
    "      SELECT 1 FROM pg_catalog.pg_proc p",
    "      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace",
    "      WHERE n.nspname='public' AND p.proname=required.name",
    "    ))::text;",
    "SELECT 'table_count=' || (SELECT count(*) FROM (VALUES",
    "      "+values(tables),
    "    ) required(name) WHERE EXISTS (",
    "      SELECT 1 FROM pg_catalog.pg_class c",
    "      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace",
    "      WHERE n.nspname='public' AND c.relname=required.name AND c.relkind='r'",
    "    ))::text;",
    "SELECT 'rls_table_count=' || (SELECT count(*) FROM (VALUES",
    "      "+values(tables),
    "    ) required(name) WHERE EXISTS (",
    "      SELECT 1 FROM pg_catalog.pg_class c",
    "      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace",
    "      WHERE n.nspname='public' AND c.relname=required.name",
    "        AND c.relkind='r' AND c.relrowsecurity",
    "    ))::text;",
    "COMMIT;",
    "",
  ].join("\n");
}
export function parseReadonlyResult(raw,surface){
  if(!surface||surface.schema!=="eternyx-four-backend-source-surface-v1")
    deny("invalid_source_manifest");
  if(typeof raw!=="string"||raw.length>1024)deny("invalid_catalog");
  const rows=raw.trim().split(/\r?\n/);
  if(rows.length!==3)deny("invalid_catalog");
  const expected=["rpc_count","table_count","rls_table_count"];
  const values=[];
  for(let i=0;i<rows.length;i++){
    const m=/^([a-z_]+)=([0-9]{1,4})$/.exec(rows[i]);
    if(!m||m[1]!==expected[i]||!Number.isSafeInteger(Number(m[2])))
      deny("invalid_catalog");
    values.push(Number(m[2]));
  }
  if(values[0]!==surface.rpcCount||
     values[1]!==surface.tableCount||
     values[2]!==surface.tableCount)
    deny("incomplete_remote_schema");
  return {schema:"eternyx-four-backend-pg-catalog-v1",
    rpcCount:values[0],tableCount:values[1],
    tenantTablesWithRls:values[2],allReferencedRpcsPresent:true,
    allReferencedTablesPresent:true,allReferencedTablesRlsEnabled:true,
    transactionReadOnly:true,sourceBound:true,
    stagingDbSource:"operator_approved_readonly_psql",
    serviceSecretsVerified:false,runtimeFlowsVerified:false,
    productionReady:false,deploymentAuthorized:false};
}
export async function main(argv=process.argv.slice(2),root=ROOT){
  if(argv.length===1&&argv[0]==="--source"){
    const report=await inspectSourceCompleteness(root);
    if(!report.allRuntimeRpcDefinitionsPresent)deny("missing_sql_definitions");
    process.stdout.write(JSON.stringify({...report,defined:true},null,2)+"\n");
    return;
  }
  if(argv.length===1&&argv[0]==="--sql"){
    const report=await inspectSourceCompleteness(root);
    if(!report.allRuntimeRpcDefinitionsPresent)deny("missing_sql_definitions");
    process.stdout.write(buildReadonlySql(report));
    return;
  }
  if(argv.length===2&&argv[0]==="--parse"){
    const report=await inspectSourceCompleteness(root);
    if(!report.allRuntimeRpcDefinitionsPresent)deny("missing_sql_definitions");
    const result=parseReadonlyResult(await readFile(argv[1],"utf8"),report);
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
    return;
  }
  deny("invalid_arguments");
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked)main().catch(e=>{
  const safe=e instanceof Error&&/^eternyx_backend_dependency_[a-z_]+$/.test(e.message)?
    e.message:"eternyx_backend_dependency_unavailable";
  process.stderr.write(safe+"\n");process.exitCode=1;
});
