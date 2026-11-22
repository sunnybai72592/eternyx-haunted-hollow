/**
 * Offline hardware acceptance receipts: operator-owned local evidence only.
 * A checksum detects changes; it is NOT a signature or independent proof of
 * image provenance, workload readiness, VM expiry, or public hosting safety.
 *
 * This module is never called by the web app, Supabase, or CI with a live VM.
 */
import {createHash,timingSafeEqual} from "node:crypto";
import {constants} from "node:fs";
import {open,lstat,realpath} from "node:fs/promises";
import {join,resolve} from "node:path";
import {validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import {supervisedVmUnit} from "./firecracker-systemd-supervisor.mjs";
import {approvedHardwareManifest} from "./firecracker-hardware-acceptance.mjs";

export const HARDWARE_EVIDENCE_DIR="/var/lib/eternyx-firecracker/evidence";
const SHA=/^[a-f0-9]{64}$/;
const MAX_REPORT_BYTES=4096;
const KEYS=Object.freeze({
  report:["payload","checksum"],
  payload:["schemaVersion","classification","capturedAt","sessionId",
    "unit","operatorUid","operatorGid","pins","guestPolicy","observed",
    "notVerified"],
  pins:["kernelSha256","rootfsSha256","jailerSha256","firecrackerSha256"],
  guestPolicy:["vcpus","memoryMiB","maximumRuntimeSeconds","egressPolicy",
    "rootfsReadOnly","publicLabsEnabled","cloudProvisioningAllowed"],
  observed:["bootApiAccepted","offlineNetnsAttested","localKvmGuestObserved",
    "teardownVerified"],
  notVerified:["guestServiceFunctional","full900SecondExpiryDrill",
    "independentImageProvenance","providerEnforcedBillingCap",
    "multiTenantProductionReadiness"],
});
function hasExactKeys(value,keys){
  return value!==null&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).sort().join("|")===keys.slice().sort().join("|");
}
function sha256(payload){
  return createHash("sha256").update(JSON.stringify(payload),"utf8").digest("hex");
}
function checkPayload(p){
  if(!hasExactKeys(p,KEYS.payload) || p.schemaVersion!==1 ||
     p.classification!=="operator-self-reported-local-smoke" ||
     !validSessionId(p.sessionId) ||
     p.unit!==supervisedVmUnit(p.sessionId) ||
     typeof p.capturedAt!=="string" ||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.capturedAt) ||
     Number.isNaN(Date.parse(p.capturedAt)) ||
     new Date(p.capturedAt).toISOString()!==p.capturedAt ||
     !Number.isSafeInteger(p.operatorUid) || p.operatorUid<1 ||
     !Number.isSafeInteger(p.operatorGid) || p.operatorGid<1 ||
     !hasExactKeys(p.pins,KEYS.pins) ||
     Object.values(p.pins).some(x=>typeof x!=="string"||!SHA.test(x)) ||
     !hasExactKeys(p.guestPolicy,KEYS.guestPolicy) ||
     !hasExactKeys(p.observed,KEYS.observed) ||
     !hasExactKeys(p.notVerified,KEYS.notVerified))
    throw Error("Invalid or unsupported offline hardware evidence");
  const m=approvedHardwareManifest({
    kernelSha256:p.pins.kernelSha256,
    rootfsSha256:p.pins.rootfsSha256,
  });
  const g=p.guestPolicy,o=p.observed,n=p.notVerified;
  if(g.vcpus!==m.vcpus||g.memoryMiB!==m.memoryMiB||
     g.maximumRuntimeSeconds!==900||g.egressPolicy!=="deny-all"||
     g.rootfsReadOnly!==true||g.publicLabsEnabled!==false||
     g.cloudProvisioningAllowed!==false ||
     Object.values(o).some(v=>v!==true) ||
     Object.values(n).some(v=>v!==false))
    throw Error("Offline hardware evidence overclaims verified safety");
  return true;
}

