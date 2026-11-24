/** Sanitized operational recovery journal; not acceptance evidence or permission to retry. */
import {EDUCATION_RELEASE_STAGES} from "./educationReleaseGate.mjs";
export const RELEASE_RECOVERY_PATH="test-results/education-hosted-release-recovery.json";
const irreversible=new Set(["cbt-write","instructor-review","trusted-finalize"]);
const fail=()=>{throw new Error("Invalid Education recovery journal transition");};
export function createEducationRecovery(mode,p){
 const stages=EDUCATION_RELEASE_STAGES[mode];
 if(!stages||!["preflight","rehearsal","journey"].includes(mode)||
   !/^[a-f0-9]{40}$/.test(p?.sha||"")||
   !/^[1-9][0-9]*$/.test(String(p?.runId||""))||
   !/^[1-9][0-9]*$/.test(String(p?.attempt||"")))fail();
 return {
  schema:1,suite:"education-hosted-release-recovery",mode,
  source_sha:p.sha,github_run_id:String(p.runId),github_run_attempt:String(p.attempt),
  outcome:"in_progress",write_may_have_occurred:false,
  automatic_retry_allowed:false,production_release_approved:false,
  stages:stages.map(s=>({stage:s.id,status:"not_started"})),
 };
}
export function advanceEducationRecovery(journal,event,stage){
 if(!journal||journal.outcome!=="in_progress")fail();
 const active=journal.stages.find(s=>s.status==="running");
 const next=journal.stages.find(s=>s.status!=="passed");
 if(event==="start"){
  if(active||!next||next.stage!==stage||next.status!=="not_started")fail();
  next.status="running";
  if(irreversible.has(stage))journal.write_may_have_occurred=true;
 }else if(event==="pass"){
  if(!active||active.stage!==stage)fail();
  active.status="passed";
 }else if(event==="block"){
  if(stage!==undefined)fail();
  if(active)active.status="blocked";
  journal.outcome="blocked";
 }else if(event==="finish"){
  if(stage!==undefined||next)fail();
  journal.outcome="backend_passed";
 }else fail();
 return journal;
}
