/**
 * Operator-signed v2 evidence for manually approved offline Firecracker tests.
 * This is a root-operator assertion, NOT TPM attestation, independent image
 * provenance, a public-lab safety approval or a provider spending guarantee.
 *
 * No cloud calls, public listener, key creation or automatic VM execution.
 */
import {
  createHash,createPrivateKey,createPublicKey,sign,verify,timingSafeEqual,
} from "node:crypto";
import {constants} from "node:fs";
import {open,lstat,realpath} from "node:fs/promises";
import {join,resolve} from "node:path";
import {validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import {createHardwareEvidence,verifyHardwareEvidence,HARDWARE_EVIDENCE_DIR}
  from "./firecracker-hardware-evidence.mjs";
import {supervisedVmUnit}
  from "./firecracker-systemd-supervisor.mjs";

export const PRIVATE_SIGNING_KEY="/etc/eternyx-firecracker/keys/attestation-ed25519.pem";
export const PUBLIC_SIGNING_KEY="/etc/eternyx-firecracker/keys/attestation-ed25519.pub.pem";
const SHA=/^[a-f0-9]{64}$/;
const MODE=["guest-vsock","watchdog-900","guest-and-watchdog"];
const MAX_RECEIPT=8192;
const MAX_KEY=8192;
const keys={
  report:["payload","signature","publicKeyFingerprint"],
  payload:["schemaVersion","classification","capturedAt","sessionId","unit",
    "mode","baseline","observed","notVerified"],
  observed:["guestServiceFunctional","guestChallengeResponseVerified",
    "full900SecondExpiryObserved","systemdTimeoutResultVerified",
    "noCgroupDescendants","teardownVerified"],
  notVerified:["independentHostAttestation","independentImageProvenance",
    "publicLabsEnabled","providerEnforcedBillingCap"],
};
const exact=(o,fields)=>o!==null&&typeof o==="object"&&!Array.isArray(o)&&
  Object.keys(o).sort().join("|")===fields.slice().sort().join("|");
const equal64=(a,b)=>SHA.test(a??"")&&SHA.test(b??"")&&
  timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
const bytes=o=>Buffer.from(JSON.stringify(o),"utf8");
function publicSpki(key){
  const publicKey=createPublicKey(key);
  if(publicKey.asymmetricKeyType!=="ed25519")
    throw Error("Only Ed25519 operator attestations are accepted");
  return createHash("sha256").update(publicKey.export({
    type:"spki",format:"der",
  })).digest("hex");
}
function modeChecks(mode){
  if(!MODE.includes(mode))throw Error("Unexpected local attestation mode");
  return {guest:mode.includes("guest"),expiry:mode.includes("watchdog")};
}

/** A key MUST be separately pinned by its SPKI SHA-256 by the reviewer. */
export function createSignedOperatorEvidence({
  config,result,mode,privateKeyPem,publicKeyPem,
  trustedPublicFingerprint,capturedAt=new Date().toISOString(),
}={}){
  const {guest,expiry}=modeChecks(mode);
  if(result?.teardownVerified!==true||
     result?.accepted!==true||
     (guest && (result.guestServiceFunctional!==true ||
       result.guestChallengeResponseVerified!==true)) ||
     (expiry && (result.full900SecondExpiryObserved!==true ||
       result.systemdTimeoutResultVerified!==true ||
       result.noCgroupDescendants!==true)) ||
     (!guest && (result.guestServiceFunctional===true ||
       result.guestChallengeResponseVerified===true)) ||
     (!expiry && (result.full900SecondExpiryObserved===true ||
       result.systemdTimeoutResultVerified===true ||
       result.noCgroupDescendants===true)))
    throw Error("Expanded local evidence requires exact confirmed mode outcomes");
  const base=createHardwareEvidence({config,result,capturedAt});
  const privateKey=createPrivateKey(privateKeyPem);
  if(privateKey.asymmetricKeyType!=="ed25519")
    throw Error("Expected operator Ed25519 private key");
  const fingerprint=publicSpki(privateKey);
  if(!equal64(fingerprint,trustedPublicFingerprint) ||
     !equal64(publicSpki(publicKeyPem),trustedPublicFingerprint))
    throw Error("Operator signing key is not the independently pinned key");
  const payload={
    schemaVersion:2,classification:"operator-signed-local-only",
    capturedAt,sessionId:base.payload.sessionId,
    unit:base.payload.unit,mode,
    baseline:base,
    observed:{
      guestServiceFunctional:guest,
      guestChallengeResponseVerified:guest,
      full900SecondExpiryObserved:expiry,
      systemdTimeoutResultVerified:expiry,
      noCgroupDescendants:expiry,
      teardownVerified:true,
    },
    notVerified:{
      independentHostAttestation:false,
      independentImageProvenance:false,
      publicLabsEnabled:false,
      providerEnforcedBillingCap:false,
    },
  };
  const signature=sign(null,bytes(payload),privateKey).toString("base64url");
  const report={payload,signature,publicKeyFingerprint:fingerprint};
  verifySignedOperatorEvidence(report,{
    publicKeyPem,trustedPublicFingerprint,
    expectedSessionId:base.payload.sessionId,
  });
  return Object.freeze(report);
}

/** Verify offline without the private key or a running Firecracker process. */
export function verifySignedOperatorEvidence(report,{
  publicKeyPem,trustedPublicFingerprint,expectedSessionId,
}={}){
  if(!exact(report,keys.report)||
     !exact(report.payload,keys.payload) ||
     !exact(report.payload.observed,keys.observed)||
     !exact(report.payload.notVerified,keys.notVerified)||
     report.payload.schemaVersion!==2||
     report.payload.classification!=="operator-signed-local-only"||
     !validSessionId(report.payload.sessionId) ||
     report.payload.unit!==supervisedVmUnit(report.payload.sessionId) ||
     (expectedSessionId!==undefined &&
       report.payload.sessionId!==expectedSessionId) ||
     typeof report.payload.capturedAt!=="string"||
     typeof report.signature!=="string"||
     !/^[A-Za-z0-9_-]{86}$/.test(report.signature)||
     !equal64(report.publicKeyFingerprint,trustedPublicFingerprint))
    throw Error("Invalid or incorrectly pinned operator evidence");
  const payload=report.payload;
  const original=verifyHardwareEvidence(payload.baseline,{
    expectedSessionId:payload.sessionId,
  });
  if(!original.integrityVerified ||
     payload.baseline.payload.unit!==payload.unit||
     payload.baseline.payload.capturedAt!==payload.capturedAt)
    throw Error("Expanded operator receipt does not bind the original smoke");
  const {guest,expiry}=modeChecks(payload.mode);
  const o=payload.observed;
  if(o.guestServiceFunctional!==guest ||
     o.guestChallengeResponseVerified!==guest ||
     o.full900SecondExpiryObserved!==expiry ||
     o.systemdTimeoutResultVerified!==expiry ||
     o.noCgroupDescendants!==expiry ||
     o.teardownVerified!==true ||
     Object.values(payload.notVerified).some(v=>v!==false))
    throw Error("Operator receipt overclaims independent evidence");
  const key=createPublicKey(publicKeyPem);
  const fingerprint=publicSpki(key);
  if(!equal64(fingerprint,trustedPublicFingerprint) ||
     key.asymmetricKeyType!=="ed25519")
    throw Error("Operator public key is not independently pinned");
  const signature=Buffer.from(report.signature,"base64url");
  if(signature.length!==64 || !verify(null,bytes(payload),key,signature))
    throw Error("Operator Ed25519 receipt signature is invalid");
  return Object.freeze({
    sessionId:payload.sessionId,mode:payload.mode,
    signatureVerified:true,pinnedPublicKeyVerified:true,
    signerFingerprint:fingerprint,
    guestServiceOperatorReported:guest,
    expiryDrillOperatorReported:expiry,
    operatorSelfReported:true,independentHostAttestation:false,
    productionReady:false,publicLabsEnabled:false,
  });
}
async function privateDirectory(dir,owner){
  if(typeof dir!=="string"||resolve(dir)!==dir||dir==="/")
    throw Error("Invalid local operator directory");
  const [stat,real]=await Promise.all([lstat(dir),realpath(dir)]);
  if(real!==dir||!stat.isDirectory()||
     stat.uid!==owner||(stat.mode&0o077)!==0)
    throw Error("Local operator evidence directory is not private");
}
async function readPinnedPem(path,{owner=0,privateKey=false}={}){
  const st=await lstat(path);
  if(!st.isFile()||st.uid!==owner||st.nlink!==1||
     (privateKey?(st.mode&0o077)!==0:(st.mode&0o022)!==0)||
     st.size<16||st.size>MAX_KEY)
    throw Error("Untrusted operator key file");
  const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const a=await h.stat();
    if(a.dev!==st.dev||a.ino!==st.ino||a.size!==st.size)
      throw Error("Operator key changed while opening");
    const data=await h.readFile({encoding:"utf8"});
    const b=await h.stat();
    if(b.ino!==a.ino||b.size!==a.size||
       b.mtimeMs!==a.mtimeMs||b.ctimeMs!==a.ctimeMs)
      throw Error("Operator signing key changed while reading");
    return data;
  }finally{await h.close();}
}
async function privateEvidenceFile(file,owner){
  const h=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const st=await h.stat();
    if(!st.isFile()||st.uid!==owner||st.nlink!==1||
       (st.mode&0o077)!==0||st.size<1||st.size>MAX_RECEIPT)
      throw Error("Unsafe signed local evidence file");
    const data=await h.readFile({encoding:"utf8"});
    if(Buffer.byteLength(data)>MAX_RECEIPT)
      throw Error("Oversized signed evidence");
    return JSON.parse(data);
  }finally{await h.close();}
}
function reportPath(dir,sessionId){
  if(!validSessionId(sessionId))throw Error("Invalid signed evidence session");
  return join(dir,sessionId+".v2-signed.json");
}
async function saveExclusive(report,{dir,owner}){
  const file=reportPath(dir,report.payload.sessionId);
  const data=JSON.stringify(report)+"\n";
  if(Buffer.byteLength(data)>MAX_RECEIPT)
    throw Error("Operator receipt exceeds maximum bytes");
  await privateDirectory(dir,owner);
  const h=await open(file,constants.O_WRONLY|constants.O_CREAT|
    constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{
    const stat=await h.stat();
    if(!stat.isFile()||stat.uid!==owner||stat.nlink!==1||
       (stat.mode&0o077)!==0||stat.size!==0)
      throw Error("Unsafe newly created signed evidence");
    await h.writeFile(data,"utf8");
    await h.sync();
    const done=await h.stat();
    if(done.size!==Buffer.byteLength(data))
      throw Error("Incomplete signed evidence write");
  }finally{await h.close();}
  // Durable directory entry: failure is an error, never a success report.
  const d=await open(dir,constants.O_RDONLY|constants.O_DIRECTORY);
  try{await d.sync();}finally{await d.close();}
  return true;
}
/**
 * Signing is only possible after the caller has observed a successful,
 * fully torn down, explicitly opted-in local hardware acceptance run.
 * Paths are fixed in production; overrides exist only for isolated tests.
 */
export async function recordSignedOperatorEvidence({
  config,result,mode,trustedPublicFingerprint,
  privatePath=PRIVATE_SIGNING_KEY,publicPath=PUBLIC_SIGNING_KEY,
  dir=HARDWARE_EVIDENCE_DIR,owner=0,
}={}){
  await privateDirectory(dir,owner);
  const [priv,pub]=await Promise.all([
    readPinnedPem(privatePath,{owner,privateKey:true}),
    readPinnedPem(publicPath,{owner}),
  ]);
  const report=createSignedOperatorEvidence({
    config,result,mode,privateKeyPem:priv,publicKeyPem:pub,
    trustedPublicFingerprint,
  });
  await saveExclusive(report,{dir,owner});
  return Object.freeze({sessionId:report.payload.sessionId,
    signatureRecorded:true,signerFingerprint:report.publicKeyFingerprint,
    localOnly:true,publicLabsEnabled:false});
}
export async function readSignedOperatorEvidence({
  sessionId,trustedPublicFingerprint,
  publicPath=PUBLIC_SIGNING_KEY,
  dir=HARDWARE_EVIDENCE_DIR,owner=0,
}={}){
  await privateDirectory(dir,owner);
  const [pub,report]=await Promise.all([
    readPinnedPem(publicPath,{owner}),
    privateEvidenceFile(reportPath(dir,sessionId),owner),
  ]);
  return verifySignedOperatorEvidence(report,{
    publicKeyPem:pub,trustedPublicFingerprint,expectedSessionId:sessionId,
  });
}
