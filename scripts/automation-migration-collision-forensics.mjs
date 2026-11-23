#!/usr/bin/env node
/**
 * Historical Supabase migration-version collision forensics.
 * Strictly local, read-only, and non-executing. Source inventory checks must
 * never be mistaken for a deployed database migration history.
 */
import {createHash} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const REF=/^[a-z]{20}$/;
const VERSION=/^20\d{12}$/;
const MIGRATION=/^(20\d{12})_[a-zA-Z0-9_-]+\.sql$/;
const GIT_SHA=/^[0-9a-f]{40}$/;
const BASELINE="scripts/automation-migration-collision-baseline.json";
function failure(code){throw Error("collision_"+code);}
export function gitBlobSha(bytes){
  if(typeof bytes==="string")bytes=Buffer.from(bytes,"utf8");
  if(!Buffer.isBuffer(bytes))failure("invalid_blob");
  return createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
}
export function classifyOwner(filename){
  if(filename.includes("_automation_"))return "Automation";
  if(filename.includes("_docker_"))return "Docker";
  if(filename.includes("_service_"))return "Services";
  if(filename.includes("_workspace_"))return "Workspace";
  if(filename.includes("_ai_"))return "AI";
  return "Cross-pillar/other";
}
export function validateBaseline(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    raw.schema!=="eternyx-migration-collision-baseline-v1"||
    !Array.isArray(raw.duplicateVersions)||raw.duplicateVersions.length===0){
    failure("baseline_invalid");
  }
  const result=new Map();
  for(const group of raw.duplicateVersions){
    if(!group||typeof group!=="object"||!VERSION.test(group.version)||
      !Array.isArray(group.files)||group.files.length<2||
      result.has(group.version))failure("baseline_invalid");
    const names=new Set();
    const reviewed=[];
    for(const f of group.files){
      if(!f||typeof f.name!=="string"||!MIGRATION.test(f.name)||
        f.name.slice(0,14)!==group.version||!GIT_SHA.test(f.gitBlobSha)||
        names.has(f.name))failure("baseline_invalid");
      names.add(f.name);
      reviewed.push({name:f.name,gitBlobSha:f.gitBlobSha});
    }
    result.set(group.version,reviewed.sort((a,b)=>a.name.localeCompare(b.name)));
  }
  return result;
}
export function auditCollisionGroups(observed,baselineMap){
  if(!Array.isArray(observed)||!(baselineMap instanceof Map))failure("invalid_inventory");
  const index=new Map(),seen=new Set();
  for(const file of observed){
    if(!file||typeof file.name!=="string"||!MIGRATION.test(file.name)||
      !GIT_SHA.test(file.gitBlobSha)||seen.has(file.name))failure("invalid_inventory");
    seen.add(file.name);
    const version=file.name.slice(0,14);
    const group=index.get(version)||[];
    group.push(file);
    index.set(version,group);
  }
  const collisions=[...index.entries()].filter(([,files])=>files.length>1)
    .sort(([a],[b])=>a.localeCompare(b));
  const defects=[];
  for(const [version,files] of collisions){
    const expected=baselineMap.get(version);
    if(!expected){
      defects.push({code:"new_collision_version",version});
      continue;
    }
    const expectedMap=new Map(expected.map(x=>[x.name,x.gitBlobSha]));
    const observedNames=files.map(x=>x.name);
    if(files.length!==expected.length||
      files.some(x=>!expectedMap.has(x.name))){
      defects.push({code:"collision_membership_changed",version});
    }
    for(const file of files){
      const known=expectedMap.get(file.name);
      if(known&&known!==file.gitBlobSha)
        defects.push({code:"historical_collision_content_changed",version,file:file.name});
    }
  }
  for(const version of baselineMap.keys()){
    if(!collisions.some(([actual])=>actual===version))
      defects.push({code:"historical_collision_removed_without_review",version});
  }
  const groups=collisions.map(([version,files])=>({
    version,
    files:files.map(f=>({name:f.name,gitBlobSha:f.gitBlobSha,owner:classifyOwner(f.name)}))
      .sort((a,b)=>a.name.localeCompare(b.name)),
    appliedStatus:"unknown_until_independent_staging_db_history",
    remediation:"blocked_pending_historical_history_and_schema_review",
  }));
  return {groups,defects,sourceBaselineValid:defects.length===0};
}
export async function inventoryMigrations(repoRoot=ROOT){
  const dir=path.join(repoRoot,"supabase/migrations");
  const names=(await readdir(dir)).filter(name=>name.endsWith(".sql")).sort();
  const badNames=names.filter(name=>!MIGRATION.test(name));
  if(badNames.length)failure("malformed_migration_names");
  const byVersion=new Map();
  for(const name of names){
    const version=name.slice(0,14);
    const group=byVersion.get(version)||[];
    group.push(name);
    byVersion.set(version,group);
  }
  const duplicates=new Set([...byVersion].filter(([,files])=>files.length>1)
    .map(([version])=>version));
  const observed=[];
  for(const name of names){
    if(!duplicates.has(name.slice(0,14)))continue;
    const bytes=await readFile(path.join(dir,name));
    observed.push({name,gitBlobSha:gitBlobSha(bytes)});
  }
  return {sqlFileCount:names.length,observed};
}
export function reconcileAppliedHistory(groups,raw,stagingRef,productionRef,now=new Date()){
  if(raw===null||raw===undefined){
    return {evidence:"unavailable",projectBound:false,
      statuses:groups.map(g=>({version:g.version,classification:"remote_history_unavailable"}))};
  }
  if(typeof stagingRef!=="string"||!REF.test(stagingRef)||
     typeof productionRef!=="string"||!REF.test(productionRef)||
     stagingRef===productionRef)failure("target_not_isolated");
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    raw.projectRef!==stagingRef||
    raw.source!=="operator_supplied_complete_read_only_history"||
    raw.complete!==true||
    typeof raw.capturedAt!=="string"||
    !Number.isFinite(Date.parse(raw.capturedAt))||
    !Array.isArray(raw.appliedVersions)||
    raw.appliedVersions.some(v=>typeof v!=="string"||!VERSION.test(v))||
    new Set(raw.appliedVersions).size!==raw.appliedVersions.length){
    failure("invalid_operator_evidence");
  }
  const diff=now.getTime()-Date.parse(raw.capturedAt);
  if(!Number.isFinite(diff)||diff< -300000||diff>86400000){
    failure("stale_operator_evidence");
  }
  const set=new Set(raw.appliedVersions);
  return {evidence:"operator_supplied_unverified",projectBound:true,
    statuses:groups.map(g=>({
      version:g.version,
      classification:set.has(g.version)
        ?"applied_version_ambiguous_which_sql_executed"
        :"not_listed_in_operator_history_still_requires_review",
    }))};
}
export function readonlyHistoryQuery(groups){
  if(!Array.isArray(groups)||groups.some(g=>!VERSION.test(g.version)))failure("invalid_query_versions");
  const versions=[...new Set(groups.map(g=>g.version))].sort();
  if(!versions.length)failure("no_collisions");
  return "SELECT version FROM supabase_migrations.schema_migrations WHERE version IN ("+
    versions.map(v=>"'"+v+"'").join(", ")+") ORDER BY version;";
}
export async function generateReport({
  repoRoot=ROOT,baselinePath=BASELINE,stagingRef=null,productionRef=null,
  operatorEvidence=null,now=new Date(),
}={}){
  const raw=JSON.parse(await readFile(path.join(repoRoot,baselinePath),"utf8"));
  const baseline=validateBaseline(raw);
  const inventory=await inventoryMigrations(repoRoot);
  const audit=auditCollisionGroups(inventory.observed,baseline);
  if(stagingRef!==null||productionRef!==null){
    if(typeof stagingRef!=="string"||!REF.test(stagingRef)||
       typeof productionRef!=="string"||!REF.test(productionRef)||
       stagingRef===productionRef)failure("target_not_isolated");
  }
  if(operatorEvidence!==null&&(stagingRef===null||productionRef===null))
    failure("missing_project_binding");
  const remote=reconcileAppliedHistory(audit.groups,operatorEvidence,stagingRef,productionRef,now);
  return {
    schema:"eternyx-migration-collision-forensics-v1",
    mode:operatorEvidence===null?"source_only":"operator_history_review",
    sqlFileCount:inventory.sqlFileCount,
    collisionVersionCount:audit.groups.length,
    collisionFileCount:audit.groups.reduce((n,g)=>n+g.files.length,0),
    baselineVersionCount:baseline.size,
    collisions:audit.groups,
    sourceDefects:audit.defects,
    sourceBaselineValid:audit.sourceBaselineValid,
    operatorHistory:remote,
    readOnlyQuery:readonlyHistoryQuery(audit.groups),
    stagingDeploymentBlocked:true,
    productionDeploymentBlocked:true,
    deploymentAuthorized:false,
    dataMigrated:false,
    schemaChanged:false,
    historiesRepaired:false,
    credentialsAccessed:false,
    commandsExecuted:false,
    verifiedAppliedMigrationHistory:false,
    next:"Use authorized read-only staging database access to verify applied version history AND actual schema objects; reconcile collision filenames in a separately reviewed migration remediation. Do not rename, repair, push, or deploy from this report.",
  };
}
function parseArgs(argv){
  const opts={};
  const args=new Map([
    ["--staging-ref","stagingRef"],["--production-ref","productionRef"],
    ["--applied-evidence","evidencePath"],
  ]);
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(!args.has(key)||i+1>=argv.length||argv[i+1].startsWith("--")||
       Object.hasOwn(opts,args.get(key)))failure("invalid_arguments");
    opts[args.get(key)]=argv[++i];
  }
  return opts;
}
export async function main(argv=process.argv.slice(2)){
  const opts=parseArgs(argv);
  const operatorEvidence=opts.evidencePath?
    JSON.parse(await readFile(opts.evidencePath,"utf8")):null;
  const report=await generateReport({
    stagingRef:opts.stagingRef??null,
    productionRef:opts.productionRef??null,operatorEvidence,
  });
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  // Exit=0 certifies ONLY that the historical collision baseline is unchanged.
  // It is never proof of readiness; stagingDeploymentBlocked is always true.
  return report.sourceBaselineValid?0:1;
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  main().then(n=>{process.exitCode=n;}).catch(()=>{
    // Do not echo arbitrary operator input, file contents or credentials.
    process.stderr.write("Migration collision forensics unavailable or invalid\n");
    process.exitCode=2;
  });
}
