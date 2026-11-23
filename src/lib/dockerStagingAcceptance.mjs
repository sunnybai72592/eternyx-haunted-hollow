// ETERNYX Docker explicit staging acceptance, read-only and owner-pinned.
// Reuses production HTTP probe + Supabase Management API metadata observer.
// This is NOT a deployment action, full RLS audit, or Docker Engine attestation.
import {createHash} from "node:crypto";
import {validateDockerDeploymentManifest,
 createDockerDeploymentManifestPin,inspectDockerStagingDeployment}
 from "./dockerStagingDeploymentInventory.mjs";
import {validateDockerHostedProbeConfig,runDockerHostedAuthProbe}
 from "./dockerHostedAuthProbe.mjs";
const REF=/^[a-z0-9]{20}$/,SHA=/^[a-f0-9]{40}$/,HEX=/^[a-f0-9]{64}$/;
export function validateDockerStagingAcceptanceConfig(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
  throw Error("Staging acceptance configuration required.");
 const {manifest,pinnedManifestSha256,stagingRef,productionRef,
   releaseCommitSha,checkedOutCommitSha,probe,managementToken}=raw;
 const approved=validateDockerDeploymentManifest(manifest);
 if(!REF.test(stagingRef||"")||!REF.test(productionRef||"")||
    stagingRef===productionRef||!SHA.test(releaseCommitSha||"")||
    checkedOutCommitSha!==releaseCommitSha||
    approved.stagingProjectRef!==stagingRef||
    approved.productionProjectRef!==productionRef||
    approved.releaseCommitSha!==releaseCommitSha||
    !HEX.test(pinnedManifestSha256||"")||
    createDockerDeploymentManifestPin(approved)!==pinnedManifestSha256)
   throw Error("Independent project, checkout, manifest and release pins differ.");
 if(!approved.expected.every(entry=>HEX.test(entry.bundleSha256||"")))
   throw Error("Four independently pinned function bundle digests are required.");
 const staging=validateDockerHostedProbeConfig(probe);
 if(staging.host!==stagingRef+".supabase.co"||
    probe.productionHost!==productionRef+".supabase.co")
   throw Error("Two-account staging host disagrees with independently pinned projects.");
 if(typeof managementToken!=="string"||managementToken.length<24||
    managementToken.length>8192||/[\s\r\n]/.test(managementToken))
   throw Error("A bounded read-only Management API credential is required.");
 return {manifest:approved,pinnedManifestSha256,stagingRef,productionRef,
  releaseCommitSha,probe,managementToken};
}
export async function runDockerStagingAcceptance(raw,{
 managementFetch=globalThis.fetch,hostedFetch=globalThis.fetch,
 observedAt=()=>new Date().toISOString()
}={}){
 const config=validateDockerStagingAcceptanceConfig(raw);
 if(typeof managementFetch!=="function"||typeof hostedFetch!=="function")
  throw Error("Staging HTTP transports unavailable.");
 // Sequential and fail-closed: never send user JWTs if deployed function versions
 // or JWT policies do not match the independently reviewed manifest.
 const inventory=await inspectDockerStagingDeployment({
  manifest:config.manifest,
  pinnedManifestSha256:config.pinnedManifestSha256,
  managementToken:config.managementToken,
  fetcher:managementFetch,now:observedAt
 });
 if(!inventory.passed||inventory.checks.length!==4||
    !inventory.checks.every(c=>c.passed&&c.bundleDigestPinned&&
      c.bundleDigestAvailable&&c.pinnedBundleDigestMatches))
  throw Error("Staging deployed-version/JWT/bundle metadata gate rejected.");
 const authentication=await runDockerHostedAuthProbe(config.probe,{
  fetcher:hostedFetch,now:observedAt
 });
 if(!authentication.passed||authentication.checks.length!==10||
    !authentication.checks.every(c=>c.passed))
  throw Error("Staging two-owner JWT/isolated-workspace checks failed.");
 const metadata={
  schema:"eternyx-docker-staging-readonly-acceptance-v1",
  scope:"operator_initiated_staging_read_only",
  releaseCommitSha:config.releaseCommitSha,
  stagingProjectRef:config.stagingRef,
  pinnedManifestSha256:config.pinnedManifestSha256,
  sourceSnapshotSha256:config.manifest.pinnedSourceSnapshotSha256,
  inventoryObservedAt:inventory.observedAt,
  authenticationObservedAt:authentication.observedAt,
  inventoryDigest:inventory.metadataDigest,
  functionChecks:inventory.checks.map(c=>({
   slug:c.slug,observedVersion:c.observedVersion,
   verifyJwt:c.verifyJwt,pinnedBundleDigestMatches:c.pinnedBundleDigestMatches,
   passed:c.passed
  })),
  accountChecks:authentication.checks.map(c=>({
   id:c.id,passed:c.passed
  }))
 };
 const acceptanceDigest=createHash("sha256").update(
  "ETERNYX_DOCKER_STAGING_READONLY_ACCEPTANCE_V1\n"+JSON.stringify(metadata)
 ).digest("hex");
 return {...metadata,acceptanceDigest,passed:true,
  actualStagingManagementCalled:true,
  actualStagingTwoAccountProbeCalled:true,
  accountTokensStored:false,mutationRequestsSent:false,
  productionEndpointCalled:false,
  independentDeployedSourceBytesVerified:false,
  fullStagingRlsAuditPerformed:false,
  stagingDockerHostAttested:false,
  realDockerCommandExecutionTested:false,
  operationalReleaseApproved:false,
  stagingDockerExecutionAuthorized:false,
  productionDeploymentAuthorized:false,
  independentHumanSecurityReviewRequired:true
 };
}
