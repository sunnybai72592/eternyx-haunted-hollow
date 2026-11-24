import {validateStagingRlsReadOnlyConfig} from "./stagingRlsConfig.mjs";
export const IDENTITY_APPROVAL="I_APPROVE_EDUCATION_STAGING_IDENTITY_CHECK";
const dedicated=/^(?:rls-|[a-z0-9._-]+\+rls-)[^@]*@[a-z0-9.-]+\.[a-z]{2,}$/i;
const fail=()=>{throw new Error("Education identity acceptance blocked");};
export const IDENTITY_CASES=Object.freeze([
 "student_a_verified","student_b_verified","instructor_verified","three_distinct_identities",
 "student_a_not_admin_or_instructor","student_b_not_admin_or_instructor",
 "instructor_not_admin","instructor_grant_matches_mode","anonymous_instructor_rpc_denied",
 "all_sessions_signed_out",
]);
export function identityConfig(env){
 if(env?.ETERNYX_EDU_IDENTITY_APPROVAL!==IDENTITY_APPROVAL||
    !["accounts","granted"].includes(env.ETERNYX_EDU_IDENTITY_MODE)||
    env.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY)fail();
 const base=validateStagingRlsReadOnlyConfig(env);
 const email=env.ETERNYX_RLS_INSTRUCTOR_EMAIL,password=env.ETERNYX_RLS_INSTRUCTOR_PASSWORD;
 if(typeof email!=="string"||!dedicated.test(email)||typeof password!=="string"||
    password.length<12||base.accounts.some(a=>a.email.toLowerCase()===email.toLowerCase()))fail();
 return {...base,mode:env.ETERNYX_EDU_IDENTITY_MODE,accounts:[...base.accounts,{email,password}]};
}
const must=x=>{if(!x)fail();};
export async function checkIdentityRoles(config,makeClient){
 const clients=[],ids=[],results=[];
 const step=async(name,fn)=>{
  try{await fn();results.push({check:name,result:"passed"});}
  catch{results.push({check:name,result:"blocked"});throw Error("Identity check blocked");}
 };
 let signedOut=true;
 try{
  for(const [i,name] of ["student_a_verified","student_b_verified","instructor_verified"].entries()){
   await step(name,async()=>{
    const c=makeClient(config);clients.push(c);
    const login=await c.auth.signInWithPassword(config.accounts[i]);
    must(!login.error&&login.data?.user?.id);
    const verified=await c.auth.getUser();
    must(!verified.error&&verified.data?.user?.id===login.data.user.id);
    ids.push(verified.data.user.id);
   });
  }
  await step("three_distinct_identities",()=>must(new Set(ids).size===3));
  const role=async(c,expected)=>{
   const admin=await c.rpc("is_admin"),grant=await c.rpc("education_instructor_access");
   must(!admin.error&&admin.data===false&&!grant.error&&grant.data?.approved===expected);
  };
  await step("student_a_not_admin_or_instructor",()=>role(clients[0],false));
  await step("student_b_not_admin_or_instructor",()=>role(clients[1],false));
  await step("instructor_not_admin",async()=>{
   const r=await clients[2].rpc("is_admin");must(!r.error&&r.data===false);
  });
  await step("instructor_grant_matches_mode",async()=>{
   const r=await clients[2].rpc("education_instructor_access");
   must(!r.error&&r.data?.approved===(config.mode==="granted"));
  });
  await step("anonymous_instructor_rpc_denied",async()=>{
   const r=await makeClient(config).rpc("education_instructor_access");
   must(r.error&&(r.error.code==="42501"||/permission denied/i.test(r.error.message||"")));
  });
 }catch{/* Fixed, non-sensitive check names only. */}
 finally{
  for(const c of clients){
   try{if((await c.auth.signOut({scope:"local"})).error)signedOut=false;}
   catch{signedOut=false;}
  }
  results.push({check:"all_sessions_signed_out",result:signedOut&&clients.length===3?"passed":"blocked"});
 }
 return results;
}
export function identityReport(mode,results,env){
 if(!["accounts","granted"].includes(mode)||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||"")||
    !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID||"")||!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT||""))fail();
 const sanitized=results.map(r=>{
  if(!IDENTITY_CASES.includes(r.check)||!["passed","blocked"].includes(r.result))fail();
  return {check:r.check,result:r.result};
 });
 const passed=sanitized.length===IDENTITY_CASES.length&&
   sanitized.every((r,i)=>r.check===IDENTITY_CASES[i]&&r.result==="passed");
 return {schema:1,suite:"education-staging-identity",mode,source_sha:env.GITHUB_SHA,
 github_run_id:env.GITHUB_RUN_ID,github_run_attempt:env.GITHUB_RUN_ATTEMPT,checks:sanitized,
 outcome:passed?"identity_checks_passed":"identity_checks_blocked",
 education_fixture_writes_performed:false,production_release_approved:false};
}
