#!/usr/bin/env node
/**
 * Workspace Phase 22: separate operator-gated Realtime delivery test.
 * The runner never creates/updates records or applies migrations.
 * Operator makes ONE permitted change to an existing STAGING team task
 * only after the four authenticated Realtime subscriptions are armed.
 */
import {fileURLToPath} from "node:url";
import path from "node:path";
import {
  validateWorkspaceStagingConfig,createStagingClient,
} from "./workspace-team-staging-acceptance.mjs";
import {
  WORKSPACE_REALTIME_ROLES,REALTIME_DELIVERY_WINDOW_MS,
  REALTIME_SUBSCRIBE_WINDOW_MS,REALTIME_QUIET_WINDOW_MS,
  matchesWorkspaceTaskUpdate,checkWorkspaceRealtimeEvidence,verifyWorkspaceReconnectSnapshot,
} from "../src/lib/workspaceRealtimeAcceptance.mjs";

const APPROVAL="READ_ONLY_REALTIME_WINDOW";
export function validateWorkspaceRealtimeConfig(env){
  const config=validateWorkspaceStagingConfig(env);
  if(env.WORKSPACE_STAGING_REALTIME_CONFIRM!==APPROVAL)
    throw Error("Workspace realtime blocked: explicit-operator-acknowledgment-required");
  return config;
}
const fail=(condition,code)=>{
  if(!condition)throw Error("Workspace realtime blocked: "+code);
};
const wait=(duration)=>new Promise(resolve=>setTimeout(resolve,duration));
async function promiseBefore(promise,ms,code){
  let timer;
  try{
    return await Promise.race([promise,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(Error("Workspace realtime blocked: "+code)),ms);
    })]);
  }finally{clearTimeout(timer);}
}
async function getVerifiedIdentity(client,person){
  const login=await client.auth.signInWithPassword({
    email:person.email,password:person.password,
  });
  fail(!login.error&&Boolean(login.data?.user?.id&&login.data?.session?.access_token),
    "staging-login-unavailable");
  const lookup=await client.auth.getUser();
  fail(!lookup.error&&lookup.data?.user?.id===login.data.user.id,
    "authenticated-identity-drift");
  await client.realtime.setAuth(login.data.session.access_token);
  return login.data.user.id;
}
async function fetchOne(client,table,filters,fields="id"){
  let query=client.from(table).select(fields);
  for(const [key,val] of Object.entries(filters))query=query.eq(key,val);
  const result=await query.limit(2);
  fail(!result.error&&Array.isArray(result.data),"required-staging-query-failed");
  fail(result.data.length===1,"fixture-absent-or-ambiguous");
  return result.data[0];
}
async function latestId(client,space){
  const result=await client.from("workspace_team_events")
    .select("id").eq("space_id",space).order("id",{ascending:false})
    .limit(1).maybeSingle();
  fail(!result.error&&Number.isSafeInteger(result.data?.id)
      &&result.data.id>0,"server-event-baseline-unavailable");
  return result.data.id;
}
async function ownerEventRow(client,space,eventId){
  const r=await client.from("workspace_team_events").select(
    "id,space_id,entity_id,actor_id,event_type,created_at")
    .eq("space_id",space).eq("id",eventId).maybeSingle();
  fail(!r.error&&!!r.data,"persisted-realtime-event-unavailable");
  return r.data;
}
async function forbiddenEventRead(client,space,eventId){
  const r=await client.from("workspace_team_events")
    .select("id").eq("space_id",space).eq("id",eventId).limit(1);
  if(r.error){
    fail(["42501","PGRST301"].includes(r.error.code)||
      [401,403].includes(r.error.status),"outsider-query-unavailable");
  }else{
    fail(Array.isArray(r.data)&&r.data.length===0,"outsider-event-visibility-leak");
  }
}
export async function runWorkspaceRealtimeStaging(config, factory=createStagingClient,{
  onArmed=()=>process.stdout.write(
    "ARMED: In the STAGING browser, update the existing team task ONCE as OWNER.\n"+
    "Do not edit production. The runner does not modify application data.\n"
  ), approvedFixtureEdit=null, approvedReconnectEdit=null, clock=()=>Date.now(), sleep=wait,
}={}){
  const clients=WORKSPACE_REALTIME_ROLES.map(()=>factory(config.url,config.key));
  const channels=[];
  let alive=true;
  const delivered=new Map();
  const subscribed=new Set();
  const interrupted=new Set();
  const generations=new Map();
  const requireHealthy=(roles=WORKSPACE_REALTIME_ROLES)=>{
    fail(interrupted.size===0&&roles.every(role=>subscribed.has(role)),"subscriber-interrupted-during-observation");
  };
  let outsiderCount=0,baseline=null;
  const space=config.ids.SPACE_ID,task=config.ids.TEAM_TASK_ID;
  const identities=[];
  try{
    // Four separate Auth users with fresh JWTs. No service-role credentials.
    for(let i=0;i<4;i++)
      identities.push(await getVerifiedIdentity(clients[i],config.people[i]));
    fail(new Set(identities).size===4,"four-distinct-accounts-required");
    const team=await fetchOne(clients[0],"workspace_team_spaces",
      {id:space},"id,owner_id,status");
    fail(team.owner_id===identities[0]&&team.status==="active",
      "active-owned-space-required");
    await fetchOne(clients[0],"workspace_team_tasks",
      {id:task,space_id:space},"id,space_id");
    for(let i=0;i<3;i++){
      const membership=await fetchOne(clients[i],"workspace_team_members",
        {user_id:identities[i],space_id:space},"user_id,space_id,role");
      fail(membership.role===WORKSPACE_REALTIME_ROLES[i],
        "staging-member-role-mismatch");
    }
    // Crucial: make outsider uninvited before treating no packets as proof.
    const outsiderQuery=await clients[3].from("workspace_team_spaces")
      .select("id").eq("id",space).limit(1);
    fail(!outsiderQuery.error&&Array.isArray(outsiderQuery.data)
      &&outsiderQuery.data.length===0,"outsider-must-not-see-staging-team");
    const subscribeRole=i=>{
      const role=WORKSPACE_REALTIME_ROLES[i],client=clients[i];
      const generation=(generations.get(role)??0)+1;
      generations.set(role,generation);
      return new Promise((resolve,reject)=>{
        let settled=false;
        const channel=client.channel("workspace-p22-"+role+"-"+space+"-"+generation)
          .on("postgres_changes",{
            event:"INSERT",schema:"public",table:"workspace_team_events",
            filter:"space_id=eq."+space,
          },payload=>{
            if(!alive||generations.get(role)!==generation)return;
            const row=payload?.new;
            // An outsider must receive no team event, even an unrelated action.
            if(role==="outsider"){
              if(row?.space_id===space)outsiderCount++;
              return;
            }
            if(baseline!==null&&matchesWorkspaceTaskUpdate(row,{
              space,task,owner:identities[0],baseline,
            })){
              if(!delivered.has(role))delivered.set(role,row.id);
            }
          }).subscribe(status=>{
            if(!alive||generations.get(role)!==generation)return;
            if(status==="SUBSCRIBED"){
              subscribed.add(role);
              if(!settled){settled=true;resolve(true);}
            }else if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status)){
              subscribed.delete(role);interrupted.add(role);
              if(!settled){settled=true;
                reject(Error("Workspace realtime blocked: channel-not-subscribed"));}
            }
          });
        channels.push({client,channel,role});
      });
    };
    await promiseBefore(Promise.all(WORKSPACE_REALTIME_ROLES.map((_,i)=>subscribeRole(i))),
      REALTIME_SUBSCRIBE_WINDOW_MS,"subscription-timeout");
    // Baseline AFTER all four subscribers are armed; event must follow it.
    baseline=await latestId(clients[0],space);
    requireHealthy();
    if(approvedFixtureEdit!==null){
      fail(typeof approvedFixtureEdit==="function","invalid-approved-edit");
      await approvedFixtureEdit({client:clients[0],identity:identities[0],space,task});
      requireHealthy();
    }else onArmed();
    const deadline=clock()+REALTIME_DELIVERY_WINDOW_MS;
    while(clock()<deadline&&delivered.size<3&&outsiderCount===0){
      requireHealthy();
      await sleep(200);
    }
    requireHealthy();
    fail(outsiderCount===0,"outsider-received-private-team-event");
    fail(delivered.size===3,"expected-task-update-not-delivered-to-all-members");
    const ids=[...delivered.values()];
    fail(new Set(ids).size===1,"member-event-ids-disagree");
    const row=await ownerEventRow(clients[0],space,ids[0]);
    for(const client of clients.slice(1,3)){
      await fetchOne(client,"workspace_team_events",
        {space_id:space,id:row.id},"id");
    }
    await forbiddenEventRead(clients[3],space,row.id);
    // Wait briefly for late unauthorized delivery before reporting a pass.
    await sleep(REALTIME_QUIET_WINDOW_MS);
    requireHealthy();
    fail(outsiderCount===0,"delayed-outsider-event-leak");
    const evidence=checkWorkspaceRealtimeEvidence({
      baseline,delivered:[...delivered].map(([role,eventId])=>({role,eventId})),
      subscribed:[...subscribed],outsiderCount,serverRow:row,
      space,task,owner:identities[0],
    });
    if(approvedReconnectEdit!==null){
      fail(approvedFixtureEdit!==null&&typeof approvedReconnectEdit==="function","explicit-reconnect-edit-required");
      const editor=clients[1],owner=clients[0];
      const readTask=client=>fetchOne(client,"workspace_team_tasks",{id:task,space_id:space},"id,title,updated_at");
      const before=await readTask(editor);
      const index=channels.findIndex(entry=>entry.role==="editor");
      fail(index>=0,"editor-channel-missing");
      // Retire callbacks before unsubscribing the original editor channel.
      generations.set("editor",generations.get("editor")+1);
      subscribed.delete("editor");
      const removed=await promiseBefore(editor.removeChannel(channels[index].channel),REALTIME_SUBSCRIBE_WINDOW_MS,"editor-unsubscribe-timeout");
      fail(removed==="ok","editor-unsubscribe-failed");
      channels.splice(index,1);
      await editor.realtime.disconnect();
      fail(editor.realtime.isConnected()===false,"editor-socket-not-disconnected");
      const controls=["owner","viewer","outsider"];
      const observe=async(roles,phase)=>{
        requireHealthy(roles);
        const previous=await latestId(owner,space);
        baseline=previous;delivered.clear();
        await approvedReconnectEdit({client:owner,identity:identities[0],space,task,phase});
        const recipients=roles.filter(role=>role!=="outsider");
        const deadline=clock()+REALTIME_DELIVERY_WINDOW_MS;
        while(clock()<deadline&&!recipients.every(role=>delivered.has(role))&&outsiderCount===0){
          requireHealthy(roles);await sleep(200);
        }
        requireHealthy(roles);
        fail(outsiderCount===0&&recipients.every(role=>delivered.has(role)),"reconnect-round-delivery-failed");
        const ids=recipients.map(role=>delivered.get(role));
        fail(new Set(ids).size===1&&ids[0]>previous,"reconnect-round-event-mismatch");
        const server=await ownerEventRow(owner,space,ids[0]);
        fail(matchesWorkspaceTaskUpdate(server,{space,task,owner:identities[0],baseline:previous}),"reconnect-server-event-invalid");
        for(const role of recipients.filter(role=>role!=="owner"))
          await fetchOne(clients[WORKSPACE_REALTIME_ROLES.indexOf(role)],"workspace_team_events",{space_id:space,id:server.id},"id");
        await forbiddenEventRead(clients[3],space,server.id);
        await sleep(REALTIME_QUIET_WINDOW_MS);
        requireHealthy(roles);fail(outsiderCount===0,"reconnect-delayed-outsider-leak");
        return server.id;
      };
      const missedId=await observe(controls,"offline");
      fail(editor.realtime.isConnected()===false&&!delivered.has("editor"),"editor-not-disconnected-through-missed-event");
      const missed=await readTask(owner);
      const verified=await editor.auth.getUser();
      fail(!verified.error&&verified.data?.user?.id===identities[1],"editor-identity-changed");
      await promiseBefore(subscribeRole(1),REALTIME_SUBSCRIBE_WINDOW_MS,"editor-reconnect-timeout");
      requireHealthy();
      const recovered=await readTask(editor);
      await fetchOne(editor,"workspace_team_events",{space_id:space,id:missedId},"id");
      const nextId=await observe(WORKSPACE_REALTIME_ROLES,"reconnected");
      fail(nextId>missedId,"reconnected-event-not-newer");
      const [after,final]=await Promise.all([readTask(owner),readTask(editor)]);
      verifyWorkspaceReconnectSnapshot({before,missed,recovered,after,final,task});
      return {...evidence,mode:"automated_disposable_staging_reconnect",
        application_data_modified_by_runner:true,verified_editor_disconnect:true,
        verified_authoritative_catchup:true,verified_reconnected_delivery:true,
        limitations:"Three approved staging task edits; same-client disconnect and reconnect plus authoritative catch-up. No browser, migration or production certification."};
    }
    return approvedFixtureEdit===null?evidence:{...evidence,mode:"automated_disposable_staging_edit",
      application_data_modified_by_runner:true,
      limitations:"One explicitly approved disposable staging task edit. No reconnect, browser, migration or production certification."};
  }finally{
    alive=false;
    await Promise.allSettled(channels.map(({client,channel})=>
      client.removeChannel(channel)));
  }
}
const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  const flag=process.argv[2];
  if(flag==="--help")
    process.stdout.write("Staging Realtime acceptance: --config-check or --run\n"+
      "Requires Phase 21 WORKSPACE_STAGING_* environment keys plus\n"+
      "WORKSPACE_STAGING_REALTIME_CONFIRM="+APPROVAL+"\n");
  else if(flag==="--config-check"||flag==="--run"){
    try{
      const config=validateWorkspaceRealtimeConfig(process.env);
      if(flag==="--config-check")process.stdout.write(
        "Phase 22 staging configuration accepted; no network action.\n");
      else process.stdout.write(
        JSON.stringify(await runWorkspaceRealtimeStaging(config),null,2)+"\n");
    }catch(e){
      // Only stable, non-sensitive error codes. No JWT, payloads or record data.
      const safe=e instanceof Error&&e.message.startsWith("Workspace realtime blocked: ")?
        e.message:"Workspace realtime blocked: unexpected-subscriber-failure";
      process.stderr.write(safe+"\n");process.exitCode=1;
    }
  }else{
    process.stderr.write("Use --help, --config-check or --run.\n");process.exitCode=2;
  }
}