/** Builds a limited-scope receipt ONLY from a completed accepted local run. */
export function createHardwareEvidence({config,result,capturedAt=new Date().toISOString()}={}){
  const {sessionId,manifest,uid,gid,jailerSha256,firecrackerSha256}=config??{};
  if(!manifest||typeof manifest!=="object"||
     !SHA.test(jailerSha256??"")||!SHA.test(firecrackerSha256??""))
    throw Error("Pinned offline hardware configuration is required");
  const expected=approvedHardwareManifest({
    kernelSha256:manifest.kernelSha256,rootfsSha256:manifest.rootfsSha256,
  });
  if(JSON.stringify(manifest)!==JSON.stringify(expected) ||
     result?.sessionId!==sessionId ||
     result?.unit!==supervisedVmUnit(sessionId) ||
     result?.accepted!==true || result?.bootApiAccepted!==true ||
     result?.offlineNetnsAttested!==true ||
     result?.localKvmGuestObserved!==true ||
     result?.teardownVerified!==true ||
     result?.independentDeadlineSeconds!==900 ||
     result?.publicLabsEnabled!==false ||
     result?.cloudProvisioningAllowed!==false ||
     result?.providerHardLimitVerified!==false)
    throw Error("Cannot create evidence without verified offline teardown receipt");
  const payload={
    schemaVersion:1,
    classification:"operator-self-reported-local-smoke",
    capturedAt,sessionId,unit:result.unit,operatorUid:uid,operatorGid:gid,
    pins:{
      kernelSha256:manifest.kernelSha256,rootfsSha256:manifest.rootfsSha256,
      jailerSha256,firecrackerSha256,
    },
    guestPolicy:{
      vcpus:1,memoryMiB:256,maximumRuntimeSeconds:900,
      egressPolicy:"deny-all",rootfsReadOnly:true,
      publicLabsEnabled:false,cloudProvisioningAllowed:false,
    },
    observed:{
      bootApiAccepted:true,offlineNetnsAttested:true,
      localKvmGuestObserved:true,teardownVerified:true,
    },
    notVerified:{
      guestServiceFunctional:false,full900SecondExpiryDrill:false,
      independentImageProvenance:false,providerEnforcedBillingCap:false,
      multiTenantProductionReadiness:false,
    },
  };
  checkPayload(payload);
  return Object.freeze({payload,checksum:sha256(payload)});
}

/** Hash verifies integrity only, NOT authorship or truth of observed claims. */
export function verifyHardwareEvidence(report,{expectedSessionId}={}){
  if(!hasExactKeys(report,KEYS.report) ||
     typeof report.checksum!=="string" || !SHA.test(report.checksum))
    throw Error("Malformed offline hardware evidence receipt");
  checkPayload(report.payload);
  if(expectedSessionId!==undefined&&report.payload.sessionId!==expectedSessionId)
    throw Error("Offline hardware evidence session mismatch");
  const actual=Buffer.from(sha256(report.payload),"hex");
  const supplied=Buffer.from(report.checksum,"hex");
  if(!timingSafeEqual(actual,supplied))
    throw Error("Offline hardware evidence checksum mismatch");
  return Object.freeze({
    sessionId:report.payload.sessionId,checksum:report.checksum,
    integrityVerified:true,operatorSelfReported:true,
    guestServiceVerified:false,fullExpiryDrillVerified:false,
    independentImageProvenanceVerified:false,productionReady:false,
  });
}

async function trustedDirectory(dir,expectedUid){
  if(typeof dir!=="string"||resolve(dir)!==dir||dir==="/")
    throw Error("Invalid local evidence directory");
  const [s,real]=await Promise.all([lstat(dir),realpath(dir)]);
  if(real!==dir || !s.isDirectory() || s.uid!==expectedUid ||
     (s.mode&0o077)!==0)
    throw Error("Evidence directory must be private and operator-owned");
}
function evidencePath(dir,sessionId){
  if(!validSessionId(sessionId))throw Error("Invalid evidence session");
  return join(dir,sessionId+".json");
}
function privateFile(stat,expectedUid){
  if(!stat.isFile()||stat.uid!==expectedUid||stat.nlink!==1||
     (stat.mode&0o077)!==0||stat.size<1||
     stat.size>MAX_REPORT_BYTES)
    throw Error("Unsafe offline hardware evidence file");
}

/**
 * O_EXCL and O_NOFOLLOW prevent replacing or following an existing receipt.
 * The directory MUST be manually provisioned; never create it implicitly.
 */
export async function saveHardwareEvidence(report,{
  dir=HARDWARE_EVIDENCE_DIR,expectedUid=0,
}={}){
  const check=verifyHardwareEvidence(report);
  await trustedDirectory(dir,expectedUid);
  const file=evidencePath(dir,check.sessionId);
  const body=JSON.stringify(report)+"\n";
  if(Buffer.byteLength(body)>MAX_REPORT_BYTES)
    throw Error("Offline evidence receipt exceeds size limit");
  const handle=await open(file,constants.O_WRONLY|constants.O_CREAT|
    constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{
    privateFile(await handle.stat(),expectedUid);
    await handle.writeFile(body,"utf8");
    await handle.sync();
  }finally{await handle.close();}
  return Object.freeze({sessionId:check.sessionId,checksum:check.checksum,
    recorded:true,localOnly:true});
}

/** Read-only verifier: never starts, stops, or contacts a guest. */
export async function loadHardwareEvidence(sessionId,{
  dir=HARDWARE_EVIDENCE_DIR,expectedUid=0,
}={}){
  await trustedDirectory(dir,expectedUid);
  const handle=await open(evidencePath(dir,sessionId),
    constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const stat=await handle.stat();
    privateFile(stat,expectedUid);
    const body=await handle.readFile({encoding:"utf8"});
    if(Buffer.byteLength(body)>MAX_REPORT_BYTES)
      throw Error("Oversized offline hardware evidence");
    return verifyHardwareEvidence(JSON.parse(body),
      {expectedSessionId:sessionId});
  }finally{await handle.close();}
}
