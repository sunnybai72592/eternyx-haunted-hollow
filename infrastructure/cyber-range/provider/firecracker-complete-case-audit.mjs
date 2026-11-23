/**
 * ETERNYX Labs complete OFFLINE file-review summary.
 *
 * This is ONLY a pure composition of already verified signed artifacts.
 * The private, file-backed caller must independently verify each layer,
 * its out-of-band SHA pins and a final coherent snapshot before calling.
 *
 * This must NEVER become a hardware-acceptance or public-labs enable flag.
 */
import {timingSafeEqual} from "node:crypto";

const SHA=/^[a-f0-9]{64}$/;
const MODES=new Set(["guest-vsock","watchdog-900","guest-and-watchdog"]);
const DECISIONS=new Map([
  ["reviewed-for-archival","archival-file-review-only"],
  ["follow-up-required","follow-up-required"],
  ["evidence-rejected","evidence-rejected"],
]);
const CHECKS=[
  ["operator signature","review","operatorSignatureVerified",true],
  ["reviewer signature","review","reviewerSignatureVerified",true],
  ["distinct human reviewer","review","secondSignerDistinct",true],
  ["reviewed source digests","review","sourceFileDigestsVerified",true],
  ["metadata consistency","consistency","metadataConsistencyVerified",true],
  ["binary and guest image pins","consistency","pinnedKernelRootfsAndHostBinariesMatched",true],
  ["offline-only policy","consistency","offlinePolicyFieldsMatched",true],
  ["metadata capture window","consistency","metadataTimestampWindowMatched",true],
  ["review decision signature","disposition","reviewerDispositionSignatureVerified",true],
  ["decision bound to reviewed files","disposition","boundToExactReviewedFiles",true],
  ["case checkpoint digests","checkpoint","sourceHashesMatchSealedCheckpoint",true],
  ["external case checkpoint pin","checkpoint","externalChecksumMatched",true],
  ["runtime transcript linkage","runtime","referencedTranscriptDigestsMatched",true],
  ["runtime observations","runtime","observationFlagsInternallyConsistent",true],
  ["runtime session and unit","runtime","sessionAndSystemdUnitMatched",true],
  ["runtime capture window","runtime","captureWindowMatched",true],
  ["runtime addendum reviewer signature","addendum","reviewerSignatureVerified",true],
  ["addendum binds sidecar bytes","addendum","operatorSidecarsCryptographicallyBound",true],
  ["external addendum and case pins","addendum","externallyPinnedCaseAndAddendumDigestsVerified",true],
  ["final whole-case snapshot","snapshot","stableAcrossSecondPass",true],
  ["no interrupted staging","snapshot","noStagingRemnants",true],
];
const FALSE_CLAIMS=[
  ["review","physicalHostAttested"],
  ["review","productionReady"],
  ["review","publicLabsEnabled"],
  ["disposition","physicalHostAttested"],
  ["disposition","independentHostEvidenceVerified"],
  ["disposition","productionReady"],
  ["disposition","publicLabsEnabled"],
  ["consistency","independentSourceAuthenticityVerified"],
  ["consistency","physicalHostAttested"],
  ["consistency","productionReady"],
  ["consistency","publicLabsEnabled"],
  ["checkpoint","independentSourceAuthenticityVerified"],
  ["checkpoint","physicalHostAttested"],
  ["checkpoint","productionReady"],
  ["checkpoint","publicLabsEnabled"],
  ["runtime","sidecarsIncludedInEarlierSignedReview"],
  ["runtime","rawHostLogsSemanticallyVerified"],
  ["runtime","independentSourceAuthenticityVerified"],
  ["runtime","physicalHostAttested"],
  ["runtime","productionReady"],
  ["runtime","publicLabsEnabled"],
  ["addendum","sidecarsIndependentlyAuthenticated"],
  ["addendum","physicalHostAttested"],
  ["addendum","productionReady"],
  ["addendum","publicLabsEnabled"],
  ["snapshot","physicalHostAttested"],
  ["snapshot","independentSourceAuthenticityVerified"],
  ["snapshot","productionReady"],
  ["snapshot","publicLabsEnabled"],
];
function same(a,b){
  return typeof a==="string"&&SHA.test(a)&&
    typeof b==="string"&&SHA.test(b)&&
    timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
const arrayEqual=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&
  a.length===b.length&&a.every((x,i)=>x===b[i]);

/**
 * Fail closed when any checked layer lacks the required positive fact,
 * claims hardware/public readiness, or disagrees about case/decision/digests.
 * The result is a safe *classification*, never physical attestation.
 */
export function composeOfflineCaseAudit({
  sessionId,mode,operatorFingerprint,reviewerFingerprint,
  externallyPinnedCheckpointSha256,externallyPinnedAddendumSha256,
  review,consistency,disposition,checkpoint,runtime,addendum,snapshot,
  committedImport=false,
}={}){
  const layers={review,consistency,disposition,checkpoint,runtime,addendum,snapshot};
  if(typeof sessionId!=="string"||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(sessionId)||
    !MODES.has(mode)||typeof committedImport!=="boolean"||
    !SHA.test(operatorFingerprint??"")||
    !SHA.test(reviewerFingerprint??"")||
    same(operatorFingerprint,reviewerFingerprint)||
    !SHA.test(externallyPinnedCheckpointSha256??"")||
    !SHA.test(externallyPinnedAddendumSha256??"")||
    Object.values(layers).some(x=>!x||typeof x!=="object"||Array.isArray(x)))
    throw Error("Missing pinned offline case audit prerequisites");
  for(const [label,layer,key,value] of CHECKS){
    if(layers[layer][key]!==value)
      throw Error("Incomplete offline case audit: "+label);
  }
  for(const [layer,key] of FALSE_CLAIMS){
    if(layers[layer][key]!==false)
      throw Error("Unverified or overclaimed offline audit trust boundary");
  }
  for(const layer of Object.values(layers)){
    if(layer.sessionId!==sessionId||
       (layer.mode!==undefined&&layer.mode!==mode))
      throw Error("Mixed or replayed offline case audit session/mode");
  }
  if(!DECISIONS.has(disposition.decision)||
    checkpoint.decision!==disposition.decision||
    addendum.decision!==disposition.decision||
    !Array.isArray(disposition.reasons)||
    !arrayEqual(disposition.reasons,checkpoint.reasons)||
    (disposition.decision==="reviewed-for-archival"?
      disposition.reasons.length!==0:disposition.reasons.length<1))
    throw Error("Reviewer decision or controlled follow-up reasons disagree");
  if(!same(checkpoint.checkpointSha256,externallyPinnedCheckpointSha256)||
     !same(addendum.checkpointSha256,externallyPinnedCheckpointSha256)||
     !same(addendum.addendumSha256,externallyPinnedAddendumSha256))
    throw Error("Externally pinned case and runtime addendum hashes disagree");
  if(!Number.isSafeInteger(snapshot.verifiedSourceFiles)||
     snapshot.verifiedSourceFiles<12||
     !Number.isSafeInteger(addendum.matchedSidecars)||
     !arrayEqual(runtime.checkedObservationKinds,[
       "supervisor","cgroup",
       ...(mode.includes("guest")?["guest"]:[]),
       ...(mode.includes("watchdog")?["expiry"]:[]),
     ])||
     addendum.matchedSidecars!==runtime.checkedObservationKinds.length)
    throw Error("Incomplete or wrong-mode signed runtime inventory");
  return Object.freeze({
    schemaVersion:1,
    classification:"verified-offline-file-review-only-not-hardware-attestation",
    sessionId,mode,
    decision:disposition.decision,
    dispositionClassification:DECISIONS.get(disposition.decision),
    reasons:Object.freeze([...disposition.reasons]),
    integrityChecks:Object.freeze({
      originalOperatorSignature:true,secondReviewerSignature:true,
      signedReviewerDisposition:true,exactSourceFileDigests:true,
      structuredMetadataConsistency:true,
      externallyPinnedCaseCheckpoint:true,
      operatorRuntimeConsistency:true,
      signedSupplementalRuntimeAddendum:true,
      externallyPinnedSupplementalAddendum:true,
      wholeCaseSecondPassStable:true,
    }),
    provenance:Object.freeze({
      importedWithCommittedJournal:committedImport,
      legacyManualStaging:!committedImport,
      signedSourceFilesVerified:snapshot.verifiedSourceFiles,
      signedRuntimeSidecars:addendum.matchedSidecars,
      operatorFingerprint,reviewerFingerprint,
      checkpointSha256:checkpoint.checkpointSha256,
      addendumSha256:addendum.addendumSha256,
    }),
    unresolvedIndependentProof:Object.freeze([
      "physical-kvm-host-source-authenticity",
      "cryptographic-guest-identity",
      "independent-image-provenance",
      "independent-host-log-semantics",
      "provider-enforced-public-lab-tenant-and-billing-controls",
    ]),
    privateSigningKeyRead:false,
    independentHostEvidenceVerified:false,
    physicalHostAttested:false,
    productionReady:false,
    publicLabsEnabled:false,
  });
}
