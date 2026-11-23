// Cybersecurity Wave 16: browser-compatible local recovery evidence review.
// Everything here is operator-supplied and UNSIGNED. No release is authorized.
import { RECOVERY_REQUIRED } from "./securityStagingRecoveryReadiness.mjs";
import { validateMigrationObservation } from "./securityMigrationObservation.mjs";
export const RECOVERY_PACKET_SCHEMA="eternyx.cybersecurity.recovery-acceptance.v1";
export const RECOVERY_PACKET_MAX_BYTES=48*1024;
export const RECOVERY_EVIDENCE_IDS=Object.freeze(RECOVERY_REQUIRED.map(x=>x.id));
const HEX=/^[0-9a-f]{64}$/;
const REF=/^[a-z0-9]{8,32}$/;
const valid=cond=>{if(!cond)throw new Error("Recovery evidence is incomplete, inconsistent or untrusted.");};
const obj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const shape=(v,keys)=>obj(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
function instant(s){valid(typeof s==="string"&&ISO.test(s)&&Number.isFinite(Date.parse(s)));return Date.parse(s);}
const FIELDS=["backupCompletedAt","incidentDeclaredAt","restoreStartedAt","serviceRestoredAt","newestRecoveredDataAt"];
export function calculateRecoveryMetrics(timeline){
 valid(shape(timeline,FIELDS));
 if(FIELDS.every(f=>timeline[f]===null))return {rtoSeconds:null,rpoSeconds:null};
 valid(FIELDS.every(f=>typeof timeline[f]==="string"));
 const times=Object.fromEntries(FIELDS.map(k=>[k,instant(timeline[k])]));
 valid(times.backupCompletedAt<=times.incidentDeclaredAt&&
   times.incidentDeclaredAt<=times.restoreStartedAt&&
   times.restoreStartedAt<=times.serviceRestoredAt&&
   times.newestRecoveredDataAt<=times.incidentDeclaredAt&&
   times.newestRecoveredDataAt>=times.backupCompletedAt);
 const rto=(times.serviceRestoredAt-times.incidentDeclaredAt)/1000;
 const rpo=(times.incidentDeclaredAt-times.newestRecoveredDataAt)/1000;
 valid(Number.isSafeInteger(rto)&&Number.isSafeInteger(rpo)&&
  rto>=0&&rpo>=0&&rto<=7*86400&&rpo<=7*86400);
 return {rtoSeconds:rto,rpoSeconds:rpo};
}
export function validateRecoveryOperatorPlan(v){
 valid(shape(v,["schema","stagingRef","recoveryRef","productionRef","observedAt",
  "timeline","artifactDigests","limitations"]));
 valid(v.schema==="eternyx.cybersecurity.recovery-operator-plan.v1"&&
   REF.test(v.stagingRef)&&REF.test(v.recoveryRef)&&REF.test(v.productionRef)&&
   new Set([v.stagingRef,v.recoveryRef,v.productionRef]).size===3);
 instant(v.observedAt);
 const metrics=calculateRecoveryMetrics(v.timeline);
 valid(shape(v.artifactDigests,RECOVERY_EVIDENCE_IDS));
 for(const id of RECOVERY_EVIDENCE_IDS)valid(v.artifactDigests[id]===null||
   (typeof v.artifactDigests[id]==="string"&&HEX.test(v.artifactDigests[id])));
 // No self-declared document can establish independent authenticated approval.
 valid(v.artifactDigests["independent-approval"]===null);
 if(metrics.rtoSeconds!==null){
  valid(v.artifactDigests["restore-execution"]!==null&&
   v.artifactDigests["recoverable-backup-reference"]!==null);
 }
 valid(Array.isArray(v.limitations)&&v.limitations.length===2&&v.limitations.every(
   x=>typeof x==="string"&&x.length>=18&&x.length<=250));
 return v;
}
export function validateRecoveryPacket(packet){
 valid(shape(packet,["schema","stagingRef","recoveryRef","productionRef","observedAt",
  "sourceHashes","migration","catalog","timeline","metrics","requirements","trust",
  "productionAuthorized","independentApproval","limitations"]));
 valid(packet.schema===RECOVERY_PACKET_SCHEMA&&
   REF.test(packet.stagingRef)&&REF.test(packet.recoveryRef)&&REF.test(packet.productionRef)&&
   new Set([packet.stagingRef,packet.recoveryRef,packet.productionRef]).size===3);
 instant(packet.observedAt);
 valid(shape(packet.sourceHashes,["ledgerProposal","migrationQuery","recoveryCatalog"])&&
   HEX.test(packet.sourceHashes.ledgerProposal)&&HEX.test(packet.sourceHashes.migrationQuery)&&
   (packet.sourceHashes.recoveryCatalog===null||HEX.test(packet.sourceHashes.recoveryCatalog)));
 valid(shape(packet.migration,["status","observedAt","sha256"])&&
  ["missing","operator-reported-history-only"].includes(packet.migration.status)&&
  (packet.migration.status==="missing"?
    packet.migration.observedAt===null&&packet.migration.sha256===null:
    typeof packet.migration.observedAt==="string"&&HEX.test(packet.migration.sha256)));
 if(packet.migration.status!=="missing")instant(packet.migration.observedAt);
 valid(shape(packet.catalog,["status","sha256","checkCount"])&&
  ["missing","operator-reported-60-check-pass"].includes(packet.catalog.status)&&
  (packet.catalog.status==="missing"?
   packet.catalog.sha256===null&&packet.catalog.checkCount===0:
   HEX.test(packet.catalog.sha256)&&packet.catalog.checkCount===60));
 const computed=calculateRecoveryMetrics(packet.timeline);
 valid(shape(packet.metrics,["rtoSeconds","rpoSeconds"])&&
  packet.metrics.rtoSeconds===computed.rtoSeconds&&packet.metrics.rpoSeconds===computed.rpoSeconds);
 valid(Array.isArray(packet.requirements)&&packet.requirements.length===RECOVERY_EVIDENCE_IDS.length);
 for(let i=0;i<RECOVERY_EVIDENCE_IDS.length;i++){
  const item=packet.requirements[i];
  valid(shape(item,["id","status","sha256"])&&item.id===RECOVERY_EVIDENCE_IDS[i]&&
   ["missing","operator-supplied-unsigned"].includes(item.status)&&
   (item.status==="missing"?item.sha256===null:HEX.test(item.sha256)));
 }
 valid(packet.requirements.at(-1).status==="missing");
 if(computed.rtoSeconds!==null)valid(packet.requirements.some(x=>
  x.id==="restore-execution"&&x.status==="operator-supplied-unsigned"));
 valid(packet.trust==="unsigned-operator-evidence-only"&&
   packet.productionAuthorized===false&&packet.independentApproval===false);
 valid(Array.isArray(packet.limitations)&&packet.limitations.length===3&&
   packet.limitations.every(x=>typeof x==="string"&&x.length>=25&&x.length<=250));
 return packet;
}
export function buildRecoveryPacket(plan,{migration=null,catalogDigest=null,
 ledgerSha256,migrationQuerySha256,observedAt=plan.observedAt}={}){
 validateRecoveryOperatorPlan(plan);
 instant(observedAt);
 valid(HEX.test(ledgerSha256)&&HEX.test(migrationQuerySha256));
 if(catalogDigest!==null)valid(HEX.test(catalogDigest));
 let m={status:"missing",observedAt:null,sha256:null};
 if(migration){
  validateMigrationObservation(migration.payload);
  valid(migration.payload.stagingProjectRef===plan.stagingRef&&
    migration.payload.productionProjectRef===plan.productionRef&&
    migration.payload.sourceSha256===ledgerSha256&&HEX.test(migration.sha256));
  valid(instant(migration.payload.observedAt)<=instant(observedAt));
  valid(instant(observedAt)-instant(migration.payload.observedAt)<=7*86400000);
  m={status:"operator-reported-history-only",
    observedAt:migration.payload.observedAt,sha256:migration.sha256};
 }
 const metrics=calculateRecoveryMetrics(plan.timeline);
 if(metrics.rtoSeconds!==null){
  valid(instant(plan.timeline.serviceRestoredAt)<=instant(observedAt)&&
    instant(observedAt)-instant(plan.timeline.serviceRestoredAt)<=7*86400000);
 }
 const packet={
  schema:RECOVERY_PACKET_SCHEMA,stagingRef:plan.stagingRef,
  recoveryRef:plan.recoveryRef,productionRef:plan.productionRef,observedAt,
  sourceHashes:{ledgerProposal:ledgerSha256,migrationQuery:migrationQuerySha256,
    recoveryCatalog:catalogDigest},
  migration:m,
  catalog:{status:catalogDigest===null?"missing":"operator-reported-60-check-pass",
   sha256:catalogDigest,checkCount:catalogDigest===null?0:60},
  timeline:plan.timeline,metrics,
  requirements:RECOVERY_EVIDENCE_IDS.map(id=>({
   id,status:plan.artifactDigests[id]===null?"missing":"operator-supplied-unsigned",
   sha256:plan.artifactDigests[id]
  })),
  trust:"unsigned-operator-evidence-only",productionAuthorized:false,
  independentApproval:false,
  limitations:[
   "Operator files and SHA-256 checksums can be forged; no remote project identity or backup restore is authenticated.",
   "The reported recovery RTO and RPO values come only from submitted timestamps and are not independently measured.",
   "A clean catalog result and SQL history are not proof of restored data, deployed migration source bytes, or release approval.",
  ],
 };
 return validateRecoveryPacket(packet);
}
export function parseRecoveryPacketJson(raw){
 valid(typeof raw==="string"&&raw.length>0&&
   new TextEncoder().encode(raw).length<=RECOVERY_PACKET_MAX_BYTES);
 let data;try{data=JSON.parse(raw);}catch{throw new Error("Recovery JSON invalid.");}
 return validateRecoveryPacket(data);
}
