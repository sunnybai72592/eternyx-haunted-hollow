/**
 * Execute the EXACT 21-check hosted Education journey SQL against synthetic
 * fixtures inside the network-disabled PostgreSQL 17 CI container.
 * No Supabase credentials, project refs, user rows or hosted API calls.
 */
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {FIXTURE_CHECKS} from "./educationJourneyFixturePreflight.mjs";

export const CONTAINER="eternyx-education-db-ci";
const sql=readFileSync(new URL("../sql/education-hosted-journey-fixture.sql",import.meta.url),"utf8");
const EXAM="10000000-0000-4000-8000-000000000001";
const OPT="10000000-0000-4000-8000-000000000005";
const STUDENT_A="00000000-0000-4000-8000-000000000004";
const STUDENT_B="00000000-0000-4000-8000-000000000005";
const vars=Object.freeze({
 test_id:EXAM,
 mcq_id:"10000000-0000-4000-8000-000000000002",
 mcq_option_id:"10000000-0000-4000-8000-000000000004",
 essay_id:"10000000-0000-4000-8000-000000000003",
 student_a_email:"rls-edu-student-a@example.invalid",
 student_b_email:"rls-edu-student-b@example.invalid",
 instructor_email:"rls-edu-owner@example.invalid",
 awarded:"1",expected_score:"6",expected_max:"7",
});
export const NEGATIVE_FIXTURE_CASES=Object.freeze([
 Object.freeze({name:"password_locked",
  sql:"UPDATE public.tests SET access_password_hash='synthetic-locked' WHERE id='"+EXAM+"'",
  failed:"exam_not_password_locked"}),
 Object.freeze({name:"unsafe_duration",
  sql:"UPDATE public.tests SET duration_minutes=1 WHERE id='"+EXAM+"'",
  failed:"exam_has_safe_test_window"}),
 Object.freeze({name:"blank_option_label",
  sql:"UPDATE public.options SET option_text=' ' WHERE id='"+OPT+"'",
  failed:"mcq_choices_have_valid_labels"}),
 Object.freeze({name:"student_b_enrolled",
  sql:"INSERT INTO public.education_test_enrollments(test_id,user_id,enrolled_by) VALUES ('"+EXAM+"','"+STUDENT_B+"','00000000-0000-4000-8000-000000000001')",
  failed:"student_b_is_not_enrolled"}),
 Object.freeze({name:"student_a_consumed",
  sql:"INSERT INTO public.user_attempts(user_id,test_id,status) VALUES ('"+STUDENT_A+"','"+EXAM+"','submitted')",
  failed:"student_a_has_no_attempt"}),
]);
const fail=()=>{throw new Error("Education disposable fixture SQL acceptance failed");};
export function parseFixtureSnapshot(output,failedCheck=null){
 if(typeof output!=="string"||output.length>30000)fail();
 const rows=output.trim().split(/\r?\n/).filter(Boolean);
 if(rows.length!==1)fail();
 let obj;try{obj=JSON.parse(rows[0]);}catch{fail();}
 if(!obj||typeof obj!=="object"||Array.isArray(obj)||
  JSON.stringify(Object.keys(obj).sort())!=='["checks","schema"]'||
  obj.schema!==1||!obj.checks||Array.isArray(obj.checks)||
  JSON.stringify(Object.keys(obj.checks).sort())!==JSON.stringify([...FIXTURE_CHECKS].sort())||
  (failedCheck!==null&&!FIXTURE_CHECKS.includes(failedCheck)))fail();
 for(const key of FIXTURE_CHECKS)
  if(obj.checks[key]!== (key===failedCheck ? false : true))
    throw new Error("check:"+key);
 return Object.freeze({passed:FIXTURE_CHECKS.length,failedCheck});
}
export function isolatedFixtureTransaction(source,change){
 if(!NEGATIVE_FIXTURE_CASES.some(p=>p.sql===change)||
    source.split("BEGIN TRANSACTION READ ONLY;").length!==2||
    source.split("ROLLBACK;").length!==2)fail();
 const body=source.replace("BEGIN TRANSACTION READ ONLY;","").replace(/ROLLBACK;\s*$/,"").trim();
 if(!body.startsWith("WITH\n")||!body.endsWith("::text;"))fail();
 return "BEGIN;\n"+change+";\n"+body+"\nROLLBACK;\n";
}
function run(input,override={}){
 const opts={...vars,...override};
 const args=["exec","-i",CONTAINER,"psql","-X","-q","-A","-t",
  "-v","ON_ERROR_STOP=1",
  ...Object.entries(opts).flatMap(([k,v])=>["-v",k+"="+v]),
  "-U","postgres","-d","postgres"];
 const response=spawnSync("docker",args,{
   input,encoding:"utf8",timeout:30000,maxBuffer:256*1024,
 });
 if(response.error||response.status!==0)fail();
 return response.stdout;
}
export function executeRealFixtureAcceptance(){
 parseFixtureSnapshot(run(sql));
 for(const probe of NEGATIVE_FIXTURE_CASES){
  parseFixtureSnapshot(run(isolatedFixtureTransaction(sql,probe.sql)),probe.failed);
  parseFixtureSnapshot(run(sql)); // verify transactional rollback
 }
 parseFixtureSnapshot(run(sql,{expected_score:"5"}),"expected_grade_matches_fixed_choice_and_review");
 parseFixtureSnapshot(run(sql)); // no stale or failed negative states
 process.stdout.write("PASS PostgreSQL 17: "+FIXTURE_CHECKS.length+
  " real Education fixture checks and "+(NEGATIVE_FIXTURE_CASES.length+1)+
  " negative cases. All changes rolled back; offline only.\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3||process.argv[2]!=="--run")fail();
  executeRealFixtureAcceptance();
 }catch(error){
  const code=String(error?.message||"");
  const safe=code.startsWith("check:")&&FIXTURE_CHECKS.includes(code.slice(6))
   ? code : "invalid_fixture_sql";
  process.stderr.write("BLOCKED isolated Education fixture acceptance: "+safe+".\n");
  process.exitCode=1;
 }
}
