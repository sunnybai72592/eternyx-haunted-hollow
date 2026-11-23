#!/usr/bin/env node
/**
 * Pure, offline stage snapshot preflight. Does not connect to Supabase, execute
 * SQL, read secrets, repair migration journals, or deploy anything.
 * Snapshot must come from separately authenticated read-only stage inspection.
 */
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
export const STAGING_REF="mhodwvypfbxafamkrgsk";
export const PRODUCTION_REF="wcncuarekaofmfurbtbh";
export const ORGANIZATION_ID="xnhopzufalyhswuwvqmo";
const VERSION=/^20\d{12}$/;
const FUNCTION_SLUGS=Object.freeze(["automation-control","automation-webhook","automation-scheduler-worker","ctf-verified"]);
function deny(reason){throw Error("automation_stage_preflight_"+reason);}
function unique(items,reason){if(new Set(items).size!==items.length)deny(reason);}
function validRef(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))deny("malformed_project");
  if(raw.id!==STAGING_REF||raw.ref!==STAGING_REF||raw.ref===PRODUCTION_REF||
     raw.organization_id!==ORGANIZATION_ID||raw.status!=="ACTIVE_HEALTHY"||
     raw.region!=="us-east-1")deny("wrong_target");
  return true;
}
export function validateSnapshot(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     raw.schema!=="eternyx-staging-snapshot-v1")deny("invalid_snapshot");
  validRef(raw.project);
  if(!Array.isArray(raw.migrations)||!Array.isArray(raw.functions))deny("invalid_catalog");
  if(raw.migrations.length>10000||raw.functions.length>1000)deny("oversized_catalog");
  const versions=raw.migrations.map(m=>{
    if(!m||typeof m!=="object"||Array.isArray(m)||!VERSION.test(m.version)||
       typeof m.name!=="string"||!/[a-z0-9_]/i.test(m.name)||
       m.name.length>200)deny("invalid_migration");
    return m.version;
  });
  unique(versions,"duplicate_journal_version");
  const slugs=raw.functions.map(f=>{
    if(!f||typeof f!=="object"||Array.isArray(f)||
       typeof f.slug!=="string"||!/^[a-z][a-z0-9-]{0,99}$/.test(f.slug))deny("invalid_function");
    return f.slug;
  });
  unique(slugs,"duplicate_function_slug");
  return {versions,slugs};
}
export function assessStageSnapshot(snapshot,{expectedVersions=[],allowNonempty=false}={}){
  const {versions,slugs}=validateSnapshot(snapshot);
  if(!Array.isArray(expectedVersions)||expectedVersions.some(v=>typeof v!=="string"||!VERSION.test(v)))
    deny("invalid_expected_versions");
  unique(expectedVersions,"duplicate_expected_versions");
  if(typeof allowNonempty!=="boolean")deny("invalid_mode");
  const expected=new Set(expectedVersions);
  const unexpected=versions.filter(v=>!expected.has(v));
  const missing=expectedVersions.filter(v=>!versions.includes(v));
  const presentFunctions=FUNCTION_SLUGS.filter(x=>slugs.includes(x));
  const initiallyEmpty=versions.length===0&&slugs.length===0;
  const journalReconciled=unexpected.length===0&&missing.length===0;
  const freshMirrorEligible=initiallyEmpty&&expectedVersions.length===0;
  // Explicit allowNonempty alone is NOT approval to deploy. It only permits a
  // read-only reconciled snapshot; any unknown version still blocks.
  const snapshotAccepted=(initiallyEmpty&&expectedVersions.length===0)||
    (allowNonempty&&journalReconciled&&presentFunctions.length===0);
  return {
    schema:"eternyx-automation-stage-preflight-v1",
    stagingRef:STAGING_REF,
    productionRefExcluded:true,
    migrationCount:versions.length,
    functionCount:slugs.length,
    initiallyEmpty,
    freshMirrorEligible,
    knownVersions:versions,
    unexpectedVersions:unexpected,
    missingExpectedVersions:missing,
    alreadyDeployedCoreFunctions:presentFunctions,
    journalReconciled,
    snapshotAccepted,
    requiresSeparateSqlDependencyReview:true,
    schemaApplied:false,
    remoteSqlExecuted:false,
    functionDeploymentAuthorized:false,
    productionChangesAuthorized:false
  };
}
export async function main(argv=process.argv.slice(2)){
  if(argv.length<2||argv[0]!=="--snapshot"||argv.length>5)deny("invalid_arguments");
  const location=argv[1];
  if(!path.isAbsolute(location))deny("snapshot_path_must_be_absolute");
  let expectedVersions=[],allowNonempty=false;
  for(let i=2;i<argv.length;i++){
    if(argv[i]==="--expected-versions"&&typeof argv[i+1]==="string"){
      expectedVersions=argv[++i].split(",").filter(Boolean);
    }else if(argv[i]==="--allow-nonempty"){allowNonempty=true;}
    else deny("invalid_arguments");
  }
  const data=JSON.parse(await readFile(location,"utf8"));
  const report=assessStageSnapshot(data,{expectedVersions,allowNonempty});
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if(!report.snapshotAccepted)process.exitCode=2;
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked)main().catch(e=>{
  const msg=e instanceof Error&&/^automation_stage_preflight_[a-z_]+$/.test(e.message)?
    e.message:"automation_stage_preflight_unavailable";
  process.stderr.write(msg+"\n");
  process.exitCode=1;
});
