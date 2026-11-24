// Wave 17: immutable summary of a specifically scoped staging migration deployment.
// An imported report is an unsigned observation, never an authenticated release approval.
export const W17_STAGING_REF="mhodwvypfbxafamkrgsk";
export const W17_DEPLOYMENTS=Object.freeze([
 {name:"pentest_engagement_management_staging_baseline",version:"20261123215132",
  source:"supabase/migrations/20261111210000_pentest_engagement_management.sql",
  sha256:"131411face266582e889f37e8e4a6821d78f3f46a33e6697d5f7427fbb65b77d"},
 {name:"pentest_evidence_and_audit_staging_baseline",version:"20261123215141",
  source:"supabase/migrations/20261111220000_pentest_evidence_and_audit.sql",
  sha256:"369f2d92db82b39ac1b0732b742ce57dfe4528ec36413a4141a8e14bdc071a22"},
 {name:"security_case_indexed_ledger_staging_v1",version:"20261123215211",
  source:"scripts/sql/staged-security-case-ledger.sql",
  sha256:"5690769dd6f00819d304f6b18f25445d1179556760e88a96d898f1ce206424e2"}
]);
export const W17_TABLES=Object.freeze([
 "pentest_engagements","pentest_evidence","pentest_audit_events",
 "security_case_assets","security_case_findings",
 "security_case_finding_evidence","security_case_finding_history"
]);
export const W17_CHECK_IDS=Object.freeze([
 "auth-two-user-fixtures",
 ...W17_DEPLOYMENTS.map(x=>"migration:"+x.name),
 "private-evidence-bucket",
 ...W17_TABLES.map(x=>"rls:"+x)
].sort());
export const W17_REPORT_SCHEMA="eternyx.cybersecurity.live-staging-source-audit.v1";
const REF=/^[a-z0-9]{8,32}$/;
const HASH=/^[0-9a-f]{64}$/;
function good(cond,message){if(!cond)throw new Error(message);}
function exact(v,keys,label){
 good(v&&typeof v==="object"&&!Array.isArray(v)&&
  Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),
  label+" fields are missing or unexpected.");
}
export function parseWave17Catalog(raw){
 good(typeof raw==="string"&&raw.length>0&&new TextEncoder().encode(raw).length<=8192,
  "Staging SQL output is missing or oversized.");
 const rows=raw.trim().split(/\r?\n/);
 good(rows.length===W17_CHECK_IDS.length,"Missing or duplicate staging audit rows.");
 const checks=rows.map((line,i)=>{
  const parts=/^([a-z0-9_:-]+)\|(pass|blocked)$/.exec(line);
  good(!!parts&&parts[1]===W17_CHECK_IDS[i],
   "Staging audit rows are missing, duplicated, out of order or malformed.");
  const allowed=parts[1]==="auth-two-user-fixtures";
  good(parts[2]==="pass"||(allowed&&parts[2]==="blocked"),
   "The staging security schema or migration source has an unsuccessful check.");
  return {id:parts[1],status:parts[2]};
 });
 return {checks,checksPassed:checks.filter(x=>x.status==="pass").length,
  authFixturesPresent:checks[0].status==="pass"};
}
export function validateWave17AuditReport(v){
 exact(v,["schema","stagingRef","productionRef","observedAt","checks","checksPassed",
  "authFixturesPresent","sourceHashMatched","rlsTables","catalogPassed",
  "jwtHttpAcceptance","trust","productionAuthorized","limitations"],"Wave 17 report");
 good(v.schema===W17_REPORT_SCHEMA&&v.stagingRef===W17_STAGING_REF&&REF.test(v.productionRef)&&
  v.productionRef!==v.stagingRef,"Report must be for the exact isolated staging project.");
 good(typeof v.observedAt==="string"&&Number.isFinite(Date.parse(v.observedAt)),
  "Invalid observation time.");
 good(Array.isArray(v.checks)&&v.checks.length===W17_CHECK_IDS.length&&
  v.checks.every((c,i)=>{
   try{exact(c,["id","status"],"Check");}catch{return false;}
   return c.id===W17_CHECK_IDS[i]&&
    (c.status==="pass"||(i===0&&c.status==="blocked"));
  }),"Wave 17 report has missing or failing checks.");
 const count=v.checks.filter(x=>x.status==="pass").length;
 good(v.checksPassed===count&&v.authFixturesPresent===(v.checks[0].status==="pass")&&
  v.sourceHashMatched===true&&v.rlsTables===W17_TABLES.length&&
  v.catalogPassed===60&&v.jwtHttpAcceptance==="not-tested"&&
  v.trust==="unsigned-operator-staging-observation"&&v.productionAuthorized===false,
  "Staging report overstates verified authorization or deployment.");
 good(Array.isArray(v.limitations)&&v.limitations.length===3&&v.limitations.every(s=>
  typeof s==="string"&&s.length>=30&&s.length<=250),
  "Staging report's trust limitations are missing.");
 return v;
}
