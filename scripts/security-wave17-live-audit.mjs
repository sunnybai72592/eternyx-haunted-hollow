#!/usr/bin/env node
// Wave 17: no automatically deployed SQL, no prod access, only guarded staging reads.
// --emit-disposable-seed emits synthetic SQL for networkless CI ONLY, not a remote command.
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {validateMigrationAuditConfig} from "./security-staging-migration-history.mjs";
import {
 W17_STAGING_REF,W17_DEPLOYMENTS,W17_TABLES,W17_REPORT_SCHEMA,
 parseWave17Catalog,validateWave17AuditReport
} from "../src/lib/securityWave17StagingAudit.mjs";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
export const W17_AUDIT_SQL="scripts/sql/security-wave17-live-audit.sql";
const sha=s=>createHash("sha256").update(s,"utf8").digest("hex");
export function verifyWave17ReviewedSources(){
 const entries=W17_DEPLOYMENTS.map(item=>{
  const source=readFileSync(resolve(root,item.source),"utf8");
  if(sha(source)!==item.sha256)throw new Error("Reviewed staging source drift: "+item.name);
  return {...item,bytes:Buffer.byteLength(source,"utf8")};
 });
 if(entries.length!==3)throw new Error("Exactly three reviewed source migrations are expected.");
 return entries;
}
export function wave17RunReport({stagingProjectRef,productionProjectRef},raw,{now=new Date().toISOString()}={}){
 const parsed=parseWave17Catalog(raw);
 const report={
  schema:W17_REPORT_SCHEMA,stagingRef:stagingProjectRef,productionRef:productionProjectRef,
  observedAt:now,checks:parsed.checks,checksPassed:parsed.checksPassed,
  authFixturesPresent:parsed.authFixturesPresent,sourceHashMatched:true,
  rlsTables:W17_TABLES.length,catalogPassed:60,
  jwtHttpAcceptance:"not-tested",trust:"unsigned-operator-staging-observation",
  productionAuthorized:false,
  limitations:[
   "Migration records and 60 catalog checks were observed, but this unsigned report cannot authenticate its issuer.",
   "Two real signed-in staging accounts and independently verified JWT HTTP cross-owner authorization remain outstanding.",
   "Remote migration versions differ from source filenames; indiscriminate Supabase db push is unsafe without reconciliation.",
  ]
 };
 return validateWave17AuditReport(report);
}
export function emitDisposableSeed(env){
 if(env.CI!=="true"||env.ETERNYX_EPHEMERAL_POSTGRES_ONLY!=="yes")
  throw new Error("Disposable migration fixture seed requires isolated CI authorization.");
 const items=verifyWave17ReviewedSources();
 const sql=items.map((item,i)=>{
  const body=readFileSync(resolve(root,item.source),"utf8");
  const delimiter="$wave17_ci_src_"+i+"$";
  if(body.includes(delimiter))throw new Error("Unsafe fixture SQL delimiter.");
  return "('"+item.version+"','"+item.name+"',ARRAY["+delimiter+body+delimiter+"]::text[])";
 }).join(",\n");
 return "-- Wave 17 networkless disposable CI ONLY; never execute on Supabase staging or production.\n"+
  "ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN name text;\n"+
  "ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN statements text[];\n"+
  "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES\n"+
  sql+";\n";
}
function main(){
 const args=process.argv.slice(2);
 const mode=args[0]??"--explain";
 if(args.length>1||!["--explain","--check-source","--evaluate","--run","--emit-disposable-seed"].includes(mode)){
  process.stderr.write("Use --explain, --check-source, --evaluate, --run or --emit-disposable-seed.\n");return 2;
 }
 if(mode==="--explain"){
  process.stdout.write("Wave 17: PINNED read-only Supabase staging migration history/source-byte and RLS acceptance.\n"+
    "Staging target: "+W17_STAGING_REF+"; production never accessed.\n"+
    "The full 60-check catalog gate is separately verified; authenticated JWT HTTP tests require two test users.\n"+
    "No automatic migrations, Auth users, passwords, production deployment, or release authorization.\n");
  return 0;
 }
 try{
  if(mode==="--check-source"){
   const entries=verifyWave17ReviewedSources();
   process.stdout.write(JSON.stringify({reviewedSources:entries,localOnly:true,productionAuthorized:false},null,2)+"\n");
   return 0;
  }
  if(mode==="--emit-disposable-seed"){
   process.stdout.write(emitDisposableSeed(process.env));return 0;
  }
  verifyWave17ReviewedSources();
  if(mode==="--evaluate"){
   const parsed=parseWave17Catalog(readFileSync(0,"utf8"));
   process.stdout.write("PASS: "+parsed.checksPassed+"/"+parsed.checks.length+
    " schema/provenance checks, signed-in fixture status: "+
    (parsed.authFixturesPresent?"available":"missing")+
    ", JWT HTTP acceptance NOT TESTED, production BLOCKED.\n");
   return 0;
  }
  const config=validateMigrationAuditConfig(process.env);
  if(config.stagingProjectRef!==W17_STAGING_REF||
     process.env.ETERNYX_STAGING_W17_AUDIT_ACK!=="I_APPROVE_READONLY_STAGING_W17")
   throw new Error("The exact Wave 17 staging project and additional approval are required.");
  const result=spawnSync("psql",["-X","-qAt","-F","|","-v","ON_ERROR_STOP=1",
   "-f",resolve(root,W17_AUDIT_SQL)],{
    encoding:"utf8",timeout:45000,maxBuffer:8192,
    env:{...process.env,PGAPPNAME:"eternyx-wave17-readonly-source-audit"}
  });
  if(result.error||result.status!==0)throw new Error("Staging read-only observation failed.");
  const report=wave17RunReport(config,result.stdout);
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  process.stderr.write("Wave 17 staging source/RLS observed; JWT HTTP acceptance pending; production BLOCKED.\n");
  return 0;
 }catch{
  process.stderr.write("WAVE 17 BLOCKED: source drift, invalid staging environment, or incomplete read-only checks.\n");
  return 1;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=main();
