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
const DORMANT_DEPLOYMENT="29239a784a7746d978c030523f6a88118904cf59";
const ADDITIONAL_PATHS=Object.freeze(["supabase/functions/_shared/ctf-range-access-contract.mjs","supabase/functions/_shared/ctf-range-dormant-rollout.mjs","supabase/functions/_shared/ctf-range-fenced-contract.mjs","supabase/functions/_shared/ctf-range-worker-contract.mjs","supabase/functions/ctf-range-access-check/index.ts","supabase/functions/ctf-range-access/index.ts","supabase/functions/ctf-range-worker/index.ts"]);
const KNOWN_BUNDLES=Object.freeze({"ctf-verified":{"version":6,"verifyJwt":true,"bundleSha256":"7fbf51aefd4c166ed83b1ad59ba180c75cfee7ed5a1600753f990bd8ae16ab46"},"ctf-range-control":{"version":6,"verifyJwt":true,"bundleSha256":"41268de2a0c3eb8f3a5515426cc1df888b4f7ebdc0ff9020e4804c2bd2921fb3"},"ctf-range-access":{"version":1,"verifyJwt":true,"bundleSha256":"bb0fbc5d64b66d8b86f0121f361018e2786f476aee2faa6869dc3930490b753b"},"ctf-range-worker":{"version":1,"verifyJwt":false,"bundleSha256":"738e8517b4b9a1d2eea6c35a446ab188ca2f98d97afb1970a964d672ae3b91d7"},"ctf-range-access-check":{"version":1,"verifyJwt":false,"bundleSha256":"d1cbc1e9ddd20b7b1a0179ca1ad5bc7889ab1c8805f65d9bb7ac570df0539979"}});
export function validateFullDeploymentObservation(o){
 if(o?.schema!=="eternyx.labs.full-staging-deployment-observation.v1"||
    o.projectRef!==REF||o.scope!=="historical-management-observation-and-source-readback"||
    o.dormantDeploymentCommit!==DORMANT_DEPLOYMENT||!sha.test(o.sourceCommit??"")||
    !/^\d{4}-\d{2}-\d{2}$/.test(o.observedOn??"")||!Number.isFinite(Date.parse(o.observedOn))||
    o.dormantBundleReadbackFileCopies!==15||o.dormantLockReadback!==true||o.catalogChecksPassed!==true||
    o.providerDisabled!==true||o.spendDisabled!==true||
    !["liveHttpAcceptanceVerified","authenticatedAcceptanceVerified","physicalHardwareVerified","productionReady","releaseAuthorized"].every(k=>o[k]===false)||
    !["authUsers","verifiedSolves","rangeSessions","accessGrants","spendReservations"].every(k=>o[k]===0)||
    !Array.isArray(o.functions)||!exact(o.functions.map(f=>f.slug),Object.keys(FUNCTIONS))||
    !o.functions.every(f=>f.status==="ACTIVE"&&f.verifyJwt===FUNCTIONS[f.slug]&&
      f.version===KNOWN_BUNDLES[f.slug]?.version&&f.bundleSha256===KNOWN_BUNDLES[f.slug]?.bundleSha256)||
    !Array.isArray(o.additionalLocalSourcePins)||!exact(o.additionalLocalSourcePins.map(p=>p.path),ADDITIONAL_PATHS)||
    !o.additionalLocalSourcePins.every(p=>sha.test(p.gitBlobSha1??"")))fail();
 return true;
}
export async function assessLabsRelease({root=ROOT,observation,deployment,fullDeployment}={}){
 if(observation===undefined)observation=JSON.parse(await readFile(path.join(root,"docs/examples/labs-release-observation.json"),"utf8"));
 if(deployment===undefined)deployment=JSON.parse(await readFile(path.join(root,"docs/examples/labs-staging-deployment-observation.json"),"utf8"));
 validateHistoricalObservation(observation,deployment);
 if(fullDeployment===undefined)fullDeployment=JSON.parse(await readFile(path.join(root,"docs/examples/labs-full-staging-deployment-observation.json"),"utf8"));
 validateFullDeploymentObservation(fullDeployment);
 const manifest=await createLabsBootstrapManifest(root);
 const pins=[...deployment.migrations.map(x=>({path:"supabase/migrations/"+x.source,gitBlobSha1:x.gitBlobSha1})),...observation.reviewedLocalBundleBlobs,...fullDeployment.additionalLocalSourcePins];
 const match=await Promise.all(pins.map(async x=>gitBlob(await readFile(path.join(root,x.path)))===x.gitBlobSha1));
 const drifted=match.filter(x=>!x).length;
 const missingFunctions=Object.keys(FUNCTIONS).filter(x=>!fullDeployment.functions.some(f=>f.slug===x));
 const gates=[
  {id:"reviewed-source",status:drifted===0?"matched":"drifted",matchedFiles:match.length-drifted,totalFiles:match.length},
  {id:"staging-migrations",status:"historically-observed",count:6},
  {id:"staging-catalog",status:"historically-observed",count:8},
  {id:"staging-edge-inventory",status:"historically-observed-complete",active:5,expected:5,missingFunctions},
  {id:"dormant-bundle-source-readback",status:"historically-observed",matchedFileCopies:15},
  {id:"live-dormant-http",status:"unverified"},
  {id:"dedicated-auth-identities",status:"unverified",historicalAuthUsers:fullDeployment.authUsers},
  {id:"ctf-secret-and-solve-lifecycle",status:"unverified",historicalSolves:fullDeployment.verifiedSolves},
  {id:"two-owner-range-fixtures",status:"unverified",historicalSessions:fullDeployment.rangeSessions},
  {id:"physical-kvm-and-expiry",status:"unverified"},
  {id:"public-tenant-isolation-and-provider-hard-cap",status:"unverified"},
  {id:"release-authorization",status:"not-authorized"},
 ];
 return {schema:"eternyx.labs.release-planning.v1",classification:"offline-planning-only",historicalObservationDate:fullDeployment.observedOn,
  historicalSourceCommit:fullDeployment.sourceCommit,originalDeploymentCommit:SOURCE,
  sourceManifestSchema:manifest.schema,gates,sourceDriftDetected:drifted>0,
  liveChecksPerformed:false,deployedBundleCryptographicallyVerified:false,
  remoteDeploymentCurrent:false,physicalHostAttested:false,productionReady:false,releaseAuthorized:false,
  nextActions:["configure-staging-ctf-secret-and-two-dedicated-accounts","run-protected-fresh-auth-and-ctf-lifecycle","approve-and-create-terminal-fixtures-then-recheck-isolation","run-manual-dormant-http-acceptance","obtain-independent-offline-kvm-and-watchdog-evidence","review-provider-hard-cap-and-tenant-isolation"]};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail();
  const report=await assessLabsRelease();
  console.log(JSON.stringify(report,null,2));
  if(report.sourceDriftDetected)process.exitCode=1;
 }catch{console.error("labs_release_assessment_failed");process.exitCode=1;}
}
