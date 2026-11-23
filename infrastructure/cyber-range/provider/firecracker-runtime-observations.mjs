/**
 * Operator-collected runtime-observation cross-check for OFFLINE reviewer cases.
 *
 * These bounded JSON sidecars are NOT signed, not independently authenticated
 * and do NOT replace genuine journalctl logs, cgroup proof or physical KVM
 * acceptance. Their SHA-256 links must match the original reviewer-endorsed
 * raw transcripts. This validator does not parse or execute the raw log text.
 */
import {createHash,timingSafeEqual} from "node:crypto";
import {verifySignedOperatorEvidence} from "./firecracker-operator-evidence.mjs";

const SHA=/^[a-f0-9]{64}$/;
const TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const MAX=4096;
const MAX_WINDOW=24*60*60*1000;
const FIELDS=["schemaVersion","classification","sessionId","unit",
  "capturedAt","sourceSha256","observations"];
const BASE=[
  ["supervisor","supervisor-journal.txt","runtime-supervisor.json"],
  ["cgroup","cgroup-death.txt","runtime-cgroup.json"],
];
const GUEST=["guest","guest-challenge.txt","runtime-guest.json"];
const EXPIRY=["expiry","timeout-result.txt","runtime-timeout.json"];
const SCHEMAS={
  supervisor:{
    jailed:true,hostNetworkDenied:true,externalWatchdogArmed:true,
    cgroupEnforced:true,publicIngressEnabled:false,
    cloudProvisioningAllowed:false,
  },
  cgroup:{descendantCount:0,dead:true,teardownVerified:true},
  guest:{
    localVsockOnly:true,challengeResponseVerified:true,
    guestServiceFunctional:true,guestIdentityCryptographicallyProven:false,
  },
  expiry:{
    deadlineSeconds:900,systemdTimeoutResult:"timeout",
    cgroupDescendantCount:0,fullExpiryObserved:true,
    cloudProvisioningAllowed:false,
  },
};
const exact=(x,keys)=>x!==null&&typeof x==="object"&&
  !Array.isArray(x)&&Object.keys(x).sort().join("|")===
  keys.slice().sort().join("|");
const digest=b=>createHash("sha256").update(b).digest("hex");
function same(a,b){
  return typeof a==="string"&&SHA.test(a)&&typeof b==="string"&&SHA.test(b)&&
    timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
export function requiredRuntimeObservationFiles(mode){
  if(!["guest-vsock","watchdog-900","guest-and-watchdog"].includes(mode))
    throw Error("Unknown offline runtime observation mode");
  const requirements=[
    ...BASE,...(mode.includes("guest")?[GUEST]:[]),
    ...(mode.includes("watchdog")?[EXPIRY]:[]),
  ];
  return Object.freeze(requirements.map(([kind,source,sidecar])=>
    Object.freeze({kind,source,sidecar})));
}
function canonical(bytes,kind){
  if(!Buffer.isBuffer(bytes)||bytes.length<2||bytes.length>MAX)
    throw Error("Unsafe offline runtime sidecar length");
  const object=JSON.parse(bytes.toString("utf8"));
  if(!exact(object,FIELDS)||
     !Buffer.from(JSON.stringify(object)+"\n","utf8").equals(bytes))
    throw Error("Noncanonical or unsupported runtime sidecar "+kind);
  return object;
}
function timestamp(value){
  if(typeof value!=="string"||!TIME.test(value)||
     !Number.isFinite(Date.parse(value))||
     new Date(value).toISOString()!==value)
    throw Error("Untrusted runtime capture time");
  return Date.parse(value);
}
function validateSidecar(kind,body,source,context){
  const doc=canonical(body,kind);
  const expected=SCHEMAS[kind];
  if(doc.schemaVersion!==1||
     doc.classification!=="operator-collected-"+kind+"-observation"||
     doc.sessionId!==context.sessionId||doc.unit!==context.unit||
     !same(doc.sourceSha256,digest(source))||
     !exact(doc.observations,Object.keys(expected))||
     Object.entries(expected).some(([field,value])=>
       doc.observations[field]!==value))
    throw Error("Operator runtime observation contradicts reviewed evidence");
  const t=timestamp(doc.capturedAt);
  if(t<context.preflightAt||t>context.receiptAt||
     context.receiptAt-t>MAX_WINDOW)
    throw Error("Runtime observation is outside signed session window");
  return {
    type:kind,sourceDigestMatched:true,signedSessionMatched:true,
    timestampWindowMatched:true,operatorSelfReported:true,
  };
}
/**
 * A positive result proves internal consistency of user-collected metadata,
 * not the authenticity or truthful content of a systemd journal.
 * The caller must first independently verify the review and disposition
 * signature chain before applying these optional supplemental checks.
 */
export function auditOfflineRuntimeObservations({
  operatorReport,operatorPublicPem,operatorFingerprint,artifacts,sidecars,
}={}){
  const status=verifySignedOperatorEvidence(operatorReport,{
    publicKeyPem:operatorPublicPem,
    trustedPublicFingerprint:operatorFingerprint,
  });
  const signed=operatorReport.payload;
  if(status.signatureVerified!==true||status.operatorSelfReported!==true||
     status.productionReady!==false||
     !artifacts||typeof artifacts!=="object"||Array.isArray(artifacts)||
     !sidecars||typeof sidecars!=="object"||Array.isArray(sidecars))
    throw Error("Untrusted offline runtime audit input");
  const preflight=artifacts["host-preflight.json"];
  if(!Buffer.isBuffer(preflight)||preflight.length>MAX)
    throw Error("Missing bounded signed-session preflight metadata");
  const pre=canonicalPreflight(preflight);
  const preflightAt=timestamp(pre.capturedAt);
  const receiptAt=timestamp(signed.capturedAt);
  if(pre.sessionId!==status.sessionId||pre.unit!==signed.unit||
     preflightAt>receiptAt)
    throw Error("Runtime audit preflight identity or time differs from receipt");
  const required=requiredRuntimeObservationFiles(status.mode);
  const expected=required.map(r=>r.sidecar);
  if(Object.keys(sidecars).sort().join("|")!==expected.slice().sort().join("|"))
    throw Error("Missing or unexpected operator runtime observation sidecar");
  const context={
    sessionId:status.sessionId,unit:signed.unit,preflightAt,receiptAt,
  };
  const checked=required.map(({kind,source,sidecar})=>{
    const raw=artifacts[source];
    if(!Buffer.isBuffer(raw)||raw.length<1||raw.length>128*1024)
      throw Error("Missing or unsafe previously reviewed runtime transcript");
    return validateSidecar(kind,sidecars[sidecar],raw,context);
  });
  return Object.freeze({
    sessionId:status.sessionId,mode:status.mode,
    checkedObservationKinds:checked.map(x=>x.type),
    referencedTranscriptDigestsMatched:true,
    sessionAndSystemdUnitMatched:true,
    captureWindowMatched:true,
    observationFlagsInternallyConsistent:true,
    sidecarsIncludedInEarlierSignedReview:false,
    rawHostLogsSemanticallyVerified:false,
    independentSourceAuthenticityVerified:false,
    physicalHostAttested:false,
    productionReady:false,publicLabsEnabled:false,
  });
}
function canonicalPreflight(bytes){
  const doc=JSON.parse(bytes.toString("utf8"));
  if(!doc||typeof doc!=="object"||Array.isArray(doc)||
     !Buffer.from(JSON.stringify(doc)+"\n").equals(bytes)||
     typeof doc.capturedAt!=="string")
    throw Error("Noncanonical host preflight evidence");
  return doc;
}
