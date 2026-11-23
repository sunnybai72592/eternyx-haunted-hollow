/**
 * Offline, reviewer-signed disposition for a fully verified v1 second-person
 * file review. It never approves hardware, billing, public labs or production.
 * Signing attests that a human selected a constrained follow-up category.
 */
import {
  createHash,createPrivateKey,createPublicKey,sign,verify,timingSafeEqual,
} from "node:crypto";
import {verifyIndependentReview} from "./firecracker-independent-review.mjs";

const SHA=/^[a-f0-9]{64}$/;
const TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const SIGNATURE=/^[A-Za-z0-9_-]{86}$/;
const MAX_AGE=30*24*60*60*1000;
const KEYS=["schemaVersion","classification","sessionId","mode",
  "decidedAt","decision","reasons","operatorReceiptSha256",
  "reviewReceiptSha256","operatorSignerFingerprint",
  "reviewerSignerFingerprint","claims"];
const CLAIMS=["reviewerSignatureVerified","operatorSignatureVerified",
  "humanDispositionRecorded","hardwareAttested",
  "independentHostEvidenceVerified","publicLabsEnabled","productionReady"];
const OUTER=["statement","signature"];
export const DISPOSITION_ACK="I_APPROVE_OFFLINE_REVIEW_DISPOSITION";
export const DISPOSITION_STATUSES=Object.freeze([
  "reviewed-for-archival","follow-up-required","evidence-rejected",
]);
export const DISPOSITION_REASONS=Object.freeze([
  "independent-host-source-not-established",
  "guest-identity-not-cryptographically-proven",
  "systemd-watchdog-proof-needs-review",
  "image-origin-not-independently-established",
  "source-timestamp-reconciliation-needed",
  "human-log-inspection-incomplete",
  "other-documented-in-private-case",
]);
const hash=v=>createHash("sha256").update(v).digest("hex");
const json=v=>Buffer.from(JSON.stringify(v),"utf8");
function exact(v,fields){
  return v!==null&&typeof v==="object"&&!Array.isArray(v)&&
    Object.keys(v).sort().join("|")===fields.slice().sort().join("|");
}
function same(a,b){
  return typeof a==="string"&&SHA.test(a)&&
    typeof b==="string"&&SHA.test(b)&&
    timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
function fingerprint(k){
  const key=typeof k==="string"||Buffer.isBuffer(k)?
    createPublicKey(k):k.type==="public"?k:createPublicKey(k);
  if(key.asymmetricKeyType!=="ed25519")
    throw Error("Review disposition requires Ed25519");
  return hash(key.export({type:"spki",format:"der"}));
}
function date(iso){
  if(typeof iso!=="string"||!TIME.test(iso)||
     !Number.isFinite(Date.parse(iso))||
     new Date(iso).toISOString()!==iso)
    throw Error("Invalid signed disposition date");
  return Date.parse(iso);
}
function validateStatement(s,context){
  if(!exact(s,KEYS)||s.schemaVersion!==1||
     s.classification!=="reviewer-file-disposition-offline-only"||
     !DISPOSITION_STATUSES.includes(s.decision)||
     !Array.isArray(s.reasons)||
     s.reasons.length>DISPOSITION_REASONS.length||
     s.reasons.some(r=>!DISPOSITION_REASONS.includes(r))||
     new Set(s.reasons).size!==s.reasons.length||
     s.reasons.join("|")!==s.reasons.slice().sort().join("|")||
     (s.decision==="reviewed-for-archival"?s.reasons.length!==0:
       s.reasons.length<1)||
     !exact(s.claims,CLAIMS)||
     s.claims.reviewerSignatureVerified!==true||
     s.claims.operatorSignatureVerified!==true||
     s.claims.humanDispositionRecorded!==true||
     s.claims.hardwareAttested!==false||
     s.claims.independentHostEvidenceVerified!==false||
     s.claims.publicLabsEnabled!==false||
     s.claims.productionReady!==false)
    throw Error("Untrusted review disposition schema or unauthorized claim");
  const when=date(s.decidedAt),reviewed=date(context.reviewedAt);
  if(when<reviewed||when-reviewed>MAX_AGE)
    throw Error("Disposition must follow the signed reviewer observation");
  if(s.sessionId!==context.sessionId||
     s.mode!==context.mode ||
     !same(s.operatorReceiptSha256,context.operatorReceiptSha256)||
     !same(s.reviewReceiptSha256,context.reviewReceiptSha256)||
     !same(s.operatorSignerFingerprint,context.operatorFingerprint)||
     !same(s.reviewerSignerFingerprint,context.reviewerFingerprint))
    throw Error("Disposition does not match the independently pinned review case");
}
function checkedContext({
  reviewReport,operatorReport,operatorPublicPem,operatorFingerprint,
  reviewerPublicPem,reviewerFingerprint,artifacts,
}){
  const review=verifyIndependentReview({
    report:reviewReport,operatorReport,operatorPublicPem,
    operatorFingerprint,reviewerPublicPem,reviewerFingerprint,artifacts,
  });
  if(review.operatorSignatureVerified!==true||
     review.reviewerSignatureVerified!==true||
     review.secondSignerDistinct!==true||
     review.productionReady!==false)
    throw Error("Disposition requires a fully verified offline file-review signature");
  if(!same(fingerprint(reviewerPublicPem),reviewerFingerprint)||
     same(operatorFingerprint,reviewerFingerprint))
    throw Error("Disposition requires an independently pinned reviewer identity");
  return {
    sessionId:review.sessionId,mode:review.mode,
    reviewedAt:reviewReport.statement.reviewedAt,
    operatorReceiptSha256:hash(json(operatorReport)),
    reviewReceiptSha256:hash(json(reviewReport)),
    operatorFingerprint,reviewerFingerprint,
  };
}
/**
 * This signature is a human-supplied assessment category, NOT a verification
 * of source authenticity or a production approval.
 */
export function createSignedReviewDisposition({
  reviewReport,operatorReport,operatorPublicPem,operatorFingerprint,
  reviewerPublicPem,reviewerPrivatePem,reviewerFingerprint,artifacts,
  decision,reasons=[],decidedAt=new Date().toISOString(),
  acknowledgment,
}={}){
  if(acknowledgment!==DISPOSITION_ACK)
    throw Error("A separate manual reviewer disposition approval is mandatory");
  const context=checkedContext({reviewReport,operatorReport,operatorPublicPem,
    operatorFingerprint,reviewerPublicPem,reviewerFingerprint,artifacts});
  const key=createPrivateKey(reviewerPrivatePem);
  if(key.asymmetricKeyType!=="ed25519"||
     !same(fingerprint(key),reviewerFingerprint))
    throw Error("Review disposition signing key is not pinned");
  const statement={
    schemaVersion:1,classification:"reviewer-file-disposition-offline-only",
    sessionId:context.sessionId,mode:context.mode,decidedAt,
    decision,reasons,
    operatorReceiptSha256:context.operatorReceiptSha256,
    reviewReceiptSha256:context.reviewReceiptSha256,
    operatorSignerFingerprint:operatorFingerprint,
    reviewerSignerFingerprint:reviewerFingerprint,
    claims:{
      reviewerSignatureVerified:true,operatorSignatureVerified:true,
      humanDispositionRecorded:true,hardwareAttested:false,
      independentHostEvidenceVerified:false,publicLabsEnabled:false,
      productionReady:false,
    },
  };
  validateStatement(statement,context);
  const report={
    statement,
    signature:sign(null,json(statement),key).toString("base64url"),
  };
  verifySignedReviewDisposition({
    report,reviewReport,operatorReport,operatorPublicPem,
    operatorFingerprint,reviewerPublicPem,reviewerFingerprint,artifacts,
  });
  return Object.freeze(report);
}
export function verifySignedReviewDisposition({
  report,reviewReport,operatorReport,operatorPublicPem,
  operatorFingerprint,reviewerPublicPem,reviewerFingerprint,artifacts,
}={}){
  if(!exact(report,OUTER)||
     typeof report.signature!=="string"||
     !SIGNATURE.test(report.signature))
    throw Error("Untrusted or malformed signed review disposition");
  const context=checkedContext({reviewReport,operatorReport,operatorPublicPem,
    operatorFingerprint,reviewerPublicPem,reviewerFingerprint,artifacts});
  validateStatement(report.statement,context);
  const signature=Buffer.from(report.signature,"base64url");
  if(signature.length!==64||
     !verify(null,json(report.statement),createPublicKey(reviewerPublicPem),
       signature))
    throw Error("Review disposition signature did not verify");
  return Object.freeze({
    sessionId:context.sessionId,mode:context.mode,
    decision:report.statement.decision,
    reasons:[...report.statement.reasons],
    operatorSignatureVerified:true,reviewerSignatureVerified:true,
    reviewerDispositionSignatureVerified:true,
    boundToExactReviewedFiles:true,
    independentHostEvidenceVerified:false,
    physicalHostAttested:false,publicLabsEnabled:false,
    productionReady:false,
  });
}
