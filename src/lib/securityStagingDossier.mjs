// Wave 14: offline, browser-compatible review of an unsigned staging evidence dossier.
// A SHA-256 digest validates internal consistency, NOT the report's source or operator.
export const DOSSIER_SCHEMA="eternyx.cybersecurity.staging-evidence-dossier.v1";
export const DOSSIER_LIMIT=128*1024;
export const EVIDENCE_IDS=Object.freeze([
 "live-two-account-data-api","live-jwt-http-baseline","live-jwt-http-revocation",
 "staging-pg-catalog","staging-transactional-write-rollback",
 "verified-migration-history","verified-backup-restore","independent-signed-approval",
]);
export const REQUIRED_PRODUCTION_BLOCKERS=Object.freeze([
 "Actual isolated staging environment identity, fixture ownership and migration history must be independently verified.",
 "Real two-account JWT, storage and write authorization evidence must be reviewed by an independent operator.",
 "PostgreSQL policy, grants, trigger and rollback checks must be independently tied to the intended staging project.",
 "Prove restore/rollback, monitoring and incident response with real staged infrastructure.",
 "Obtain a named, independently authenticated security and deployment approval before production promotion.",
]);
const HEX=/^[0-9a-f]{64}$/;
const REF=/^[a-z0-9]{8,32}$/;
const isObj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const exact=(v,keys,label)=>{
 if(!isObj(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))
  throw new Error(label+" fields are incomplete or unexpected.");
};
function stable(value){
 if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
 if(isObj(value))return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
 if(typeof value==="string"||typeof value==="boolean"||value===null||
   (typeof value==="number"&&Number.isFinite(value)))return JSON.stringify(value);
 throw new Error("Noncanonical dossier data was rejected.");
}
export function canonicalDossierCore(core){return stable(core);}
function bounded(raw){
 if(typeof raw!=="string"||!raw||new TextEncoder().encode(raw).length>DOSSIER_LIMIT)
  throw new Error("Dossier JSON must be at most 128 KiB.");
 return raw;
}
async function hash(data,subtle){
 const provider=subtle??globalThis.crypto?.subtle;
 if(!provider)throw new Error("WebCrypto SHA-256 is required for dossier integrity.");
 const bytes=typeof data==="string"?new TextEncoder().encode(data):data;
 const digest=await provider.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
function validateCore(core){
 exact(core,["schema","createdAt","stagingRef","productionRef","production",
  "trust","evidence","sourceFingerprints","blockers","summary","limitations"],"Dossier body");
 if(core.schema!==DOSSIER_SCHEMA||core.production!=="blocked"||
    core.trust!=="unsigned-local-consistency-only")
  throw new Error("Dossier must preserve its blocked production trust boundary.");
 if(!REF.test(core.stagingRef)||!REF.test(core.productionRef)||
    core.stagingRef===core.productionRef)throw new Error("Staging and production refs must be distinct.");
 if(typeof core.createdAt!=="string"||!Number.isFinite(Date.parse(core.createdAt)))
  throw new Error("Dossier creation timestamp invalid.");
 if(!Array.isArray(core.evidence)||core.evidence.length!==EVIDENCE_IDS.length)
  throw new Error("All expected staging evidence categories must be reported.");
 for(let i=0;i<core.evidence.length;i++){
  const v=core.evidence[i];
  exact(v,["id","status","sha256","observedAt","scope"],"Evidence entry");
  const missing=v.status==="missing";
  if(v.id!==EVIDENCE_IDS[i]||!["missing","locally-validated-unattested"].includes(v.status)||
    (missing?!(v.sha256===null&&v.observedAt===null):!HEX.test(v.sha256)||
       typeof v.observedAt!=="string"||!Number.isFinite(Date.parse(v.observedAt)))||
    typeof v.scope!=="string"||v.scope.length<12||v.scope.length>180)
   throw new Error("Evidence entry contradicts its declared state.");
 }
 exact(core.sourceFingerprints,["ledger","catalog","parentMigrations"],"Source fingerprint set");
 if(!HEX.test(core.sourceFingerprints.ledger)||!HEX.test(core.sourceFingerprints.catalog)||
    !Array.isArray(core.sourceFingerprints.parentMigrations)||
    core.sourceFingerprints.parentMigrations.length!==2||
    !core.sourceFingerprints.parentMigrations.every(s=>typeof s==="string"&&HEX.test(s)))
  throw new Error("Source SHA-256 fingerprints are missing.");
 if(!Array.isArray(core.blockers)||core.blockers.length!==REQUIRED_PRODUCTION_BLOCKERS.length||
   core.blockers.some((v,i)=>v!==REQUIRED_PRODUCTION_BLOCKERS[i]))
  throw new Error("Production release blockers cannot be removed.");
 exact(core.summary,["provided","missing","completeLocalReview","independentlyAttested","productionApproved"],"Dossier summary");
 const count=core.evidence.filter(x=>x.status==="locally-validated-unattested").length;
 if(core.summary.provided!==count||core.summary.missing!==EVIDENCE_IDS.length-count||
   core.summary.completeLocalReview!==false||
   core.summary.independentlyAttested!==false||core.summary.productionApproved!==false)
  throw new Error("Dossier summary cannot claim approval or verification.");
 if(!Array.isArray(core.limitations)||core.limitations.length!==3||
   core.limitations.some(s=>typeof s!=="string"||s.length<20||s.length>240))
  throw new Error("Dossier must disclose incomplete trust boundaries.");
 return core;
}
export async function createStagingDossier(core,subtle){
 validateCore(core);
 const checksum={algorithm:"SHA-256",hex:await hash(stable(core),subtle)};
 const dossier={core,checksum};
 bounded(JSON.stringify(dossier));
 return dossier;
}
export async function inspectStagingDossier(raw,subtle){
 bounded(raw);
 let data;
 try{data=JSON.parse(raw);}catch{throw new Error("Dossier JSON is invalid.");}
 exact(data,["core","checksum"],"Dossier");
 validateCore(data.core);
 exact(data.checksum,["algorithm","hex"],"Dossier checksum");
 if(data.checksum.algorithm!=="SHA-256"||typeof data.checksum.hex!=="string"||
    !HEX.test(data.checksum.hex))throw new Error("Unknown dossier checksum format.");
 const computed=await hash(stable(data.core),subtle);
 if(computed!==data.checksum.hex)throw new Error("Dossier was altered after checksum creation.");
 return {core:data.core,checksum:computed,production:"blocked",
  attestation:"none",warning:"Unsigned checksum confirms only internal consistency, not real staging execution."};
}
export function makeDossierCore({stagingRef,productionRef,observedAt,files,sourceFingerprints}){
 const evidence=EVIDENCE_IDS.map(id=>{
  const record=files[id]??null;
  return {id,status:record?"locally-validated-unattested":"missing",
    sha256:record?.sha256??null,observedAt:record?.observedAt??null,
    scope:({
     "live-two-account-data-api":"Wave 10 private read, cross-account RLS and Storage",
     "live-jwt-http-baseline":"Wave 13 authenticated JWT baseline and seven-table visibility",
     "live-jwt-http-revocation":"Wave 13 operator-driven attestation revocation and audit",
     "staging-pg-catalog":"Wave 11 sixty PostgreSQL policy and privilege checks",
     "staging-transactional-write-rollback":"Wave 12 database-role write tests, revocation and rollback",
     "verified-migration-history":"Independent staging migration history and approved change set",
     "verified-backup-restore":"Actual staging restore/rollback and recovery exercise",
     "independent-signed-approval":"Authenticated independent security and release approval",
    })[id]};
 });
 const provided=evidence.filter(x=>x.status==="locally-validated-unattested").length;
 return {
  schema:DOSSIER_SCHEMA,createdAt:observedAt,stagingRef,productionRef,
  production:"blocked",trust:"unsigned-local-consistency-only",evidence,
  sourceFingerprints,blockers:[...REQUIRED_PRODUCTION_BLOCKERS],
  summary:{provided,missing:EVIDENCE_IDS.length-provided,completeLocalReview:false,
   independentlyAttested:false,productionApproved:false},
  limitations:[
   "Submitted files and their SHA-256 digests are unsigned operator claims and can be fabricated.",
   "Same staging project and compatible timestamps do not authenticate real deployments or prove ownership.",
   "Neither this dossier nor the release UI runs migrations, approves production, or validates independent signatures.",
  ],
 };
}
