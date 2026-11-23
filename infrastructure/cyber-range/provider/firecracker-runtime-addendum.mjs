/**
 * Supplemental reviewer-signed runtime observation addendum.
 *
 * A physically independent reviewer must validate original source provenance.
 * This signature covers operator-collected JSON bytes ONLY; it is not host
 * attestation, semantic parsing of systemd logs or public lab authorization.
 */
import {
  createHash,createPrivateKey,createPublicKey,sign,verify,timingSafeEqual,
} from "node:crypto";
import {requiredRuntimeObservationFiles} from "./firecracker-runtime-observations.mjs";

export const RUNTIME_ADDENDUM_FILE="review-runtime-addendum.json";
export const RUNTIME_ADDENDUM_ACK="I_APPROVE_SIGNED_OFFLINE_RUNTIME_ADDENDUM";
const SHA=/^[a-f0-9]{64}$/;
const SIGNATURE=/^[A-Za-z0-9_-]{86}$/;
const TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const MAX=4096;
const FIELDS=["schemaVersion","classification","sessionId","mode",
  "decision","signedAt","checkpointSha256","operatorSignerFingerprint",
  "reviewerSignerFingerprint","sidecarDigests","claims"];
const ENTRY=["name","sha256","bytes"];
const CLAIMS=[
  "originalCaseCheckpointExternallyPinned","sourceMetadataConsistent",
  "supplementalFilesSignedByReviewer","rawHostLogsSemanticallyVerified",
  "independentSourceAuthenticityVerified","physicalHostAttested",
  "productionReady","publicLabsEnabled",
];
const exact=(x,fields)=>x!==null&&typeof x==="object"&&
  !Array.isArray(x)&&Object.keys(x).sort().join("|")===
  fields.slice().sort().join("|");
