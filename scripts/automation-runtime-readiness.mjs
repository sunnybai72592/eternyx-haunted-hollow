#!/usr/bin/env node
/**
 * Read-only Automation v1 source and hosted-function inventory.
 * No migration, deployment, scheduler tick, workflow run, external write or
 * secret inspection occurs here. This is not a production release certificate.
 */
import {readFile,readdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

export const REQUIRED_FUNCTIONS=Object.freeze({
  "automation-control":true,
  "automation-webhook":false,
  "automation-scheduler-worker":false,
  "automation-schedule-control":true,
  "automation-github-public":true,
  "automation-github-issues":true,
});
const BASELINE_MIGRATIONS=Object.freeze([
  "20261122220000_automation_manual_control_plane.sql",
  "20261122230000_automation_signed_webhook_triggers.sql",
  "20261122234500_automation_scheduled_runs.sql",
  "20261123160000_automation_evidence_packages.sql",
  "20261123170000_automation_audit_handoff.sql",
]);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const uuidRef=/^[a-z]{20}$/;
const version=/^\d{14}$/;
function signal(code,subject,detail){
  return {code,subject,detail};
}
export function parseJwtPolicies(config){
  if(typeof config!=="string")throw Error("Supabase config missing");
  const map=new Map();
  let block=null;
  for(const line of config.split(/\r?\n/)){
    const v=line.trim();
    const found=/^\[functions\.([a-z0-9-]+)\]$/.exec(v);
    if(found){block=found[1];if(map.has(block))throw Error("Duplicate function block: "+block);map.set(block,null);continue;}
    if(/^\[/.test(v)){block=null;continue;}
    if(block!==null&&/^verify_jwt\s*=/.test(v)){
      const m=/^verify_jwt\s*=\s*(true|false)(?:\s*#.*)?$/.exec(v);
      if(!m||map.get(block)!==null)throw Error("Invalid JWT policy for "+block);
      map.set(block,m[1]==="true");
    }
  }
  return map;
}
export async function inspectSources(repoRoot=root){
  const config=await readFile(path.join(repoRoot,"supabase/config.toml"),"utf8");
  const policies=parseJwtPolicies(config);
  const problems=[];
  const entries=await readdir(path.join(repoRoot,"supabase/migrations"));
  const migrations=entries.filter(x=>/^20\d{12}_automation_[a-z0-9_]+\.sql$/.test(x)).sort();
  for(const name of BASELINE_MIGRATIONS){
    if(!migrations.includes(name))problems.push(signal("migration_source_missing",name,"Required SQL migration not in checkout"));
  }
  if(migrations.length<20)problems.push(signal("migration_inventory_short","automation", "Expected multi-phase migrations are absent"));
  for(const [slug,expectJwt] of Object.entries(REQUIRED_FUNCTIONS)){
    try{const source=await readFile(path.join(repoRoot,"supabase/functions",slug,"index.ts"),"utf8");
      if(!source.includes("serve("))problems.push(signal("handler_not_detected",slug,"No Edge handler detected"));
    }catch{problems.push(signal("function_source_missing",slug,"Function source file not found"));}
    if(policies.get(slug)!==expectJwt){
      problems.push(signal("jwt_config_mismatch",slug,"Explicit verify_jwt must be "+expectJwt));
    }
  }
  return {functionCount:Object.keys(REQUIRED_FUNCTIONS).length,migrations,problems};
}
export function checkFunctions(raw){
  const items=Array.isArray(raw)?raw:raw&&typeof raw==="object"&&Array.isArray(raw.functions)?raw.functions:null;
  if(!items)throw Error("Invalid function inventory shape");
  const seen=new Map();
  for(const item of items){
    if(!item||typeof item!=="object"||Array.isArray(item)||
       typeof item.slug!=="string"||!/^[a-z0-9-]{1,90}$/.test(item.slug)){
      throw Error("Malformed function inventory entry");
    }
    if(seen.has(item.slug))throw Error("Duplicate function slug "+item.slug);
    seen.set(item.slug,item);
  }
  const problems=[];
  const present=[];
  for(const [slug,expectedJwt] of Object.entries(REQUIRED_FUNCTIONS)){
    const entry=seen.get(slug);
    if(!entry){problems.push(signal("function_not_deployed",slug,"Not in project function inventory"));continue;}
    present.push(slug);
    if(entry.status!=="ACTIVE"){
      problems.push(signal("function_not_active",slug,"Management inventory does not report ACTIVE"));
    }
    if(typeof entry.verify_jwt!=="boolean"||entry.verify_jwt!==expectedJwt){
      problems.push(signal("deployed_jwt_mismatch",slug,"Expected verify_jwt="+expectedJwt));
    }
    if(!Number.isSafeInteger(entry.version)||entry.version<1){
      problems.push(signal("function_version_unverified",slug,"Missing positive deployed version"));
    }
  }
  return {present,missing:Object.keys(REQUIRED_FUNCTIONS).filter(x=>!seen.has(x)),problems};
}
export function checkMigrations(raw,required,projectRef,now=new Date()){
  if(!raw)return {
    evidenced:false,matched:[],missing:required,
    problems:[signal("migration_evidence_unavailable","database",
      "Migration inventory not retrieved; source files do not prove deployment")],
  };
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     !uuidRef.test(raw.projectRef)||raw.projectRef!==projectRef||
     raw.source!=="operator_supplied_migration_list"||
     !Array.isArray(raw.appliedVersions)||
     raw.appliedVersions.some(x=>typeof x!=="string"||!version.test(x))||
     new Set(raw.appliedVersions).size!==raw.appliedVersions.length||
     typeof raw.capturedAt!=="string"||!Number.isFinite(Date.parse(raw.capturedAt))){
    throw Error("Invalid or mismatched operator-supplied migration evidence");
  }
  const when=Date.parse(raw.capturedAt),age=now.getTime()-when;
  if(age< -5*60*1000||age>24*60*60*1000){
    throw Error("Operator migration evidence is stale or future-dated");
  }
  const set=new Set(raw.appliedVersions);
  const missing=required.filter(x=>!set.has(x.slice(0,14)));
  return {evidenced:true,matched:required.filter(x=>!missing.includes(x)),
    missing,problems:missing.map(x=>signal("migration_not_evidenced",x,"No matching applied migration version in operator inventory"))};
}
export async function readLiveFunctionInventory(projectRef,token,fetcher=fetch){
  if(!uuidRef.test(projectRef))throw Error("Invalid Supabase project reference");
  if(typeof token!=="string"||token.trim().length<20)throw Error("Missing management read token");
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const res=await fetcher("https://api.supabase.com/v1/projects/"+projectRef+"/functions",{
      method:"GET",redirect:"error",headers:{Authorization:"Bearer "+token,Accept:"application/json"},
      signal:controller.signal,
    });
    if(!res.ok)throw Error("Function inventory unavailable (HTTP "+res.status+")");
    const body=await res.json();
    checkFunctions(body);
    return body;
  }finally{clearTimeout(timeout);}
}
export function buildReport(source,inventory,migrations,sourceKind){
  const issues=[...source.problems,...(inventory?.problems??[
    signal("function_inventory_unavailable","runtime","Hosted function inventory has not been checked")]),
    ...migrations.problems];
  return {
    schema:"eternyx-automation-v1-runtime-inventory-v1",
    sourceKind,sourceMigrationCount:source.migrations.length,
    observedFunctions:inventory?.present??[],
    missingFunctions:inventory?.missing??Object.keys(REQUIRED_FUNCTIONS),
    migrationVersionsMatched:migrations.matched.length,
    missingMigrations:migrations.missing,
    checks:issues,status:issues.length?"blocked":"inventory_checks_passed",
    productionReady:false,liveExecutionVerified:false,
    migrationReceiptIsIndependentProof:false,
    releaseAuthorized:false,externalExecutionTriggered:false,
    next:"Verify live database access, real authenticated workflows, RLS, secrets, staging and explicit deployment approval separately",
  };
}
function argsFrom(argv){
  const o={live:false,json:false,snapshot:null,migrations:null,project:null};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==="--live")o.live=true;
    else if(arg==="--json")o.json=true;
    else if(["--snapshot","--migration-receipt","--project-ref"].includes(arg)){
      if(!argv[i+1]||argv[i+1].startsWith("--"))throw Error("Missing value for "+arg);
      o[arg==="--snapshot"?"snapshot":arg==="--migration-receipt"?"migrations":"project"]=argv[++i];
    }else throw Error("Unknown argument "+arg);
  }
  if(o.live&&o.snapshot)throw Error("Choose --live or --snapshot, not both");
  return o;
}
export async function main(argv=process.argv.slice(2),env=process.env){
  const o=argsFrom(argv);
  const source=await inspectSources();
  const project=o.project||env.SUPABASE_PROJECT_REF||"";
  let raw=null,kind="source_only";
  if(o.live){raw=await readLiveFunctionInventory(project,env.SUPABASE_ACCESS_TOKEN);kind="management_api_read_only";}
  if(o.snapshot){raw=JSON.parse(await readFile(o.snapshot,"utf8"));kind="operator_snapshot";}
  const inventory=raw===null?null:checkFunctions(raw);
  const receipt=o.migrations?JSON.parse(await readFile(o.migrations,"utf8")):null;
  const migrations=checkMigrations(receipt,source.migrations,project);
  const report=buildReport(source,inventory,migrations,kind);
  if(o.json)process.stdout.write(JSON.stringify(report,null,2)+"\n");
  else{
    process.stdout.write("Automation v1 runtime inventory: "+report.status+"\n");
    for(const issue of report.checks)process.stdout.write(" - "+issue.code+" ["+issue.subject+"]: "+issue.detail+"\n");
    process.stdout.write("No execution, deployment, migration, secret lookup, or release occurred.\n");
  }
  // Offline source-only CI checks source/config; live audits fail closed.
  return !o.live&&!o.snapshot&&!o.migrations
    ?(source.problems.length?1:0):(report.checks.length?1:0);
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked)main().then(code=>{process.exitCode=code;}).catch(e=>{
  // Print bounded, predictable errors only; never echo Authorization/token.
  const reason=e instanceof Error&&/^(Invalid|Missing|Unknown|Duplicate|Malformed|Function inventory unavailable|Operator migration evidence)/.test(e.message)
    ?e.message:"Inventory check unavailable";
  process.stderr.write("Automation runtime check: "+reason+"\n");
  process.exitCode=2;
});
