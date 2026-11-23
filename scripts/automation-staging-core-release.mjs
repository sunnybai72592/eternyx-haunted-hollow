#!/usr/bin/env node
/**
 * Strict, staging-only gate for ETERNYX's three missing Automation functions.
 * This module never deploys functions, runs SQL or invokes Supabase CLI.
 */
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {inspectStagingConnection,ETERNYX_PRODUCTION_REF} from "./automation-staging-db-readonly.mjs";
import {inspectSources,REQUIRED_FUNCTIONS} from "./automation-runtime-readiness.mjs";
export const CORE=Object.freeze(["automation-control","automation-webhook","automation-scheduler-worker"]);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const ORG="xnhopzufalyhswuwvqmo";
function deny(code){throw Error("automation_staging_release_"+code);}
export function validateTarget(env={}){
  const checked=inspectStagingConnection(env);
  if(checked.stagingRef===ETERNYX_PRODUCTION_REF)deny("production_denied");
  return checked;
}
export function parseCatalog(text){
  if(typeof text!=="string"||text.length>1024)deny("invalid_catalog");
  const expected=["automation_rpc_catalog_present","automation_rls_enabled","automation_schema_present"];
  const rows=text.trim().split(/\r?\n/);
  if(rows.length!==expected.length)deny("invalid_catalog");
  const result={};
  rows.forEach((line,i)=>{
    const match=/^([a-z_]+)=(true|false)$/.exec(line);
    if(!match||match[1]!==expected[i])deny("invalid_catalog");
    result[match[1]]=match[2]==="true";
  });
  if(Object.values(result).some(x=>x!==true))deny("schema_unverified");
  return {schema:"eternyx-automation-staging-function-catalog-v1",
    ...result,onlyReadOnlyCatalogQueries:true,
    remoteMigrationHistoryReconciled:false,
    releaseAuthorized:false};
}
export function validateStageProbe(raw,target){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     raw.schema!=="eternyx-automation-staging-db-probe-result-v1"||
     raw.historySource!=="independent_staging_readonly_database_query"||
     raw.observed?.connection_ok!==true||
     raw.observed?.transaction_read_only!==true||
     raw.observed?.migration_history_present!==true||
     raw.observed?.automation_workflows_present!==true||
     raw.observed?.automation_runs_present!==true||
     raw.observed?.automation_webhooks_present!==true||
     raw.observed?.automation_schedules_present!==true||
     raw.databaseWritesPerformed!==false||
     raw.releaseAuthorized!==false||
     raw.whichCollidedSqlExecuted!=="unknown"||
     !target?.targetBound)deny("staging_probe_not_verified");
  return true;
}
export function inspectStageProject(raw,expectedRef){
  const project=raw?.project??raw;
  if(!project||typeof project!=="object"||
     project.ref!==expectedRef||
     project.id!==expectedRef||
     project.ref===ETERNYX_PRODUCTION_REF||
     project.organization_id!==ORG||
     project.status!=="ACTIVE_HEALTHY")
    deny("independent_project_not_verified");
  return {ref:expectedRef,organizationConfirmed:true,
    productionExcluded:true,hostedStageChecked:true};
}
export function verifyDeployedCore(raw){
  const items=Array.isArray(raw)?raw:raw?.functions;
  if(!Array.isArray(items))deny("inventory_missing");
  const map=new Map();
  for(const f of items){
    if(!f||typeof f.slug!=="string"||map.has(f.slug))
      deny("malformed_function_inventory");
    map.set(f.slug,f);
  }
  return CORE.map(slug=>{
    const f=map.get(slug),expectedJwt=REQUIRED_FUNCTIONS[slug];
    if(!f||f.status!=="ACTIVE"||
       f.verify_jwt!==expectedJwt||
       !Number.isSafeInteger(f.version)||f.version<1)
      deny("core_function_not_verified");
    return {slug,active:true,version:f.version,verifyJwt:f.verify_jwt};
  });
}
export async function inspectCoreSources(root=ROOT){
  const source=await inspectSources(root);
  if(source.problems.length)deny("source_or_policy_invalid");
  const entries=[];
  for(const slug of CORE){
    const body=await readFile(path.join(root,"supabase/functions",slug,"index.ts"));
    if(body.length<500||body.length>200000)deny("source_out_of_bounds");
    entries.push({slug,verifyJwt:REQUIRED_FUNCTIONS[slug],
      sha256:createHash("sha256").update(body).digest("hex")});
  }
  return {schema:"eternyx-automation-core-deploy-manifest-v1",
    functions:entries,
    sourceValidated:true,stagingOnly:true,releaseAuthorized:false,
    productionDeployAllowed:false};
}
export async function fetchStageManagement(endpoint,token,fetcher=fetch){
  if(typeof endpoint!=="string"||
     !/^https:\/\/api\.supabase\.com\/v1\/projects\/[a-z]{20}(?:\/functions)?$/.test(endpoint)||
     typeof token!=="string"||token.length<20)deny("invalid_management_target");
  const response=await fetcher(endpoint,{
    method:"GET",redirect:"error",
    headers:{Authorization:"Bearer "+token,Accept:"application/json"},
    signal:AbortSignal.timeout(12000),
  });
  if(!response.ok)deny("management_unavailable");
  return response.json();
}
export async function main(argv=process.argv.slice(2),env=process.env){
  if(argv.length!==1||!["--check-source","--check-target"].includes(argv[0]))
    deny("invalid_arguments");
  if(argv[0]==="--check-source"){
    const manifest=await inspectCoreSources();
    process.stdout.write(JSON.stringify(manifest,null,2)+"\n");
  }else{
    const target=validateTarget(env);
    process.stdout.write(JSON.stringify(target,null,2)+"\n");
  }
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked)main().catch(error=>{
  const safe=error instanceof Error&&/^(automation_staging_release_|staging_db_)[a-z_]+$/.test(error.message)?
    error.message:"automation_staging_release_unavailable";
  process.stderr.write(safe+"\n");process.exitCode=1;
});
