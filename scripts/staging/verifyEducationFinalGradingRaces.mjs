// Run only against disposable network-isolated PostgreSQL 17 CI fixture.
// Three real overlapping transaction races: retry/finalize, review/finalize,
// and finalize/review. No Supabase Auth/network or customer data.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";

const container = "eternyx-education-db-ci";
const user = n => "00000000-0000-4000-8000-" + String(n).padStart(12,"0");
const teacher = user(2);
const active = new Set();
const limit = 15000;
const cmd = () => ["exec","--interactive",container,"psql","-X","-q","-A","-t",
  "-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"];
function query(sql) {
  const r=spawnSync("docker",cmd(),{input:sql+"\n",encoding:"utf8",timeout:limit});
  assert.equal(r.status,0,r.stderr || String(r.error) || r.stdout);
  return r.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "";
}
function session(label,role,uid) {
  const app="eternyx_finalgrade_"+label;
  const child=spawn("docker",cmd(),{stdio:["pipe","pipe","pipe"]});
  let out="",err="",closed=false,code;
  child.stdout.on("data",s=>out+=String(s));
  child.stderr.on("data",s=>err+=String(s));
  const finished=new Promise(resolve=>child.once("close",c=>{closed=true;code=c;resolve();}));
  const s={
    app,get out(){return out;},
    send(sql){assert(!closed,label+" prematurely closed: "+err);child.stdin.write(sql+"\n");},
    async wait(marker){
      const start=Date.now();
      while(!out.includes(marker)&&!closed&&Date.now()-start<limit)await pause(40);
      assert(out.includes(marker),label+" missing "+marker+": "+out+" "+err);
    },
    async close(){if(!closed)child.stdin.end();await finished;active.delete(s);
      assert.equal(code,0,label+" failed: "+err+" "+out);},
    kill(){if(!closed)child.kill("SIGKILL");},
  };
  active.add(s);
  s.send("SET application_name='"+app+"'; SET ROLE "+role+"; "+
    (uid?"SET request.jwt.claim.sub='"+uid+"'; ":"")+
    "BEGIN; SELECT 'READY_"+label+"';");
  return s;
}
async function ready(label,role,uid) {
  const s=session(label,role,uid);await s.wait("READY_"+label);return s;
}
async function lockWait(app) {
  const begin=Date.now();
  while(Date.now()-begin<limit) {
    if(Number(query("SELECT count(*) FROM pg_catalog.pg_stat_activity "+
      "WHERE application_name='"+app+"' AND wait_event_type='Lock';"))>0)return;
    await pause(80);
  }
  throw Error(app+" did not contend on a real database row lock");
}
function createCase(num,reviewPoints) {
  const test=query("SELECT id FROM public.tests WHERE title='CP Fundamentals Assessment';");
  const question=query("SELECT id FROM public.questions WHERE test_id='"+test+
    "'::uuid AND question_type='short_answer';");
  assert.match(test,/^[0-9a-f-]{36}$/i);
  assert.match(question,/^[0-9a-f-]{36}$/i);
  query("INSERT INTO auth.users(id) VALUES ('"+user(num)+"'::uuid);");
  query("INSERT INTO public.education_test_enrollments(test_id,user_id,enrolled_by) "+
    "VALUES ('"+test+"'::uuid,'"+user(num)+"'::uuid,'"+user(1)+"'::uuid);");
  const attempt=query("INSERT INTO public.user_attempts(user_id,test_id,status,end_time) "+
    "VALUES ('"+user(num)+"'::uuid,'"+test+"'::uuid,'submitted',clock_timestamp()) RETURNING id;");
  const answer=query("INSERT INTO public.user_answers(attempt_id,question_id,short_answer_text) "+
    "VALUES ('"+attempt+"'::uuid,'"+question+"'::uuid,'Explain protection and polarization') RETURNING id;");
  query("SET ROLE authenticated; SET request.jwt.claim.sub='"+teacher+"'; "+
    "SELECT public.education_instructor_review_written_answer('"+answer+"'::uuid,"+
    reviewPoints+");");
  return {attempt,answer};
}
async function main(){
  // Race A: exactly one finalization; losing service sees immutable replay.
  const one=createCase(21,1);
  const first=await ready("first_grade","service_role");
  first.send("SELECT 'ONE=' || (public.education_finalize_cbt_grade('"+
    one.attempt+"'::uuid)->>'status'); SELECT 'ONE_HELD';");
  await first.wait("ONE_HELD");
  const again=await ready("retry_grade","service_role");
  again.send("SELECT 'RETRY=' || (public.education_finalize_cbt_grade('"+
    one.attempt+"'::uuid)->>'status'); SELECT 'RETRY_DONE';");
  await lockWait(again.app);
  first.send("COMMIT; SELECT 'ONE_COMMITTED';"); await first.wait("ONE_COMMITTED");
  await again.wait("RETRY_DONE");
  again.send("COMMIT; SELECT 'RETRY_COMMITTED';"); await again.wait("RETRY_COMMITTED");
  assert(first.out.includes("ONE=finalized"),"First writer did not finalize");
  assert(again.out.includes("RETRY=already_finalized"),"Second writer was not a replay");
  await Promise.all([first.close(),again.close()]);
  assert.equal(Number(query("SELECT count(*) FROM public.education_final_grades "+
    "WHERE attempt_id='"+one.attempt+"'::uuid;")),1,"Duplicate official ledger");
  console.log("PASS concurrent finalization is exactly-once");

  // Race B: reviewer holds same attempt lock, updates to 2 first, then the
  // service waits and includes the committed mark in the official score.
  const two=createCase(22,1);
  const reviewer=await ready("review_before_grade","authenticated",teacher);
  reviewer.send("SELECT 'REVIEWED=' || (public.education_instructor_review_written_answer('"+
    two.answer+"'::uuid,2)->>'status'); SELECT 'REVIEW_HELD';");
  await reviewer.wait("REVIEW_HELD");
  const laterGrade=await ready("grade_after_review","service_role");
  laterGrade.send("SELECT 'GRADE=' || (public.education_finalize_cbt_grade('"+
    two.attempt+"'::uuid)->>'score'); SELECT 'GRADE_DONE';");
  await lockWait(laterGrade.app);
  reviewer.send("COMMIT; SELECT 'REVIEW_COMMITTED';"); await reviewer.wait("REVIEW_COMMITTED");
  await laterGrade.wait("GRADE_DONE");
  laterGrade.send("COMMIT; SELECT 'GRADE_COMMITTED';");await laterGrade.wait("GRADE_COMMITTED");
  assert(laterGrade.out.includes("GRADE=2"),"Atomic grader missed committed review");
  await Promise.all([reviewer.close(),laterGrade.close()]);
  console.log("PASS review-first race grades committed review points");

  // Race C: trusted grade commits first, then a delayed authorized instructor
  // revision must fail closed after waiting for the finalized attempt lock.
  const three=createCase(23,1);
  const earlyGrade=await ready("grade_before_review","service_role");
  earlyGrade.send("SELECT 'EARLY=' || (public.education_finalize_cbt_grade('"+
    three.attempt+"'::uuid)->>'status'); SELECT 'EARLY_HELD';");
  await earlyGrade.wait("EARLY_HELD");
  const lateReviewer=await ready("review_after_grade","authenticated",teacher);
  lateReviewer.send("DO $race$ BEGIN BEGIN "+
    "PERFORM public.education_instructor_review_written_answer('"+
    three.answer+"'::uuid,0); RAISE EXCEPTION 'Review changed after finalization'; "+
    "EXCEPTION WHEN invalid_parameter_value THEN NULL; END; END $race$; "+
    "SELECT 'LATE_REVIEW_REJECTED';");
  await lockWait(lateReviewer.app);
  earlyGrade.send("COMMIT; SELECT 'EARLY_COMMITTED';");await earlyGrade.wait("EARLY_COMMITTED");
  await lateReviewer.wait("LATE_REVIEW_REJECTED");
  lateReviewer.send("COMMIT; SELECT 'DENIAL_COMMITTED';");await lateReviewer.wait("DENIAL_COMMITTED");
  assert(earlyGrade.out.includes("EARLY=finalized"));
  await Promise.all([earlyGrade.close(),lateReviewer.close()]);
  assert.equal(query("SELECT score::text FROM public.user_attempts WHERE id='"+
    three.attempt+"'::uuid;"),"1","Grade corrupted by late reviewer");
  assert.equal(query("SELECT points_awarded::text FROM public.education_written_reviews "+
    "WHERE answer_id='"+three.answer+"'::uuid;"),"1",
    "Finalized review changed after waiting for lock");
  console.log("PASS finalization-first race rejects late review correction");
  console.log("All three real PostgreSQL final grading transaction races passed.");
}
try{await main();}finally{for(const s of active)s.kill();}
