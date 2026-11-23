/**
 * Offline, signed operator receipt transfer: ONLY the v2 signed receipt
 * and operator public PEM are copied. NO host logs, guest state, private keys,
 * public network, VM start, hosted runtime or independently sourced evidence.
 *
 * This envelope is operator self-report only. Transport SHA-256 MUST be
 * communicated independently of the transferred packet to detect substitution.
 */
import {createHash,timingSafeEqual,createPublicKey} from "node:crypto";
import {constants} from "node:fs";
import {lstat,open,realpath} from "node:fs/promises";
import {join,resolve} from "node:path";
import {validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import {
  verifySignedOperatorEvidence, PUBLIC_SIGNING_KEY,
} from "./firecracker-operator-evidence.mjs";
import {HARDWARE_EVIDENCE_DIR} from "./firecracker-hardware-evidence.mjs";
import {REVIEW_CASE_BASE} from "./firecracker-independent-review.mjs";
import {
  commitHandoffImport,auditHandoffImport,
} from "./firecracker-handoff-import-journal.mjs";

export const REVIEW_INBOX="/var/lib/eternyx-reviewer/inbox";
const SHA=/^[a-f0-9]{64}$/;
const MAX_ENVELOPE=16384;
const MAX_REPORT=8192;
const MAX_PEM=8192;
const KEYS=["schemaVersion","classification","sessionId","mode",
  "operatorSignerFingerprint","operatorReportSha256","operatorReport",
  "operatorPublicPem","claims"];
const CLAIMS=["operatorSelfReported","independentSourcesIncluded",
  "hardwareAttested","productionReady","publicLabsEnabled"];
function exact(obj,fields){
  return obj!==null&&typeof obj==="object"&&!Array.isArray(obj)&&
    Object.keys(obj).sort().join("|")===fields.slice().sort().join("|");
}
const digest=x=>createHash("sha256").update(x).digest("hex");
function sameSha(a,b){
  return typeof a==="string"&&SHA.test(a)&&typeof b==="string"&&SHA.test(b)&&
    timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
function requireSession(sessionId){
  if(!validSessionId(sessionId))throw Error("Invalid offline handoff session");
  return sessionId;
}
export function canonicalHandoffBytes(envelope){
  if(!exact(envelope,KEYS))throw Error("Malformed offline operator handoff");
  const bytes=Buffer.from(JSON.stringify(envelope)+"\n","utf8");
  if(bytes.length<1||bytes.length>MAX_ENVELOPE)
    throw Error("Offline operator handoff exceeds bounded size");
  return bytes;
}
function validatePublicOnly(pem){
  if(typeof pem!=="string"||Buffer.byteLength(pem)>MAX_PEM||
     !pem.startsWith("-----BEGIN PUBLIC KEY-----\n")||
     !pem.includes("\n-----END PUBLIC KEY-----")||
     pem.includes("PRIVATE KEY"))
    throw Error("Operator handoff only permits a public PEM");
  const publicKey=createPublicKey(pem);
  if(publicKey.asymmetricKeyType!=="ed25519")
    throw Error("Operator public PEM must be Ed25519");
  return digest(publicKey.export({type:"spki",format:"der"}));
}
/**
 * Does not sign or endorse. It packages an already signed v2 operator record.
 * An external fingerprint is mandatory, never accepted from the envelope.
 */
export function createOperatorHandoff({
  operatorReport,operatorPublicPem,trustedOperatorFingerprint,
}={}){
  const publicFingerprint=validatePublicOnly(operatorPublicPem);
  if(!sameSha(publicFingerprint,trustedOperatorFingerprint))
    throw Error("Unpinned operator signer identity");
  const verified=verifySignedOperatorEvidence(operatorReport,{
    publicKeyPem:operatorPublicPem,
    trustedPublicFingerprint:trustedOperatorFingerprint,
  });
  const envelope={
    schemaVersion:1,
    classification:"operator-signed-receipt-offline-transfer-only",
    sessionId:verified.sessionId,mode:verified.mode,
    operatorSignerFingerprint:trustedOperatorFingerprint,
    operatorReportSha256:digest(Buffer.from(
      JSON.stringify(operatorReport),"utf8")),
    operatorReport,operatorPublicPem,
    claims:{operatorSelfReported:true,independentSourcesIncluded:false,
      hardwareAttested:false,productionReady:false,publicLabsEnabled:false},
  };
  const bytes=canonicalHandoffBytes(envelope);
  return Object.freeze({
    envelope,transportSha256:digest(bytes),bytes,
  });
}
/** Verify receipt authenticity and independently pinned transfer checksum. */
export function verifyOperatorHandoff(envelope,{
  expectedSessionId,trustedOperatorFingerprint,expectedTransportSha256,
}={}){
  if(!exact(envelope,KEYS)||
     envelope.schemaVersion!==1||
     envelope.classification!=="operator-signed-receipt-offline-transfer-only"||
     !exact(envelope.claims,CLAIMS)||
     envelope.claims.operatorSelfReported!==true||
     Object.entries(envelope.claims).some(([k,v])=>
       k!=="operatorSelfReported" && v!==false)||
     !validSessionId(envelope.sessionId) ||
     (expectedSessionId!==undefined &&
       envelope.sessionId!==expectedSessionId) ||
     !sameSha(envelope.operatorSignerFingerprint,trustedOperatorFingerprint)||
     !SHA.test(envelope.operatorReportSha256??""))
    throw Error("Untrusted offline handoff metadata");
  if(!sameSha(validatePublicOnly(envelope.operatorPublicPem),
    trustedOperatorFingerprint))
    throw Error("Operator handoff public key substitution");
  const receipt=verifySignedOperatorEvidence(envelope.operatorReport,{
    publicKeyPem:envelope.operatorPublicPem,
    trustedPublicFingerprint:trustedOperatorFingerprint,
    expectedSessionId:envelope.sessionId,
  });
  if(receipt.mode!==envelope.mode||
     !sameSha(envelope.operatorReportSha256,digest(Buffer.from(
       JSON.stringify(envelope.operatorReport),"utf8"))))
    throw Error("Operator handoff receipt mismatch");
  const computed=digest(canonicalHandoffBytes(envelope));
  if(expectedTransportSha256!==undefined &&
     !sameSha(computed,expectedTransportSha256))
    throw Error("Offline handoff failed independently pinned transport digest");
  return Object.freeze({
    sessionId:envelope.sessionId,mode:receipt.mode,
    transportSha256:computed,
    operatorSignatureVerified:true,operatorKeyPinned:true,
    externalTransportDigestVerified:expectedTransportSha256!==undefined,
    independentSourcesIncluded:false,
    hardwareAttested:false,productionReady:false,publicLabsEnabled:false,
  });
}
function fixedDir(dir,expected){
  if(dir!==expected)throw Error("Unsafe operator handoff directory");
  return dir;
}
async function privateDir(dir,owner){
  if(typeof dir!=="string"||resolve(dir)!==dir||dir==="/")
    throw Error("Invalid private handoff storage");
  const [stat,real]=await Promise.all([lstat(dir),realpath(dir)]);
  if(!stat.isDirectory()||real!==dir||stat.uid!==owner||
     (stat.mode&0o077)!==0)
    throw Error("Offline handoff storage must be private and owner-controlled");
}
async function safeRead(file,{owner,max,publicPem=false}){
  const info=await lstat(file);
  if(!info.isFile()||info.uid!==owner||info.nlink!==1||
     (info.mode&(publicPem?0o022:0o077))!==0||
     info.size<1||info.size>max)
    throw Error("Untrusted signed operator handoff input");
  const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await fd.stat();
    if(before.dev!==info.dev||before.ino!==info.ino||
       before.size!==info.size)
      throw Error("Handoff input changed while opening");
    const data=await fd.readFile();
    const after=await fd.stat();
    if(after.dev!==before.dev||after.ino!==before.ino||
       after.size!==before.size||after.mtimeMs!==before.mtimeMs||
       after.ctimeMs!==before.ctimeMs||data.length!==before.size)
      throw Error("Handoff input modified during inspection");
    return data;
  }finally{await fd.close();}
}
async function writeOnce(file,bytes,owner){
  const fd=await open(file,constants.O_WRONLY|constants.O_CREAT|
    constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{
    const info=await fd.stat();
    if(!info.isFile()||info.uid!==owner||info.nlink!==1||
       (info.mode&0o077)!==0||info.size!==0)
      throw Error("Untrusted newly created operator handoff file");
    await fd.writeFile(bytes);
    await fd.sync();
    const done=await fd.stat();
    if(done.size!==bytes.length)
      throw Error("Incomplete operator handoff write");
  }finally{await fd.close();}
}
async function syncDir(dir){
  const fd=await open(dir,constants.O_RDONLY|constants.O_DIRECTORY);
  try{await fd.sync();}finally{await fd.close();}
}
function handoffFilename(sessionId){return requireSession(sessionId)+".handoff.json";}
function receiptFilename(sessionId){
  return requireSession(sessionId)+".v2-signed.json";
}
async function parseTransferBytes(bytes){
  if(bytes.length>MAX_ENVELOPE)throw Error("Oversized offline handoff");
  const envelope=JSON.parse(bytes.toString("utf8"));
  if(!canonicalHandoffBytes(envelope).equals(bytes))
    throw Error("Noncanonical or modified handoff bytes");
  return envelope;
}

/**
 * Manual operator export: reads signed receipt/public key, never the private
 * signing key. The root-only folder must exist; existing exports are immutable.
 * Overrides used only by isolated no-VM tests, never passed by the CLI.
 */
export async function exportOperatorHandoff({
  sessionId,trustedOperatorFingerprint,
  evidenceDir=HARDWARE_EVIDENCE_DIR,publicPath=PUBLIC_SIGNING_KEY,owner=0,
}={}){
  fixedDir(evidenceDir,HARDWARE_EVIDENCE_DIR);
  if(publicPath!==PUBLIC_SIGNING_KEY)
    throw Error("Operator public key path is fixed");
  await privateDir(evidenceDir,owner);
  const [receipt,pem]=await Promise.all([
    safeRead(join(evidenceDir,receiptFilename(sessionId)),{
      owner,max:MAX_REPORT,
    }),
    safeRead(publicPath,{owner,max:MAX_PEM,publicPem:true}),
  ]);
  const record=createOperatorHandoff({
    operatorReport:JSON.parse(receipt.toString("utf8")),
    operatorPublicPem:pem.toString("utf8"),
    trustedOperatorFingerprint,
  });
  if(record.envelope.sessionId!==sessionId)
    throw Error("Operator signed evidence session changed during export");
  await writeOnce(join(evidenceDir,handoffFilename(sessionId)),record.bytes,owner);
  await syncDir(evidenceDir);
  return Object.freeze({
    sessionId,transportSha256:record.transportSha256,
    operatorSignatureVerified:true,exportedOffline:true,
    independentSourcesIncluded:false,productionReady:false,
  });
}
async function inspectInbox({
  sessionId,trustedOperatorFingerprint,expectedTransportSha256,
  inboxDir=REVIEW_INBOX,owner=0,
}={}){
  fixedDir(inboxDir,REVIEW_INBOX);
  await privateDir(inboxDir,owner);
  if(!SHA.test(expectedTransportSha256??""))
    throw Error("Independent handoff transport digest is mandatory");
  const raw=await safeRead(join(inboxDir,handoffFilename(sessionId)),{
    owner,max:MAX_ENVELOPE,
  });
  const envelope=await parseTransferBytes(raw);
  const verification=verifyOperatorHandoff(envelope,{
    expectedSessionId:sessionId,trustedOperatorFingerprint,
    expectedTransportSha256,
  });
  return {envelope,verification};
}
/** Reviewer read-only inspection of previously transferred local file. */
export async function inspectOperatorHandoff(options={}){
  const {verification}=await inspectInbox(options);
  return verification;
}
/**
 * Reviewer import only creates two fixed private files. Host logs must be
 * acquired independently and are never inside this operator transfer packet.
 * Incomplete/crashed imports remain blocked, not overwritten automatically.
 */
async function runReviewerImport({
  sessionId,trustedOperatorFingerprint,expectedTransportSha256,
  caseDir=REVIEW_CASE_BASE,owner=0,resume=false,
}={}){
  fixedDir(caseDir,REVIEW_CASE_BASE);
  const {envelope,verification}=await inspectInbox({
    sessionId,trustedOperatorFingerprint,expectedTransportSha256,owner,
  });
  await privateDir(caseDir,owner);
  const folder=join(caseDir,requireSession(sessionId));
  await privateDir(folder,owner);
  const receiptBytes=Buffer.from(
    JSON.stringify(envelope.operatorReport)+"\n","utf8");
  const publicPemBytes=Buffer.from(envelope.operatorPublicPem,"utf8");
  const record=await commitHandoffImport({
    folder,owner,sessionId,operatorSignerFingerprint:trustedOperatorFingerprint,
    transportSha256:expectedTransportSha256,receiptBytes,publicPemBytes,resume,
  });
  return Object.freeze({
    sessionId,mode:verification.mode,importedOffline:true,
    ...(resume?{manuallyResumed:true}:{}),
    importedFiles:2,importJournalCommitted:record.verified,
    independentSourcesIncluded:false,humanReviewStillRequired:true,
    productionReady:false,
  });
}
/** Only a new, pre-inspected reviewer case may start a fresh import. */
export async function importOperatorHandoff(options={}){
  return runReviewerImport({...options,resume:false});
}
/**
 * Recovery never deletes or overwrites: its existing start journal must
 * match the externally pinned receipt; any partial file must match exactly.
 */
export async function resumeOperatorHandoff(options={}){
  return runReviewerImport({...options,resume:true});
}
/**
 * Read-only state inspection can report pending, committed or legacy
 * without starting a recovery or promoting partially imported evidence.
 */
export async function auditImportedHandoff({
  sessionId,trustedOperatorFingerprint,expectedTransportSha256,
  caseDir=REVIEW_CASE_BASE,owner=0,
}={}){
  fixedDir(caseDir,REVIEW_CASE_BASE);
  await inspectInbox({sessionId,trustedOperatorFingerprint,
    expectedTransportSha256,owner});
  await privateDir(caseDir,owner);
  const folder=join(caseDir,requireSession(sessionId));
  return auditHandoffImport({folder,owner,sessionId,
    operatorSignerFingerprint:trustedOperatorFingerprint,
    transportSha256:expectedTransportSha256,allowLegacy:true});
}
/**
 * Reader compares the transferred packet against staged exact operator inputs,
 * without touching host logs or any reviewer private key.
 */
export async function verifyImportedHandoff({
  sessionId,trustedOperatorFingerprint,expectedTransportSha256,
  caseDir=REVIEW_CASE_BASE,owner=0,
}={}){
  fixedDir(caseDir,REVIEW_CASE_BASE);
  const {envelope,verification}=await inspectInbox({
    sessionId,trustedOperatorFingerprint,expectedTransportSha256,owner,
  });
  await privateDir(caseDir,owner);
  const folder=join(caseDir,requireSession(sessionId));
  await privateDir(folder,owner);
  const [report,pem]=await Promise.all([
    safeRead(join(folder,"operator-report.json"),{owner,max:MAX_REPORT}),
    safeRead(join(folder,"operator-public.pem"),{owner,max:MAX_PEM}),
  ]);
  if(!report.equals(Buffer.from(
       JSON.stringify(envelope.operatorReport)+"\n","utf8"))||
     !pem.equals(Buffer.from(envelope.operatorPublicPem,"utf8")))
    throw Error("Reviewer staged operator receipt diverged from pinned handoff");
  const commit=await auditHandoffImport({
    folder,owner,sessionId,
    operatorSignerFingerprint:trustedOperatorFingerprint,
    transportSha256:expectedTransportSha256,
  });
  if(commit.state!=="committed"||commit.verified!==true)
    throw Error("Reviewer import is not durably committed");
  return Object.freeze({
    importJournalCommitted:true,
    ...verification,importIntegrityVerified:true,
    independentSourcesIncluded:false,productionReady:false,
  });
}
