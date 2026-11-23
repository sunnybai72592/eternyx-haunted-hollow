/**
 * Deterministic, private offline case checkpoint.
 * A SHA-256 is NOT a signature, immutable external storage or hardware proof.
 * The caller MUST first validate the three Ed25519 evidence signatures,
 * reviewer metadata, import journal and independently pinned public keys.
 */
import {createHash,timingSafeEqual} from "node:crypto";
import {validSessionId} from "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";

export const CASE_CHECKPOINT_FILE="case-checkpoint.json";
export const CASE_CHECKPOINT_ACK="I_APPROVE_OFFLINE_CASE_CHECKPOINT";
const SHA=/^[a-f0-9]{64}$/;
const MAX_DOC=8192;
const BASE_FILES=[
  "operator-report.json","operator-public.pem","review-verdict.json",
  "review-disposition.json","reviewer-public.pem",
  "host-preflight.json","image-provenance.json",
  "supervisor-journal.txt","cgroup-death.txt",
];
const HEAD=["schemaVersion","classification","sessionId","mode",
  "decision","reasons","operatorSignerFingerprint",
  "reviewerSignerFingerprint","fileDigests","trustLimits"];
const ENTRY=["name","sha256","bytes"];
const TRUST=["externalPinRequiredForRollbackDetection",
  "independentSourceAuthenticityVerified","physicalHostAttested",
  "publicLabsEnabled","productionReady"];
