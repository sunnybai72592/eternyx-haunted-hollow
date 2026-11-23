/**
 * Read-only consistency checking for operator-collected, offline KVM metadata.
 * It correlates private review-case JSON to a cryptographically pinned v2
 * operator receipt. It does NOT attest the origin/truth of those inputs,
 * parse raw systemd logs, or promote a lab to production readiness.
 *
 * Filenames come from the existing fixed, private reviewer case loader.
 * No network, VM execution, cloud API, or local host command is used.
 */
import {timingSafeEqual,createHash} from "node:crypto";
import {validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import {verifySignedOperatorEvidence} from
  "./firecracker-operator-evidence.mjs";

const SHA=/^[a-f0-9]{64}$/;
const MAX_JSON_BYTES=4096;
const MAX_AGE_MS=24*60*60*1000;
const TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PRE_KEYS=[
  "schemaVersion","classification","sessionId","unit","capturedAt",
  "offlineOnly","loopbackOnly","pinnedHostExecutables",
  "pinnedGuestImages","readyForPublicHostedLabs","publicLabsEnabled",
  "cloudProvisioningAllowed",
];
const IMAGE_KEYS=[
  "schemaVersion","classification","sessionId","capturedAt",
  "pins","imageDigestProvenanceIndependentlyVerified",
  "rootfsReadOnly","publicLabsEnabled","cloudProvisioningAllowed",
];
const PIN_KEYS=["kernelSha256","rootfsSha256","jailerSha256","firecrackerSha256"];
function exact(value,keys){
  return value!==null&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).sort().join("\x00")===keys.slice().sort().join("\x00");
}
function equalSha(a,b){
  return typeof a==="string"&&SHA.test(a)&&
    typeof b==="string"&&SHA.test(b)&&
    timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
function canonicalObject(bytes,field){
  if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>MAX_JSON_BYTES)
    throw Error("Untrusted bounded offline "+field+" metadata");
  const raw=bytes.toString("utf8");
  const doc=JSON.parse(raw);
  if(!doc||typeof doc!=="object"||Array.isArray(doc)||
     Buffer.from(JSON.stringify(doc)+"\n","utf8").equals(bytes)!==true)
    throw Error("Noncanonical or ambiguous offline "+field+" metadata");
  return doc;
}
function expectTimestamp(stamp,baseline){
  if(typeof stamp!=="string"||!TIME.test(stamp)||
     !Number.isFinite(Date.parse(stamp))||
     new Date(stamp).toISOString()!==stamp)
    throw Error("Invalid offline metadata timestamp");
  const time=Date.parse(stamp);
  const captured=Date.parse(baseline);
  if(!Number.isFinite(captured)||time>captured ||
     captured-time>MAX_AGE_MS)
    throw Error("Evidence metadata predates or follows expected acceptance window");
  return time;
}
function inspectPreflight(doc,signed){
  if(!exact(doc,PRE_KEYS)||doc.schemaVersion!==1||
     doc.classification!=="operator-collected-offline-preflight"||
     !validSessionId(doc.sessionId)||
     doc.sessionId!==signed.sessionId||doc.unit!==signed.unit ||
     doc.offlineOnly!==true||doc.loopbackOnly!==true||
     doc.pinnedHostExecutables!==true||doc.pinnedGuestImages!==true||
     doc.readyForPublicHostedLabs!==false||
     doc.publicLabsEnabled!==false||
     doc.cloudProvisioningAllowed!==false)
    throw Error("Host preflight contradicts signed offline acceptance");
  return expectTimestamp(doc.capturedAt,signed.capturedAt);
}
function inspectImages(doc,signed){
  if(!exact(doc,IMAGE_KEYS)||doc.schemaVersion!==1||
     doc.classification!=="operator-collected-image-digest-inventory"||
     doc.sessionId!==signed.sessionId||
     !validSessionId(doc.sessionId)||
     !exact(doc.pins,PIN_KEYS)||
     !PIN_KEYS.every(key=>equalSha(doc.pins[key],signed.pins[key]))||
     doc.rootfsReadOnly!==true||
     doc.imageDigestProvenanceIndependentlyVerified!==false||
     doc.publicLabsEnabled!==false||
     doc.cloudProvisioningAllowed!==false)
    throw Error("Image digest inventory contradicts signed binary/image pins");
  return expectTimestamp(doc.capturedAt,signed.capturedAt);
}

/**
 * Existing review signatures cover raw file bytes. This stricter metadata
 * validator checks internal consistency and catches same-case contradictions,
 * but cannot prove the metadata was actually gathered on a physical KVM host.
 *
 * No raw logs are parsed or returned. Such logs remain independently
 * reviewed by a human, not automatically "verified" by this function.
 */
export function auditOperatorEvidenceConsistency({
  operatorReport,operatorPublicPem,operatorFingerprint,artifacts,
}={}){
  const verified=verifySignedOperatorEvidence(operatorReport,{
    publicKeyPem:operatorPublicPem,
    trustedPublicFingerprint:operatorFingerprint,
  });
  const payload=operatorReport.payload;
  const baseline=payload.baseline?.payload;
  if(verified.signatureVerified!==true||verified.productionReady!==false||
     verified.operatorSelfReported!==true ||
     !baseline||baseline.sessionId!==payload.sessionId||
     baseline.unit!==payload.unit)
    throw Error("Untrusted signed evidence baseline for consistency review");
  if(!artifacts||typeof artifacts!=="object"||Array.isArray(artifacts)||
     !Object.prototype.hasOwnProperty.call(artifacts,"host-preflight.json")||
     !Object.prototype.hasOwnProperty.call(artifacts,"image-provenance.json"))
    throw Error("Incomplete offline review metadata");
  const host=canonicalObject(artifacts["host-preflight.json"],"host-preflight");
  const images=canonicalObject(artifacts["image-provenance.json"],"image-provenance");
  const hostTime=inspectPreflight(host,baseline);
  const imageTime=inspectImages(images,baseline);
  // Ensure inventory is not newer than preflight but both precede receipt.
  // A conservative ordering check reduces accidental stale/mismatched runs.
  if(imageTime>hostTime)
    throw Error("Image inventory timestamp follows host preflight");
  return Object.freeze({
    sessionId:verified.sessionId,mode:verified.mode,
    operatorSignatureVerified:true,
    exactSessionAndUnitMatched:true,
    pinnedKernelRootfsAndHostBinariesMatched:true,
    offlinePolicyFieldsMatched:true,
    metadataTimestampWindowMatched:true,
    metadataConsistencyVerified:true,
    hostPreflightOperatorCollected:true,
    imageInventoryOperatorCollected:true,
    rawSupervisorJournalSemanticallyVerified:false,
    rawGuestTranscriptSemanticallyVerified:false,
    independentSourceAuthenticityVerified:false,
    physicalHostAttested:false,productionReady:false,
    publicLabsEnabled:false,
  });
}
