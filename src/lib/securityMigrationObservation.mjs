// Wave 15: migration history report is a limited observation, not deployment attestation.
export const MIGRATION_OBSERVATION_SCHEMA="eternyx.cybersecurity.staging-migration-observation.v1";
export const MIGRATION_SQL_CHECKS=Object.freeze([
 "history-engagement","history-evidence","table-engagement","table-evidence",
 "table-ledger-assets","table-ledger-findings","table-ledger-evidence","table-ledger-history",
]);
const REF=/^[a-z0-9]{8,32}$/;
const HASH=/^[0-9a-f]{64}$/;
const insist=(ok,message)=>{if(!ok)throw new Error(message);};
const shape=(v,keys)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function parseMigrationObservationSql(raw){
 insist(typeof raw==="string"&&raw.length>0&&new TextEncoder().encode(raw).length<8192,
  "Read-only SQL result missing or oversized.");
 const lines=raw.trim().split(/\r?\n/).filter(Boolean);
 insist(lines.length===MIGRATION_SQL_CHECKS.length,
  "Read-only SQL output is missing required checks.");
 const checks=lines.map((line,i)=>{
  const match=/^([a-z][a-z-]+)\|(present|missing)$/.exec(line);
  insist(match&&match[1]===MIGRATION_SQL_CHECKS[i],
   "Read-only SQL check is malformed or out of order.");
  return {id:match[1],status:match[2]};
 });
 insist(checks.slice(0,4).every(x=>x.status==="present"),
  "Existing security migration history or baseline tables are missing in staging.");
 const ledger=checks.slice(4);
 insist(ledger.every(x=>x.status===ledger[0].status),
  "Ledger relation set is partially deployed or inconsistent.");
 return {checks,ledgerTables:ledger[0].status==="present"?"present-unlinked":"missing"};
}
export function validateMigrationObservation(input){
 const keys=["schema","stagingProjectRef","productionProjectRef","observedAt",
 "sourceSha256","querySha256","baselineMigrations","ledgerTables","ledgerMigrationHistory",
 "checks","trust","productionAuthorized","limitations"];
 insist(shape(input,keys),"Migration observation has missing or extra fields.");
 insist(input.schema===MIGRATION_OBSERVATION_SCHEMA&&REF.test(input.stagingProjectRef)&&
  REF.test(input.productionProjectRef)&&input.stagingProjectRef!==input.productionProjectRef,
  "Migration observation is not a distinct staging environment.");
 insist(typeof input.observedAt==="string"&&Number.isFinite(Date.parse(input.observedAt)),
  "Migration observation timestamp is invalid.");
 insist(HASH.test(input.sourceSha256)&&HASH.test(input.querySha256),
  "Migration observation source fingerprints missing.");
 insist(shape(input.baselineMigrations,["engagement","evidence"])&&
  input.baselineMigrations.engagement==="recorded-observed"&&
  input.baselineMigrations.evidence==="recorded-observed",
  "Existing baseline migrations have not been observed.");
 insist(["missing","present-unlinked"].includes(input.ledgerTables)&&
  input.ledgerMigrationHistory==="unverified"&&
  input.trust==="operator-reported-readonly-observation"&&input.productionAuthorized===false,
  "Cannot claim ledger migration deployment or release.");
 insist(Array.isArray(input.checks)&&input.checks.length===MIGRATION_SQL_CHECKS.length,
  "Required SQL observations were not all returned.");
 insist(MIGRATION_SQL_CHECKS.every((id,i)=>{
  const x=input.checks[i];
  return shape(x,["id","status"])&&x.id===id&&["present","missing"].includes(x.status)&&
   (i<4?x.status==="present":
    x.status===(input.ledgerTables==="missing"?"missing":"present"));
 }),"Migration observation checks contradict their declared state.");
 insist(Array.isArray(input.limitations)&&input.limitations.length===3&&
  input.limitations.every(x=>typeof x==="string"&&x.length>=20&&x.length<=240),
  "Migration observation limitations missing.");
 return input;
}
