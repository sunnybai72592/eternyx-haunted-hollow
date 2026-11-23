#!/usr/bin/env node
// Operator-controlled CLI. Never deploys Supabase, invokes Docker, calls
// production, logs bearer tokens, or issues anything except one staging GET.
import {openSync,closeSync,fstatSync,readFileSync,constants} from "node:fs";
import {isAbsolute} from "node:path";
import {createDockerDeploymentManifestPin,validateDockerDeploymentManifest,
 inspectDockerStagingDeployment} from "../src/lib/dockerStagingDeploymentInventory.mjs";
const usage="Usage: node scripts/docker-staging-management-inventory.mjs pin /ABS/EXPECTED.json | inspect /ABS/EXPECTED.json";
function readPrivate(path){
 if(!isAbsolute(path))throw Error("Absolute private manifest path required.");
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.size<2||st.size>16384||
     process.platform!=="win32"&&(st.uid!==process.getuid()||(st.mode&0o077)!==0))
    throw Error("Release manifest must be an owner-only regular file.");
  return JSON.parse(readFileSync(fd,"utf8"));
 }finally{closeSync(fd);}
}
try{
 const [action,path,...extra]=process.argv.slice(2);
 if(extra.length||!["pin","inspect"].includes(action)||!path)throw Error(usage);
 const manifest=validateDockerDeploymentManifest(readPrivate(path));
 if(action==="pin"){
  process.stdout.write(JSON.stringify({
   schema:"eternyx-docker-management-expected-pin-v1",
   releaseCommitSha:manifest.releaseCommitSha,
   stagingProjectRef:manifest.stagingProjectRef,
   manifestSha256:createDockerDeploymentManifestPin(manifest),
   liveStagingCalled:false,productionDeploymentAuthorized:false
  },null,2)+"\n");
 }else{
  const env=process.env;
  if(env.ETERNYX_DOCKER_MANAGEMENT_READ_ONLY_ENABLED!=="true"||
     env.ETERNYX_DOCKER_STAGING_REF!==manifest.stagingProjectRef||
     env.ETERNYX_DOCKER_PRODUCTION_REF!==manifest.productionProjectRef)
    throw Error("Independent project-ref pins and explicit offline-to-live opt-in required.");
  const result=await inspectDockerStagingDeployment({
   manifest,pinnedManifestSha256:env.ETERNYX_DOCKER_PINNED_DEPLOY_MANIFEST_SHA256,
   managementToken:env.ETERNYX_DOCKER_MANAGEMENT_READ_TOKEN
  });
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if(!result.passed)process.exitCode=1;
 }
}catch{
 process.stderr.write("Docker staging Management API inventory refused: missing or untrusted pins, unsafe manifest, unavailable read-only credential, incompatible deployment metadata or network failure. No tokens were printed.\n");
 process.exitCode=1;
}
