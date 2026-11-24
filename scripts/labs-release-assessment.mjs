#!/usr/bin/env node
// Offline planning report only; historical management observations are NOT
// cryptographic hosted attestation or a release authorization.
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createLabsBootstrapManifest,MIGRATIONS,FUNCTIONS} from "./labs-bootstrap-manifest.mjs";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const REF="mhodwvypfbxafamkrgsk";
const SOURCE="36ac171d50c82a566c40c405fded1c53280de692";
const BUNDLE=Object.freeze([
 "supabase/functions/ctf-verified/index.ts",
 "supabase/functions/ctf-range-control/index.ts",
 "supabase/functions/_shared/user-auth.ts",
 "supabase/functions/_shared/supabase.ts",
 "supabase/functions/_shared/ctf-range-contract.mjs",
 "src/lib/eternyxVerifiedCtf.mjs",
]);
const sha=/^[a-f0-9]{40}$/;
const gitBlob=bytes=>createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
const exact=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((x,i)=>x===b[i]);
const fail=()=>{throw Error("labs_release_invalid_observation");};
export function validateHistoricalObservation(observation,deployment){
 if(observation?.schema!=="eternyx.labs.release-observation.v1"||
    observation.projectRef!==REF||observation.scope!=="historical-read-only-management-observation"||
    observation.originalDeploymentCommit!==SOURCE||!sha.test(observation.sourceCommit??"")||
    !/^\d{4}-\d{2}-\d{2}$/.test(observation.observedOn??"")||
    !Number.isFinite(Date.parse(observation.observedOn))||
    observation.catalogChecksPassed!==true||observation.rlsTableCount!==8||
    observation.providerDisabled!==true||observation.spendDisabled!==true||
    observation.physicalHardwareVerified!==false||observation.authenticatedAcceptanceVerified!==false||
    observation.releaseAuthorized!==false||
    !["authUsers","verifiedSolves","rangeSessions"].every(k=>Number.isSafeInteger(observation[k])&&observation[k]>=0))fail();
 if(deployment?.projectRef!==REF||deployment.sourceCommit!==SOURCE||
    !Array.isArray(deployment.migrations)||!exact(deployment.migrations.map(x=>x.source),MIGRATIONS)||
    !deployment.migrations.every(x=>sha.test(x.gitBlobSha1??"")&&/^\d{14}$/.test(x.version??"")&&x.name==="labs_"+x.source.slice(0,-4))||
    new Set(deployment.migrations.map(x=>x.version)).size!==6||
    !exact(observation.migrationVersions,deployment.migrations.map(x=>x.version)))fail();
 if(!Array.isArray(observation.activeLabsFunctions)||
    !exact(observation.activeLabsFunctions.map(x=>x.slug),["ctf-verified","ctf-range-control"])||
    !observation.activeLabsFunctions.every(x=>x.verifyJwt===true&&x.version===1))fail();
 if(!Array.isArray(observation.reviewedLocalBundleBlobs)||
    !exact(observation.reviewedLocalBundleBlobs.map(x=>x.path),BUNDLE)||
    !observation.reviewedLocalBundleBlobs.every(x=>sha.test(x.gitBlobSha1??"")))fail();
 return true;
}
export async function assessLabsRelease({root=ROOT,observation,deployment}={}){
 if(observation===undefined)observation=JSON.parse(await readFile(path.join(root,"docs/examples/labs-release-observation.json"),"utf8"));
 if(deployment===undefined)deployment=JSON.parse(await readFile(path.join(root,"docs/examples/labs-staging-deployment-observation.json"),"utf8"));
 validateHistoricalObservation(observation,deployment);
 const manifest=await createLabsBootstrapManifest(root);
 const pins=[...deployment.migrations.map(x=>({path:"supabase/migrations/"+x.source,gitBlobSha1:x.gitBlobSha1})),...observation.reviewedLocalBundleBlobs];
 const match=await Promise.all(pins.map(async x=>gitBlob(await readFile(path.join(root,x.path)))===x.gitBlobSha1));
 const drifted=match.filter(x=>!x).length;
 const missingFunctions=Object.keys(FUNCTIONS).filter(x=>!observation.activeLabsFunctions.some(f=>f.slug===x));
 const gates=[
  {id:"reviewed-source",status:drifted===0?"matched":"drifted",matchedFiles:match.length-drifted,totalFiles:match.length},
  {id:"staging-migrations",status:"historically-observed",count:6},
  {id:"staging-catalog",status:"historically-observed",count:8},
  {id:"staging-edge-inventory",status:"historically-observed-partial",active:2,expected:5,missingFunctions},
  {id:"dedicated-auth-identities",status:"unverified",historicalAuthUsers:observation.authUsers},
  {id:"ctf-secret-and-solve-lifecycle",status:"unverified",historicalSolves:observation.verifiedSolves},
  {id:"two-owner-range-fixtures",status:"unverified",historicalSessions:observation.rangeSessions},
  {id:"physical-kvm-and-expiry",status:"unverified"},
  {id:"public-tenant-isolation-and-provider-hard-cap",status:"unverified"},
  {id:"release-authorization",status:"not-authorized"},
 ];
 return {schema:"eternyx.labs.release-planning.v1",classification:"offline-planning-only",historicalObservationDate:observation.observedOn,
  historicalSourceCommit:observation.sourceCommit,originalDeploymentCommit:SOURCE,
  sourceManifestSchema:manifest.schema,gates,sourceDriftDetected:drifted>0,
  liveChecksPerformed:false,deployedBundleCryptographicallyVerified:false,
  remoteDeploymentCurrent:false,physicalHostAttested:false,productionReady:false,releaseAuthorized:false,
  nextActions:["configure-staging-ctf-secret-and-two-dedicated-accounts","run-protected-fresh-auth-and-ctf-lifecycle","approve-and-create-terminal-fixtures-then-recheck-isolation","review-remaining-disabled-edge-deployment","obtain-independent-offline-kvm-and-watchdog-evidence","review-provider-hard-cap-and-tenant-isolation"]};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail();
  const report=await assessLabsRelease();
  console.log(JSON.stringify(report,null,2));
  if(report.sourceDriftDetected)process.exitCode=1;
 }catch{console.error("labs_release_assessment_failed");process.exitCode=1;}
}
