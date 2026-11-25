import {STAGING_REF} from "./educationStagingSyntheticFixtures.mjs";
import {validateStagingRlsReadOnlyConfig} from "./stagingRlsConfig.mjs";
export const PUBLICATION_APPROVAL="I_APPROVE_ONE_SYNTHETIC_EDUCATION_PUBLICATION_JOURNEY";
export const PUBLICATION_CASES=Object.freeze([
 "four_independent_auth_identities","verified_instructor_and_operator_roles",
 "students_cannot_author","instructor_creates_private_draft","instructor_recovers_own_answer_key",
 "students_and_guest_cannot_recover_draft","draft_invisible_to_students",
 "instructor_requests_publication","operator_queue_metadata_only",
 "instructor_and_students_cannot_self_approve","operator_approves_publication",
 "published_exam_hidden_without_enrollment","instructor_cannot_enroll_student",
 "operator_enrolls_student_a","student_a_reads_exam_without_answer_key",
 "student_b_remains_unenrolled","operator_revokes_unstarted_enrollment",
 "student_a_loses_access_after_revocation","all_sessions_signed_out"
]);
const must=x=>{if(!x)throw Error("Publication acceptance blocked");};
export function publicationConfig(env){
 must(env?.ETERNYX_EDU_PUBLICATION_APPROVAL===PUBLICATION_APPROVAL&&
 env.ETERNYX_RLS_STAGING_REF===STAGING_REF&&env.GITHUB_RUN_ATTEMPT==="1"&&
 /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID||"")&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||"")&&
 !env.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY&&!env.ETERNYX_EDU_STAGING_DB_PASSWORD);
 const base=validateStagingRlsReadOnlyConfig(env);
 const accounts=[...base.accounts,{email:env.ETERNYX_RLS_INSTRUCTOR_EMAIL,password:env.ETERNYX_RLS_INSTRUCTOR_PASSWORD},
 {email:env.ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL,password:env.ETERNYX_EDU_FIXTURE_OPERATOR_PASSWORD}];
 must(accounts.every(a=>typeof a.email==="string"&&/^rls-[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(a.email)&&typeof a.password==="string"&&a.password.length>=12)&&
 new Set(accounts.map(a=>a.email.toLowerCase())).size===4);
 return {...base,accounts,title:"ETERNYX synthetic publication acceptance / "+env.GITHUB_RUN_ID};
}
const ok=r=>{must(r&&!r.error);return r.data;};
const denied=r=>Boolean(r?.error&&r.error.code==="42501");
const invisible=r=>denied(r)||(!r?.error&&Array.isArray(r?.data)&&r.data.length===0);
const exact=(x,keys)=>x&&JSON.stringify(Object.keys(x).sort())===JSON.stringify([...keys].sort());
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function publicationJourney(config,makeClient,persist){
 const clients=[],ids=[],results=[];let mayWrite=false,exam=null,question=null,choice=null;
 const bank={version:1,title:config.title,description:"Synthetic publication access test only",duration_minutes:60,
 questions:[{id:"q1",text:"Which instrument measures potential difference?",type:"multiple_choice",points:5,
 options:[{id:"v",text:"Voltmeter",correct:true},{id:"m",text:"Mass balance",correct:false}]}]};
 const snapshot=()=>({schema:1,suite:"education-hosted-publication",checks:results.map(x=>({...x})),
 writes_may_have_occurred:mayWrite,automatic_retry_allowed:false,production_release_approved:false,
 outcome:results.length===PUBLICATION_CASES.length&&results.every((x,i)=>x.check===PUBLICATION_CASES[i]&&x.result==="passed")?"passed":"blocked"});
 const gate=async(name,fn,write=false)=>{
  if(write){mayWrite=true;persist(snapshot());}
  try{await fn();results.push({check:name,result:"passed"});}
  catch{results.push({check:name,result:"failed"});throw Error("Publication stage blocked");}
  finally{persist(snapshot());}
 };
 try{
  for(const account of config.accounts){
   const c=makeClient();clients.push(c);
   const login=ok(await c.auth.signInWithPassword(account)),user=ok(await c.auth.getUser());
   must(login?.user?.id===user?.user?.id&&uuid.test(user?.user?.id));ids.push(user.user.id);
  }
  const [a,b,i,o]=clients,guest=makeClient(),[aid,bid]=ids;
  const args=()=>({p_test_id:exam});
  const enrollment=()=>({...args(),p_user_id:aid});
  const catalog=async(c,expected)=>must(ok(await c.rpc("education_student_enrolled_catalog")).some(x=>x.id===exam)===expected);
  const hidden=async(c)=>must(invisible(await c.from("tests").select("id").eq("id",exam)));
  await gate("four_independent_auth_identities",()=>must(new Set(ids).size===4));
  await gate("verified_instructor_and_operator_roles",async()=>{
   for(const [idx,c] of clients.entries()){
    must(ok(await c.rpc("is_admin"))===(idx===3));
    must(ok(await c.rpc("education_instructor_access"))?.approved===(idx===2));
   }
   const drafts=ok(await i.rpc("education_instructor_list_drafts"));
   must(Array.isArray(drafts)&&drafts.length<45&&!drafts.some(x=>x.title===config.title));
   const queue=ok(await o.rpc("education_admin_publication_queue"));
   must(Array.isArray(queue)&&queue.length<90&&!queue.some(x=>x.title===config.title));
  });
  await gate("students_cannot_author",async()=>{
   for(const c of [a,b,guest])must(denied(await c.rpc("education_instructor_create_draft",{p_bank:bank})));
  },true);
  await gate("instructor_creates_private_draft",async()=>{
   const r=ok(await i.rpc("education_instructor_create_draft",{p_bank:bank}));
   must(uuid.test(r?.id)&&r.status==="private_draft"&&r.question_count===1);exam=r.id;
  },true);
  await gate("instructor_recovers_own_answer_key",async()=>{
   const r=ok(await i.rpc("education_instructor_load_draft",args()));
   must(r.id===exam&&r.status==="private_draft"&&r.bank.title===config.title&&r.bank.questions.length===1);
   const q=r.bank.questions[0],correct=q.options.filter(x=>x.correct===true);
   must(uuid.test(q.id)&&correct.length===1&&uuid.test(correct[0].id)&&correct[0].text==="Voltmeter");
   question=q.id;choice=correct[0].id;
  });
  await gate("students_and_guest_cannot_recover_draft",async()=>{for(const c of [a,b,guest])must(denied(await c.rpc("education_instructor_load_draft",args())));});
  await gate("draft_invisible_to_students",async()=>{for(const c of [a,b]){await hidden(c);await catalog(c,false);}});
  await gate("instructor_requests_publication",async()=>{
   const r=ok(await i.rpc("education_request_publication",args()));must(r.test_id===exam&&r.status==="pending");
  },true);
  await gate("operator_queue_metadata_only",async()=>{
   const rows=ok(await o.rpc("education_admin_publication_queue")).filter(x=>x.test_id===exam);
   must(rows.length===1&&rows[0].status==="pending"&&exact(rows[0],["test_id","title","status","requested_at","teacher_id"]));
   for(const c of [a,b,i,guest])must(denied(await c.rpc("education_admin_publication_queue")));
  });
  await gate("instructor_and_students_cannot_self_approve",async()=>{
   for(const c of [i,a,b,guest])must(denied(await c.rpc("education_admin_review_publication",{...args(),p_approve:true})));
  },true);
  await gate("operator_approves_publication",async()=>{
   const r=ok(await o.rpc("education_admin_review_publication",{...args(),p_approve:true}));must(r.test_id===exam&&r.status==="approved");
   must(denied(await i.rpc("education_instructor_load_draft",args())));
  },true);
  await gate("published_exam_hidden_without_enrollment",async()=>{for(const c of [a,b]){await hidden(c);await catalog(c,false);}});
  await gate("instructor_cannot_enroll_student",async()=>must(denied(await i.rpc("education_admin_enroll_student",enrollment()))),true);
  await gate("operator_enrolls_student_a",async()=>{
   const r=ok(await o.rpc("education_admin_enroll_student",enrollment()));must(r.test_id===exam&&r.user_id===aid&&r.status==="enrolled");
  },true);
  await gate("student_a_reads_exam_without_answer_key",async()=>{
   await catalog(a,true);
   const rows=ok(await a.from("tests").select("id").eq("id",exam));must(rows.length===1&&rows[0].id===exam);
   const qs=ok(await a.from("questions").select("id").eq("id",question));must(qs.length===1);
   must(denied(await a.from("options").select("id,is_correct").eq("id",choice)));
   must(denied(await a.rpc("education_instructor_load_draft",args())));
  });
  await gate("student_b_remains_unenrolled",async()=>{
   await catalog(b,false);await hidden(b);must(invisible(await b.from("questions").select("id").eq("id",question)));
  });
  await gate("operator_revokes_unstarted_enrollment",async()=>must(ok(await o.rpc("education_admin_revoke_enrollment",enrollment()))===true),true);
  await gate("student_a_loses_access_after_revocation",async()=>{
   await catalog(a,false);await hidden(a);must(invisible(await a.from("questions").select("id").eq("id",question)));
  });
 }catch{/* no sensitive errors, no retries or rollback */}
 finally{
  let signed=clients.length===4;
  for(const c of clients){try{if((await c.auth.signOut({scope:"local"})).error)signed=false;}catch{signed=false;}}
  results.push({check:"all_sessions_signed_out",result:signed?"passed":"failed"});persist(snapshot());
 }
 return snapshot();
}
