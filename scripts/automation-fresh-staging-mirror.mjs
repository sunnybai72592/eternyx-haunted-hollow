#!/usr/bin/env node
/**
 * Create an UNLINKED, fresh-staging-only local mirror of SQL migrations.
 * Does NOT execute SQL, call the CLI, connect to Supabase, edit originals,
 * rename tracked migrations, repair history, or authorize a remote push.
 */
import {createHash} from "node:crypto";
import {readdir,readFile,writeFile,mkdir,realpath} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {gitBlobSha,validateBaseline,auditCollisionGroups} from "./automation-migration-collision-forensics.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const MIGRATION=/^(20\d{12})_[A-Za-z0-9_-]+\.sql$/;
const BASELINE="scripts/automation-migration-collision-baseline.json";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const err=(code)=>{throw Error("rehearsal_"+code);};
function within(base,location){
  const rel=path.relative(base,location);
  return rel===""||(!rel.startsWith(".."+path.sep)&&rel!==".."&&!path.isAbsolute(rel));
}
export function resolveUniqueVersions(names){
  if(!Array.isArray(names)||!names.length||new Set(names).size!==names.length||
      names.some(x=>typeof x!=="string"||!MIGRATION.test(x)))err("invalid_source_names");
  const grouped=new Map();
  for(const name of names){
    const version=name.slice(0,14);
    const list=grouped.get(version)||[];
    list.push(name);grouped.set(version,list);
  }
  const occupied=new Set(grouped.keys());
  const mapping=new Map();
  for(const [version,group] of [...grouped].sort(([a],[b])=>a.localeCompare(b))){
    const sorted=[...group].sort();
    if(sorted.length>60)err("too_many_same_second");
    sorted.forEach((filename,index)=>{
      let newVersion=version;
      if(index>0){
        const originalSecond=Number(version.slice(12));
        const proposedSecond=originalSecond+index;
        if(proposedSecond>59)err("minute_overflow");
        newVersion=version.slice(0,12)+String(proposedSecond).padStart(2,"0");
        if(occupied.has(newVersion))err("existing_timestamp_conflict");
        occupied.add(newVersion);
      }
      mapping.set(filename,newVersion+"_"+filename.slice(15));
    });
  }
  const outputs=[...mapping.values()];
  if(new Set(outputs).size!==outputs.length)err("derived_filename_collision");
  if(new Set(outputs.map(x=>x.slice(0,14))).size!==outputs.length)
    err("derived_timestamp_collision");
  return [...mapping].sort(([a],[b])=>a.localeCompare(b))
    .map(([original,mirror])=>({original,mirror,changed:original!==mirror}));
}
export function verifySourceBaseline(allFiles,baseline){
  const listed=allFiles.filter(x=>MIGRATION.test(x.name));
  if(listed.length!==allFiles.length)err("nonstandard_sql_filename");
  const collided=new Map();
  for(const f of listed){
    const v=f.name.slice(0,14),a=collided.get(v)||[];
    a.push(f);collided.set(v,a);
  }
  const onlyCollided=[...collided.values()].filter(x=>x.length>1).flat();
  const audit=auditCollisionGroups(onlyCollided,validateBaseline(baseline));
  if(!audit.sourceBaselineValid)err("baseline_drift");
  return audit;
}
async function sourceIndex(root=ROOT){
  const dir=path.join(root,"supabase","migrations");
  const names=(await readdir(dir)).filter(n=>n.endsWith(".sql")).sort();
  const baseline=JSON.parse(await readFile(path.join(root,BASELINE),"utf8"));
  const preflight=[];
  const byVersion=new Map();
  for(const name of names){
    if(!MIGRATION.test(name))err("nonstandard_sql_filename");
    const v=name.slice(0,14),current=byVersion.get(v)||[];
    current.push(name);byVersion.set(v,current);
  }
  const duplicated=new Set([...byVersion].filter(([,a])=>a.length>1)
    .map(([version])=>version));
  // Hash only the historical collided files in preflight; all bytes
  // are hashed while constructing the full mirror, without modifying them.
  for(const name of names){
    if(!duplicated.has(name.slice(0,14)))continue;
    const bytes=await readFile(path.join(dir,name));
    preflight.push({name,gitBlobSha:gitBlobSha(bytes)});
  }
  const audit=verifySourceBaseline(preflight,baseline);
  const mapping=resolveUniqueVersions(names);
  return {dir,names,audit,mapping};
}
export async function inspectRehearsalSource(root=ROOT){
  const index=await sourceIndex(root);
  const changes=index.mapping.filter(x=>x.changed);
  return {
    schema:"eternyx-fresh-staging-migration-mirror-v1",
    sourceFileCount:index.names.length,
    originalCollisionVersions:index.audit.groups.length,
    originalCollisionFiles:index.audit.groups.reduce((n,x)=>n+x.files.length,0),
    locallyReversionedFiles:changes.length,
    proposedRenames:changes,
    allMirrorTimestampsUnique:true,
    sourceBaselineValid:true,
    remoteMigrationsReconciled:false,
    freshIsolatedStagingOnly:true,
    productionDeploymentAllowed:false,
    remoteExecutionOccurred:false,
  };
}
export async function createRehearsalMirror({root=ROOT,output,explicitConsent=false}={}){
  if(explicitConsent!==true)err("explicit_local_only_consent_required");
  if(typeof output!=="string"||!path.isAbsolute(output)||output==="/")err("unsafe_destination");
  const resolved=path.resolve(output);
  const canonicalRoot=await realpath(root);
  const canonicalParent=await realpath(path.dirname(resolved));
  const canonicalDestination=path.join(canonicalParent,path.basename(resolved));
  if(within(canonicalRoot,canonicalDestination)||within(canonicalDestination,canonicalRoot))
    err("destination_overlaps_repository");
  const index=await sourceIndex(root);
  const manifest=await inspectRehearsalSource(root);
  // Atomic exclusive creation: never overwrite an existing path.
  await mkdir(canonicalDestination,{recursive:false});
  const directory=path.join(canonicalDestination,"supabase","migrations");
  await mkdir(directory,{recursive:true});
  const fingerprints=[];
  for(const item of index.mapping){
    const bytes=await readFile(path.join(index.dir,item.original));
    await writeFile(path.join(directory,item.mirror),bytes,{flag:"wx"});
    fingerprints.push({original:item.original,mirror:item.mirror,
      sourceGitBlob:gitBlobSha(bytes),contentSha256:sha256(bytes)});
  }
  await writeFile(path.join(canonicalDestination,"REHEARSAL_ONLY.json"),
    JSON.stringify({...manifest,files:fingerprints,
      sourceSqlBytesChanged:false,remoteDatabaseVerified:false,
      schemaApplied:false,migrationsPushed:false,
      deploymentAuthorized:false},null,2)+"\n",{flag:"wx"});
  await writeFile(path.join(canonicalDestination,"DO_NOT_DEPLOY.txt"),
    "REHEARSAL-ONLY, fresh local Supabase project migration mirror.\n"+
    "Never run against a linked, existing or production database.\n"+
    "No SQL was executed, no migration history was repaired, no remote change was made.\n"+
    "Resolve actual staging history and SQL dependencies with an independent reviewer.\n",
    {flag:"wx"});
  return {...manifest,localMirrorGenerated:true,
    databaseExecuted:false,productionDatabaseChanged:false,
    stagingDatabaseChanged:false,releaseAuthorized:false};
}
function args(argv){
  if(argv.length===1&&argv[0]==="--check")return {mode:"check"};
  if(argv.length===3&&argv[0]==="--create-fresh-local-mirror"&&
      argv[1]==="--output"&&typeof argv[2]==="string")
    return {mode:"mirror",output:argv[2]};
  err("invalid_arguments");
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  (async()=>{
    const parsed=args(process.argv.slice(2));
    const result=parsed.mode==="check"?await inspectRehearsalSource()
      :await createRehearsalMirror({output:parsed.output,explicitConsent:true});
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
  })().catch(e=>{
    const code=e instanceof Error&&/^rehearsal_[a-z_]+$/.test(e.message)?
      e.message:"rehearsal_unavailable";
    process.stderr.write("Automation fresh-staging migration mirror: "+code+"\n");
    process.exitCode=1;
  });
}
