import { calculateSha256, PROVENANCE_SCHEMA, MAX_PROVENANCE_BYTES } from "./securityEvidenceProvenance.mjs";
export const HANDOFF_SCHEMA="eternyx.private-evidence-handoff.v1";
export const HANDOFF_MAX_BYTES=128*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^[0-9a-f]{64}$/;
const allowed={
 manifest:["schema","generatedAt","engagementId","collection","limitations","totalHashed","observations","investigationReferences"],
 obs:["evidenceId","mimeType","bytes","registeredAt","locallyObservedAt","sha256","baselineComparison","suppliedDigestComparison"],
 ref:["investigationId","target","referencedIds","referencedByteDigestsInThisExport"],
 core:["schema","handoffId","createdAt","expiresAt","senderLabel","recipientLabel","purpose","manifest","disclaimer"],
};
const disclaimer="Unsigned local checksum; no identity proof, recipient authorization, evidence transfer, or chain-of-custody certification.";
function object(value,keys,label) {
 if(!value||typeof value!=="object"||Array.isArray(value)||
    Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k))) {
   throw new Error(label+" has missing or unsupported fields.");
 }
}
function stamp(v,label) {
 if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(v)||!Number.isFinite(Date.parse(v)))
   throw new Error(label+" must be an ISO timestamp.");
 return new Date(v).toISOString();
}
function uuid(v,label) {if(typeof v!=="string"||!UUID.test(v))throw new Error(label+" must be a UUID.");return v;}
function sha(v) {if(typeof v!=="string"||!HEX.test(v))throw new Error("SHA-256 must be lowercase 64-character hex.");return v;}
function plain(v,label,min,max) {
 if(typeof v!=="string"||v.trim().length<min||v.trim().length>max||/[\x00-\x1f]/.test(v))
 throw new Error(label+" must be plain text within "+min+"–"+max+" characters.");
 return v.trim();
}
function list(v,max,label) {if(!Array.isArray(v)||v.length>max)throw new Error(label+" exceeds its bounds.");return v;}
function unique(ids,label) {if(new Set(ids).size!==ids.length)throw new Error(label+" must be unique.");}
function canonical(v) {
 if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";
 if(v!==null&&typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
 if(typeof v==="string"||typeof v==="boolean"||v===null||(typeof v==="number"&&Number.isFinite(v)))return JSON.stringify(v);
 throw new Error("Non-canonical data is not permitted.");
}
function ensureBounded(raw) {
 if(typeof raw!=="string"||new TextEncoder().encode(raw).length>HANDOFF_MAX_BYTES||!raw.length)
 throw new Error("Handoff file exceeds the 128 KiB size limit.");
 return raw;
}
export function validateHandoffManifest(v) {
 object(v,allowed.manifest,"Manifest");
 if(v.schema!==PROVENANCE_SCHEMA)throw new Error("Unknown provenance schema.");
 uuid(v.engagementId,"Engagement");
 const generatedAt=stamp(v.generatedAt,"Manifest generation time");
 if(v.collection!=="session-only local SHA-256 from explicitly downloaded private objects")
 throw new Error("Unsupported provenance origin.");
 const limitations=list(v.limitations,8,"Manifest limitations").map(x=>plain(x,"Limitation",1,250));
 if(!limitations.length)throw new Error("Manifest limitations are required.");
 const observations=list(v.observations,100,"Observations").map(o=>{
  object(o,allowed.obs,"Observation");
  if(!Number.isSafeInteger(o.bytes)||o.bytes<1||o.bytes>MAX_PROVENANCE_BYTES)
    throw new Error("Invalid evidence byte count.");
  if(!["first-observation","match","mismatch"].includes(o.baselineComparison)||
     !["not-provided","match","mismatch"].includes(o.suppliedDigestComparison))
    throw new Error("Invalid comparison state.");
  return {evidenceId:uuid(o.evidenceId,"Evidence"),mimeType:plain(o.mimeType,"MIME",3,90),bytes:o.bytes,
    registeredAt:stamp(o.registeredAt,"Registered time"),locallyObservedAt:stamp(o.locallyObservedAt,"Observed time"),
    sha256:sha(o.sha256),baselineComparison:o.baselineComparison,suppliedDigestComparison:o.suppliedDigestComparison};
 });
 if(!observations.length||v.totalHashed!==observations.length)throw new Error("Manifest needs actual observed hashes.");
 unique(observations.map(x=>x.evidenceId),"Evidence IDs");
 const hashedIds=new Set(observations.map(x=>x.evidenceId));
 const investigationReferences=list(v.investigationReferences,100,"Investigations").map(r=>{
  object(r,allowed.ref,"Investigation reference");
  const ids=list(r.referencedIds,20,"Referenced evidence").map(id=>uuid(id,"Referenced ID"));
  unique(ids,"Referenced IDs");
  if(r.referencedByteDigestsInThisExport!==ids.filter(id=>hashedIds.has(id)).length)
    throw new Error("Referenced digest coverage is inconsistent.");
  return {investigationId:uuid(r.investigationId,"Investigation"),target:plain(r.target,"Target",1,500),
   referencedIds:ids.sort(),referencedByteDigestsInThisExport:r.referencedByteDigestsInThisExport};
 });
 unique(investigationReferences.map(x=>x.investigationId),"Investigation IDs");
 const manifest={schema:PROVENANCE_SCHEMA,generatedAt,engagementId:v.engagementId,collection:v.collection,limitations,
   totalHashed:observations.length,
   observations:observations.sort((a,b)=>a.evidenceId.localeCompare(b.evidenceId)),
   investigationReferences:investigationReferences.sort((a,b)=>a.investigationId.localeCompare(b.investigationId))};
 ensureBounded(JSON.stringify(manifest));
 return manifest;
}
export function parseHandoffManifest(raw) {
 ensureBounded(raw);let data;try{data=JSON.parse(raw);}catch{throw new Error("Provenance file is invalid JSON.");}
 return validateHandoffManifest(data);
}
export function canonicalHandoffBody(value){return canonical(value);}
async function digest(core,subtle) {return calculateSha256(new TextEncoder().encode(ensureBounded(canonical(core))),subtle);}
function lifetime(created,expiry) {
 const delta=Date.parse(expiry)-Date.parse(created);
 if(delta<=0||delta>30*86400000)throw new Error("Handoff must expire after creation and within 30 days.");
}
export async function createEvidenceHandoff(manifest,details,{now=new Date().toISOString(),subtle}={}) {
 const verified=validateHandoffManifest(manifest);
 const createdAt=stamp(now,"Creation time"),expiresAt=stamp(details.expiresAt,"Expiry time");
 lifetime(createdAt,expiresAt);
 const core={schema:HANDOFF_SCHEMA,handoffId:uuid(details.handoffId,"Handoff"),createdAt,expiresAt,
  senderLabel:plain(details.senderLabel??"","Sender reference",0,120),
  recipientLabel:plain(details.recipientLabel,"Recipient reference",2,120),
  purpose:plain(details.purpose,"Purpose",12,500),manifest:verified,disclaimer};
 const checksum={algorithm:"SHA-256",hex:await digest(core,subtle)};
 const packet={core,checksum};
 ensureBounded(JSON.stringify(packet));
 return packet;
}
export async function verifyEvidenceHandoff(raw,{now=new Date().toISOString(),subtle,expectedChecksum=null}={}) {
 ensureBounded(raw);let p;try{p=JSON.parse(raw);}catch{throw new Error("Invalid handoff JSON.");}
 object(p,["core","checksum"],"Handoff packet");
 object(p.core,allowed.core,"Handoff body");object(p.checksum,["algorithm","hex"],"Checksum");
 if(p.core.schema!==HANDOFF_SCHEMA||p.checksum.algorithm!=="SHA-256")throw new Error("Unsupported handoff version.");
 uuid(p.core.handoffId,"Handoff");plain(p.core.senderLabel,"Sender reference",0,120);
 plain(p.core.recipientLabel,"Recipient",2,120);plain(p.core.purpose,"Purpose",12,500);
 if(p.core.disclaimer!==disclaimer)throw new Error("Handoff limitations were altered.");
 const created=stamp(p.core.createdAt,"Created time"),expires=stamp(p.core.expiresAt,"Expiry time");
 lifetime(created,expires);
 validateHandoffManifest(p.core.manifest);
 const actual=await digest(p.core,subtle);
 if(sha(p.checksum.hex)!==actual)throw new Error("Handoff checksum mismatch; body differs from its recorded digest.");
 if(Date.parse(stamp(now,"Review time"))>Date.parse(expires))throw new Error("Handoff expired.");
 const expected=expectedChecksum?sha(expectedChecksum):null;
 return {packet:p,checksum:actual,externalChecksumMatched:expected===null?null:expected===actual,
   observations:p.core.manifest.observations.length,
   warning:"Local SHA-256 checksum verifies consistency, not sender identity, original evidence authenticity or custody."};
}
export async function verifyLocalEvidenceAgainstHandoff(result,evidenceId,buffer,{subtle}={}) {
 const observations=result?.packet?.core?.manifest?.observations;
 if(!Array.isArray(observations))throw new Error("Verify packet before checking local evidence.");
 const obs=observations.find(x=>x.evidenceId===evidenceId);
 if(!obs)throw new Error("Evidence ID is not in this handoff.");
 if(!(buffer instanceof ArrayBuffer)&&!ArrayBuffer.isView(buffer))
   throw new Error("Evidence must be an uploaded byte array.");
 if(buffer.byteLength!==obs.bytes)return {evidenceId,match:false,reason:"File size differs from recorded bytes."};
 const actual=await calculateSha256(buffer,subtle);
 const match=actual===obs.sha256;
 return {evidenceId,match,reason:match?
   "File bytes match the packet digest; original authenticity is not proven.":"File bytes differ from the packet digest."};
}
