#!/usr/bin/env node
// Local, explicitly approved disposable staging suite. No privileged key is consumed.
import {fileURLToPath} from "node:url";
import path from "node:path";
import {FIXTURE_REF} from "./workspace-staging-provision-fixtures.mjs";
import {createStagingClient,validateWorkspaceStagingConfig,runWorkspaceStagingAcceptance} from "./workspace-team-staging-acceptance.mjs";
import {validateStagingWriteConfig,runStagingWriteRoleAcceptance} from "./workspace-team-staging-write-roles.mjs";
import {validatePrivateStorageConfig,runPrivateStorageReadOnly} from "./workspace-team-staging-storage.mjs";
import {validateWorkspaceRealtimeConfig,runWorkspaceRealtimeStaging} from "./workspace-team-staging-realtime.mjs";
import {validateStagingRevocationConfig,runStagingRevocationAcceptance} from "./workspace-team-staging-revocation.mjs";
import {UUID_REGEX,WRITE_PROBE_SPACE_NAME} from "../src/lib/workspaceRoleWriteAcceptance.mjs";
import {REVOCATION_TEAM_NAME} from "../src/lib/workspaceRevocationAcceptance.mjs";

export const SUITE_CONFIRM="RUN_DISPOSABLE_WORKSPACE_STAGING_ACCEPTANCE";
const ROLES=["OWNER","EDITOR","VIEWER","OUTSIDER"];
function gate(ok,code){if(!ok)throw Error("Workspace suite blocked: "+code);}
export function validateSuiteConfig(env){
  gate(env.WORKSPACE_FIXTURE_COMPLETE==="true"&&env.WORKSPACE_FIXTURE_SUITE_CONFIRM===SUITE_CONFIRM,"complete-fixtures-and-approval-required");
  gate(env.WORKSPACE_STAGING_PROJECT_REF===FIXTURE_REF,"exact-staging-required");
  const base=validateWorkspaceStagingConfig(env);
  const write=validateStagingWriteConfig(env),storage=validatePrivateStorageConfig(env);
  const realtime=validateWorkspaceRealtimeConfig(env),revoke=validateStagingRevocationConfig(env);
  const accounts=ROLES.map(role=>env["WORKSPACE_FIXTURE_CREATED_"+role+"_ID"]);
  gate(accounts.every(id=>UUID_REGEX.test(String(id)))&&new Set(accounts).size===4,"four-receipted-accounts-required");
  const all=[...Object.values(base.ids),write.writeSpace,revoke.revocationSpace,storage.storageItemId,...accounts];
  gate(new Set(all.map(id=>id.toLowerCase())).size===all.length,"fixture-scope-overlap");
  return {base,write,storage,realtime,revoke,accounts};
}
async function one(client,table,filters,columns){
  let q=client.from(table).select(columns);
  for(const [key,value] of Object.entries(filters))q=q.eq(key,value);
  const r=await q.limit(2);
  gate(!r.error&&Array.isArray(r.data)&&r.data.length===1,"fixture-row-not-verified");
  return r.data[0];
}
async function loginFixture(config,i,factory){
  const client=factory(config.base.url,config.base.key),p=config.base.people[i];
  const signed=await client.auth.signInWithPassword({email:p.email,password:p.password});
  const checked=await client.auth.getUser();
  const user=checked.data?.user;
  const marker=user?.app_metadata?.eternyx_workspace_test_fixture;
  gate(!signed.error&&!checked.error&&signed.data?.user?.id===config.accounts[i]&&user?.id===config.accounts[i]&&
    typeof marker==="string"&&/^[a-f0-9]{16}$/.test(marker),"dedicated-fixture-auth-required");
  return {client,marker};
}
export async function preflightSuite(config,factory=createStagingClient){
  const fixtures=[];
  for(let i=0;i<4;i++)fixtures.push(await loginFixture(config,i,factory));
  const nonce=fixtures[0].marker;
  gate(fixtures.every(f=>f.marker===nonce),"fixture-run-marker-mismatch");
  const owner=fixtures[0].client;
  for(const [id,name] of [[config.base.ids.SPACE_ID,"ETERNYX STAGING READ ACCEPTANCE"],[config.write.writeSpace,WRITE_PROBE_SPACE_NAME],[config.revoke.revocationSpace,REVOCATION_TEAM_NAME]]){
    const team=await one(owner,"workspace_team_spaces",{id},"id,owner_id,name,description,status");
    gate(team.id===id&&team.owner_id===config.accounts[0]&&team.name===name&&team.status==="active"&&
      team.description==="Dedicated synthetic staging acceptance "+nonce,"dedicated-team-marker-mismatch");
    const members=await owner.from("workspace_team_members").select("user_id,role",{count:"exact"}).eq("space_id",id).limit(4);
    gate(!members.error&&members.count===3&&members.data?.length===3&&["owner","editor","viewer"].every((role,i)=>members.data.some(m=>m.role===role&&m.user_id===config.accounts[i])),"team-roles-not-verified");
    const tasks=await owner.from("workspace_team_tasks").select("id",{count:"exact"}).eq("space_id",id).limit(2);
    const isRead=id===config.base.ids.SPACE_ID;
    gate(!tasks.error&&tasks.count===(isRead?1:0)&&tasks.data?.length===(isRead?1:0)&&(!isRead||tasks.data[0].id===config.base.ids.TEAM_TASK_ID),"unexpected-fixture-tasks");
    const outsider=await fixtures[3].client.from("workspace_team_spaces").select("id").eq("id",id).limit(1);
    gate(!outsider.error&&Array.isArray(outsider.data)&&outsider.data.length===0,"outsider-team-visible");
  }
  const task=await one(owner,"workspace_team_tasks",{id:config.base.ids.TEAM_TASK_ID,space_id:config.base.ids.SPACE_ID},"id,title,details");
  gate(task.title==="Synthetic staging task"&&task.details==="Non-sensitive acceptance fixture","fresh-task-required");
  const project=await one(owner,"workspace_projects",{id:config.base.ids.PRIVATE_PROJECT_ID},"id,owner_id,name");
  gate(project.owner_id===config.accounts[0]&&project.name==="ETERNYX STAGING PRIVATE FIXTURE","private-fixture-owner-mismatch");
  return nonce;
}
export async function editApprovedFixture(config,{client,identity,space,task}){
  gate(identity===config.accounts[0]&&space===config.base.ids.SPACE_ID&&task===config.base.ids.TEAM_TASK_ID,"edit-scope-mismatch");
  const row=await one(client,"workspace_team_tasks",{id:task,space_id:space},"id,title,details,status,priority,due_on,assignee_id,updated_at");
  gate(row.title==="Synthetic staging task"&&row.details==="Non-sensitive acceptance fixture"&&
    typeof row.updated_at==="string"&&Number.isFinite(Date.parse(row.updated_at)),"edit-fixture-changed");
  const result=await client.rpc("workspace_team_save_task",{p_space_id:space,p_task_id:task,
    p_title:"Synthetic staging task — acceptance update",p_details:row.details,p_status:row.status,
    p_priority:row.priority,p_due_on:row.due_on,p_assignee_id:row.assignee_id,p_expected_updated_at:row.updated_at});
  gate(!result.error&&result.data===task,"approved-realtime-edit-failed");
}
const stages=["authenticated_read","private_storage","concurrent_write","realtime","revocation"];
export function verifySuiteStage(stage,report){
  gate(stages.includes(stage)&&report?.release_gate==="manual_review_required"&&report.production_certified===false,"invalid-stage-receipt");
  const checks=Array.isArray(report.checks)?report.checks:[];
  const passed=key=>checks.some(c=>c.key===key&&c.status==="pass");
  const valid={
    authenticated_read:passed("complete_member_portfolio_snapshots")&&passed("outsider_portfolio_projection_denied")&&passed("final_four_account_identity_recheck"),
    private_storage:report.verified_exact_sha256===true&&report.verified_cross_account_denial===true&&report.verified_public_url_denial===true,
    concurrent_write:passed("concurrent_edit_one_winner_and_shared_convergence")&&report.verified_temporary_task_cleanup===true,
    realtime:report.verified_realtime_delivery===true&&report.verified_outsider_exclusion===true&&report.application_data_modified_by_runner===true,
    revocation:report.verified_existing_socket_exclusion===true&&report.verified_fresh_socket_exclusion===true&&report.temporary_task_removed===true&&report.persisted_editor_revocation===true,
  };
  gate(valid[stage]===true,"stage-specific-evidence-incomplete");
  return true;
}
export async function runWorkspaceAcceptanceSuite(config,{factory=createStagingClient,onStage=()=>{}}={}){
  await preflightSuite(config,factory);
  const calls=[
    ()=>runWorkspaceStagingAcceptance(config.base,factory),
    ()=>runPrivateStorageReadOnly(config.storage,factory),
    ()=>runStagingWriteRoleAcceptance(config.write,factory),
    ()=>runWorkspaceRealtimeStaging(config.realtime,factory,{approvedFixtureEdit:context=>editApprovedFixture(config,context)}),
    ()=>runStagingRevocationAcceptance(config.revoke,factory),
  ];
  const completed=[];
  for(let i=0;i<stages.length;i++){
    onStage(stages[i],"started");
    verifySuiteStage(stages[i],await calls[i]());
    completed.push({key:stages[i],status:"pass"});
    onStage(stages[i],"passed");
  }
  return {schema:"eternyx.workspace.phase52.acceptance-suite",checks:completed,
    release_gate:"manual_review_required",production_certified:false,browser_ui_verified:false,
    reconnect_verified:false,account_recovery_verified:false,migration_history_verified:false,
    disposable_task_edit_and_revocation_persist:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const config=validateSuiteConfig(process.env);
    if(process.argv[2]==="--config-check")process.stdout.write("Suite configuration valid; no network calls.\n");
    else if(process.argv[2]==="--run")process.stdout.write(JSON.stringify(await runWorkspaceAcceptanceSuite(config,{
      onStage:(stage,status)=>process.stderr.write("Workspace "+stage+": "+status+"\n"),
    }),null,2)+"\n");
    else throw Error("Workspace suite blocked: invalid-command");
  }catch{
    process.stderr.write("Workspace suite stopped; inspect the last stage. Do not retry blindly or reuse partially mutated fixtures.\n");
    process.exitCode=1;
  }
}
