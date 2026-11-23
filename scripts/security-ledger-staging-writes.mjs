#!/usr/bin/env node
// Real database role emulation, NOT an actual JWT-based HTTP acceptance test.
// Prevent mistakes by refusing anything but a specifically designated staging DB.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const WAVE12_STAGING_SQL = "tests/sql/security-ledger-transactional-writes.sql";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REF=/^[a-z0-9]{8,32}$/;
export function validateWriteStagingConfig(env) {
 const required=[
  "ETERNYX_STAGING_ONLY","ETERNYX_STAGING_WRITE_ACK",
  "ETERNYX_STAGING_PROJECT_REF","ETERNYX_PRODUCTION_PROJECT_REF",
  "ETERNYX_STAGING_USER_A_ID","ETERNYX_STAGING_USER_B_ID",
  "PGHOST","PGPORT","PGDATABASE","PGUSER","PGPASSWORD","PGSSLMODE","PGSSLROOTCERT",
 ];
 const missing=required.filter(k=>!env||typeof env[k]!=="string"||!env[k].trim());
 if(missing.length)throw new Error("Missing staging-only configuration: "+missing.join(", "));
 if(env.ETERNYX_STAGING_ONLY!=="yes"||
  env.ETERNYX_STAGING_WRITE_ACK!=="I_APPROVE_ROLLBACK_ONLY_STAGING_TEST")
  throw new Error("Two explicit staging write rehearsal acknowledgements are required.");
 const stage=env.ETERNYX_STAGING_PROJECT_REF,prod=env.ETERNYX_PRODUCTION_PROJECT_REF;
 if(!REF.test(stage)||!REF.test(prod)||stage===prod)throw new Error("Distinct valid staging and production refs are required.");
 if(env.PGHOST!=="db."+stage+".supabase.co"||env.PGPORT!=="5432"||
   env.PGDATABASE!=="postgres"||env.PGUSER!=="postgres"||
   env.PGSSLMODE!=="verify-full"||!existsSync(env.PGSSLROOTCERT))
  throw new Error("Direct dedicated staging Postgres host, TLS verification and certificate are mandatory.");
 const a=env.ETERNYX_STAGING_USER_A_ID,b=env.ETERNYX_STAGING_USER_B_ID;
 if(!UUID.test(a)||!UUID.test(b)||a===b)
  throw new Error("Two distinct registered staging test account UUIDs are required.");
 if(["PGOPTIONS","PGSERVICE","PGSERVICEFILE","PGHOSTADDR","PGDATABASE_URL","DATABASE_URL"].some(x=>env[x]))
  throw new Error("Extra PostgreSQL service/host override variables are forbidden.");
 return {actorA:a,actorB:b,stagingRef:stage,productionRef:prod};
}
export function buildPostgresCommand(validated) {
 return ["-X","-qAt","-v","ON_ERROR_STOP=1",
  "-v","actor_a="+validated.actorA,"-v","actor_b="+validated.actorB,
  "-f",resolve(fileURLToPath(new URL("../"+WAVE12_STAGING_SQL,import.meta.url)))];
}
function main(){
 const command=process.argv[2]??"--explain";
 if(process.argv.length>3||!["--explain","--check-config","--run"].includes(command)){
  process.stderr.write("Only --explain, --check-config and --run are supported.\n");return 2;
 }
 if(command==="--explain"){
  process.stdout.write("Wave 12 requires two EXISTING staging Auth users and reviewed indexed-ledger schema.\n"+
   "The probe impersonates authenticated DB roles in ONE transaction and unconditionally ROLLBACKs.\n"+
   "It does NOT test JWT HTTP auth, storage bytes, schema installation or production rollback.\n"+
   "No remote write can run without explicit staging acknowledgement, verified TLS and a separate project ref.\n");
  return 0;
 }
 let validated;
 try{validated=validateWriteStagingConfig(process.env);}
 catch(e){
  process.stderr.write("STAGING WRITE BLOCKED: "+(e instanceof Error?e.message:"invalid settings")+"\n");return 2;
 }
 if(command==="--check-config"){
  process.stdout.write("PASS: configuration validated without opening a database connection.\n");return 0;
 }
 const result=spawnSync("psql",buildPostgresCommand(validated),{
  env:{...process.env,PGAPPNAME:"eternyx-wave12-transactional-staging"},
  encoding:"utf8",timeout:60000,maxBuffer:1024*128
 });
 if(result.error||result.status!==0||
   !result.stdout?.includes("PASS: Wave 12 two-role transactional writes, revocation and rollback")){
  process.stderr.write("STAGING WRITE BLOCKED: transactional acceptance failed or lacked rollback proof. "+
    "Connection is closed and any uncommitted transaction must be reviewed; no production approval.\n");
  return 1;
 }
 process.stdout.write("PASS: Wave 12 staging database-role write/revoke/rollback rehearsal (unsigned, not JWT HTTP acceptance).\n");
 process.stdout.write("PRODUCTION RELEASE REMAINS BLOCKED.\n");
 return 0;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=main();