const hash=x=>createHash("sha256").update(x).digest("hex");
function same(a,b){
  return typeof a==="string"&&SHA.test(a)&&typeof b==="string"&&SHA.test(b)&&
    timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
function keyFingerprint(key){
  const k=key?.type==="public"?key:createPublicKey(key);
  if(k.asymmetricKeyType!=="ed25519")
    throw Error("Only pinned Ed25519 reviewer keys may sign addenda");
  return hash(k.export({format:"der",type:"spki"}));
}
function checkPrerequisites(checkpoint,audit,operatorFingerprint,reviewerFingerprint){
  if(!checkpoint||checkpoint.sourceHashesMatchSealedCheckpoint!==true||
    checkpoint.externalChecksumMatched!==true||
    checkpoint.privateKeyUsed!==false||
    checkpoint.physicalHostAttested!==false||
    checkpoint.productionReady!==false||
    checkpoint.publicLabsEnabled!==false||
    !audit||audit.referencedTranscriptDigestsMatched!==true||
    audit.observationFlagsInternallyConsistent!==true||
    audit.sessionAndSystemdUnitMatched!==true||
    audit.captureWindowMatched!==true||
    audit.sidecarsIncludedInEarlierSignedReview!==false||
    audit.rawHostLogsSemanticallyVerified!==false||
    audit.physicalHostAttested!==false||
    audit.independentSourceAuthenticityVerified!==false||
    audit.productionReady!==false||
    checkpoint.sessionId!==audit.sessionId||
    checkpoint.mode!==audit.mode||
    !SHA.test(checkpoint.checkpointSha256??"")||
    !SHA.test(operatorFingerprint??"")||
    !SHA.test(reviewerFingerprint??"")||
    same(operatorFingerprint,reviewerFingerprint))
    throw Error("Signed runtime addendum needs an externally pinned verified case");
  const expected=requiredRuntimeObservationFiles(checkpoint.mode).map(x=>x.kind);
  if(!Array.isArray(audit.checkedObservationKinds)||
    audit.checkedObservationKinds.join("|")!==expected.join("|"))
    throw Error("Incomplete runtime observation modes");
  if(!["reviewed-for-archival","follow-up-required","evidence-rejected"]
      .includes(checkpoint.decision))
    throw Error("Unsupported signed disposition");
  return expected;
}
function manifest(mode,sidecars){
  const names=requiredRuntimeObservationFiles(mode).map(x=>x.sidecar);
  if(!sidecars||typeof sidecars!=="object"||Array.isArray(sidecars)||
    Object.keys(sidecars).sort().join("|")!==names.slice().sort().join("|"))
    throw Error("Incomplete or extra runtime sidecars");
  return names.map(name=>{
    const raw=sidecars[name];
    if(!Buffer.isBuffer(raw)||raw.length<2||raw.length>MAX)
      throw Error("Unsafe runtime addendum source bytes");
    return {name,sha256:hash(raw),bytes:raw.length};
  });
}
function checkStatement(s){
  if(!exact(s,FIELDS)||s.schemaVersion!==1||
     s.classification!=="reviewer-signed-operator-runtime-sidecars-offline"||
     !["guest-vsock","watchdog-900","guest-and-watchdog"].includes(s.mode)||
     !["reviewed-for-archival","follow-up-required","evidence-rejected"]
       .includes(s.decision)||
     typeof s.signedAt!=="string"||!TIME.test(s.signedAt)||
     !Number.isFinite(Date.parse(s.signedAt))||
     new Date(s.signedAt).toISOString()!==s.signedAt||
     !SHA.test(s.checkpointSha256??"")||
     !SHA.test(s.operatorSignerFingerprint??"")||
     !SHA.test(s.reviewerSignerFingerprint??"")||
     same(s.operatorSignerFingerprint,s.reviewerSignerFingerprint)||
     !exact(s.claims,CLAIMS)||
     s.claims.originalCaseCheckpointExternallyPinned!==true||
     s.claims.sourceMetadataConsistent!==true||
     s.claims.supplementalFilesSignedByReviewer!==true||
     Object.entries(s.claims).some(([key,value])=>
       !["originalCaseCheckpointExternallyPinned","sourceMetadataConsistent",
         "supplementalFilesSignedByReviewer"].includes(key)&&value!==false))
    throw Error("Malformed or overclaiming runtime addendum");
  const names=requiredRuntimeObservationFiles(s.mode).map(x=>x.sidecar);
  if(!Array.isArray(s.sidecarDigests)||
    s.sidecarDigests.length!==names.length||
    s.sidecarDigests.some((x,i)=>!exact(x,ENTRY)||x.name!==names[i]||
      !SHA.test(x.sha256??"")||!Number.isSafeInteger(x.bytes)||
      x.bytes<2||x.bytes>MAX))
    throw Error("Untrusted addendum sidecar manifest");
  return true;
}
export function canonicalRuntimeAddendumBytes(report){
  if(!exact(report,["statement","signature"])||
    typeof report.signature!=="string"||!SIGNATURE.test(report.signature))
    throw Error("Malformed signed runtime addendum envelope");
  checkStatement(report.statement);
  const raw=Buffer.from(JSON.stringify(report)+"\n","utf8");
  if(raw.length>MAX)throw Error("Signed runtime addendum exceeds bound");
  return raw;
}
function assertMatch(report,checkpoint,audit,operatorFingerprint,
  reviewerFingerprint,sidecars){
  checkPrerequisites(checkpoint,audit,operatorFingerprint,reviewerFingerprint);
  const s=report.statement;
  checkStatement(s);
  if(s.sessionId!==checkpoint.sessionId||s.mode!==checkpoint.mode||
     s.decision!==checkpoint.decision||
     !same(s.checkpointSha256,checkpoint.checkpointSha256)||
     !same(s.operatorSignerFingerprint,operatorFingerprint)||
     !same(s.reviewerSignerFingerprint,reviewerFingerprint))
    throw Error("Signed addendum belongs to different offline case or checkpoint");
  const expected=manifest(checkpoint.mode,sidecars);
  if(expected.some((x,i)=>x.name!==s.sidecarDigests[i].name||
     x.bytes!==s.sidecarDigests[i].bytes||
     !same(x.sha256,s.sidecarDigests[i].sha256)))
    throw Error("Reviewed operator sidecars changed after addendum signing");
}
export function createSignedRuntimeAddendum({
  checkpoint,audit,operatorFingerprint,reviewerFingerprint,sidecars,
  reviewerPublicPem,reviewerPrivatePem,
  acknowledgment,signedAt=new Date().toISOString(),
}={}){
  if(acknowledgment!==RUNTIME_ADDENDUM_ACK)
    throw Error("Separate human approval for runtime addendum required");
  checkPrerequisites(checkpoint,audit,operatorFingerprint,reviewerFingerprint);
  if(!same(keyFingerprint(reviewerPublicPem),reviewerFingerprint))
    throw Error("Reviewer signing identity is not externally pinned");
  const privateKey=createPrivateKey(reviewerPrivatePem);
  if(privateKey.asymmetricKeyType!=="ed25519"||
     !same(keyFingerprint(privateKey),reviewerFingerprint))
    throw Error("Wrong or substituted reviewer private key");
  const statement={
    schemaVersion:1,
    classification:"reviewer-signed-operator-runtime-sidecars-offline",
    sessionId:checkpoint.sessionId,mode:checkpoint.mode,
    decision:checkpoint.decision,signedAt,
    checkpointSha256:checkpoint.checkpointSha256,
    operatorSignerFingerprint:operatorFingerprint,
    reviewerSignerFingerprint:reviewerFingerprint,
    sidecarDigests:manifest(checkpoint.mode,sidecars),
    claims:{
      originalCaseCheckpointExternallyPinned:true,
      sourceMetadataConsistent:true,
      supplementalFilesSignedByReviewer:true,
      rawHostLogsSemanticallyVerified:false,
      independentSourceAuthenticityVerified:false,
      physicalHostAttested:false,
      productionReady:false,publicLabsEnabled:false,
    },
  };
  checkStatement(statement);
  const report={
    statement,
    signature:sign(null,Buffer.from(JSON.stringify(statement)),privateKey)
      .toString("base64url"),
  };
  const raw=canonicalRuntimeAddendumBytes(report);
  return Object.freeze({report,bytes:raw,addendumSha256:hash(raw)});
}
export function verifySignedRuntimeAddendum({
  report,checkpoint,audit,operatorFingerprint,reviewerFingerprint,sidecars,
  reviewerPublicPem,externallyPinnedAddendumSha256,
}={}){
  if(!SHA.test(externallyPinnedAddendumSha256??""))
    throw Error("Independently pinned runtime addendum digest required");
  const raw=canonicalRuntimeAddendumBytes(report);
  assertMatch(report,checkpoint,audit,operatorFingerprint,
    reviewerFingerprint,sidecars);
  if(!same(keyFingerprint(reviewerPublicPem),reviewerFingerprint)||
     !same(hash(raw),externallyPinnedAddendumSha256))
    throw Error("Reviewer addendum signer or external digest mismatch");
  const signature=Buffer.from(report.signature,"base64url");
  if(signature.length!==64||
     !verify(null,Buffer.from(JSON.stringify(report.statement)),
       createPublicKey(reviewerPublicPem),signature))
    throw Error("Reviewer addendum signature invalid");
  return Object.freeze({
    sessionId:checkpoint.sessionId,mode:checkpoint.mode,
    decision:checkpoint.decision,
    checkpointSha256:checkpoint.checkpointSha256,
    addendumSha256:hash(raw),
    matchedSidecars:report.statement.sidecarDigests.length,
    reviewerSignatureVerified:true,
    externallyPinnedCaseAndAddendumDigestsVerified:true,
    operatorSidecarsCryptographicallyBound:true,
    sidecarsIndependentlyAuthenticated:false,
    physicalHostAttested:false,
    publicLabsEnabled:false,productionReady:false,
  });
}
