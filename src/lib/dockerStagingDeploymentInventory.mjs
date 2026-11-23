// Operator-controlled READ-ONLY Supabase Management API inventory.
// No function deployment, code mutation, production calls, or host Docker usage.
// GET /v1/projects/{ref}/functions returns metadata, NOT deployed source-code proof.
import {createHash} from "node:crypto";
export const DOCKER_FUNCTIONS=Object.freeze([
 {slug:"docker-control",verifyJwt:true},
 {slug:"docker-enrollment",verifyJwt:true},
 {slug:"docker-heartbeat",verifyJwt:false},
 {slug:"docker-command-dispatch",verifyJwt:false}
]);
const REF=/^[a-z0-9]{20}$/,SHA=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/;
const EXACT=(value,keys)=>!!value&&typeof value==="object"&&!Array.isArray(value)&&
 Object.keys(value).sort().join(",")===keys.slice().sort().join(",");
const fingerprint=contents=>createHash("sha256").update(
 "ETERNYX_DOCKER_STAGING_DEPLOYED_METADATA_V1\n"+JSON.stringify(contents)).digest("hex");
export function validateDockerDeploymentManifest(raw){
 if(!EXACT(raw,["schema","stagingProjectRef","productionProjectRef","releaseCommitSha",
 "pinnedSourceSnapshotSha256","expected"])||
 raw.schema!=="eternyx-docker-deployment-expectations-v1"||
 !REF.test(raw.stagingProjectRef||"")||!REF.test(raw.productionProjectRef||"")||
 raw.stagingProjectRef===raw.productionProjectRef||
 !SHA.test(raw.releaseCommitSha||"")||
 !HASH.test(raw.pinnedSourceSnapshotSha256||"")||
 !Array.isArray(raw.expected)||raw.expected.length!==4||
 !raw.expected.every((row,index)=>EXACT(row,[
  "slug","version","verifyJwt","bundleSha256"
 ])&&row.slug===DOCKER_FUNCTIONS[index].slug&&
 row.verifyJwt===DOCKER_FUNCTIONS[index].verifyJwt&&
 Number.isSafeInteger(row.version)&&row.version>=1&&row.version<=2147483647&&
 (row.bundleSha256===null||HASH.test(row.bundleSha256||""))))
 throw Error("Invalid release expectations. Four independently pinned Docker versions/JWT settings required.");
 return raw;
}
export function createDockerDeploymentManifestPin(raw){
 return fingerprint(validateDockerDeploymentManifest(raw));
}
export function parseDockerManagementInventory(raw,manifest){
 validateDockerDeploymentManifest(manifest);
 if(!Array.isArray(raw)||raw.length>300)
   throw Error("Missing or oversized Supabase Management API function list.");
 const byName=new Map();
 for(const item of raw){
  if(!item||typeof item!=="object"||Array.isArray(item))throw Error("Malformed function metadata.");
  const name=item.slug;
  if(typeof name!=="string"||name.length>128)throw Error("Malformed function slug.");
  if(!name.startsWith("docker-"))continue;
  if(byName.has(name))throw Error("Duplicate Docker function listing.");
  if(!DOCKER_FUNCTIONS.some(x=>x.slug===name))
   throw Error("Unreviewed Docker function deployed in staging.");
  if(item.status!=="ACTIVE"||!Number.isSafeInteger(item.version)||
     item.version<1||item.version>2147483647||
     typeof item.verify_jwt!=="boolean")
   throw Error("Inactive or incomplete staging function metadata.");
  if(item.ezbr_sha256!=null&&
     (typeof item.ezbr_sha256!=="string"||!HASH.test(item.ezbr_sha256)))
   throw Error("Noncanonical deployed bundle fingerprint.");
  byName.set(name,item);
 }
 if(byName.size!==DOCKER_FUNCTIONS.length)
   throw Error("One or more expected staging Docker functions are missing.");
 return manifest.expected.map(expected=>{
  const actual=byName.get(expected.slug);
  const versionMatches=actual.version===expected.version;
  const jwtMatches=actual.verify_jwt===expected.verifyJwt;
  const bundleAvailable=typeof actual.ezbr_sha256==="string";
  const bundlePinned=expected.bundleSha256!==null;
  // Having a pinned source snapshot does not prove deployed code identity.
  const bundleMatches=!bundlePinned||bundleAvailable&&
    actual.ezbr_sha256===expected.bundleSha256;
  return {slug:expected.slug,status:"ACTIVE",observedVersion:actual.version,
   expectedVersion:expected.version,versionMatches,
   verifyJwt:actual.verify_jwt,expectedVerifyJwt:expected.verifyJwt,
   jwtMatches,bundleDigestAvailable:bundleAvailable,
   bundleDigestPinned:bundlePinned,
   pinnedBundleDigestMatches:bundlePinned?bundleMatches:false,
   passed:versionMatches&&jwtMatches&&bundleMatches};
 });
}
async function limitedJSON(response){
 const type=response.headers?.get("content-type")||"";
 if(!/^application\/json(?:;|$)/i.test(type.trim()))
  throw Error("Unexpected Management API media type.");
 if(!response.body)throw Error("Missing Management API response body.");
 const reader=response.body.getReader();
 const chunks=[];let size=0;
 try{
  while(true){
   const part=await reader.read();
   if(part.done)break;
   size+=part.value.byteLength;
   if(size>524288)throw Error("Management API inventory exceeds size limit.");
   chunks.push(part.value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
}
export async function inspectDockerStagingDeployment({
 manifest,pinnedManifestSha256,managementToken,fetcher=globalThis.fetch,
 timeoutMs=8000,now=()=>new Date().toISOString()
}){
 validateDockerDeploymentManifest(manifest);
 if(!HASH.test(pinnedManifestSha256||"")||
    createDockerDeploymentManifestPin(manifest)!==pinnedManifestSha256)
   throw Error("Operator's independently pinned expectations digest mismatch.");
 if(typeof managementToken!=="string"||managementToken.length<24||
    managementToken.length>8192||/[\s\r\n]/.test(managementToken))
   throw Error("Missing or invalid read-only Management API credential.");
 if(typeof fetcher!=="function"||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>15000)
   throw Error("Invalid read-only Management API transport.");
 // Hardcoded origin/path, no user-controlled URLs or production project access.
 const apiUrl="https://api.supabase.com/v1/projects/"+manifest.stagingProjectRef+"/functions";
 const response=await fetcher(apiUrl,{method:"GET",
  headers:{"Authorization":"Bearer "+managementToken,
   "Accept":"application/json"},redirect:"error",cache:"no-store",
  signal:AbortSignal.timeout(timeoutMs)});
 if(!response||response.status!==200||response.redirected===true||
   (response.url&&response.url!==apiUrl))
   throw Error("Staging Management API metadata was unavailable or redirected.");
 const data=await limitedJSON(response);
 const checks=parseDockerManagementInventory(data,manifest);
 const passed=checks.every(x=>x.passed);
 const metadataDigest=fingerprint({
  stagingProjectRef:manifest.stagingProjectRef,releaseCommitSha:manifest.releaseCommitSha,
  pinnedSourceSnapshotSha256:manifest.pinnedSourceSnapshotSha256,
  checks:checks.map(x=>({slug:x.slug,version:x.observedVersion,
   verifyJwt:x.verifyJwt,bundleDigestAvailable:x.bundleDigestAvailable,
   bundleDigestPinned:x.bundleDigestPinned,pinnedBundleDigestMatches:x.pinnedBundleDigestMatches}))
 });
 return {schema:"eternyx-docker-management-inventory-v1",
  scope:"read_only_staging_metadata",observedAt:now(),
  stagingProjectRef:manifest.stagingProjectRef,releaseCommitSha:manifest.releaseCommitSha,
  pinnedSourceSnapshotSha256:manifest.pinnedSourceSnapshotSha256,
  pinnedManifestSha256,checks,metadataDigest,passed,
  productionProjectCalled:false,mutationRequestsSent:false,
  remoteDockerCommandsIssued:false,remoteCodeBytesVerified:false,
  deployedSourceParityVerified:false,productionDeploymentAuthorized:false,
  stagingDockerExecutionAuthorized:false,independentHumanApprovalRequired:true,
  note:"Live management metadata is not a cryptographic proof of deployed code bytes or operational host safety."};
}
