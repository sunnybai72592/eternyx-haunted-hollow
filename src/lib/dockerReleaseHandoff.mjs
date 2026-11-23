// Offline Docker release evidence handoff. No Supabase network access, Docker
// execution or deployment. Two signatures authenticate assertions, NOT truth.
import {createHash,createPrivateKey,createPublicKey,sign,verify} from "node:crypto";
import {DOCKER_FUNCTIONS,validateDockerDeploymentManifest,
 createDockerDeploymentManifestPin} from "./dockerStagingDeploymentInventory.mjs";
const SHA=/^[a-f0-9]{40}$/,HEX=/^[a-f0-9]{64}$/;
const SIGNATURE=/^[A-Za-z0-9_-]{86}$/;
const HOST=/^[a-z0-9]{20}\.supabase\.co$/;
const exact=(v,fields)=>v!==null&&typeof v==="object"&&!Array.isArray(v)&&
 Object.keys(v).sort().join(",")===fields.slice().sort().join(",");
const hash=b=>createHash("sha256").update(b).digest("hex");
const timeValue=(s,now)=>{
 if(typeof s!=="string")throw Error("Noncanonical release evidence time.");
 const t=Date.parse(s);
 if(!Number.isFinite(t)||new Date(t).toISOString()!==s||
   t>now+300000||t<now-86400000)
   throw Error("Release evidence observation is stale or future-dated.");
 return t;
};
const bytes=(v,limit=131072)=>{
 if(!(Buffer.isBuffer(v)||v instanceof Uint8Array)||v.byteLength<2||
   v.byteLength>limit)throw Error("Missing or oversized release evidence.");
 return Buffer.from(v);
};
const decode=(v,limit)=>JSON.parse(bytes(v,limit).toString("utf8"));
const keyObject=(key,kind)=>{
 const parsed=key?.type===kind?key:kind==="private"?createPrivateKey(key):createPublicKey(key);
 if(parsed.asymmetricKeyType!=="ed25519")throw Error("Operator/reviewer must use Ed25519.");
 return parsed;
};
const publicFingerprint=(key)=>hash(key.export({format:"der",type:"spki"}));
const signatureBytes=(s)=>{
 if(!SIGNATURE.test(s||""))throw Error("Noncanonical release signature.");
 const decoded=Buffer.from(s,"base64url");
 if(decoded.length!==64||decoded.toString("base64url")!==s)
  throw Error("Invalid release signature bytes.");
 return decoded;
};
function checkParity(report,manifest){
 if(!exact(report,["schema","classification","gitCommitSha","stagingHost",
   "sourceSnapshotSha256","sourceMatchesPinnedCheckout","operatorSignatureVerified",
   "hostedAuthProbeLinked","tenArtifactDigestsMatched","actualDeployedSourceParityVerified",
   "stagingEvidenceIndependentlyVerified","realDockerHostAttested",
   "productionDeploymentAuthorized","dockerExecutionAuthorized",
   "humanSecurityApprovalRequired","note"])||
   report.schema!=="eternyx-docker-staging-evidence-review-v1"||
   report.classification!=="operator_evidence_consistent_manual_review_required"||
   report.gitCommitSha!==manifest.releaseCommitSha||
   report.sourceSnapshotSha256!==manifest.pinnedSourceSnapshotSha256||
   report.stagingHost!==manifest.stagingProjectRef+".supabase.co"||
   report.sourceMatchesPinnedCheckout!==true||report.operatorSignatureVerified!==true||
   report.hostedAuthProbeLinked!==true||report.tenArtifactDigestsMatched!==true||
   report.actualDeployedSourceParityVerified!==false||
   report.stagingEvidenceIndependentlyVerified!==false||
   report.realDockerHostAttested!==false||report.productionDeploymentAuthorized!==false||
   report.dockerExecutionAuthorized!==false||report.humanSecurityApprovalRequired!==true||
   typeof report.note!=="string"||report.note.length>500)
   throw Error("Offline Docker source/evidence parity report does not match pinned release.");
 return report;
}
function checkManagement(report,manifest,pin,now){
 if(!exact(report,["schema","scope","observedAt","stagingProjectRef",
   "releaseCommitSha","pinnedSourceSnapshotSha256","pinnedManifestSha256",
   "checks","metadataDigest","passed","productionProjectCalled",
   "mutationRequestsSent","remoteDockerCommandsIssued","remoteCodeBytesVerified",
   "deployedSourceParityVerified","productionDeploymentAuthorized",
   "stagingDockerExecutionAuthorized","independentHumanApprovalRequired","note"])||
   report.schema!=="eternyx-docker-management-inventory-v1"||
   report.scope!=="read_only_staging_metadata"||
   report.stagingProjectRef!==manifest.stagingProjectRef||
   report.releaseCommitSha!==manifest.releaseCommitSha||
   report.pinnedSourceSnapshotSha256!==manifest.pinnedSourceSnapshotSha256||
   report.pinnedManifestSha256!==pin||report.passed!==true||
   report.productionProjectCalled!==false||report.mutationRequestsSent!==false||
   report.remoteDockerCommandsIssued!==false||report.remoteCodeBytesVerified!==false||
   report.deployedSourceParityVerified!==false||
   report.productionDeploymentAuthorized!==false||
   report.stagingDockerExecutionAuthorized!==false||
   report.independentHumanApprovalRequired!==true||
   typeof report.note!=="string"||report.note.length>500||
   !HEX.test(report.metadataDigest||""))
   throw Error("Management metadata report is not an eligible Docker release observation.");
 timeValue(report.observedAt,now);
 if(!Array.isArray(report.checks)||report.checks.length!==DOCKER_FUNCTIONS.length)
   throw Error("Docker function deployment checks are incomplete.");
 for(let i=0;i<report.checks.length;i++){
   const c=report.checks[i],expected=manifest.expected[i];
   if(!exact(c,["slug","status","observedVersion","expectedVersion",
      "versionMatches","verifyJwt","expectedVerifyJwt","jwtMatches",
      "bundleDigestAvailable","bundleDigestPinned","pinnedBundleDigestMatches","passed"])||
      c.slug!==expected.slug||c.status!=="ACTIVE"||
      c.observedVersion!==expected.version||c.expectedVersion!==expected.version||
      c.versionMatches!==true||c.verifyJwt!==expected.verifyJwt||
      c.expectedVerifyJwt!==expected.verifyJwt||c.jwtMatches!==true||
      expected.bundleSha256===null||c.bundleDigestPinned!==true||
      c.bundleDigestAvailable!==true||c.pinnedBundleDigestMatches!==true||
      c.passed!==true)
     throw Error("Function version, JWT policy or independently pinned bundle metadata failed.");
 }
 const metadata={
  stagingProjectRef:report.stagingProjectRef,
  releaseCommitSha:report.releaseCommitSha,
  pinnedSourceSnapshotSha256:report.pinnedSourceSnapshotSha256,
  checks:report.checks.map(c=>({
    slug:c.slug,version:c.observedVersion,verifyJwt:c.verifyJwt,
    bundleDigestAvailable:c.bundleDigestAvailable,
    bundleDigestPinned:c.bundleDigestPinned,
    pinnedBundleDigestMatches:c.pinnedBundleDigestMatches
  }))
 };
 const expectedDigest=hash("ETERNYX_DOCKER_STAGING_DEPLOYED_METADATA_V1\n"+JSON.stringify(metadata));
 if(report.metadataDigest!==expectedDigest)
   throw Error("Management report metadata digest is inconsistent with observed fields.");
 return report;
}
function candidateHash(candidate){
 return hash("ETERNYX_DOCKER_RELEASE_CANDIDATE_V1\n"+JSON.stringify(candidate));
}
const authorMessage=(digest)=>Buffer.from("ETERNYX_DOCKER_RELEASE_AUTHOR_V1\n"+digest);
const reviewMessage=(digest,signature)=>Buffer.from("ETERNYX_DOCKER_RELEASE_REVIEWER_V1\n"+digest+"\n"+signature);
export function prepareDockerReleaseCandidate({
 parityBytes,managementBytes,manifestBytes,pinnedManifestSha256,now=Date.now()
}){
 if(!Number.isFinite(now)||!HEX.test(pinnedManifestSha256||""))
  throw Error("Independent release manifest pin and trusted clock required.");
 const manifest=validateDockerDeploymentManifest(decode(manifestBytes,16384));
 if(createDockerDeploymentManifestPin(manifest)!==pinnedManifestSha256)
   throw Error("Release expectations differ from independent manifest pin.");
 const parity=checkParity(decode(parityBytes),manifest);
 const management=checkManagement(decode(managementBytes),manifest,pinnedManifestSha256,now);
 const candidate={
  schema:"eternyx-docker-release-candidate-v1",
  environment:"isolated_staging",
  observedAt:management.observedAt,
  stagingProjectRef:manifest.stagingProjectRef,
  productionProjectRef:manifest.productionProjectRef,
  gitCommitSha:manifest.releaseCommitSha,
  sourceSnapshotSha256:manifest.pinnedSourceSnapshotSha256,
  expectedManifestSha256:pinnedManifestSha256,
  stagingMetadataDigest:management.metadataDigest,
  evidence:{
   parityReportSha256:hash(bytes(parityBytes)),
   deploymentInventorySha256:hash(bytes(managementBytes)),
   deploymentManifestSha256:hash(bytes(manifestBytes,16384))
  },
  functionCount:4,
  allFunctionBundleDigestsPinned:true,
  deploymentSourceBytesIndependentlyVerified:false,
  productionDeploymentAuthorized:false,
  stagingDockerExecutionAuthorized:false,
  independentSecurityApprovalRequired:true
 };
 return candidate;
}
export function authorSignDockerCandidate(candidate,privateKey){
 if(!exact(candidate,["schema","environment","observedAt","stagingProjectRef",
  "productionProjectRef","gitCommitSha","sourceSnapshotSha256",
  "expectedManifestSha256","stagingMetadataDigest","evidence","functionCount",
  "allFunctionBundleDigestsPinned","deploymentSourceBytesIndependentlyVerified",
  "productionDeploymentAuthorized","stagingDockerExecutionAuthorized",
  "independentSecurityApprovalRequired"])||
  candidate.schema!=="eternyx-docker-release-candidate-v1"||
  candidate.environment!=="isolated_staging"||
  candidate.functionCount!==4||candidate.allFunctionBundleDigestsPinned!==true||
  candidate.deploymentSourceBytesIndependentlyVerified!==false||
  candidate.productionDeploymentAuthorized!==false||
  candidate.stagingDockerExecutionAuthorized!==false||
  candidate.independentSecurityApprovalRequired!==true||
  !exact(candidate.evidence,["parityReportSha256","deploymentInventorySha256","deploymentManifestSha256"])||
  !Object.values(candidate.evidence).every(x=>HEX.test(x))||
  !SHA.test(candidate.gitCommitSha||"")||!HEX.test(candidate.sourceSnapshotSha256||"")||
  !HEX.test(candidate.expectedManifestSha256||"")||!HEX.test(candidate.stagingMetadataDigest||"")||
  !/^[a-z0-9]{20}$/.test(candidate.stagingProjectRef||"")||
  !/^[a-z0-9]{20}$/.test(candidate.productionProjectRef||"")||
  candidate.stagingProjectRef===candidate.productionProjectRef)
  throw Error("Malformed release candidate.");
 const digest=candidateHash(candidate);
 const key=keyObject(privateKey,"private");
 return {schema:"eternyx-docker-release-authored-v1",candidate,
  candidateSha256:digest,authorSignature:sign(null,authorMessage(digest),key).toString("base64url")};
}
export function reviewerCountersignDockerCandidate(authored,reviewerKey,authorPublicKey){
 if(!exact(authored,["schema","candidate","candidateSha256","authorSignature"])||
    authored.schema!=="eternyx-docker-release-authored-v1"||
    !HEX.test(authored.candidateSha256||"")||
    authored.candidateSha256!==candidateHash(authored.candidate))
  throw Error("Invalid builder-authored release candidate.");
 const author=keyObject(authorPublicKey,"public");
 if(!verify(null,authorMessage(authored.candidateSha256),author,
    signatureBytes(authored.authorSignature)))
   throw Error("Author signature invalid.");
 const reviewer=keyObject(reviewerKey,"private");
 const reviewerPublic=createPublicKey(reviewer);
 if(publicFingerprint(author)===publicFingerprint(reviewerPublic))
   throw Error("Same signing key cannot countersign the release.");
 return {schema:"eternyx-docker-release-dual-attestation-v1",
  candidate:authored.candidate,candidateSha256:authored.candidateSha256,
  authorSignature:authored.authorSignature,
  reviewerSignature:sign(null,reviewMessage(authored.candidateSha256,
     authored.authorSignature),reviewer).toString("base64url")};
}
export function verifyDockerReleaseHandoff({
 attestation,authorPublicKey,reviewerPublicKey,
 parityBytes,managementBytes,manifestBytes,pinnedManifestSha256,now=Date.now()
}){
 if(!exact(attestation,["schema","candidate","candidateSha256",
   "authorSignature","reviewerSignature"])||
   attestation.schema!=="eternyx-docker-release-dual-attestation-v1"||
   !HEX.test(attestation.candidateSha256||""))
  throw Error("Invalid dual-attested release package.");
 const author=keyObject(authorPublicKey,"public"),reviewer=keyObject(reviewerPublicKey,"public");
 if(publicFingerprint(author)===publicFingerprint(reviewer))
  throw Error("Release signer and reviewer are not cryptographically independent.");
 const prepared=prepareDockerReleaseCandidate({
  parityBytes,managementBytes,manifestBytes,pinnedManifestSha256,now
 });
 const digest=candidateHash(prepared);
 if(attestation.candidateSha256!==digest||
    JSON.stringify(attestation.candidate)!==JSON.stringify(prepared))
  throw Error("Signed release package has drifted from current evidence.");
 const authorSignature=signatureBytes(attestation.authorSignature);
 const reviewerSignature=signatureBytes(attestation.reviewerSignature);
 if(!verify(null,authorMessage(digest),author,authorSignature)||
   !verify(null,reviewMessage(digest,attestation.authorSignature),
     reviewer,reviewerSignature))
  throw Error("One or both release signatures are invalid.");
 return {
  schema:"eternyx-docker-release-handoff-review-v1",
  status:"two_distinct_signatures_valid_independent_approval_required",
  releaseCommitSha:prepared.gitCommitSha,
  stagingProjectRef:prepared.stagingProjectRef,
  candidateSha256:digest,
  manifestPinMatched:true,parityEvidenceDigestMatched:true,
  deploymentMetadataDigestMatched:true,allFourBundlesReportedPinned:true,
  bothSignaturesVerified:true,
  signedReportsAuthenticityIndependentlyEstablished:false,
  deployedCodeBytesIndependentlyVerified:false,
  realDockerHostAttested:false,
  productionDeploymentAuthorized:false,stagingDockerExecutionAuthorized:false,
  independentHumanSecurityApprovalRequired:true,
  note:"Two signatures validate this evidence handoff, not remote system behavior or execution authority."
 };
}
