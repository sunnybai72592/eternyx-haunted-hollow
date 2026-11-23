#!/usr/bin/env node
// Read-only, explicitly approved staging migration-history observation.
// Never runs migrations or grants a production release. Source hashes are local only.
import { spawnSync } from "node:child_process";
import { readFileSync,existsSync,statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
 MIGRATION_OBSERVATION_SCHEMA,parseMigrationObservationSql,validateMigrationObservation
} from "../src/lib/securityMigrationObservation.mjs";
import { sourceReleasePreflight } from "./security-ledger-catalog-gate.mjs";

export const MIGRATION_SQL_PATH="scripts/sql/security-staging-migration-history.sql";
const REF=/^[a-z0-9]{8,32}$/;
const safeExists=path=>{try{return statSync(path).isFile()&&statSync(path).size>0&&statSync(path).size<65536;}catch{return false;}};
export function validateMigrationAuditConfig(env){
 const required=["ETERNYX_STAGING_ONLY","ETERNYX_STAGING_MIGRATION_ACK",
  "ETERNYX_STAGING_PROJECT_REF","ETERNYX_PRODUCTION_PROJECT_REF",
  "PGHOST","PGPORT","PGDATABASE","PGUSER","PGPASSWORD","PGSSLMODE","PGSSLROOTCERT"];
 if(!env||required.some(k=>typeof env[k]!=="string"||!env[k].trim()))
  throw new Error("Staging-only migration audit requires explicit configuration.");
 if(env.ETERNYX_STAGING_ONLY!=="yes"||
    env.ETERNYX_STAGING_MIGRATION_ACK!=="I_APPROVE_READONLY_STAGING_AUDIT")
  throw new Error("Staging-only read audit acknowledgment is required.");
 const stage=env.ETERNYX_STAGING_PROJECT_REF,prod=env.ETERNYX_PRODUCTION_PROJECT_REF;
 if(!REF.test(stage)||!REF.test(prod)||stage===prod)
  throw new Error("Staging/production project refs must differ.");
 if(env.PGHOST!=="db."+stage+".supabase.co"||
   env.PGPORT!=="5432"||env.PGDATABASE!=="postgres"||
   env.PGUSER!=="postgres"||env.PGSSLMODE!=="verify-full"||
   !safeExists(env.PGSSLROOTCERT))
  throw new Error("Dedicated staging Postgres host and trusted verify-full TLS CA are required.");
 if(["PGHOSTADDR","PGOPTIONS","PGSERVICE","PGSERVICEFILE","PGPASSFILE","PGDATABASE_URL","DATABASE_URL"].some(k=>env[k]))
  throw new Error("Database host/service override variables are forbidden.");
 return {stagingProjectRef:stage,productionProjectRef:prod};
}
const sha=s=>createHash("sha256").update(s).digest("hex");
export function buildMigrationObservation(config,raw,{now=new Date().toISOString()}={}){
 const {checks,ledgerTables}=parseMigrationObservationSql(raw);
 const sources=sourceReleasePreflight();
 const query=readFileSync(fileURLToPath(new URL("../"+MIGRATION_SQL_PATH,import.meta.url)),"utf8");
 const receipt=validateMigrationObservation({
  schema:MIGRATION_OBSERVATION_SCHEMA,
  stagingProjectRef:config.stagingProjectRef,
  productionProjectRef:config.productionProjectRef,
  observedAt:now,
  sourceSha256:sources.sourceSha256,
  querySha256:sha(query),
  baselineMigrations:{engagement:"recorded-observed",evidence:"recorded-observed"},
  ledgerTables,ledgerMigrationHistory:"unverified",
  checks,trust:"operator-reported-readonly-observation",productionAuthorized:false,
  limitations:[
   "Supabase migration versions were queried through an operator-configured staging connection, not independently signed.",
   "History-version rows do not prove SQL source bytes, complete ledger migration registration or successful rollback.",
   "No production deployment, migration apply, data mutation, backup restore, or independent security approval occurred.",
  ]
 });
 return receipt;
}
function main(){
 const args=process.argv.slice(2),mode=args[0]??"--explain";
 if(args.length>1||!["--explain","--check-source","--check-config","--evaluate-raw","--run"].includes(mode)){
  process.stderr.write("Use --explain, --check-source, --check-config, --evaluate-raw or --run.\n");return 2;
 }
 if(mode==="--explain"){
  process.stdout.write(
   "Wave 15 reads only migration history and observed table presence from isolated staging.\n"+
   "History row presence is NOT proof that reviewed SQL content was applied.\n"+
   "No migrations, writes, restore, release approvals or production access.\n"+
   "The case-ledger migration remains UNVERIFIED regardless of relation existence.\n");
  return 0;
 }
 if(mode==="--evaluate-raw"){
  try{
   const {checks,ledgerTables}=parseMigrationObservationSql(readFileSync(0,"utf8"));
   process.stdout.write("PASS: "+checks.length+" read-only migration and schema checks; case-ledger migration "+ledgerTables+" and UNVERIFIED.\n");
   return 0;
  }catch{
   process.stderr.write("BLOCKED: missing or contradictory migration history and schema observations.\n");
   return 1;
  }
 }
 if(mode==="--check-source"){
  const p=sourceReleasePreflight();
  process.stdout.write(JSON.stringify({sourceSha256:p.sourceSha256,
   baselineSourceSha256:p.parentSha256,catalogSha256:p.catalogSha256,
   productionAuthorized:false,ledgerMigrationHistory:"unverified"},null,2)+"\n");
  return 0;
 }
 let config;
 try{config=validateMigrationAuditConfig(process.env);}
 catch{
  process.stderr.write("STAGING MIGRATION AUDIT BLOCKED: invalid staging-only configuration or verified TLS.\n");
  return 2;
 }
 if(mode==="--check-config"){
  process.stdout.write("PASS: dedicated staging migration audit configuration checked; no network accessed.\n");
  return 0;
 }
 const script=fileURLToPath(new URL("../"+MIGRATION_SQL_PATH,import.meta.url));
 const run=spawnSync("psql",["-X","-qAt","-v","ON_ERROR_STOP=1","-f",script],{
  encoding:"utf8",timeout:45000,maxBuffer:8192,
  env:{...process.env,PGAPPNAME:"eternyx-wave15-readonly-migration-audit"}
 });
 try{
  if(run.error||run.status!==0)throw new Error("Read-only database query failed.");
  const receipt=buildMigrationObservation(config,run.stdout);
  process.stdout.write(JSON.stringify(receipt,null,2)+"\n");
  process.stderr.write("Staging migration history observed, case-ledger migration UNVERIFIED, production BLOCKED.\n");
  return 0;
 }catch{
  process.stderr.write("STAGING MIGRATION AUDIT BLOCKED: missing history, partial schema, invalid result or unsafe query. No changes made.\n");
  return 1;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=main();
