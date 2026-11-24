// Offline comparison of independently collected read-only staging evidence.
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {validateSnapshot} from "./automation-stage-snapshot-preflight.mjs";
import {PROTECTED_TABLES,OBSERVED_VERSIONS,buildCandidate} from "./automation-additive-replay-candidate.mjs";
const fail=x=>{throw Error("occupied_stage_"+x);};
const names=["pentest_engagement_management_staging_baseline","pentest_evidence_and_audit_staging_baseline","security_case_indexed_ledger_staging_v1"];
export function validateCatalog(c){
 if(!c||c.schema!=="eternyx-occupied-stage-catalog-v1"||c.postgres_major!==17||!Array.isArray(c.tables)||c.tables.length!==PROTECTED_TABLES.length)fail("catalog_shape");
 const map=new Map();
 for(const t of c.tables){
  if(!t||!PROTECTED_TABLES.includes(t.name)||map.has(t.name)||t.rls!==true||typeof t.catalog_fingerprint!=="string"||!/^[a-f0-9]{32}$/.test(t.catalog_fingerprint))fail("protected_table");
  map.set(t.name,t.catalog_fingerprint);
 }
 for(const field of ["automation_ctf_tables","automation_ctf_rpcs"])if(!Number.isSafeInteger(c[field])||c[field]<0)fail("catalog_counts");
 return map;
}
export function reconcileBefore(snapshot,catalog,candidate){
 const {versions,slugs}=validateSnapshot(snapshot);
 validateCatalog(catalog);
 if(versions.length!==OBSERVED_VERSIONS.length||OBSERVED_VERSIONS.some((v,i)=>!snapshot.migrations.some(m=>m.version===v&&m.name===names[i])))fail("journal_drift");
 if(slugs.length!==0||catalog.automation_ctf_tables!==0||catalog.automation_ctf_rpcs!==0)fail("existing_core_objects");
 if(!candidate||candidate.schema!=="eternyx-additive-replay-candidate-v1"||candidate.sourceBaselineValid!==true||candidate.remoteExecutionAuthorized!==false||!Array.isArray(candidate.files)||candidate.files.length<23)fail("candidate_shape");
 const selected=new Set();
 for(const f of candidate.files){
  if(!f||typeof f.name!=="string"||!/^20\d{12}_[a-z0-9_]+\.sql$/.test(f.name)||f.version!==f.name.slice(0,14)||selected.has(f.version)||versions.includes(f.version)||!(/^[a-f0-9]{64}$/).test(f.sha256))fail("candidate_identity");
  selected.add(f.version);
 }
 return {schema:"eternyx-occupied-stage-reconciliation-v1",journalMatched:true,existingSecurityTables:catalog.tables.length,candidateCount:selected.size,coreSchemaAbsent:true,reviewedCatalogOnly:true,sqlApplied:false,releaseAuthorized:false,requiresIndependentLiveReplayEvidence:true};
}
export function compareProtectedCatalogs(before,after){
 const a=validateCatalog(before),b=validateCatalog(after);
 const changed=[...a.keys()].filter(k=>a.get(k)!==b.get(k));
 return {protectedSchemaUnchanged:changed.length===0,changedTables:changed,rowContentsVerified:false,releaseAuthorized:false};
}
async function main(args){
 if(args.length===3&&args[0]==="--before"){
  const read=async p=>JSON.parse(await readFile(p,"utf8"));
  console.log(JSON.stringify(reconcileBefore(await read(args[1]),await read(args[2]),await buildCandidate()),null,2));
 }else if(args.length===3&&args[0]==="--compare"){
  const read=async p=>JSON.parse(await readFile(p,"utf8"));
  const r=compareProtectedCatalogs(await read(args[1]),await read(args[2]));
  console.log(JSON.stringify(r,null,2));if(!r.protectedSchemaUnchanged)process.exitCode=2;
 }else fail("arguments");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error(/^occupied_stage_[a-z_]+$/.test(e.message)?e.message:"occupied_stage_unavailable");process.exitCode=1;});
