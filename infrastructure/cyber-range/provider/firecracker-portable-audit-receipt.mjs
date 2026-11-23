/**
 * Deterministic, portable, metadata-only receipt for a complete OFFLINE
 * Firecracker case audit. Never a hardware attestation or hosted-Labs permit.
 *
 * This module must ONLY consume the successful output of the file-backed
 * auditCompleteIndependentReviewCase after all signed evidence checks pass.
 * A SHA-256 alone is neither a signature nor a protected external record.
 */
import {createHash,timingSafeEqual} from "node:crypto";
import {validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";

export const ARCHIVE_RECEIPT_SCHEMA=1;
export const ARCHIVE_RECEIPT_CLASS=
  "offline-verified-file-chain-archive-not-hardware-attestation";
const SHA=/^[a-f0-9]{64}$/;
const MAX_BYTES=4096;
const MODES=new Set(["guest-vsock","watchdog-900","guest-and-watchdog"]);
const DECISIONS=new Map([
  ["reviewed-for-archival","archival-file-review-only"],
  ["follow-up-required","follow-up-required"],
  ["evidence-rejected","evidence-rejected"],
]);
const REASONS=new Set([
  "independent-host-source-not-established",
  "guest-identity-not-cryptographically-proven",
  "systemd-watchdog-proof-needs-review",
  "image-origin-not-independently-established",
  "source-timestamp-reconciliation-needed",
  "human-log-inspection-incomplete",
  "other-documented-in-private-case",
]);
const CHECKS=[
  "originalOperatorSignature","secondReviewerSignature",
  "signedReviewerDisposition","exactSourceFileDigests",
  "structuredMetadataConsistency","externallyPinnedCaseCheckpoint",
  "operatorRuntimeConsistency","signedSupplementalRuntimeAddendum",
  "externallyPinnedSupplementalAddendum","wholeCaseSecondPassStable",
];
const EXTERNAL_PROOF=[
  "physical-kvm-host-source-authenticity",
  "cryptographic-guest-identity",
  "independent-image-provenance",
  "independent-host-log-semantics",
  "provider-enforced-public-lab-tenant-and-billing-controls",
];
const INPUT=[
  "schemaVersion","classification","sessionId","mode","decision",
  "dispositionClassification","reasons","integrityChecks","provenance",
  "unresolvedIndependentProof","privateSigningKeyRead",
  "independentHostEvidenceVerified","physicalHostAttested",
  "productionReady","publicLabsEnabled",
];
const PROVENANCE=[
  "importedWithCommittedJournal","legacyManualStaging",
  "signedSourceFilesVerified","signedRuntimeSidecars",
  "operatorFingerprint","reviewerFingerprint",
  "checkpointSha256","addendumSha256",
];
const ARCHIVE=[
  "schemaVersion","classification","sessionId","mode","decision",
  "reviewClassification","reasons","signerPins","evidencePins",
  "evidenceCounts","importProvenance","verificationCoverage",
  "unresolvedIndependentProof","trustBoundary",
];
const SIGNERS=["operatorSpkiSha256","reviewerSpkiSha256"];
const PINS=["caseCheckpointSha256","runtimeAddendumSha256"];
const COUNTS=["verifiedSourceFiles","signedRuntimeSidecars"];
const IMPORT=["committedImportJournal","legacyManualStaging"];
const TRUST=[
  "privateSigningKeyRead","independentHostEvidenceVerified",
  "physicalHostAttested","productionReady","publicLabsEnabled",
];
const exact=(x,fields)=>x!==null&&typeof x==="object"&&
  !Array.isArray(x)&&Object.keys(x).sort().join("|")===
  fields.slice().sort().join("|");
const same=(a,b)=>typeof a==="string"&&SHA.test(a)&&
  typeof b==="string"&&SHA.test(b)&&
  timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
const hash=b=>createHash("sha256").update(b).digest("hex");
const identical=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&
  a.length===b.length&&a.every((x,i)=>x===b[i]);
function safeReasons(reasons,decision){
  return Array.isArray(reasons)&&reasons.length<=7&&
    reasons.every(x=>typeof x==="string"&&REASONS.has(x))&&
    new Set(reasons).size===reasons.length&&
    identical(reasons,[...reasons].sort())&&
    (decision==="reviewed-for-archival"?
      reasons.length===0:reasons.length>=1);
}
function goodCount(x,min,max){
  return Number.isSafeInteger(x)&&x>=min&&x<=max;
}
function validCommon({
  sessionId,mode,decision,reasons,operatorSha,reviewerSha,
  checkpointSha,addendumSha,sourceCount,sidecarCount,
  committed,legacy,checks,external,trust,
}){
  if(!validSessionId(sessionId)||!MODES.has(mode)||
     !DECISIONS.has(decision)||!safeReasons(reasons,decision)||
     !SHA.test(operatorSha??"")||!SHA.test(reviewerSha??"")||
     same(operatorSha,reviewerSha)||
     !SHA.test(checkpointSha??"")||!SHA.test(addendumSha??"")||
     !goodCount(sourceCount,12,32)||
     sidecarCount!==(2+(mode.includes("guest")?1:0)+
       (mode.includes("watchdog")?1:0))||
     typeof committed!=="boolean"||legacy!==!committed||
     !exact(checks,CHECKS)||Object.values(checks).some(v=>v!==true)||
     !identical(external,EXTERNAL_PROOF)||
     !exact(trust,TRUST)||Object.values(trust).some(v=>v!==false))
    throw Error("Incomplete or overclaiming offline archive receipt");
}
function validateOriginal(a){
  if(!exact(a,INPUT)||a.schemaVersion!==1||
     a.classification!==
       "verified-offline-file-review-only-not-hardware-attestation"||
     !exact(a.provenance,PROVENANCE)||
     a.dispositionClassification!==DECISIONS.get(a.decision))
    throw Error("Not a complete, verified offline file-chain audit");
  const p=a.provenance;
  const trust=Object.fromEntries(TRUST.map(k=>[k,a[k]]));
  validCommon({
    sessionId:a.sessionId,mode:a.mode,decision:a.decision,
    reasons:a.reasons,
    operatorSha:p.operatorFingerprint,reviewerSha:p.reviewerFingerprint,
    checkpointSha:p.checkpointSha256,addendumSha:p.addendumSha256,
    sourceCount:p.signedSourceFilesVerified,
    sidecarCount:p.signedRuntimeSidecars,
    committed:p.importedWithCommittedJournal,legacy:p.legacyManualStaging,
    checks:a.integrityChecks,external:a.unresolvedIndependentProof,trust,
  });
}
function validateReceipt(r){
  if(!exact(r,ARCHIVE)||r.schemaVersion!==ARCHIVE_RECEIPT_SCHEMA||
    r.classification!==ARCHIVE_RECEIPT_CLASS||
    r.reviewClassification!==DECISIONS.get(r.decision)||
    !exact(r.signerPins,SIGNERS)||!exact(r.evidencePins,PINS)||
    !exact(r.evidenceCounts,COUNTS)||!exact(r.importProvenance,IMPORT)||
    !exact(r.verificationCoverage,CHECKS))
    throw Error("Untrusted or extended portable archive schema");
  validCommon({
    sessionId:r.sessionId,mode:r.mode,decision:r.decision,
    reasons:r.reasons,
    operatorSha:r.signerPins.operatorSpkiSha256,
    reviewerSha:r.signerPins.reviewerSpkiSha256,
    checkpointSha:r.evidencePins.caseCheckpointSha256,
    addendumSha:r.evidencePins.runtimeAddendumSha256,
    sourceCount:r.evidenceCounts.verifiedSourceFiles,
    sidecarCount:r.evidenceCounts.signedRuntimeSidecars,
    committed:r.importProvenance.committedImportJournal,
    legacy:r.importProvenance.legacyManualStaging,
    checks:r.verificationCoverage,external:r.unresolvedIndependentProof,
    trust:r.trustBoundary,
  });
}
export function portableArchiveBytes(receipt){
  validateReceipt(receipt);
  const b=Buffer.from(JSON.stringify(receipt)+"\n","utf8");
  if(b.length>MAX_BYTES)throw Error("Oversized portable audit receipt");
  return b;
}
export function createPortableOfflineAuditReceipt(verifiedAudit){
  validateOriginal(verifiedAudit);
  const p=verifiedAudit.provenance;
  const receipt={
    schemaVersion:ARCHIVE_RECEIPT_SCHEMA,
    classification:ARCHIVE_RECEIPT_CLASS,
    sessionId:verifiedAudit.sessionId,
    mode:verifiedAudit.mode,
    decision:verifiedAudit.decision,
    reviewClassification:verifiedAudit.dispositionClassification,
    reasons:[...verifiedAudit.reasons],
    signerPins:{
      operatorSpkiSha256:p.operatorFingerprint,
      reviewerSpkiSha256:p.reviewerFingerprint,
    },
    evidencePins:{
      caseCheckpointSha256:p.checkpointSha256,
      runtimeAddendumSha256:p.addendumSha256,
    },
    evidenceCounts:{
      verifiedSourceFiles:p.signedSourceFilesVerified,
      signedRuntimeSidecars:p.signedRuntimeSidecars,
    },
    importProvenance:{
      committedImportJournal:p.importedWithCommittedJournal,
      legacyManualStaging:p.legacyManualStaging,
    },
    verificationCoverage:Object.fromEntries(
      CHECKS.map(k=>[k,verifiedAudit.integrityChecks[k]])),
    unresolvedIndependentProof:[...verifiedAudit.unresolvedIndependentProof],
    trustBoundary:Object.fromEntries(TRUST.map(k=>[k,verifiedAudit[k]])),
  };
  const bytes=portableArchiveBytes(receipt);
  return Object.freeze({
    receipt,bytes,
    receiptSha256:hash(bytes),
    bytesLength:bytes.length,
  });
}
/**
 * Compare a separately retained canonical receipt buffer AND external SHA
 * against a freshly re-verified complete case. Never trust a pin from the
 * same case directory. No signer private key is used in this verifier.
 */
export function verifyPortableOfflineAuditReceipt({
  savedBytes,verifiedAudit,externallyPinnedReceiptSha256,
}={}){
  if(!Buffer.isBuffer(savedBytes)||savedBytes.length<2||
    savedBytes.length>MAX_BYTES||!SHA.test(externallyPinnedReceiptSha256??""))
    throw Error("Missing bounded saved receipt and external SHA-256 pin");
  const parsed=JSON.parse(savedBytes.toString("utf8"));
  const canonical=portableArchiveBytes(parsed);
  const fresh=createPortableOfflineAuditReceipt(verifiedAudit);
  if(!savedBytes.equals(canonical)||!savedBytes.equals(fresh.bytes)||
     !same(hash(savedBytes),externallyPinnedReceiptSha256))
    throw Error("Offline archive receipt changed or external pin disagrees");
  return Object.freeze({
    schemaVersion:1,
    classification:ARCHIVE_RECEIPT_CLASS,
    sessionId:fresh.receipt.sessionId,
    mode:fresh.receipt.mode,
    decision:fresh.receipt.decision,
    receiptSha256:hash(savedBytes),
    independentPinnedDigestMatched:true,
    freshlyReverifiedCaseMatched:true,
    originalEvidenceFilesCopied:false,
    privateSigningKeyRead:false,
    physicalHostAttested:false,
    independentHostEvidenceVerified:false,
    productionReady:false,publicLabsEnabled:false,
  });
}
