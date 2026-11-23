#!/usr/bin/env node
// Phase 23 — isolated STAGING write-role acceptance. NEVER production.
// This script intentionally creates and deletes temporary test tasks/comments/steps
// only in an empty dedicated staging team; server event audit persists.
import path from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {
  validateWorkspaceStagingConfig,createStagingClient,
} from "./workspace-team-staging-acceptance.mjs";
import {
  WRITE_PROBE_SPACE_NAME,WRITE_PROBE_APPROVAL,WRITE_AUDIT_APPROVAL,
  UUID_REGEX,isExpectedAccessDenial,assertDeniedOutcome,
  validateWriteProbeTeam,writeRoleProbeReport,
} from "../src/lib/workspaceRoleWriteAcceptance.mjs";

function gate(ok,code){
  if(!ok)throw Error("Workspace Phase 23 blocked: "+code);
}
export function validateStagingWriteConfig(env){
  const base=validateWorkspaceStagingConfig(env); // rejects known production ref + privileged keys
  const space=String(env.WORKSPACE_STAGING_WRITE_SPACE_ID??"").trim();
  gate(UUID_REGEX.test(space),"write-team-uuid-required");
  gate(!Object.values(base.ids).some(id=>id.toLowerCase()===space.toLowerCase()),
    "disposable-team-must-be-separate-from-read-only-fixtures");
  gate(env.WORKSPACE_STAGING_WRITE_CONFIRM===WRITE_PROBE_APPROVAL,
    "explicit-disposable-write-approval-required");
  gate(env.WORKSPACE_STAGING_WRITE_AUDIT_CONFIRM===WRITE_AUDIT_APPROVAL,
    "persistent-audit-consent-required");
  return {...base,writeSpace:space};
}
async function login(client,person){
  const l=await client.auth.signInWithPassword({
    email:person.email,password:person.password,
  });
  gate(!l.error&&Boolean(l.data?.user?.id),"fixture-login-failed");
  const again=await client.auth.getUser();
  gate(!again.error&&again.data?.user?.id===l.data.user.id,
    "authenticated-identity-drift");
  return l.data.user.id;
}
async function rows(client,table,filters,columns="id",limit=5){
  let query=client.from(table).select(columns);
  for(const [k,v] of Object.entries(filters))query=query.eq(k,v);
  const r=await query.limit(limit);
  gate(!r.error&&Array.isArray(r.data),"staging-query-unavailable");
  return r.data;
}
async function exactlyOne(client,table,filters,columns){
  const list=await rows(client,table,filters,columns,2);
  gate(list.length===1,"expected-single-existing-fixture");
  return list[0];
}
async function countTasks(client,space){
  const result=await client.from("workspace_team_tasks")
    .select("id",{head:true,count:"exact"}).eq("space_id",space);
  gate(!result.error&&Number.isSafeInteger(result.count),"task-count-unavailable");
  return result.count;
}
async function saveTask(client,space,title){
  return client.rpc("workspace_team_save_task",{
    p_space_id:space,p_task_id:null,p_title:title,p_details:"Phase 23 disposable staging role test",
    p_status:"todo",p_priority:"normal",p_due_on:null,p_assignee_id:null,
    p_expected_updated_at:null,
  });
}
async function rpcExpectedDenied(client,name,args,trackSuccess=()=>{}){
  const result=await client.rpc(name,args);
  // If a forbidden write unexpectedly succeeds, track its ID if present
  // so the owner can clean up the leaked test task before blocking release.
  return assertDeniedOutcome(result,trackSuccess);
}
async function positive(client,name,args){
  const result=await client.rpc(name,args);
  gate(!result.error&&UUID_REGEX.test(String(result.data)),"approved-rpc-unavailable");
  return result.data;
}
async function inspectCreated(owner,space,entry,authorId){
  const row=await exactlyOne(owner,"workspace_team_tasks",
    {id:entry.id,space_id:space},"id,space_id,title,created_by");
  gate(row.title===entry.title&&row.created_by===authorId,
    "created-task-owner-or-title-mismatch");
}
async function checkEvent(owner,space,taskId,type){
  const records=await rows(owner,"workspace_team_events",{
    space_id:space,entity_id:taskId,event_type:type,
  },"id",4);
  gate(records.length>=1,"expected-audit-event-missing");
}
async function cleanupTask(owner,space,entry){
  const current=await rows(owner,"workspace_team_tasks",
    {id:entry.id,space_id:space},"id,title",2);
  gate(current.length<=1,"ambiguous-cleanup-target");
  if(current.length){
    gate(current[0].title===entry.title,"cleanup-would-touch-unexpected-row");
    const removed=await owner.rpc("workspace_team_delete_task",{
      p_space_id:space,p_task_id:entry.id,
    });
    gate(!removed.error&&removed.data===true,"temporary-task-delete-failed");
  }
  const remains=await rows(owner,"workspace_team_tasks",
    {id:entry.id,space_id:space},"id",1);
  gate(remains.length===0,"temporary-task-still-present");
}
export async function runStagingWriteRoleAcceptance(config,clientFactory=createStagingClient){
  const clients=config.people.map(()=>clientFactory(config.url,config.key));
  const anon=clientFactory(config.url,config.key);
  const [owner,editor,viewer,outsider]=clients;
  const space=config.writeSpace;
  const created=[];
  const checks=[];
  let failed=null,cleanupFailure=null;
  let preflightComplete=false;
  try {
    const identities=[];
    for(let i=0;i<4;i++)identities.push(await login(clients[i],config.people[i]));
    gate(new Set(identities).size===4,"accounts-not-distinct");
    checks.push("four_verified_staging_users");
    const team=await exactlyOne(owner,"workspace_team_spaces",{id:space},
      "id,owner_id,name,status");
    const members=await rows(owner,"workspace_team_members",{space_id:space},
      "user_id,role",5);
    validateWriteProbeTeam(team,identities[0],members,identities);
    const outside=await rows(outsider,"workspace_team_spaces",{id:space},"id");
    gate(outside.length===0,"outsider-can-read-write-team");
    gate(await countTasks(owner,space)===0,"write-team-must-be-empty");
    checks.push("empty_dedicated_team_and_exact_roles");
    preflightComplete=true;
    // Any forbidden operation succeeding is a release blocker. For task create,
    // the leaked UUID is tracked for controlled cleanup.
    const token=randomUUID().slice(0,12);
    const title=(role)=>"ETERNYX STAGING ROLE PROBE "+token+" "+role;
    const denyArgs={p_space_id:space,p_task_id:null,p_title:title("denied"),
      p_details:"Permission denial only",p_status:"todo",p_priority:"normal",
      p_due_on:null,p_assignee_id:null,p_expected_updated_at:null};
    for(const client of [viewer,outsider,anon]){
      const result=await client.rpc("workspace_team_save_task",denyArgs);
      assertDeniedOutcome(result,id=>created.push({id,title:denyArgs.p_title}));
    }
    checks.push("viewer_outsider_anonymous_task_creation_denied");
    const editorTitle=title("editor");
    const eTask=await positive(editor,"workspace_team_save_task",{
      ...denyArgs,p_title:editorTitle,
    });
    created.push({id:eTask,title:editorTitle});
    await inspectCreated(owner,space,created.at(-1),identities[1]);
    const ownerTitle=title("owner");
    const oTask=await positive(owner,"workspace_team_save_task",{
      ...denyArgs,p_title:ownerTitle,
    });
    created.push({id:oTask,title:ownerTitle});
    await inspectCreated(owner,space,created.at(-1),identities[0]);
    gate(await countTasks(owner,space)===2,"expected-two-verified-test-tasks");
    checks.push("owner_and_editor_created_real_tasks");
    const editorComment=await positive(editor,"workspace_team_post_comment",{
      p_space_id:space,p_task_id:eTask,p_body:"Phase 23 generated staging-only comment",
    });
    const ownerStep=await positive(owner,"workspace_team_add_step",{
      p_space_id:space,p_task_id:oTask,p_title:"Phase 23 staging-only checklist",
    });
    const comment=await exactlyOne(owner,"workspace_team_task_comments",
      {id:editorComment,space_id:space},"id,task_id,author_id");
    const step=await exactlyOne(owner,"workspace_team_task_steps",
      {id:ownerStep,space_id:space},"id,task_id,created_by");
    gate(comment.task_id===eTask&&comment.author_id===identities[1]&&
      step.task_id===oTask&&step.created_by===identities[0],
      "saved-discussion-checklist-actor-mismatch");
    checks.push("authorized_comment_and_checklist_writes");
    for(const client of [viewer,outsider]){
      await rpcExpectedDenied(client,"workspace_team_post_comment",{
        p_space_id:space,p_task_id:eTask,p_body:"Deny unauthorized comment",
      });
      await rpcExpectedDenied(client,"workspace_team_add_step",{
        p_space_id:space,p_task_id:eTask,p_title:"Deny unauthorized step",
      });
      await rpcExpectedDenied(client,"workspace_team_delete_task",{
        p_space_id:space,p_task_id:eTask,
      });
    }
    checks.push("viewer_outsider_comment_step_delete_denied");
    // Unauthorized users must not be able to bypass RPCs with direct INSERT.
    for(const client of [viewer,outsider,anon]){
      const insert=await client.from("workspace_team_tasks")
        .insert({space_id:space,created_by:identities[0],
          title:title("direct"),details:"Direct grant test"})
        .select("id");
      if(insert.error&&isExpectedAccessDenial(insert.error))continue;
      if(Array.isArray(insert.data)){
        for(const row of insert.data){
          if(UUID_REGEX.test(String(row.id)))
            created.push({id:row.id,title:title("direct")});
        }
      }
      throw Error("Workspace Phase 23 blocked: direct-table-insert-not-denied");
    }
    checks.push("browser_direct_table_writes_denied");
    for(const entry of created.slice(0)){
      await checkEvent(owner,space,entry.id,"task_created");
    }
    await checkEvent(owner,space,eTask,"comment_posted");
    await checkEvent(owner,space,oTask,"step_added");
    checks.push("server_authored_write_events_verified");
  }catch(error){failed=error;}
  finally{
    // NEVER delete preexisting tasks. Only exact UUIDs returned by this run
    // with the nonce-prefixed expected titles can be touched.
    if(created.length){
      for(const entry of created.slice().reverse()){
        try{await cleanupTask(owner,space,entry);}
        catch{cleanupFailure=Error(
          "Workspace Phase 23 blocked: cleanup-incomplete-inspect-disposable-staging-team");}
      }
    }
    if(preflightComplete&&cleanupFailure===null){
      try{
        gate(await countTasks(owner,space)===0,"write-team-not-empty-after-cleanup");
        for(const entry of created){
          await checkEvent(owner,space,entry.id,"task_deleted");
        }
        if(created.length)checks.push("temporary_tasks_removed_with_audit");
      }catch{cleanupFailure=Error(
        "Workspace Phase 23 blocked: cleanup-or-audit-verification-incomplete");}
    }
  }
  if(cleanupFailure)throw cleanupFailure;
  if(failed)throw failed;
  return writeRoleProbeReport(checks);
}
const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  const flag=process.argv[2];
  if(flag==="--help")
    process.stdout.write("Phase 23 dedicated staging role-write acceptance.\n"+
      "Requires Phase 21 WORKSPACE_STAGING_* configuration, plus:\n"+
      "WORKSPACE_STAGING_WRITE_SPACE_ID=<dedicated empty team UUID>\n"+
      "WORKSPACE_STAGING_WRITE_CONFIRM="+WRITE_PROBE_APPROVAL+"\n"+
      "WORKSPACE_STAGING_WRITE_AUDIT_CONFIRM="+WRITE_AUDIT_APPROVAL+"\n"+
      "Commands: --config-check | --run\n");
  else if(flag==="--config-check"||flag==="--run"){
    try{
      const config=validateStagingWriteConfig(process.env);
      if(flag==="--config-check"){
        process.stdout.write("Staging write configuration accepted. No network access or writes.\n");
      }else{
        process.stdout.write("STAGING ONLY: testing role boundaries in a disposable team; audit events persist.\n");
        process.stdout.write(JSON.stringify(
          await runStagingWriteRoleAcceptance(config),null,2)+"\n");
      }
    }catch(e){
      // No raw SDK error, UUID, user identity, JWT or private row is logged.
      const message=e instanceof Error&&e.message.startsWith("Workspace Phase 23 blocked: ")?
        e.message:"Workspace Phase 23 blocked: unexpected-role-probe-failure";
      process.stderr.write(message+"\n");process.exitCode=1;
    }
  }else{
    process.stderr.write("Use --help, --config-check or --run; nothing was changed.\n");
    process.exitCode=2;
  }
}
