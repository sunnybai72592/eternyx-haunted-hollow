#!/usr/bin/env node
/**
 * Four missing ETERNYX backend function release contract.
 * Staging only. Never connects to Supabase, deploys, runs SQL, modifies
 * production or retrieves secret values by itself.
 */
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  CORE,inspectCoreSources,verifyDeployedCore,validateTarget,
  inspectStageProject,
} from "./automation-staging-core-release.mjs";

export const MISSING_BACKEND=Object.freeze([
  ...CORE,"ctf-verified",
]);
export const JWT_POLICIES=Object.freeze({
  "automation-control":true,
  "automation-webhook":false,
  "automation-scheduler-worker":false,
  "ctf-verified":true,
});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const expectedLines=Object.freeze([
  "ctf_verified_solves_present",
  "ctf_verify_rate_present",
  "ctf_verified_solves_rls",
  "ctf_verify_rate_rls",
  "ctf_verification_rpc_present",
  "ctf_rpc_service_only",
  "ctf_solve_table_owner_select_only",
]);
function fail(code){throw Error("eternyx_missing_backend_"+code);}
export function parseCtfCatalog(raw){
  if(typeof raw!=="string"||raw.length>1400)fail("catalog_invalid");
  const lines=raw.trim().split(/\r?\n/);
  if(lines.length!==expectedLines.length)fail("catalog_invalid");
  const observed={};
  for(let i=0;i<lines.length;i++){
    const match=/^([a-z_]+)=(true|false)$/.exec(lines[i]);
    if(!match||match[1]!==expectedLines[i])fail("catalog_invalid");
    observed[match[1]]=match[2]==="true";
  }
  if(Object.values(observed).some(value=>value!==true))fail("ctf_schema_missing");
  return {
    schema:"eternyx-ctf-verification-catalog-v1",
    observed,readOnlyCatalogQueries:true,
    ctfFlagSecretChecked:false,
    productionReady:false,
    deploymentAuthorized:false,
  };
}
export function verifyCtfCatalog(raw){
  if(!raw||raw.schema!=="eternyx-ctf-verification-catalog-v1"||
    raw.readOnlyCatalogQueries!==true||
    raw.ctfFlagSecretChecked!==false||
    raw.productionReady!==false||raw.deploymentAuthorized!==false||
    !raw.observed||expectedLines.some(key=>raw.observed[key]!==true))
    fail("ctf_catalog_not_verified");
  return true;
}
export async function inspectFourSources(base=root){
  const core=await inspectCoreSources(base);
  const src=await readFile(path.join(base,"supabase/functions/ctf-verified/index.ts"));
  const config=await readFile(path.join(base,"supabase/config.toml"),"utf8");
  if(src.length<1000||src.length>120000||
     !src.toString("utf8").includes('Deno.env.get("CTF_FLAG_SECRET")')||
     !src.toString("utf8").includes('authenticateUser(req)')||
     !/^\[functions\.ctf-verified\]\s*\nverify_jwt\s*=\s*true\b/m.test(config))
     fail("ctf_source_invalid");
  const functions=[...core.functions,{
    slug:"ctf-verified",
    verifyJwt:true,
    sha256:createHash("sha256").update(src).digest("hex"),
  }];
  if(functions.length!==4||functions.some(x=>JWT_POLICIES[x.slug]!==x.verifyJwt))
    fail("source_jwt_policy_mismatch");
  return {
    schema:"eternyx-four-missing-backend-manifest-v1",
    functions,sourceValidated:true,stagingOnly:true,
    ctfFlagSecretChecked:false,
    productionDeploymentAuthorized:false,
    releaseAuthorized:false,
  };
}
export function verifyFourInventory(raw){
  const core=verifyDeployedCore(raw);
  const items=Array.isArray(raw)?raw:raw?.functions;
  if(!Array.isArray(items))fail("inventory_missing");
  const ctf=items.filter(x=>x?.slug==="ctf-verified");
  if(ctf.length!==1||ctf[0].status!=="ACTIVE"||
     ctf[0].verify_jwt!==true||
     !Number.isSafeInteger(ctf[0].version)||ctf[0].version<1)
    fail("ctf_function_missing_or_insecure");
  return [...core,{
    slug:"ctf-verified",active:true,
    version:ctf[0].version,verifyJwt:true,
  }];
}
export function validateFourRelease(target,ctf,core,project){
  if(!target?.targetBound||target.stagingRef===undefined)
    fail("target_unverified");
  verifyCtfCatalog(ctf);
  if(core?.schema!=="eternyx-automation-staging-function-catalog-v1"||
     core.automation_rpc_catalog_present!==true||
     core.automation_rls_enabled!==true||
     core.automation_schema_present!==true||
     core.onlyReadOnlyCatalogQueries!==true)
    fail("automation_schema_unverified");
  inspectStageProject(project,target.stagingRef);
  return {stagingOnly:true,preflightPassed:true,
    productionDeployAllowed:false,ctfSecretVerified:false};
}
export async function main(argv=process.argv.slice(2),env=process.env){
  if(argv.length!==1||argv[0]!=="--check-source")fail("invalid_arguments");
  // No secrets, network, provider calls or runtime invocations.
  const manifest=await inspectFourSources();
  process.stdout.write(JSON.stringify(manifest,null,2)+"\n");
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked)main().catch(e=>{
  const msg=e instanceof Error&&/^eternyx_missing_backend_[a-z_]+$/.test(e.message)?
    e.message:"eternyx_missing_backend_unavailable";
  process.stderr.write(msg+"\n");process.exitCode=1;
});
