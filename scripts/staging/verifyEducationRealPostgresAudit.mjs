import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath,pathToFileURL} from "node:url";
import {DATABASE_CHECKS} from "./educationHostedDbMetadata.mjs";
// Executes the EXACT live release audit in an isolated, networkless PG17 container.
export const OFFLINE_CONTAINER="eternyx-education-db-ci";
export const auditPath=fileURLToPath(new URL("../sql/education-hosted-db-metadata.sql",import.meta.url));
const auditSql=readFileSync(auditPath,"utf8");
export const NEGATIVE_AUDITS=Object.freeze([
  {name:"student_score_grant",sql:"GRANT UPDATE(score) ON public.user_attempts TO authenticated",rejected:"no_student_attempt_score_update"},
  {name:"anonymous_answer_key_grant",sql:"GRANT SELECT(is_correct) ON public.options TO anon",rejected:"no_anon_answer_key"},
  {name:"attempt_rls_off",sql:"ALTER TABLE public.user_attempts DISABLE ROW LEVEL SECURITY",rejected:"rls_user_attempts"},
  {name:"grade_not_definer",sql:"ALTER FUNCTION public.education_finalize_cbt_grade(uuid) SECURITY INVOKER",rejected:"trusted_final_grade_rpc"},
  {name:"review_lock_off",sql:"ALTER TABLE public.education_written_reviews DISABLE TRIGGER education_lock_final_review",rejected:"finalized_review_lock_enabled"},
].map(Object.freeze));
const fail=()=>{throw new Error("Education disposable Postgres audit failed");};
export function parseAuditOutput(output,{deniedCheck=null}={}){
  if(typeof output!=="string")fail();
  const rows=output.trim().split(/\r?\n/).filter(Boolean);
  if(rows.length!==1 || rows[0].length>25000)fail();
  let r;try{r=JSON.parse(rows[0]);}catch{fail();}
  if(!r||Array.isArray(r)||JSON.stringify(Object.keys(r).sort())!=='["checks","schema"]'||
    r.schema!==1||!r.checks||Array.isArray(r.checks)||
    JSON.stringify(Object.keys(r.checks).sort())!==JSON.stringify([...DATABASE_CHECKS].sort())||
    (deniedCheck!==null&&!DATABASE_CHECKS.includes(deniedCheck)))fail();
  for(const k of DATABASE_CHECKS)if(r.checks[k]!== (k===deniedCheck?false:true))
    throw new Error("check:"+k);
  return Object.freeze({passed:DATABASE_CHECKS.length,deniedCheck});
}
export function rollbackSabotageSql(source,sabotage){
  if(typeof source!=="string"||typeof sabotage!=="string"||
    source.split("BEGIN TRANSACTION READ ONLY;").length!==2||
    source.split("ROLLBACK;").length!==2||!/\bROLLBACK;\s*$/.test(source)||
    !NEGATIVE_AUDITS.some(s=>s.sql===sabotage))fail();
  const query=source.replace("BEGIN TRANSACTION READ ONLY;","").replace(/ROLLBACK;\s*$/,"").trim();
  if(!/^--/.test(query)||!query.includes("SELECT pg_catalog.jsonb_build_object")||!query.endsWith("::text;"))fail();
  return "BEGIN;\n"+sabotage+";\n"+query+"\nROLLBACK;\n";
}
function psql(input){
  const result=spawnSync("docker",[
    "exec","-i",OFFLINE_CONTAINER,"psql","-X","-q","-A","-t",
    "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres",
  ],{input,encoding:"utf8",timeout:30000,maxBuffer:256*1024});
  if(result.error||result.status!==0)throw new Error("sql_execution_failed");
  return result.stdout;
}
export function runRealPostgresAudit(){
  try {
    parseAuditOutput(psql(auditSql));
  } catch(error) {
    if(String(error?.message)==="check:atomic_start_rpc"){
      // Only emit fixed boolean security attributes from disposable PostgreSQL.
      // No function sources, UUIDs, credentials or data rows leave the container.
      const result=psql(`SELECT pg_catalog.jsonb_build_object(
        'definer',p.prosecdef,
        'search_empty_unquoted','search_path='=ANY(COALESCE(p.proconfig,ARRAY[]::text[])),
        'search_empty_quoted','search_path=""'=ANY(COALESCE(p.proconfig,ARRAY[]::text[])),
        'authenticated_exec',pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
        'anon_exec',pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      )::text FROM pg_catalog.pg_proc p
      WHERE p.oid=pg_catalog.to_regprocedure('public.start_cbt_attempt(uuid)');`);
      let diag;
      try {diag=JSON.parse(result.trim());}catch{diag=null;}
      const keys=['definer','search_empty_unquoted','search_empty_quoted','authenticated_exec','anon_exec'];
      if(diag && keys.every(k=>typeof diag[k]==='boolean'))
        process.stderr.write('Offline RPC metadata flags: '+
          keys.map(k=>k+'='+diag[k]).join(',')+'\n');
    }
    throw error;
  }
  for(const probe of NEGATIVE_AUDITS){
    parseAuditOutput(psql(rollbackSabotageSql(auditSql,probe.sql)),
      {deniedCheck:probe.rejected});
    parseAuditOutput(psql(auditSql));
  }
  process.stdout.write("PASS real offline PostgreSQL: "+DATABASE_CHECKS.length+
    " catalog checks and "+NEGATIVE_AUDITS.length+" rollback-restored negative tests.\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
   if(process.argv.length!==3||process.argv[2]!=="--run")fail();
   runRealPostgresAudit();
 }catch(error){
   // Print only known, fixed check IDs; no raw SQL output or sensitive rows.
   const message=String(error?.message||"");
   const safe=message.startsWith("check:") &&
     DATABASE_CHECKS.includes(message.slice(6)) ? message : (
       message==="sql_execution_failed" ? message : "invalid_evidence");
   process.stderr.write("BLOCKED Education isolated PostgreSQL catalog acceptance: "+safe+".\n");
   process.exitCode=1;
 }
}
