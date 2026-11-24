#!/usr/bin/env node
// Source-only manifest; no Supabase connection, deployment, or secret lookup.
import {createHash} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const MIGRATIONS=Object.freeze([
  "20261122170000_ctf_verified_missions.sql",
  "20261122180000_ctf_range_session_control.sql",
  "20261122190000_ctf_range_access_grants.sql",
  "20261122200000_ctf_worker_fencing_budget.sql",
  "20261123041000_ctf_hosted_spend_reservations.sql",
  "20261124123000_ctf_range_session_column_privacy.sql",
]);
export const FUNCTIONS=Object.freeze({
  "ctf-verified":true,"ctf-range-control":true,"ctf-range-access":true,
  "ctf-range-worker":false,"ctf-range-access-check":false,
});
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
function fail(code){throw Error("labs_bootstrap_"+code);}
export function validateMigrationInventory(names){
  if(!Array.isArray(names)||names.some(x=>typeof x!=="string"))fail("invalid_inventory");
  const expected=new Set(MIGRATIONS);
  const actual=names.filter(x=>/^\d{14}_(?:ctf|.*(?:_ctf_|_cyber_range_))[^/]*\.sql$/.test(x));
  if(actual.length!==expected.size||actual.some(x=>!expected.has(x))||
    MIGRATIONS.some(x=>!actual.includes(x)))fail("migration_inventory_drift");
  for(const name of MIGRATIONS){
    const version=name.slice(0,14);
    if(names.filter(x=>x.startsWith(version+"_")&&x.endsWith(".sql")).length!==1)
      fail("migration_version_collision");
  }
  return true;
}
export function validateFunctionConfig(config){
  if(typeof config!=="string")fail("invalid_function_config");
  for(const [slug,verifyJwt] of Object.entries(FUNCTIONS)){
    const section="[functions."+slug+"]";
    const pieces=config.split(section);
    if(pieces.length!==2)fail("function_config_drift");
    const content=pieces[1].split(/^\[/m)[0];
    const settings=[...content.matchAll(/^\s*verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/gm)];
    if(settings.length!==1||settings[0][1]!==String(verifyJwt))fail("jwt_policy_drift");
  }
  return true;
}
export async function createLabsBootstrapManifest(root=ROOT){
  const dir=path.join(root,"supabase","migrations");
  const names=await readdir(dir);
  validateMigrationInventory(names);
  const config=await readFile(path.join(root,"supabase","config.toml"),"utf8");
  validateFunctionConfig(config);
  const migrations=await Promise.all(MIGRATIONS.map(async name=>{
    const bytes=await readFile(path.join(dir,name));
    if(bytes.length<100||bytes.length>200000)fail("migration_size");
    return {path:"supabase/migrations/"+name,sha256:sha(bytes)};
  }));
  const functions=await Promise.all(Object.entries(FUNCTIONS).map(async([slug,verifyJwt])=>{
    const file="supabase/functions/"+slug+"/index.ts";
    const bytes=await readFile(path.join(root,file));
    if(bytes.length<100||bytes.length>200000)fail("function_size");
    return {slug,verifyJwt,entrypointSha256:sha(bytes)};
  }));
  return {schema:"eternyx.labs.bootstrap-source-manifest.v1",migrations,functions,
    manifestScope:"entrypoint_and_migration_hashes_only",
    migrationReplayRequired:true,remoteDeploymentVerified:false,
    productionReady:false,deploymentAuthorized:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==2)fail("unexpected_arguments");
    process.stdout.write(JSON.stringify(await createLabsBootstrapManifest(),null,2)+"\n");
  }catch(e){
    process.stderr.write(/^labs_bootstrap_[a-z_]+$/.test(e?.message??"")?
      e.message+"\n":"labs_bootstrap_source_check_failed\n");process.exitCode=1;
  }
}
