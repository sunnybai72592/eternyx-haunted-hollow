import {existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {ACCOUNT_LABELS} from "./educationStagingAccountProvision.mjs";
const target="test-results/education-account-provision-recovery.json";
const source="education-staging-account-recovery.private.json";
const fail=()=>{throw Error("Account recovery evidence blocked");};
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&
 JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort());
export function recoveryEvidence(j,env){
 if(!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||"")||!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID||"")||env.GITHUB_RUN_ATTEMPT!=="1")fail();
 if(!exact(j,["schema","suite","outcome","administrator_granted","instructor_granted","production_release_approved","accounts"])||
 j.schema!==1||j.suite!=="education-staging-account-provisioning"||
 !["in_progress","blocked_inspect_before_retry","four_accounts_verified"].includes(j.outcome)||
 j.administrator_granted!==false||j.instructor_granted!==false||j.production_release_approved!==false||
 !Array.isArray(j.accounts)||j.accounts.length!==ACCOUNT_LABELS.length||
 j.accounts.some((a,i)=>!exact(a,["account","status"])||a.account!==ACCOUNT_LABELS[i]||
 !["not_started","creation_may_have_occurred","created","verified_nonprivileged"].includes(a.status)))fail();
 const all=j.accounts.every(a=>a.status==="verified_nonprivileged");
 if(j.outcome==="four_accounts_verified"&&!all)fail();
 return {schema:1,suite:"education-account-provision-recovery",source_sha:env.GITHUB_SHA,
 github_run_id:env.GITHUB_RUN_ID,github_run_attempt:env.GITHUB_RUN_ATTEMPT,
 outcome:j.outcome,accounts:j.accounts.map(a=>({account:a.account,status:a.status})),
 automatic_retry_allowed:false,administrator_granted:false,instructor_granted:false,production_release_approved:false};
}
export function run(env=process.env){
 rmSync(target,{force:true});
 try{
  if(!existsSync(source))fail();
  const r=recoveryEvidence(JSON.parse(readFileSync(source,"utf8")),env);
  mkdirSync("test-results",{recursive:true});
  writeFileSync(target,JSON.stringify(r,null,2)+"\n",{mode:0o600,flag:"wx"});
  if(r.outcome!=="four_accounts_verified")process.exitCode=1;
 }catch{
  rmSync(target,{force:true});
  process.stderr.write("Account creation outcome not established. Inspect staging Auth before new dispatch.\n");
  process.exitCode=1;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run();
