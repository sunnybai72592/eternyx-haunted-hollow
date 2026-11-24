// Explicit local operator-only fixture bootstrap; never a deployment or production path.
import {spawnSync} from "node:child_process";
import {existsSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
export const APPROVAL="I_APPROVE_ONE_TIME_EDUCATION_STAGING_FIXTURES";
export const STAGING_REF="mhodwvypfbxafamkrgsk";
export const MANIFEST_KEYS=Object.freeze([
 "ETERNYX_EDU_STAGING_TEST_ID","ETERNYX_EDU_STAGING_QUESTION_ID","ETERNYX_EDU_STAGING_OPTION_ID","ETERNYX_EDU_STAGING_ATTEMPT_ID","ETERNYX_EDU_STAGING_ANSWER_ID",
 "ETERNYX_EDU_WRITE_TEST_ID","ETERNYX_EDU_WRITE_MCQ_ID","ETERNYX_EDU_WRITE_MCQ_OPTION_ID","ETERNYX_EDU_WRITE_ESSAY_ID",
 "ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT","ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT","ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT","ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT","ETERNYX_EDU_RESULT_LEGACY_A_ATTEMPT",
 "ETERNYX_EDU_REVIEW_TEST_ID","ETERNYX_EDU_REVIEW_ATTEMPT_ID","ETERNYX_EDU_REVIEW_ANSWER_ID",
 "ETERNYX_EDU_RESULT_A_SCORE","ETERNYX_EDU_RESULT_A_MAX","ETERNYX_EDU_RESULT_B_SCORE","ETERNYX_EDU_RESULT_B_MAX",
 "ETERNYX_EDU_REVIEW_AWARDED_POINTS","ETERNYX_EDU_FINALIZE_EXPECTED_SCORE","ETERNYX_EDU_FINALIZE_EXPECTED_MAX",
]);
const fail=()=>{throw Error("Education fixture provisioning blocked");};
const emailKeys=["ETERNYX_RLS_TEST_A_EMAIL","ETERNYX_RLS_TEST_B_EMAIL","ETERNYX_RLS_INSTRUCTOR_EMAIL","ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL"];
export function operatorConfig(env){
 if(env?.ETERNYX_EDU_FIXTURE_APPROVAL!==APPROVAL||
   env.ETERNYX_RLS_STAGING_REF!==STAGING_REF||
   env.ETERNYX_RLS_STAGING_URL!=="https://"+STAGING_REF+".supabase.co"||
   env.ETERNYX_RLS_PRODUCTION_REF===STAGING_REF||
   !/^[a-z0-9]{20}$/.test(env.ETERNYX_RLS_PRODUCTION_REF||"")||
   typeof env.ETERNYX_EDU_STAGING_DB_PASSWORD!=="string"||env.ETERNYX_EDU_STAGING_DB_PASSWORD.length<12)fail();
 const emails=emailKeys.map(k=>env[k]);
 if(emails.some(e=>typeof e!=="string"||!/^rls-[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e))||
   new Set(emails.map(e=>e.toLowerCase())).size!==4)fail();
 return {...Object.fromEntries(emailKeys.map(k=>[k,env[k]])),ETERNYX_EDU_FIXTURE_APPROVAL:APPROVAL,
  PATH:env.PATH||"",PGPASSWORD:env.ETERNYX_EDU_STAGING_DB_PASSWORD,PGSSLMODE:"require",PGCONNECT_TIMEOUT:"10",
  PGOPTIONS:"-c statement_timeout=45000 -c lock_timeout=5000"};
}
export function validateManifest(value){
 if(!value||JSON.stringify(Object.keys(value).sort())!==JSON.stringify([...MANIFEST_KEYS].sort()))fail();
 for(const k of MANIFEST_KEYS){
  if(typeof value[k]!=="string")fail();
  if(/(?:_SCORE|_MAX|_POINTS)$/.test(k)){if(value[k]!== (k.endsWith("_POINTS")?"2":"7"))fail();}
  else if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value[k]))fail();
 }
 if(value.ETERNYX_EDU_REVIEW_ATTEMPT_ID!==value.ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT)fail();
 const ids=MANIFEST_KEYS.filter(k=>!/(?:_SCORE|_MAX|_POINTS)$/.test(k)&&k!=="ETERNYX_EDU_REVIEW_ATTEMPT_ID").map(k=>value[k].toLowerCase());
 if(new Set(ids).size!==ids.length)fail();
 return value;
}
export function run(env=process.env){
 const target="education-staging-fixture-variables.private.json";
 try{
  const config=operatorConfig(env);
  if(existsSync(target))fail();
  // Reserve the local file before remote mutation; a failed run remains a recovery sentinel.
  writeFileSync(target,"", {flag:"wx",mode:0o600});
  const r=spawnSync("psql",["-X","-qAt","-w","-v","ON_ERROR_STOP=1","-h","db."+STAGING_REF+".supabase.co","-p","5432","-U","postgres","-d","postgres","-f",
   fileURLToPath(new URL("../sql/education-staging-synthetic-fixtures.sql",import.meta.url))],
   {env:config,encoding:"utf8",timeout:65000,maxBuffer:128*1024});
  if(r.error||r.status!==0)fail();
  const manifest=validateManifest(JSON.parse(r.stdout.trim()));
  writeFileSync(target,JSON.stringify(manifest,null,2)+"\n",{mode:0o600});
  process.stdout.write("Synthetic staging fixtures provisioned; private variable manifest saved locally. No release clearance.\n");
 }catch{process.stderr.write("Fixture provisioning blocked or outcome unknown. Inspect staging before retry; never delete immutable grades.\n");process.exitCode=1;}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])run();
