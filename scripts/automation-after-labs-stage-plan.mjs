// Read-only reconciliation for shared stage after LABS rollout. No deployment.
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {validateSnapshot} from "./automation-stage-snapshot-preflight.mjs";
import {buildCandidate,CTF,PROTECTED_TABLES} from "./automation-additive-replay-candidate.mjs";
export const JOURNAL=Object.freeze([
 ["20261123215132","pentest_engagement_management_staging_baseline"],
 ["20261123215141","pentest_evidence_and_audit_staging_baseline"],
 ["20261123215211","security_case_indexed_ledger_staging_v1"],
 ["20261124121732","labs_20261122170000_ctf_verified_missions"],
 ["20261124121741","labs_20261122180000_ctf_range_session_control"],
 ["20261124121744","labs_20261122190000_ctf_range_access_grants"],
 ["20261124121747","labs_20261122200000_ctf_worker_fencing_budget"],
 ["20261124121749","labs_20261123041000_ctf_hosted_spend_reservations"],
 ["20261124121752","labs_20261124123000_ctf_range_session_column_privacy"]
].map(Object.freeze));
export const TABLES=Object.freeze([...PROTECTED_TABLES,"ctf_hosted_spend_policy","ctf_hosted_spend_reservations","ctf_range_access_grants","ctf_range_provider","ctf_range_sessions","ctf_range_worker_lease","ctf_verified_solves","ctf_verify_rate"].sort());
export const LABS_FUNCTIONS=Object.freeze(["ctf-range-control","ctf-verified"]);
const fail=x=>{throw Error("labs_stage_"+x);};
const digest=x=>typeof x==="string"&&/^[a-f0-9]{32}$/.test(x);
function catalog(c){
 if(!c||c.schema!=="eternyx-labs-occupied-stage-catalog-v2"||c.postgres_major!==17||!Array.isArray(c.tables)||c.tables.length!==TABLES.length||!digest(c.ctf_rpc_fingerprint)||c.ctf_rpc_service_only!==true)fail("catalog");
 const map=new Map();
 for(const t of c.tables){if(!t||!TABLES.includes(t.name)||map.has(t.name)||t.rls!==true||!digest(t.catalog_fingerprint))fail("protected_table");map.set(t.name,t.catalog_fingerprint);}
 for(const k of ["automation_tables","automation_rpcs"])if(!Number.isSafeInteger(c[k])||c[k]<0)fail("counts");
 return map;
}
function functions(snapshot){
 if(!Array.isArray(snapshot.functions)||snapshot.functions.length!==LABS_FUNCTIONS.length)fail("function_inventory");
 for(const slug of LABS_FUNCTIONS){
  const f=snapshot.functions.find(f=>f.slug===slug);
  if(!f||f.status!=="ACTIVE"||f.verify_jwt!==true||!Number.isSafeInteger(f.version)||f.version<1||typeof f.ezbr_sha256!=="string"||!/^[a-f0-9]{64}$/.test(f.ezbr_sha256))fail("function_identity");
 }
}
export function reconcile(snapshot,c,candidate){
 validateSnapshot(snapshot);catalog(c);functions(snapshot);
 if(snapshot.migrations.length!==JOURNAL.length||JOURNAL.some(([version,name])=>!snapshot.migrations.some(m=>m.version===version&&m.name===name)))fail("journal_drift");
 if(c.automation_tables!==0||c.automation_rpcs!==0)fail("partial_automation");
 if(!candidate||candidate.schema!=="eternyx-additive-replay-candidate-v1"||candidate.sourceBaselineValid!==true||candidate.remoteExecutionAuthorized!==false||!Array.isArray(candidate.files)||candidate.files.length!==23)fail("candidate");
 const seen=new Set();let foundations=0;const files=[];
 for(const f of candidate.files){
  if(!f||typeof f.name!=="string"||!/^20\d{12}_[a-z0-9_]+\.sql$/.test(f.name)||f.version!==f.name.slice(0,14)||seen.has(f.version)||JOURNAL.some(([v])=>v===f.version)||typeof f.sha256!=="string"||!/^[a-f0-9]{64}$/.test(f.sha256))fail("candidate_identity");
  seen.add(f.version);
  if(f.name===CTF){foundations++;continue;}
  if(!/^20\d{12}_automation_/.test(f.name))fail("unexpected_pillar");
  files.push({...f});
 }
 if(foundations!==1||files.length!==22||files.some((f,i)=>i>0&&files[i-1].version>=f.version))fail("candidate_order");
 return {schema:"eternyx-automation-after-labs-plan-v1",files,protectedTableCount:15,preservedFunctions:[...LABS_FUNCTIONS],ctfFoundationExcluded:true,ctfSourceBytesIndependentlyVerified:false,remoteExecutionAuthorized:false,releaseAuthorized:false,requiresRehearsalWithAllSixLabsMigrations:true};
}
export function compare(before,after){
 const a=catalog(before),b=catalog(after);
 const changedTables=TABLES.filter(t=>a.get(t)!==b.get(t));
 const ctfRpcUnchanged=before.ctf_rpc_fingerprint===after.ctf_rpc_fingerprint;
 return {changedTables,ctfRpcUnchanged,protectedSchemaUnchanged:changedTables.length===0&&ctfRpcUnchanged,rowContentsVerified:false,releaseAuthorized:false};
}
async function main(args){
 const read=async p=>JSON.parse(await readFile(p,"utf8"));
 if(args.length===3&&args[0]==="--before"){console.log(JSON.stringify(reconcile(await read(args[1]),await read(args[2]),await buildCandidate()),null,2));return;}
 if(args.length===3&&args[0]==="--compare"){const r=compare(await read(args[1]),await read(args[2]));console.log(JSON.stringify(r,null,2));if(!r.protectedSchemaUnchanged)process.exitCode=2;return;}
 fail("arguments");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error(/^labs_stage_[a-z_]+$/.test(e.message)?e.message:"labs_stage_unavailable");process.exitCode=1;});
