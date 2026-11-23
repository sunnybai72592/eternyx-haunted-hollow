#!/usr/bin/env node
/**
 * Read a previously generated, unlinked, source-verified SQL mirror and plan
 * a network-isolated PostgreSQL 17 Automation + Docker dependency replay.
 * This script does not connect to or run SQL against ANY database.
 */
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

const MIRROR_NAME=/^20\d{12}_[A-Za-z0-9_-]+\.sql$/;
const GIT_BLOB=/^[a-f0-9]{40}$/;
const SHA256=/^[a-f0-9]{64}$/;
function reject(code){throw Error("cross_pillar_"+code);}
function within(base,location){
  const r=path.relative(base,location);
  return r!==""&&!r.startsWith(".."+path.sep)&&r!==".."&&!path.isAbsolute(r);
}
function owner(name){
  return name.includes("_automation_")?"Automation":
    name.includes("_docker_")?"Docker":null;
}
export function planReplay(raw) {
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     raw.schema!=="eternyx-fresh-staging-migration-mirror-v1"||
     raw.sourceSqlBytesChanged!==false||
     raw.sourceBaselineValid!==true||
     raw.allMirrorTimestampsUnique!==true||
     raw.productionDeploymentAllowed!==false||
     raw.remoteMigrationsReconciled!==false||
     raw.schemaApplied!==false||raw.migrationsPushed!==false||
     raw.deploymentAuthorized!==false||!Array.isArray(raw.files)||
     raw.files.length!==raw.sourceFileCount||
     raw.files.length<25)reject("unsafe_or_incomplete_source");
  const seenNames=new Set(),seenVersions=new Set(),scoped=[];
  for(const item of raw.files){
    if(!item||!MIRROR_NAME.test(item.original)||!MIRROR_NAME.test(item.mirror)||
       !GIT_BLOB.test(item.sourceGitBlob)||!SHA256.test(item.contentSha256)||
       seenNames.has(item.original)||seenVersions.has(item.mirror.slice(0,14)))
      reject("invalid_file_provenance");
    seenNames.add(item.original);seenVersions.add(item.mirror.slice(0,14));
    if(item.original.slice(15)!==item.mirror.slice(15))
      reject("changed_sql_source_identity");
    if(item.original.slice(0,12)!==item.mirror.slice(0,12))
      reject("unexpected_timestamp_range");
    const pillar=owner(item.original);
    if(pillar) scoped.push({original:item.original,mirror:item.mirror,pillar});
  }
  const automation=scoped.filter(x=>x.pillar==="Automation");
  const docker=scoped.filter(x=>x.pillar==="Docker");
  if(automation.length<20||docker.length<8)reject("missing_pillar_migrations");
  scoped.sort((a,b)=>a.mirror.localeCompare(b.mirror));
  if(!scoped[0].original.includes("_automation_manual_control_plane"))
    reject("unexpected_first_migration");
  return {
    schema:"eternyx-automation-docker-postgres17-replay-v1",
    mode:"disposable_postgres_only",
    scope:"Automation_and_Docker_SQL_only",
    automationMigrationCount:automation.length,
    dockerMigrationCount:docker.length,
    combinedMigrationCount:scoped.length,
    order:scoped,
    otherPillarsExcluded:true,
    localPostgresExecutionVerified:false,
    liveSupabaseMigrationHistoryVerified:false,
    remoteProjectChanged:false,
    productionReady:false,
    remoteDeployAllowed:false,
  };
}
export async function writeReplayPlan(mirrorDirectory,outputFile){
  if(typeof mirrorDirectory!=="string"||!path.isAbsolute(mirrorDirectory)||
     typeof outputFile!=="string"||!path.isAbsolute(outputFile))reject("unsafe_paths");
  const root=path.resolve(mirrorDirectory),target=path.resolve(outputFile);
  if(!within(path.dirname(root),target)&&!within(root,target))reject("plan_outside_workspace");
  const manifest=JSON.parse(await readFile(path.join(root,"REHEARSAL_ONLY.json"),"utf8"));
  const result=planReplay(manifest);
  const lines=result.order.map(entry=>entry.mirror).join("\n")+"\n";
  // The mirror is generated in a new clean local directory. The output
  // path may not already exist and is never used as a command.
  const {writeFile}=await import("node:fs/promises");
  await writeFile(target,lines,{flag:"wx",mode:0o600});
  return result;
}
export async function main(argv=process.argv.slice(2)){
  if(argv.length!==4||argv[0]!=="--mirror"||argv[2]!=="--plan")reject("invalid_arguments");
  const result=await writeReplayPlan(argv[1],argv[3]);
  process.stdout.write(JSON.stringify({...result,order:undefined},null,2)+"\n");
  return 0;
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked)main().then(code=>{process.exitCode=code;}).catch(()=>{
  process.stderr.write("Fresh cross-pillar SQL replay plan invalid or unavailable\n");
  process.exitCode=1;
});
