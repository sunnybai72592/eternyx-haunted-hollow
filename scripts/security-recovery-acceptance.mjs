#!/usr/bin/env node
// Wave 16: OFFLINE acceptance of operator-supplied recovery evidence. No network, no writes.
import {readFileSync,lstatSync,existsSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {join,resolve,basename} from "node:path";
import {fileURLToPath} from "node:url";
import {validateMigrationObservation} from "../src/lib/securityMigrationObservation.mjs";
import {evaluateCatalogOutput} from "./security-ledger-catalog-gate.mjs";
import {sourceReleasePreflight} from "./security-ledger-catalog-gate.mjs";
import {
 validateRecoveryOperatorPlan,buildRecoveryPacket,parseRecoveryPacketJson
} from "../src/lib/securityRecoveryEvidence.mjs";
import {reviewLedgerMigrationCandidate} from "./security-ledger-candidate-review.mjs";
const ROOT=resolve(fileURLToPath(new URL("..",import.meta.url)));
export const FILES=Object.freeze({
 plan:"wave16-operator-plan.json",
 migration:"wave15-migration-history.json",
 catalog:"wave16-after-restore-catalog.txt",
});
const SHA=value=>createHash("sha256").update(value,"utf8").digest("hex");
function readOptional(folder,name,max=48*1024){
 const path=join(folder,name);
 if(!existsSync(path))return null;
 const stats=lstatSync(path);
 if(!stats.isFile()||stats.size<1||stats.size>max)
  throw new Error("Invalid bounded recovery input: "+name);
 return readFileSync(path,"utf8");
}
function parse(raw,label){try{return JSON.parse(raw);}catch{throw new Error("Invalid recovery JSON: "+label);}}
export function assessRecoveryFolder(folder,{now=new Date().toISOString(),stagingRef,recoveryRef,productionRef}={}){
 if(typeof folder!=="string"||!folder.trim()||!lstatSync(folder).isDirectory())
  throw new Error("An existing local recovery evidence directory is required.");
 const planRaw=readOptional(folder,FILES.plan);
 if(!planRaw)throw new Error("Operator plan is missing; no recovery result can be inferred.");
 const plan=validateRecoveryOperatorPlan(parse(planRaw,"operator plan"));
 if(plan.stagingRef!==stagingRef||plan.recoveryRef!==recoveryRef||
   plan.productionRef!==productionRef)throw new Error("Operator plan is for different staging/recovery/production refs.");
 const nowMs=Date.parse(now),observed=Date.parse(plan.observedAt);
 if(!Number.isFinite(nowMs)||observed>nowMs+5*60000||nowMs-observed>7*86400000)
  throw new Error("Operator plan is future-dated or over seven days old.");
 const source=sourceReleasePreflight();
 const query=readFileSync(join(ROOT,"scripts/sql/security-staging-migration-history.sql"),"utf8");
 let migration=null;
 const history=readOptional(folder,FILES.migration);
 if(history){
  const payload=validateMigrationObservation(parse(history,"migration history"));
  migration={payload,sha256:SHA(history)};
 }
 const catalogRaw=readOptional(folder,FILES.catalog,30000);
 let catalogDigest=null;
 if(catalogRaw){
  evaluateCatalogOutput(catalogRaw);
  catalogDigest=SHA(catalogRaw);
 }
 const packet=buildRecoveryPacket(plan,{
  migration,catalogDigest,
  ledgerSha256:source.sourceSha256,migrationQuerySha256:SHA(query),
  observedAt:plan.observedAt
 });
 const output=JSON.stringify(packet);
 parseRecoveryPacketJson(output);
 return packet;
}
export function checkLocalCandidate(path){
 if(typeof path!=="string"||!path.trim()||!existsSync(path))throw new Error("Candidate missing.");
 const stat=lstatSync(path);
 if(!stat.isFile()||stat.size<1||stat.size>128*1024)throw new Error("Candidate is not a bounded regular file.");
 const proposal=readFileSync(join(ROOT,"scripts/sql/staged-security-case-ledger.sql"),"utf8");
 const files=readdirSync(join(ROOT,"supabase/migrations"))
  .filter(x=>/^202611112[12]0000_pentest_/.test(x)&&x.endsWith(".sql")).sort();
 return reviewLedgerMigrationCandidate({
  filename:basename(path),proposal,candidate:readFileSync(path,"utf8"),baselineMigrations:files
 });
}
async function main(){
 const [mode,argument,...other]=process.argv.slice(2);
 if(other.length||!["--explain","--assess","--check-candidate"].includes(mode??"--explain")){
  process.stderr.write("Use --explain, --assess <local folder>, or --check-candidate <local .sql>.\n");return 2;
 }
 if(!mode||mode==="--explain"){
  process.stdout.write("Wave 16 OFFLINE review: migration candidate exact-byte check and operator-supplied isolated recovery evidence.\n"+
   "No database connections, backup restore, migrations, release approvals or artifact uploads.\n"+
   "The result is unsigned and NEVER authorizes production.\n");return 0;
 }
 if(!argument){process.stderr.write("Provide a local file or folder.\n");return 2;}
 try{
  if(mode==="--check-candidate"){
   process.stdout.write(JSON.stringify(checkLocalCandidate(argument),null,2)+"\n");
  }else{
   const packet=assessRecoveryFolder(argument,{
    stagingRef:process.env.ETERNYX_STAGING_PROJECT_REF,
    recoveryRef:process.env.ETERNYX_RECOVERY_PROJECT_REF,
    productionRef:process.env.ETERNYX_PRODUCTION_PROJECT_REF
   });
   process.stdout.write(JSON.stringify(packet,null,2)+"\n");
  }
  process.stderr.write("Local consistency checks complete; evidence is UNSIGNED and production BLOCKED.\n");
  return 0;
 }catch{
  process.stderr.write("BLOCKED: invalid, incomplete, stale or mismatched local recovery inputs. No output released.\n");
  return 1;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().then(code=>{process.exitCode=code;});
}
