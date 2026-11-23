// Wave 14 - Structured, unsigned result for a staging-only PostgreSQL write rehearsal.
export const WRITE_RECEIPT_SCHEMA="eternyx.cybersecurity.staging-db-write-rollback.v1";
const REF=/^[a-z0-9]{8,32}$/;
const HEX=/^[0-9a-f]{64}$/;
export function validateWriteReceipt(v){
 if(!v||typeof v!=="object"||Array.isArray(v))throw new Error("Write receipt missing.");
 const keys=["schema","stagingProjectRef","productionProjectRef","observedAt",
 "status","mode","transactionRolledBack","sourceSha256","productionAuthorized","limitations"];
 if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))
  throw new Error("Write receipt fields are incomplete.");
 if(v.schema!==WRITE_RECEIPT_SCHEMA||!REF.test(v.stagingProjectRef)||
  !REF.test(v.productionProjectRef)||v.stagingProjectRef===v.productionProjectRef||
  !Number.isFinite(Date.parse(v.observedAt))||
  v.status!=="operator-reported-pass"||
  v.mode!=="database-role-emulation-not-http-jwt"||
  v.transactionRolledBack!==true||v.productionAuthorized!==false||
  typeof v.sourceSha256!=="string"||!HEX.test(v.sourceSha256)||
  !Array.isArray(v.limitations)||v.limitations.length!==2||
  v.limitations.some(s=>typeof s!=="string"||s.length<16||s.length>230))
  throw new Error("Write receipt contradicts staging-only and rollback boundaries.");
 return v;
}
