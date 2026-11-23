#!/usr/bin/env node
// Phase 25: DISPOSABLE STAGING ONLY. Real owner removes test editor and
// generates bounded task events. Team membership and audit history PERSIST.
// Task UUID is captured for exact-title scoped cleanup, no bulk deletions.
import {randomUUID} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createStagingClient,validateWorkspaceStagingConfig}
  from "./workspace-team-staging-acceptance.mjs";
import {
  REVOCATION_TEAM_NAME,REVOCATION_ROLES,REVOCATION_CONFIRM,
  REVOCATION_HISTORY_CONFIRM,REVOCATION_SUBSCRIBE_MS,
  REVOCATION_EVENT_MS,REVOCATION_QUIET_MS,
  validateRevocationConfig,validateRevocationFixture,
  isRoleDenied,verifyRevocationDelivery,safeRevocationReport,
} from "../src/lib/workspaceRevocationAcceptance.mjs";

function gate(ok,reason){if(!ok)throw Error("Workspace revocation blocked: "+reason);}
export function validateStagingRevocationConfig(env){
  return validateRevocationConfig(env,validateWorkspaceStagingConfig(env));
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(promise,ms,label){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error("Workspace revocation blocked: "+label)),ms);
  })]);}
  finally{clearTimeout(timer);}
}
async function login(client,account){
  const signed=await client.auth.signInWithPassword({
    email:account.email,password:account.password});
  gate(!signed.error&&!!signed.data?.user?.id&&
    !!signed.data?.session?.access_token,"staging-authentication-failed");
  const checked=await client.auth.getUser();
  gate(!checked.error&&checked.data?.user?.id===signed.data.user.id,
    "authenticated-identity-drift");
  await client.realtime.setAuth(signed.data.session.access_token);
  return signed.data.user.id;
}
async function queryRows(client,table,filters,fields="id",limit=5){
  let q=client.from(table).select(fields);
  for(const [key,val] of Object.entries(filters))q=q.eq(key,val);
  const r=await q.limit(limit);
  gate(!r.error&&Array.isArray(r.data),"required-staging-query-unavailable");
  return r.data;
}
async function one(client,table,filters,fields="id"){
  const data=await queryRows(client,table,filters,fields,2);
  gate(data.length===1,"fixture-row-missing-or-ambiguous");
  return data[0];
}
async function invisible(client,table,filters){
  const data=await queryRows(client,table,filters,"id",1);
  gate(data.length===0,"revoked-row-level-access-exposed");
}
async function latestEventId(client,space){
  const r=await client.from("workspace_team_events").select("id")
    .eq("space_id",space).order("id",{ascending:false}).limit(1).maybeSingle();
  gate(!r.error&&Number.isSafeInteger(r.data?.id)&&r.data.id>0,
    "server-event-baseline-unavailable");
  return r.data.id;
}
async function eventProof(client,{space,owner,entity,type,after}){
  let q=client.from("workspace_team_events").select(
    "id,space_id,actor_id,entity_id,event_type")
    .eq("space_id",space).eq("actor_id",owner)
    .eq("entity_id",entity).eq("event_type",type)
    .gt("id",after).order("id",{ascending:true}).limit(2);
  const r=await q;
  gate(!r.error&&Array.isArray(r.data)&&r.data.length===1,
    "persisted-task-event-not-unique");
  return r.data[0];
}
async function ownerTask(client,space,id,fields){
  return one(client,"workspace_team_tasks",{id,space_id:space},fields);
}
function saveArgs(space,taskId,title,updatedAt=null){
  return {p_space_id:space,p_task_id:taskId,p_title:title,
    p_details:"Phase 25 disposable revocation acceptance",
    p_status:"todo",p_priority:"normal",p_due_on:null,
    p_assignee_id:null,p_expected_updated_at:updatedAt};
}
async function waitForDelivery(packets,event,permitted,forbidden,scope,
  {ms=REVOCATION_EVENT_MS,delayFn=delay}={}){
  const stop=Date.now()+ms;
  while(Date.now()<stop){
    // Unauthorized packet must fail immediately, not at the end of the window.
    for(const role of forbidden){
      if(packets[role]?.some(x=>x.space_id===scope.space&&
        Number.isSafeInteger(x.id)&&x.id>scope.denyAfter))
        throw Error("Workspace revocation blocked: revoked-or-outsider-event-exposed");
    }
    if(permitted.every(role=>packets[role]?.some(x=>x.id===event.id)))break;
    await delayFn(150);
  }
  verifyRevocationDelivery({packets,event,permitted,forbidden,...scope});
  await delayFn(REVOCATION_QUIET_MS);
  verifyRevocationDelivery({packets,event,permitted,forbidden,...scope});
}
async function checkRevokedData(client,space,taskId,identityId){
  // Auth session must still represent the SAME user: this is authorization,
  // not a side effect of signing out or erasing local credentials.
  const identity=await client.auth.getUser();
  gate(!identity.error&&identity.data?.user?.id===identityId,
    "revoked-auth-session-not-verified");
  for(const [table,filter] of [
    ["workspace_team_spaces",{id:space}],
    ["workspace_team_members",{space_id:space}],
    ["workspace_team_tasks",{space_id:space,id:taskId}],
    ["workspace_team_events",{space_id:space}],
    ["workspace_team_read_cursors",{space_id:space}],
    ["workspace_team_task_comments",{space_id:space,task_id:taskId}],
    ["workspace_team_task_steps",{space_id:space,task_id:taskId}],
  ])await invisible(client,table,filter);
  const snapshot=await client.rpc("workspace_team_notification_snapshot",{p_space_id:space});
  gate(!snapshot.error&&snapshot.data===null,"revoked-notification-snapshot-exposed");
  const role=await client.rpc("workspace_team_role",{p_space_id:space});
  gate(!role.error&&role.data===null,"revoked-team-role-exposed");
}
async function forbiddenUpdate(client,space,taskId,title,updatedAt){
  const r=await client.rpc("workspace_team_save_task",
    saveArgs(space,taskId,title,updatedAt));
  gate(isRoleDenied(r),"revoked-user-can-write-existing-team-task");
}
export async function runStagingRevocationAcceptance(config,
  factory=createStagingClient,{onProgress=()=>{}}={}){
  const clients=REVOCATION_ROLES.map(()=>factory(config.url,config.key));
  const channels=[];
  const packets=Object.fromEntries(
    [...REVOCATION_ROLES,"editor_fresh"].map(x=>[x,[]]));
  const status=new Map();
  const space=config.revocationSpace;
  const checks=[];
  const identities=[];
  let alive=true,taskId=null,title="",removedId=null;
  let error=null,cleanupError=null;
  const subscribe=(client,role)=>new Promise((resolve,reject)=>{
    let complete=false,channel=null;
    channel=client.channel("eternyx-p25-"+role+"-"+space)
      .on("postgres_changes",{
        event:"INSERT",schema:"public",table:"workspace_team_events",
        filter:"space_id=eq."+space,
      },payload=>{
        if(!alive)return;
        const row=payload?.new;
        if(row?.space_id!==space)return;
        if(packets[role].length>=100)
          {status.set(role,"OVERFLOW");return;}
        packets[role].push({
          id:row.id,space_id:row.space_id,
          actor_id:row.actor_id,entity_id:row.entity_id,
          event_type:row.event_type,
        });
      }).subscribe(state=>{
        if(!alive)return;
        status.set(role,state);
        if(state==="SUBSCRIBED"){
          if(!complete){complete=true;resolve();}
        }else if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(state)){
          if(!complete){complete=true;
            reject(Error("Workspace revocation blocked: subscription-unavailable"));}
        }
      });
    channels.push({client,channel,role});
  });
  const requireHealthy=()=>{
    for(const role of ["owner","viewer","outsider","editor_fresh"]){
      gate(status.get(role)==="SUBSCRIBED",
        "control-or-fresh-channel-not-connected");
    }
    // The original editor's channel may be deliberately closed by Realtime
    // after revocation; either a closed connection or still-connected-but-
    // denied events is acceptable, but unexpected errors are not.
    gate(["SUBSCRIBED","CLOSED"].includes(status.get("editor")),
      "original-channel-unhealthy");
    gate(Object.values(packets).every(x=>x.length<=100),"event-buffer-overflow");
  };
  const cleanup=async()=>{
    if(!taskId)return;
    const current=await queryRows(clients[0],"workspace_team_tasks",
      {id:taskId,space_id:space},"id,title",2);
    gate(current.length<=1,"cleanup-ambiguous-task");
    if(current.length){
      // Only the exactly named test task generated by THIS invocation.
      gate(current[0].title===title||current[0].title===title+" checked",
        "cleanup-would-delete-nontest-task");
      const del=await clients[0].rpc("workspace_team_delete_task",
        {p_space_id:space,p_task_id:taskId});
      gate(!del.error&&del.data===true,"delete-disposable-task-failed");
    }
    const left=await queryRows(clients[0],"workspace_team_tasks",
      {id:taskId,space_id:space},"id",1);
    gate(left.length===0,"temporary-task-not-deleted");
    const all=await queryRows(clients[0],"workspace_team_tasks",
      {space_id:space},"id",1);
    gate(all.length===0,"dedicated-team-not-empty-after-cleanup");
  };
  try{
    for(let i=0;i<4;i++)identities.push(await login(clients[i],config.people[i]));
    gate(new Set(identities).size===4,"four-distinct-staging-users-required");
    const team=await one(clients[0],"workspace_team_spaces",{id:space},
      "id,owner_id,name,status");
    const members=await queryRows(clients[0],"workspace_team_members",
      {space_id:space},"user_id,role",5);
    const tasks=await queryRows(clients[0],"workspace_team_tasks",
      {space_id:space},"id",1);
    const invites=await clients[0].from("workspace_team_invites")
      .select("id").eq("space_id",space)
      .is("consumed_at",null).is("revoked_at",null)
      .gt("expires_at",new Date().toISOString()).limit(1);
    gate(!invites.error&&Array.isArray(invites.data),
      "invitation-preflight-unavailable");
    validateRevocationFixture(team,members,identities,tasks.length,invites.data.length);
    await invisible(clients[3],"workspace_team_spaces",{id:space});
    checks.push("isolated_active_empty_staging_team");
    await bounded(Promise.all(clients.map((client,i)=>
      subscribe(client,REVOCATION_ROLES[i]))),
    REVOCATION_SUBSCRIBE_MS,"initial-four-stream-subscribe-timeout");
    gate(REVOCATION_ROLES.every(role=>status.get(role)==="SUBSCRIBED"),
      "initial-channel-not-subscribed");
    checks.push("four_authenticated_realtime_connections");
    const baseline=await latestEventId(clients[0],space);
    title="ETERNYX REVOCATION TEST "+randomUUID().slice(0,12);
    const created=await clients[0].rpc("workspace_team_save_task",
      saveArgs(space,null,title));
    gate(!created.error&&typeof created.data==="string"&&
      /^[0-9a-f-]{36}$/i.test(created.data),"owner-cannot-create-test-task");
    taskId=created.data;
    const row=await ownerTask(clients[0],space,taskId,"id,title,created_by,updated_at");
    gate(row.title===title&&row.created_by===identities[0],"test-task-owner-mismatch");
    const createEvent=await eventProof(clients[0],{
      space,owner:identities[0],entity:taskId,type:"task_created",after:baseline});
    await waitForDelivery(packets,createEvent,
      ["owner","editor","viewer"],["outsider"],{
        space,owner:identities[0],entity:taskId,
        type:"task_created",after:baseline,denyAfter:baseline});
    checks.push("pre_revocation_editor_received_real_event");
    const revoked=await clients[0].rpc("workspace_team_member_change",{
      p_space_id:space,p_user_id:identities[1],p_role:null,
    });
    gate(!revoked.error&&revoked.data===true,"owner-revoke-member-rpc-failed");
    removedId=(await eventProof(clients[0],{
      space,owner:identities[0],entity:identities[1],
      type:"member_removed",after:createEvent.id})).id;
    const afterMembers=await queryRows(clients[0],"workspace_team_members",
      {space_id:space},"user_id,role",4);
    gate(afterMembers.length===2&&
      afterMembers.some(x=>x.role==="owner"&&x.user_id===identities[0])&&
      afterMembers.some(x=>x.role==="viewer"&&x.user_id===identities[2]),
      "editor-membership-not-removed");
    checks.push("persisted_editor_removal_event_and_exact_membership");
    await checkRevokedData(clients[1],space,taskId,identities[1]);
    checks.push("existing_revoked_session_cannot_read_team_or_snapshot");
    const fresh=factory(config.url,config.key);
    const freshId=await login(fresh,config.people[1]);
    gate(freshId===identities[1],"fresh-editor-identity-mismatch");
    await checkRevokedData(fresh,space,taskId,identities[1]);
    checks.push("new_auth_session_cannot_restore_removed_membership");
    await bounded(subscribe(fresh,"editor_fresh"),
      REVOCATION_SUBSCRIBE_MS,"fresh-revoked-subscription-timeout");
    requireHealthy();
    checks.push("fresh_removed_editor_socket_observation_armed");
    await forbiddenUpdate(clients[1],space,taskId,title+" trespass",row.updated_at);
    await forbiddenUpdate(fresh,space,taskId,title+" trespass",row.updated_at);
    checks.push("old_and_new_removed_editor_write_rpcs_denied");
    const ownerEdit=await clients[0].rpc("workspace_team_save_task",
      saveArgs(space,taskId,title+" checked",row.updated_at));
    gate(!ownerEdit.error&&ownerEdit.data===taskId,"owner-post-revocation-edit-failed");
    const updateEvent=await eventProof(clients[0],{
      space,owner:identities[0],entity:taskId,
      type:"task_updated",after:removedId});
    await waitForDelivery(packets,updateEvent,["owner","viewer"],
      ["editor","editor_fresh","outsider"],{
        space,owner:identities[0],entity:taskId,
        type:"task_updated",after:removedId,denyAfter:removedId});
    requireHealthy();
    const visible=await one(clients[2],"workspace_team_tasks",
      {id:taskId,space_id:space},"id,title");
    gate(visible.title===title+" checked","viewer-control-data-not-visible");
    const verified=await one(clients[2],"workspace_team_events",
      {id:updateEvent.id,space_id:space},"id");
    gate(verified.id===updateEvent.id,"viewer-server-event-not-visible");
    checks.push("revoked_existing_and_new_sockets_excluded");
    checks.push("owner_viewer_received_real_post_removal_update");
    onProgress("Staging editor removed; verification complete; cleaning test task.");
  }catch(e){error=e;}
  finally{
    try{
      const before=taskId&&removedId!==null?await latestEventId(clients[0],space):null;
      await cleanup();
      if(taskId&&removedId!==null&&before!==null){
        const deletionEvent=await eventProof(clients[0],{
          space,owner:identities[0],entity:taskId,
          type:"task_deleted",after:before});
        // Even cleanup must not leak to a removed member after revocation.
        await waitForDelivery(packets,deletionEvent,["owner","viewer"],
          ["editor","editor_fresh","outsider"],{
            space,owner:identities[0],entity:taskId,
            type:"task_deleted",after:removedId,denyAfter:removedId});
        checks.push("temporary_task_cleanup_and_event_delivery_verified");
      }
    }catch{cleanupError=Error(
      "Workspace revocation blocked: cleanup-or-delivery-unverified-inspect-disposable-team");}
    alive=false;
    await Promise.allSettled(channels.map(({client,channel})=>
      client.removeChannel(channel)));
  }
  if(cleanupError)throw cleanupError;
  if(error)throw error;
  return safeRevocationReport(checks);
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const flag=process.argv[2];
  if(flag==="--help")process.stdout.write(
    "Real STAGING editor removal and Realtime permission acceptance.\n"+
    "Requires Phase 21 WORKSPACE_STAGING_* keys and:\n"+
    "WORKSPACE_STAGING_REVOKE_SPACE_ID=<dedicated empty 3-member team UUID>\n"+
    "WORKSPACE_STAGING_REVOKE_CONFIRM="+REVOCATION_CONFIRM+"\n"+
    "WORKSPACE_STAGING_REVOKE_HISTORY_CONFIRM="+REVOCATION_HISTORY_CONFIRM+"\n"+
    "--config-check | --run\n");
  else if(flag==="--config-check"||flag==="--run"){
    try{
      const config=validateStagingRevocationConfig(process.env);
      if(flag==="--config-check")process.stdout.write(
        "Phase 25 staging revocation configuration valid; nothing changed.\n");
      else{
        process.stdout.write(
          "STAGING ONLY: test editor removal and audit events will persist.\n");
        process.stdout.write(JSON.stringify(
          await runStagingRevocationAcceptance(config),null,2)+"\n");
      }
    }catch(e){
      const msg=e instanceof Error&&e.message.startsWith("Workspace revocation blocked: ")?
        e.message:"Workspace revocation blocked: unexpected-staging-revocation-failure";
      process.stderr.write(msg+"\n");process.exitCode=1;
    }
  }else{
    process.stderr.write("Use --help, --config-check or --run.\n");
    process.exitCode=2;
  }
}
