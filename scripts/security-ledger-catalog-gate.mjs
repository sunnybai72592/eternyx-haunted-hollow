#!/usr/bin/env node
// Strict parser for the actual read-only PG catalog result. No network access.
// Fails if a row is missing, duplicated, unexpectedly passing, or the entire
// input is synthetic/empty. This cannot establish a remote staging run itself.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export const TABLES=Object.freeze([
 "pentest_engagements","pentest_evidence","pentest_audit_events",
 "security_case_assets","security_case_findings",
 "security_case_finding_evidence","security_case_finding_history",
]);
export const LEDGER=Object.freeze(TABLES.filter(x=>x.startsWith("security_case_")));
export const SQL_TRIGGERS=Object.freeze([
 "security_case_guard_asset_scope_trg","security_case_guard_finding_scope_trg",
 "security_case_record_finding_history_trg","security_case_record_evidence_link_trg",
]);
export const SQL_FKEYS=Object.freeze([
 "security_case_assets_parent_fk","security_case_findings_asset_fk",
 "security_case_finding_evidence_finding_fk","security_case_finding_evidence_private_object_fk",
 "security_case_finding_history_finding_fk",
]);
export const SQL_FUNCTIONS=Object.freeze([
 "security_case_guard_asset_scope","security_case_guard_finding_scope",
 "security_case_record_finding_history","security_case_record_evidence_link",
]);
export const EXPECTED_IDS=Object.freeze([
 ...TABLES.flatMap(t=>["table:"+t,"rls:"+t,"anon-deny-select:"+t,
   "authenticated-can-read:"+t,"owner-read-policy:"+t]),
 ...LEDGER.map(t=>"ledger-deny-delete:"+t),
 ...LEDGER.filter(t=>t!=="security_case_finding_history").map(t=>"ledger-write-owner-policy:"+t),
 ...["security_case_assets","security_case_findings"].map(t=>"ledger-update-owner-policy:"+t),
 ...SQL_TRIGGERS.map(x=>"trigger:"+x),
 ...SQL_FKEYS.map(x=>"composite-fk:"+x),
 ...SQL_FUNCTIONS.map(x=>"function-execute-denied:"+x),
 "private-evidence-bucket","private-storage-rls","history-append-only",
].sort());
const ROOT=resolve(fileURLToPath(new URL("..",import.meta.url)));
export function evaluateCatalogOutput(raw){
 if(typeof raw!=="string"||!raw.length||Buffer.byteLength(raw)>30000)
  throw new Error("Catalog output missing or exceeds 30 KiB.");
 const lines=raw.trim().split(/\r?\n/).filter(Boolean);
 if(lines.length!==EXPECTED_IDS.length)
  throw new Error("Catalog response does not contain all required check rows.");
 const seen=new Map();
 for(const line of lines){
  const match=/^([a-z][a-z0-9_:-]+)\|(pass|fail)$/.exec(line);
  if(!match)throw new Error("Invalid catalog check row.");
  if(seen.has(match[1]))throw new Error("Duplicate catalog check.");
  seen.set(match[1],match[2]);
 }
 for(const id of EXPECTED_IDS){
  if(!seen.has(id))throw new Error("Missing catalog check.");
  if(seen.get(id)!=="pass")throw new Error("Security catalog invariant failed: "+id);
 }
 if(seen.size!==EXPECTED_IDS.length)
  throw new Error("Unexpected catalog check.");
 return {passed:EXPECTED_IDS.length,hasPrivilegedCatalogScan:true,productionAuthorized:false};
}
export function sourceReleasePreflight(root=ROOT){
 const source=readFileSync(resolve(root,"scripts/sql/staged-security-case-ledger.sql"),"utf8");
 const catalog=readFileSync(resolve(root,"scripts/sql/security-ledger-catalog-gate.sql"),"utf8");
 const migrationPaths=[
  "supabase/migrations/20261111210000_pentest_engagement_management.sql",
  "supabase/migrations/20261111220000_pentest_evidence_and_audit.sql",
 ];
 if(!source.startsWith("-- ETERNYX Wave 4 security case ledger")||
   !source.includes("STAGED SQL PROPOSAL ONLY")||
   !source.includes("ENABLE ROW LEVEL SECURITY")||
   source.includes("DISABLE ROW LEVEL SECURITY")||
   !catalog.includes("BEGIN TRANSACTION READ ONLY;")||
   !catalog.includes("COMMIT;"))throw new Error("Reviewed staged source or read-only catalog gate unsafe.");
 const parents=migrationPaths.map(path=>readFileSync(resolve(root,path)));
 return {
  sourceSha256:createHash("sha256").update(source).digest("hex"),
  catalogSha256:createHash("sha256").update(catalog).digest("hex"),
  parentSha256:parents.map(content=>createHash("sha256").update(content).digest("hex")),
  readOnlyCatalogChecks:EXPECTED_IDS.length,
  stagingDeploymentPerformed:false,productionAuthorized:false,
  manualReleaseBlockers:[
   "Confirm isolated staging ref, DB backup and reviewed migration sequence before staging apply.",
   "Run real staging catalog scan under an approved read-only inspector role.",
   "Run two-account HTTP and private Storage isolation acceptance with actual staging fixtures.",
   "Verify staging-only INSERT/UPDATE denial, scope revocation and failed migration rollback.",
   "Independent reviewer must approve recovery and production change plan.",
  ],
 };
}
function command(){
 const arg=process.argv[2]??"--explain";
 if(process.argv.length>3||!["--check-source","--evaluate","--explain"].includes(arg)){
  process.stderr.write("Use --check-source, --evaluate or --explain.\n");return 2;
 }
 try{
  if(arg==="--evaluate"){
   const verdict=evaluateCatalogOutput(readFileSync(0,"utf8"));
   process.stdout.write("PASS: "+verdict.passed+" PostgreSQL read-only catalog invariants; NOT production approval.\n");
   return 0;
  }
  const plan=sourceReleasePreflight();
  if(arg==="--check-source"){
   process.stdout.write(JSON.stringify(plan,null,2)+"\n");
  }else{
   process.stdout.write("PRODUCTION BLOCKED: staged migration source audited, NOT deployed. "+
    plan.readOnlyCatalogChecks+" required read-only catalog checks.\n");
   process.stdout.write(plan.manualReleaseBlockers.map((x,i)=>(i+1)+". "+x).join("\n")+"\n");
  }
  return 0;
 }catch(error){
  process.stderr.write("BLOCKED: "+(error instanceof Error?error.message:"Unknown error")+"\n");
  return 1;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=command();