function exact(x,fields){
  return x!==null&&typeof x==="object"&&!Array.isArray(x)&&
    Object.keys(x).sort().join("|")===fields.slice().sort().join("|");
}
const hash=data=>createHash("sha256").update(data).digest("hex");
function same(a,b){
  return typeof a==="string"&&SHA.test(a)&&typeof b==="string"&&SHA.test(b)&&
    timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
export function checkpointFilenames(mode){
  if(!["guest-vsock","watchdog-900","guest-and-watchdog"].includes(mode))
    throw Error("Unsupported offline case evidence mode");
  return Object.freeze([...BASE_FILES,
    ...(mode.includes("guest")?["guest-challenge.txt"]:[]),
    ...(mode.includes("watchdog")?["timeout-result.txt"]:[]),
  ]);
}
function checkStatement(d){
  if(!exact(d,HEAD)||d.schemaVersion!==1||
    d.classification!=="offline-case-checkpoint-sha256-not-attestation"||
    !validSessionId(d.sessionId)||
    !["reviewed-for-archival","follow-up-required","evidence-rejected"].includes(d.decision)||
    !Array.isArray(d.reasons)||!d.reasons.every(x=>typeof x==="string"&&
      /^[a-z-]{3,80}$/.test(x))||
    (d.decision==="reviewed-for-archival"?d.reasons.length!==0:
      d.reasons.length<1)||
    d.reasons.length>7||new Set(d.reasons).size!==d.reasons.length||
    d.reasons.join("|")!==d.reasons.slice().sort().join("|")||
    !SHA.test(d.operatorSignerFingerprint)||
    !SHA.test(d.reviewerSignerFingerprint)||
    same(d.operatorSignerFingerprint,d.reviewerSignerFingerprint)||
    !exact(d.trustLimits,TRUST)||
    d.trustLimits.externalPinRequiredForRollbackDetection!==true||
    Object.entries(d.trustLimits).some(([k,v])=>
      k!=="externalPinRequiredForRollbackDetection" && v!==false)||
    !Array.isArray(d.fileDigests))
    throw Error("Untrusted offline case checkpoint fields");
  const names=checkpointFilenames(d.mode);
  if(d.fileDigests.length!==names.length||
    d.fileDigests.some((x,i)=>!exact(x,ENTRY)||x.name!==names[i]||
      !SHA.test(x.sha256)||!Number.isSafeInteger(x.bytes)||
      x.bytes<1||x.bytes>128*1024))
    throw Error("Missing, oversized, reordered or unexpected case file digest");
  return true;
}
export function checkpointBytes(doc){
  checkStatement(doc);
  const raw=Buffer.from(JSON.stringify(doc)+"\n","utf8");
  if(raw.length>MAX_DOC)throw Error("Oversized case checkpoint");
  return raw;
}
/**
 * Digest a fully verified set of fixed, private file bytes. This function
 * doesn't verify signatures: the reviewer file-backed wrapper does so before
 * supplying the verified status and these buffers.
 */
export function buildCaseCheckpoint({
  verifiedDisposition,operatorFingerprint,reviewerFingerprint,files,
}={}){
  if(!verifiedDisposition||
    verifiedDisposition.operatorSignatureVerified!==true||
    verifiedDisposition.reviewerSignatureVerified!==true||
    verifiedDisposition.reviewerDispositionSignatureVerified!==true||
    verifiedDisposition.productionReady!==false||
    verifiedDisposition.publicLabsEnabled!==false||
    verifiedDisposition.physicalHostAttested!==false||
    verifiedDisposition.independentHostEvidenceVerified!==false||
    same(operatorFingerprint,reviewerFingerprint))
    throw Error("Signed review must be externally verified before checkpointing");
  const names=checkpointFilenames(verifiedDisposition.mode);
  if(!files||typeof files!=="object"||Array.isArray(files)||
     Object.keys(files).sort().join("|")!==names.slice().sort().join("|"))
    throw Error("Incomplete exact offline checkpoint source set");
  const fileDigests=names.map(name=>{
    const raw=files[name];
    if(!Buffer.isBuffer(raw)||raw.length<1||raw.length>128*1024)
      throw Error("Invalid bounded checkpoint source bytes");
    return {name,sha256:hash(raw),bytes:raw.length};
  });
  const doc={
    schemaVersion:1,classification:"offline-case-checkpoint-sha256-not-attestation",
    sessionId:verifiedDisposition.sessionId,
    mode:verifiedDisposition.mode,
    decision:verifiedDisposition.decision,
    reasons:[...verifiedDisposition.reasons],
    operatorSignerFingerprint:operatorFingerprint,
    reviewerSignerFingerprint:reviewerFingerprint,
    fileDigests,
    trustLimits:{
      externalPinRequiredForRollbackDetection:true,
      independentSourceAuthenticityVerified:false,
      physicalHostAttested:false,
      publicLabsEnabled:false,productionReady:false,
    },
  };
  const bytes=checkpointBytes(doc);
  return Object.freeze({doc,bytes,checkpointSha256:hash(bytes)});
}
/**
 * Externally pinned SHA is required to detect swapping/rollback of both the
 * checkpoint and its source files. The SHA must be recorded independently.
 */
export function verifyCaseCheckpoint({
  savedBytes,recomputed,externallyPinnedSha256,
}={}){
  if(!Buffer.isBuffer(savedBytes)||savedBytes.length<1||
     savedBytes.length>MAX_DOC||!recomputed||
     !Buffer.isBuffer(recomputed.bytes)||!SHA.test(externallyPinnedSha256??""))
    throw Error("Missing independently recorded case checkpoint SHA-256");
  const doc=JSON.parse(savedBytes.toString("utf8"));
  if(!savedBytes.equals(checkpointBytes(doc))||
     !savedBytes.equals(recomputed.bytes)||
     !same(hash(savedBytes),externallyPinnedSha256))
    throw Error("Offline case checkpoint mismatch or rollback detected");
  return Object.freeze({
    sessionId:recomputed.doc.sessionId,mode:recomputed.doc.mode,
    decision:recomputed.doc.decision,
    reasons:[...recomputed.doc.reasons],
    checkpointSha256:hash(savedBytes),
    sourceHashesMatchSealedCheckpoint:true,
    externalChecksumMatched:true,
    privateKeyUsed:false,
    independentSourceAuthenticityVerified:false,
    physicalHostAttested:false,
    publicLabsEnabled:false,productionReady:false,
  });
}
