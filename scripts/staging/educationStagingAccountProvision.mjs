// Local-only operator utility. No application administrator or instructor grants.
import {STAGING_REF} from "./educationStagingSyntheticFixtures.mjs";
import {validateStagingRlsReadOnlyConfig} from "./stagingRlsConfig.mjs";
export const ACCOUNT_APPROVAL="I_APPROVE_FOUR_NEW_SYNTHETIC_EDUCATION_STAGING_AUTH_USERS";
export const ACCOUNT_LABELS=Object.freeze(["student_a","student_b","instructor_candidate","operator_candidate"]);
const fail=()=>{throw new Error("Education staging Auth provisioning blocked");};
// Fixed setting names and reason codes only; never include actual values or API errors.
export function accountConfigurationIssues(env={}){
 const issues=[];
 const add=(setting,reason)=>issues.push({setting,reason});
 const ref="ETERNYX_RLS_STAGING_REF",prod="ETERNYX_RLS_PRODUCTION_REF",url="ETERNYX_RLS_STAGING_URL",
 pub="ETERNYX_RLS_STAGING_PUBLISHABLE_KEY",secret="ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY";
 const check=(key,predicate,reason)=>{const v=env[key];if(typeof v!=="string"||!v.trim())add(key,"missing");else if(!predicate(v))add(key,reason);};
 check("ETERNYX_EDU_ACCOUNT_APPROVAL",v=>v===ACCOUNT_APPROVAL,"invalid_approval");
 check(ref,v=>v===STAGING_REF,"wrong_staging_reference");
 check(prod,v=>/^[a-z0-9]{20}$/.test(v)&&v!==STAGING_REF,"invalid_production_reference");
 check(url,v=>v==="https://"+STAGING_REF+".supabase.co","wrong_staging_url");
 const claims=v=>{try{const p=v.split(".");return p.length===3&&p.every(Boolean)?JSON.parse(Buffer.from(p[1],"base64url").toString("utf8")):null;}catch{return null;}};
 check(pub,v=>v.length>16&&v.length<2500&&!v.toLowerCase().includes("service_role")&&
  !v.startsWith("sb_secret_")&&(v.startsWith("sb_publishable_")||claims(v)?.role==="anon"),"invalid_publishable_key");
 check(secret,v=>v!==env[pub]&&(/^sb_secret_[A-Za-z0-9_-]{18,}$/.test(v)||
  (claims(v)?.role==="service_role"&&claims(v)?.ref===STAGING_REF)),"invalid_staging_service_key");
 const emailKeys=["ETERNYX_RLS_TEST_A_EMAIL","ETERNYX_RLS_TEST_B_EMAIL","ETERNYX_RLS_INSTRUCTOR_EMAIL","ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL"];
 const passwordKeys=["ETERNYX_RLS_TEST_A_PASSWORD","ETERNYX_RLS_TEST_B_PASSWORD","ETERNYX_RLS_INSTRUCTOR_PASSWORD","ETERNYX_EDU_FIXTURE_OPERATOR_PASSWORD"];
 for(const key of emailKeys)check(key,v=>/^rls-[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(v),"requires_rls_prefix_email");
 for(const key of passwordKeys)check(key,v=>v.length>=16&&v.length<=72,"requires_16_to_72_characters");
 for(const [keys,normalize] of [[emailKeys,v=>v.toLowerCase()],[passwordKeys,v=>v]]){
  for(const key of keys){const v=env[key];if(typeof v==="string"&&v&&keys.some(other=>other!==key&&typeof env[other]==="string"&&normalize(env[other])===normalize(v)))add(key,"must_be_distinct");}
 }
 return issues;
}
export function accountProvisionConfig(env){
 if(accountConfigurationIssues(env).length)fail();
 if(env?.ETERNYX_EDU_ACCOUNT_APPROVAL!==ACCOUNT_APPROVAL||
   env.ETERNYX_RLS_STAGING_REF!==STAGING_REF||
   env.ETERNYX_RLS_STAGING_URL!=="https://"+STAGING_REF+".supabase.co")fail();
 const base=validateStagingRlsReadOnlyConfig(env);
 const accounts=[...base.accounts,
  {email:env.ETERNYX_RLS_INSTRUCTOR_EMAIL,password:env.ETERNYX_RLS_INSTRUCTOR_PASSWORD},
  {email:env.ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL,password:env.ETERNYX_EDU_FIXTURE_OPERATOR_PASSWORD}];
 if(accounts.some(a=>typeof a.email!=="string"||!/^rls-[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(a.email)||
   typeof a.password!=="string"||a.password.length<16||a.password.length>72)||
   new Set(accounts.map(a=>a.email.toLowerCase())).size!==4||
   new Set(accounts.map(a=>a.password)).size!==4)fail();
 const secret=env.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY;
 if(typeof secret!=="string"||secret===base.publishableKey)fail();
 if(!/^sb_secret_[A-Za-z0-9_-]{18,}$/.test(secret)){
  try{
   const parts=secret.split(".");
   if(parts.length!==3||parts.some(p=>!p))fail();
   const p=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
   if(p.role!=="service_role"||p.ref!==STAGING_REF)fail();
  }catch{fail();}
 }
 return {...base,accounts,secret};
}
export function freshAccountJournal(){
 return {schema:1,suite:"education-staging-account-provisioning",outcome:"in_progress",
  administrator_granted:false,instructor_granted:false,production_release_approved:false,
  accounts:ACCOUNT_LABELS.map(account=>({account,status:"not_started"}))};
}
export async function provisionAccounts(config,{admin,makePublicClient,persist,journal=freshAccountJournal()}){
 const ids=new Set();
 try{
  for(const [i,account] of config.accounts.entries()){
   const entry=journal.accounts[i];
   entry.status="creation_may_have_occurred";persist(journal);
   const result=await admin.auth.admin.createUser({email:account.email,password:account.password,email_confirm:true});
   const user=result?.data?.user;
   if(result?.error||!user?.id||user.email?.toLowerCase()!==account.email.toLowerCase()||ids.has(user.id))fail();
   ids.add(user.id);
   entry.status="created";persist(journal);
   const client=makePublicClient(config);
   let verified=false,signedOut=false;
   try{
    const login=await client.auth.signInWithPassword(account);
    if(login.error||login.data?.user?.id!==user.id)fail();
    const current=await client.auth.getUser();
    if(current.error||current.data?.user?.id!==user.id)fail();
    const adminRole=await client.rpc("is_admin");
    const instructorRole=await client.rpc("education_instructor_access");
    if(adminRole.error||adminRole.data!==false||instructorRole.error||instructorRole.data?.approved!==false)fail();
    verified=true;
   }finally{
    try{signedOut=!(await client.auth.signOut({scope:"local"})).error;}catch{}
   }
   if(!verified||!signedOut)fail();
   entry.status="verified_nonprivileged";persist(journal);
  }
  journal.outcome="four_accounts_verified";persist(journal);
 }catch{
  journal.outcome="blocked_inspect_before_retry";persist(journal);throw Error("Provisioning blocked; inspect staging Auth before any retry");
 }
 return journal;
}
