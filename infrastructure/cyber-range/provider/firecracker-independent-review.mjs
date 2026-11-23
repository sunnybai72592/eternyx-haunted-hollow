/**
 * ETERNYX Labs: strictly offline second-person review of operator evidence.
 *
 * A reviewer signs that specific, local files were examined and hashed.
 * This is NOT TPM quote verification, independent host measurement, proof of
 * artifact authenticity, or permission to enable customer-facing labs.
 *
 * Does not launch guests, install images, open networks, or contact cloud APIs.
 */
import {
  createHash,createPrivateKey,createPublicKey,sign,verify,timingSafeEqual,
} from "node:crypto";
import {constants} from "node:fs";
import {lstat,open,realpath} from "node:fs/promises";
import {join,resolve} from "node:path";
import {validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import {verifySignedOperatorEvidence} from
  "./firecracker-operator-evidence.mjs";
import {assertNoUnfinishedHandoff} from
  "./firecracker-handoff-import-journal.mjs";
import {auditOperatorEvidenceConsistency} from
  "./firecracker-evidence-consistency.mjs";
import {
  createSignedReviewDisposition,verifySignedReviewDisposition,
} from "./firecracker-review-disposition.mjs";
import {
  CASE_CHECKPOINT_FILE,CASE_CHECKPOINT_ACK,buildCaseCheckpoint,
  verifyCaseCheckpoint,
} from "./firecracker-review-checkpoint.mjs";

export const REVIEW_CASE_BASE="/var/lib/eternyx-reviewer/cases";
export const REVIEWER_PRIVATE_KEY="/etc/eternyx-reviewer/reviewer-ed25519-private.pem";
export const REVIEWER_PUBLIC_KEY="/etc/eternyx-reviewer/reviewer-ed25519-public.pem";
const SHA=/^[a-f0-9]{64}$/;
const ACK="I_REVIEWED_INDEPENDENT_SOURCE_FILES";
const MAX_ARTIFACT=128*1024;
const MAX_RECEIPT=8192;
const MAX_KEY=8192;
const BASE_FILES=Object.freeze([
  "host-preflight.json","image-provenance.json",
  "supervisor-journal.txt","cgroup-death.txt",
]);
const GUEST_FILE="guest-challenge.txt";
const EXPIRY_FILE="timeout-result.txt";
const PKT_KEYS=["schemaVersion","classification","sessionId","mode",
  "reviewedAt","operatorReceiptSha256","operatorSignerFingerprint",
  "reviewerSignerFingerprint","artifactDigests","claims"];
const REPORT_KEYS=["statement","reviewerSignature"];
const CLAIM_KEYS=["operatorSignatureVerified","sourceFilesHashed",
  "secondSignerDistinct","guestServiceAttestationIndependentlyVerified",
  "systemdExpiryIndependentlyVerified","hostMeasurementVerified",
  "publicLabsEnabled","productionReady"];
const META_KEYS=["name","sha256","bytes"];
function exact(value,keys){
  return value!==null && typeof value==="object"&&!Array.isArray(value) &&
    Object.keys(value).sort().join("\x00")===keys.slice().sort().join("\x00");
}
const hash=value=>createHash("sha256").update(value).digest("hex");
const jsonBytes=value=>Buffer.from(JSON.stringify(value),"utf8");
function sameSha(a,b){
  return typeof a==="string"&&SHA.test(a)&&typeof b==="string"&&SHA.test(b)&&
    timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
export function requiredReviewArtifacts(mode){
  if(!["guest-vsock","watchdog-900","guest-and-watchdog"].includes(mode))
    throw Error("Unsupported offline review mode");
  return Object.freeze([
    ...BASE_FILES,
    ...(mode.includes("guest")?[GUEST_FILE]:[]),
    ...(mode.includes("watchdog")?[EXPIRY_FILE]:[]),
  ]);
}
function fingerprint(key){
  const k=typeof key==="string"||Buffer.isBuffer(key)?
    createPublicKey(key):key.type==="public"?key:createPublicKey(key);
  if(k.asymmetricKeyType!=="ed25519")
    throw Error("Only Ed25519 reviewer identity is accepted");
  return hash(k.export({format:"der",type:"spki"}));
}
function validateOperator(operatorReport,operatorPublicPem,operatorFingerprint){
  const status=verifySignedOperatorEvidence(operatorReport,{
    publicKeyPem:operatorPublicPem,
    trustedPublicFingerprint:operatorFingerprint,
  });
  if(status.signatureVerified!==true ||status.productionReady!==false ||
     status.operatorSelfReported!==true)
    throw Error("Untrusted operator-signed offline case");
  return status;
}
function manifestFor(mode,artifacts){
  const required=requiredReviewArtifacts(mode);
  if(!artifacts ||typeof artifacts!=="object"||Array.isArray(artifacts) ||
     Object.keys(artifacts).sort().join("|")!==required.slice().sort().join("|"))
    throw Error("Missing or unexpected independently collected source files");
  return required.map(name=>{
    const raw=artifacts[name];
    if(!Buffer.isBuffer(raw)||raw.length<1||raw.length>MAX_ARTIFACT)
      throw Error("Untrusted review source length or binary content");
    return {name,sha256:hash(raw),bytes:raw.length};
  });
}
function checkStatement(s){
  if(!exact(s,PKT_KEYS)||s.schemaVersion!==1 ||
     s.classification!=="independent-reviewer-file-endorsement"||
     !validSessionId(s.sessionId)||!SHA.test(s.operatorReceiptSha256)||
     !SHA.test(s.operatorSignerFingerprint)||
     !SHA.test(s.reviewerSignerFingerprint)||
     !exact(s.claims,CLAIM_KEYS)||
     s.claims.operatorSignatureVerified!==true||
     s.claims.sourceFilesHashed!==true||
     s.claims.secondSignerDistinct!==true||
     s.claims.guestServiceAttestationIndependentlyVerified!==false||
     s.claims.systemdExpiryIndependentlyVerified!==false||
     s.claims.hostMeasurementVerified!==false||
     s.claims.publicLabsEnabled!==false||
     s.claims.productionReady!==false ||
     typeof s.reviewedAt!=="string" ||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s.reviewedAt) ||
     Number.isNaN(Date.parse(s.reviewedAt))||
     new Date(s.reviewedAt).toISOString()!==s.reviewedAt ||
     !Array.isArray(s.artifactDigests))
    throw Error("Invalid offline reviewer endorsement fields");
  const names=requiredReviewArtifacts(s.mode);
  if(s.artifactDigests.length!==names.length||
     s.artifactDigests.some((a,i)=>
       !exact(a,META_KEYS)||a.name!==names[i]||
       !SHA.test(a.sha256)||
       !Number.isSafeInteger(a.bytes)||a.bytes<1||a.bytes>MAX_ARTIFACT))
    throw Error("Incomplete or extra independent review source");
  if(s.operatorSignerFingerprint===s.reviewerSignerFingerprint)
    throw Error("Operator cannot endorse own hardware claims as independent reviewer");
  return true;
}
function validateTime(operatorReport,reviewedAt){
  const t=Date.parse(reviewedAt);
  const origin=Date.parse(operatorReport.payload.capturedAt);
  if(!Number.isFinite(t)||!Number.isFinite(origin)||
     t<origin ||t-origin>30*24*60*60*1000)
    throw Error("Review timestamp does not follow the signed source evidence");
}
function validateRelation(statement,operatorReport,operatorStatus,artifacts,
  operatorFingerprint,reviewerFingerprint){
  checkStatement(statement);
  validateTime(operatorReport,statement.reviewedAt);
  if(statement.sessionId!==operatorStatus.sessionId ||
     statement.mode!==operatorStatus.mode ||
     !sameSha(statement.operatorReceiptSha256,hash(jsonBytes(operatorReport)))||
     !sameSha(statement.operatorSignerFingerprint,operatorFingerprint)||
     !sameSha(statement.reviewerSignerFingerprint,reviewerFingerprint))
    throw Error("Reviewer endorsement refers to different operator evidence");
  const current=manifestFor(statement.mode,artifacts);
  if(current.length!==statement.artifactDigests.length||
     current.some((e,i)=>e.name!==statement.artifactDigests[i].name ||
       e.bytes!==statement.artifactDigests[i].bytes ||
       !sameSha(e.sha256,statement.artifactDigests[i].sha256)))
    throw Error("Reviewed host evidence differs from reviewer-signed digests");
}

/**
 * Human witness must explicitly confirm they independently obtained and
 * inspected the source files. This acknowledgment is a procedural gate,
 * not a cryptographic statement about the physical host's integrity.
 */
export function createIndependentReview({
  operatorReport,operatorPublicPem,operatorFingerprint,
  reviewerPrivatePem,reviewerPublicPem,reviewerFingerprint,
  artifacts,reviewerAck,reviewedAt=new Date().toISOString(),
}={}){
  if(reviewerAck!==ACK)
    throw Error("Independent operator evidence review requires manual acknowledgment");
  const status=validateOperator(operatorReport,operatorPublicPem,operatorFingerprint);
  if(!sameSha(fingerprint(operatorPublicPem),operatorFingerprint) ||
     !sameSha(fingerprint(reviewerPublicPem),reviewerFingerprint) ||
     !SHA.test(reviewerFingerprint??"") ||
     sameSha(operatorFingerprint,reviewerFingerprint))
    throw Error("Reviewer must have a distinct externally pinned Ed25519 key");
  const privateKey=createPrivateKey(reviewerPrivatePem);
  if(privateKey.asymmetricKeyType!=="ed25519"||
     !sameSha(fingerprint(privateKey),reviewerFingerprint))
    throw Error("Reviewer signing key does not match pinned public fingerprint");
  const artifactDigests=manifestFor(status.mode,artifacts);
  const statement={
    schemaVersion:1,classification:"independent-reviewer-file-endorsement",
    sessionId:status.sessionId,mode:status.mode,reviewedAt,
    operatorReceiptSha256:hash(jsonBytes(operatorReport)),
    operatorSignerFingerprint:operatorFingerprint,
    reviewerSignerFingerprint:reviewerFingerprint,
    artifactDigests,
    claims:{
      operatorSignatureVerified:true,sourceFilesHashed:true,
      secondSignerDistinct:true,
      guestServiceAttestationIndependentlyVerified:false,
      systemdExpiryIndependentlyVerified:false,
      hostMeasurementVerified:false,publicLabsEnabled:false,
      productionReady:false,
    },
  };
  validateRelation(statement,operatorReport,status,artifacts,
    operatorFingerprint,reviewerFingerprint);
  const signature=sign(null,jsonBytes(statement),privateKey).toString("base64url");
  const report={statement,reviewerSignature:signature};
  verifyIndependentReview({
    report,operatorReport,operatorPublicPem,operatorFingerprint,
    reviewerPublicPem,reviewerFingerprint,artifacts,
  });
  return Object.freeze(report);
}

/** Fully offline verification, including comparison to original raw files. */
export function verifyIndependentReview({
  report,operatorReport,operatorPublicPem,operatorFingerprint,
  reviewerPublicPem,reviewerFingerprint,artifacts,
}={}){
  if(!exact(report,REPORT_KEYS)||
     typeof report.reviewerSignature!=="string" ||
     !/^[A-Za-z0-9_-]{86}$/.test(report.reviewerSignature))
    throw Error("Invalid second-person review signature format");
  const status=validateOperator(operatorReport,operatorPublicPem,operatorFingerprint);
  if(!sameSha(fingerprint(reviewerPublicPem),reviewerFingerprint) ||
     sameSha(operatorFingerprint,reviewerFingerprint))
    throw Error("Reviewer identity has not been independently pinned");
  validateRelation(report.statement,operatorReport,status,artifacts,
    operatorFingerprint,reviewerFingerprint);
  const sig=Buffer.from(report.reviewerSignature,"base64url");
  if(sig.length!==64 || !verify(null,jsonBytes(report.statement),
    createPublicKey(reviewerPublicPem),sig))
    throw Error("Independent reviewer signature invalid or modified");
  return Object.freeze({
    sessionId:status.sessionId,mode:status.mode,
    operatorSignatureVerified:true,reviewerSignatureVerified:true,
    secondSignerDistinct:true,sourceFileDigestsVerified:true,
    humanReviewEndorsed:true,
    physicalHostAttested:false,independentSourceAuthenticityVerified:false,
    productionReady:false,publicLabsEnabled:false,
  });
}
function sessionCasePath(sessionId,caseBase){
  if(!validSessionId(sessionId)||caseBase!==REVIEW_CASE_BASE)
    throw Error("Reviewer must use fixed offline case storage");
  return join(caseBase,sessionId);
}
async function trustedDir(dir,owner){
  if(typeof dir!=="string"||resolve(dir)!==dir||dir==="/")
    throw Error("Invalid review case directory");
  const [stat,real]=await Promise.all([lstat(dir),realpath(dir)]);
  if(real!==dir||!stat.isDirectory()||stat.uid!==owner||
     (stat.mode&0o077)!==0)
    throw Error("Offline reviewer directory must be private and owner-controlled");
}
async function safeRead(file,owner,max,kind="artifact"){
  const info=await lstat(file);
  if(!info.isFile()||info.uid!==owner||info.nlink!==1||
     (info.mode&0o077)!==0||info.size<1||info.size>max)
    throw Error("Unsafe offline review "+kind+" file");
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await handle.stat();
    if(before.dev!==info.dev||before.ino!==info.ino||before.size!==info.size)
      throw Error("Offline review file changed while opening");
    const raw=await handle.readFile();
    const after=await handle.stat();
    if(after.dev!==before.dev||after.ino!==before.ino||
       after.size!==before.size||after.mtimeMs!==before.mtimeMs||
       after.ctimeMs!==before.ctimeMs||raw.length!==before.size)
      throw Error("Offline review file changed while reading");
    return raw;
  }finally{await handle.close();}
}
async function loadCase(sessionId,{caseBase=REVIEW_CASE_BASE,owner=0}={}){
  const folder=sessionCasePath(sessionId,caseBase);
  await trustedDir(caseBase,owner);
  await trustedDir(folder,owner);
  // An interrupted transfer cannot be endorsed by a second reviewer.
  // Legacy manually staged cases without an import journal remain eligible
  // for explicit human review; they cannot claim handoff verification.
  await assertNoUnfinishedHandoff(folder,owner);
  const [operatorReport,operatorPublicPem]=await Promise.all([
    safeRead(join(folder,"operator-report.json"),owner,MAX_RECEIPT),
    safeRead(join(folder,"operator-public.pem"),owner,MAX_KEY,"operator public key"),
  ]);
  const parsed=JSON.parse(operatorReport.toString("utf8"));
  const names=requiredReviewArtifacts(parsed?.payload?.mode);
  const entries=await Promise.all(names.map(async name=>
    [name,await safeRead(join(folder,name),owner,MAX_ARTIFACT)]));
  return {folder,operatorReport:parsed,
    operatorPublicPem:operatorPublicPem.toString("utf8"),
    artifacts:Object.fromEntries(entries)};
}
async function reviewerKeys({owner=0,privateRequired=false,
  publicPath=REVIEWER_PUBLIC_KEY,privatePath=REVIEWER_PRIVATE_KEY}={}){
  if(publicPath!==REVIEWER_PUBLIC_KEY||privatePath!==REVIEWER_PRIVATE_KEY)
    throw Error("Reviewer signing key paths are fixed and not user-controlled");
  const publicPem=(await safeRead(publicPath,owner,MAX_KEY,
    "reviewer public key")).toString("utf8");
  const privatePem=privateRequired?(await safeRead(privatePath,owner,MAX_KEY,
    "reviewer private key")).toString("utf8"):undefined;
  return {reviewerPublicPem:publicPem,reviewerPrivatePem:privatePem};
}
/** Strict production paths. No user-selected paths or network access. */
export async function inspectIndependentReviewCase({
  sessionId,operatorFingerprint,reviewerFingerprint,
  caseBase=REVIEW_CASE_BASE,owner=0,
}={}){
  const source=await loadCase(sessionId,{caseBase,owner});
  const consistency=auditOperatorEvidenceConsistency({
    ...source,operatorFingerprint,
  });
  const keys=await reviewerKeys({owner});
  const status=validateOperator(source.operatorReport,
    source.operatorPublicPem,operatorFingerprint);
  if(status.sessionId!==sessionId||
     !sameSha(fingerprint(keys.reviewerPublicPem),reviewerFingerprint)||
     sameSha(operatorFingerprint,reviewerFingerprint))
    throw Error("Independent reviewer case identities are not pinned");
  const files=manifestFor(status.mode,source.artifacts);
  return Object.freeze({sessionId,mode:status.mode,
    operatorSignatureVerified:true,requiredSources:files.length,
    sourceHashes:files,reviewerKeyPinned:true,
    metadataConsistencyVerified:consistency.metadataConsistencyVerified,
    readyForHumanReview:true,productionReady:false});
}
export async function signIndependentReviewCase({
  sessionId,operatorFingerprint,reviewerFingerprint,reviewerAck,
  caseBase=REVIEW_CASE_BASE,owner=0,
}={}){
  const source=await loadCase(sessionId,{caseBase,owner});
  auditOperatorEvidenceConsistency({...source,operatorFingerprint});
  const keys=await reviewerKeys({owner,privateRequired:true});
  const report=createIndependentReview({
    ...source,...keys,operatorFingerprint,reviewerFingerprint,reviewerAck,
  });
  const path=join(source.folder,"review-verdict.json");
  const data=JSON.stringify(report)+"\n";
  if(Buffer.byteLength(data)>MAX_RECEIPT)
    throw Error("Oversized offline reviewer endorsement");
  const file=await open(path,constants.O_WRONLY|constants.O_CREAT|
    constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{
    const before=await file.stat();
    if(!before.isFile()||before.uid!==owner||before.nlink!==1||
       (before.mode&0o077)!==0||before.size!==0)
      throw Error("Unsafe offline reviewer verdict file");
    await file.writeFile(data,"utf8");
    await file.sync();
    if((await file.stat()).size!==Buffer.byteLength(data))
      throw Error("Incomplete offline reviewer verdict");
  }finally{await file.close();}
  const directory=await open(source.folder,
    constants.O_RDONLY|constants.O_DIRECTORY);
  try{await directory.sync();}finally{await directory.close();}
  return Object.freeze({sessionId,reviewerVerdictRecorded:true,
    productionReady:false});
}
export async function verifyIndependentReviewCase({
  sessionId,operatorFingerprint,reviewerFingerprint,
  caseBase=REVIEW_CASE_BASE,owner=0,
}={}){
  const source=await loadCase(sessionId,{caseBase,owner});
  auditOperatorEvidenceConsistency({...source,operatorFingerprint});
  const keys=await reviewerKeys({owner});
  const verdict=JSON.parse((await safeRead(join(source.folder,
    "review-verdict.json"),owner,MAX_RECEIPT)).toString("utf8"));
  return verifyIndependentReview({
    ...source,...keys,report:verdict,operatorFingerprint,reviewerFingerprint,
  });
}

/**
 * A read-only, no-key and no-VM consistency check, before human signature.
 * The supplied JSON is explicitly operator-collected, not attested proof.
 */
export async function auditIndependentReviewConsistency({
  sessionId,operatorFingerprint,caseBase=REVIEW_CASE_BASE,owner=0,
}={}){
  const source=await loadCase(sessionId,{caseBase,owner});
  const result=auditOperatorEvidenceConsistency({
    ...source,operatorFingerprint,
  });
  if(result.sessionId!==sessionId)
    throw Error("Offline consistency audit session does not match case");
  return result;
}


/**
 * Record a separate, explicit human category after the existing signed file
 * review and structured metadata check. Never overwrites an earlier decision.
 */
export async function signIndependentReviewDisposition({
  sessionId,operatorFingerprint,reviewerFingerprint,decision,reasons,
  acknowledgment,caseBase=REVIEW_CASE_BASE,owner=0,
}={}){
  const source=await loadCase(sessionId,{caseBase,owner});
  auditOperatorEvidenceConsistency({...source,operatorFingerprint});
  const keys=await reviewerKeys({owner,privateRequired:true});
  const reviewReport=JSON.parse((await safeRead(
    join(source.folder,"review-verdict.json"),owner,MAX_RECEIPT)).toString("utf8"));
  const report=createSignedReviewDisposition({
    ...source,...keys,reviewReport,operatorFingerprint,
    reviewerFingerprint,decision,reasons,acknowledgment,
  });
  const serialized=Buffer.from(JSON.stringify(report)+"\n","utf8");
  if(serialized.length>MAX_RECEIPT)
    throw Error("Offline reviewer disposition unexpectedly oversized");
  const file=await open(join(source.folder,"review-disposition.json"),
    constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|
    constants.O_NOFOLLOW,0o600);
  try{
    const created=await file.stat();
    if(!created.isFile()||created.uid!==owner||created.nlink!==1||
       (created.mode&0o077)!==0||created.size!==0)
      throw Error("Unsafe independently signed disposition file");
    await file.writeFile(serialized);
    await file.sync();
    if((await file.stat()).size!==serialized.length)
      throw Error("Incomplete disposition write");
  }finally{await file.close();}
  const folder=await open(source.folder,
    constants.O_RDONLY|constants.O_DIRECTORY);
  try{await folder.sync();}finally{await folder.close();}
  return Object.freeze({
    sessionId,decision,recordedOffline:true,productionReady:false,
    publicLabsEnabled:false,
  });
}

/** Fully read-only, independent key-pinned re-verification of both records. */
export async function verifyIndependentReviewDisposition({
  sessionId,operatorFingerprint,reviewerFingerprint,
  caseBase=REVIEW_CASE_BASE,owner=0,
}={}){
  const source=await loadCase(sessionId,{caseBase,owner});
  auditOperatorEvidenceConsistency({...source,operatorFingerprint});
  const keys=await reviewerKeys({owner});
  const [reviewBytes,dispositionBytes]=await Promise.all([
    safeRead(join(source.folder,"review-verdict.json"),owner,MAX_RECEIPT),
    safeRead(join(source.folder,"review-disposition.json"),owner,MAX_RECEIPT),
  ]);
  const status=verifySignedReviewDisposition({
    ...source,...keys,
    reviewReport:JSON.parse(reviewBytes.toString("utf8")),
    report:JSON.parse(dispositionBytes.toString("utf8")),
    operatorFingerprint,reviewerFingerprint,
  });
  if(status.sessionId!==sessionId)
    throw Error("Offline disposition belongs to an unrelated review case");
  return status;
}


/**
 * Re-verify signatures, latest structured metadata and private import journal
 * before hashing the raw files that comprise a complete local review case.
 */
async function loadedVerifiedCheckpoint({
  sessionId,operatorFingerprint,reviewerFingerprint,
  caseBase=REVIEW_CASE_BASE,owner=0,
}={}){
  const source=await loadCase(sessionId,{caseBase,owner});
  auditOperatorEvidenceConsistency({...source,operatorFingerprint});
  const keys=await reviewerKeys({owner});
  const [operatorRaw,reviewRaw,dispositionRaw]=await Promise.all([
    safeRead(join(source.folder,"operator-report.json"),owner,MAX_RECEIPT),
    safeRead(join(source.folder,"review-verdict.json"),owner,MAX_RECEIPT),
    safeRead(join(source.folder,"review-disposition.json"),owner,MAX_RECEIPT),
  ]);
  const operatorReport=JSON.parse(operatorRaw.toString("utf8"));
  if(JSON.stringify(operatorReport)!==JSON.stringify(source.operatorReport))
    throw Error("Signed operator source changed during offline checkpoint check");
  const reviewReport=JSON.parse(reviewRaw.toString("utf8"));
  const report=JSON.parse(dispositionRaw.toString("utf8"));
  const verifiedDisposition=verifySignedReviewDisposition({
    ...source,...keys,operatorReport,reviewReport,report,
    operatorFingerprint,reviewerFingerprint,
  });
  if(verifiedDisposition.sessionId!==sessionId)
    throw Error("Foreign disposition cannot be checkpointed");
  const files={
    "operator-report.json":operatorRaw,
    "operator-public.pem":Buffer.from(source.operatorPublicPem,"utf8"),
    "review-verdict.json":reviewRaw,
    "review-disposition.json":dispositionRaw,
    "reviewer-public.pem":Buffer.from(keys.reviewerPublicPem,"utf8"),
    ...source.artifacts,
  };
  const checkpoint=buildCaseCheckpoint({
    verifiedDisposition,operatorFingerprint,reviewerFingerprint,files,
  });
  return {folder:source.folder,checkpoint};
}

/** Offline, read-only digest that MUST be pinned outside the case directory. */
export async function inspectIndependentCaseCheckpoint(options={}){
  const {checkpoint}=await loadedVerifiedCheckpoint(options);
  return Object.freeze({
    sessionId:checkpoint.doc.sessionId,mode:checkpoint.doc.mode,
    decision:checkpoint.doc.decision,
    checkpointSha256:checkpoint.checkpointSha256,
    hashedFiles:checkpoint.doc.fileDigests.length,
    signedDispositionReverified:true,
    externallyPinnedDigestMatched:false,
    checkpointSealed:false,
    physicalHostAttested:false,productionReady:false,publicLabsEnabled:false,
  });
}

/**
 * Human authorized one-write local checkpoint; the checksum MUST separately
 * be copied to a trusted external record to resist local file rollback.
 */
export async function sealIndependentCaseCheckpoint({
  acknowledgment,...options
}={}){
  if(acknowledgment!==CASE_CHECKPOINT_ACK)
    throw Error("Separate case checkpoint sealing acknowledgment is mandatory");
  const {folder,checkpoint}=await loadedVerifiedCheckpoint(options);
  const path=join(folder,CASE_CHECKPOINT_FILE);
  const file=await open(path,constants.O_WRONLY|constants.O_CREAT|
    constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{
    const initial=await file.stat();
    if(!initial.isFile()||initial.uid!==(options.owner??0)||
       initial.nlink!==1||(initial.mode&0o077)!==0||initial.size!==0)
      throw Error("Untrusted new private case checkpoint file");
    await file.writeFile(checkpoint.bytes);
    await file.sync();
    if((await file.stat()).size!==checkpoint.bytes.length)
      throw Error("Incomplete offline case checkpoint write");
  }finally{await file.close();}
  const directory=await open(folder,constants.O_RDONLY|constants.O_DIRECTORY);
  try{await directory.sync();}finally{await directory.close();}
  return Object.freeze({
    sessionId:checkpoint.doc.sessionId,
    checkpointSha256:checkpoint.checkpointSha256,
    privateCheckpointRecorded:true,
    externalPinStillRequired:true,
    physicalHostAttested:false,productionReady:false,publicLabsEnabled:false,
  });
}

/** No private key, no writes. Reject absent, stale or rolled-back sealed cases. */
export async function verifyIndependentCaseCheckpoint({
  externallyPinnedSha256,...options
}={}){
  const {folder,checkpoint}=await loadedVerifiedCheckpoint(options);
  const raw=await safeRead(join(folder,CASE_CHECKPOINT_FILE),
    options.owner??0,8192);
  return verifyCaseCheckpoint({
    savedBytes:raw,recomputed:checkpoint,
    externallyPinnedSha256,
  });
}
