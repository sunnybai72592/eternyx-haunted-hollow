#!/usr/bin/env node
// Workspace Phase 21 — operator-only, READ-ONLY authenticated staging acceptance.
// Only Auth sign-in sessions, Data API SELECT and read-only snapshot RPC.
// No production project, SQL migration, application-data mutation or Storage byte access.
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeWorkspaceTeamSnapshot } from "../src/lib/workspaceTeamActivityHistory.mjs";

const PRODUCTION_REF="wcncuarekaofmfurbtbh";
const UUID=/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const ROLES=["OWNER","EDITOR","VIEWER","OUTSIDER"];
const required=["URL","PROJECT_REF","PUBLISHABLE_KEY","CONFIRM",
  "SPACE_ID","TEAM_TASK_ID","PRIVATE_PROJECT_ID","PRIVATE_TASK_ID","PRIVATE_ITEM_ID",
  ...ROLES.flatMap(r=>[r+"_EMAIL",r+"_PASSWORD"])];
export const STAGING_KEYS=Object.freeze(required.map(x=>"WORKSPACE_STAGING_"+x));
function gate(ok,label){if(!ok)throw Error("Workspace staging blocked: "+label);}
function envValue(env,key){return String(env["WORKSPACE_STAGING_"+key]??"").trim();}
function validatePublishableKey(raw){
  gate(!raw.startsWith("sb_secret_"),"privileged-key-rejected");
  if(raw.startsWith("sb_publishable_"))return raw;
  const parts=raw.split(".");
  gate(parts.length===3,"invalid-publishable-key");
  let payload;
  try{payload=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));}
  catch{throw Error("Workspace staging blocked: invalid-legacy-key");}
  gate(payload.role==="anon","privileged-key-rejected");
  return raw;
}
export function validateWorkspaceStagingConfig(env){
  const missing=STAGING_KEYS.filter(key=>typeof env[key]!=="string"||!env[key].trim());
  gate(!missing.length,"missing-keys-"+missing.join(","));
  const ref=envValue(env,"PROJECT_REF");
  gate(/^[a-z0-9]{20}$/.test(ref)&&ref!==PRODUCTION_REF,"nonproduction-project-required");
  let parsed;
  try{parsed=new URL(envValue(env,"URL"));}
  catch{throw Error("Workspace staging blocked: invalid-url");}
  gate(parsed.href==="https://"+ref+".supabase.co/","staging-url-ref-mismatch");
  gate(envValue(env,"CONFIRM")==="READ_ONLY_FOUR_ACCOUNT_ACCEPTANCE","operator-confirmation-required");
  const key=validatePublishableKey(envValue(env,"PUBLISHABLE_KEY"));
  const ids=Object.fromEntries(["SPACE_ID","TEAM_TASK_ID","PRIVATE_PROJECT_ID",
    "PRIVATE_TASK_ID","PRIVATE_ITEM_ID"].map(k=>[k,envValue(env,k)]));
  gate(Object.values(ids).every(id=>UUID.test(id)),"fixture-uuid-invalid");
  gate(new Set(Object.values(ids).map(id=>id.toLowerCase())).size===5,"duplicate-fixture-ids");
  const people=ROLES.map(role=>({
    role:role.toLowerCase(),email:envValue(env,role+"_EMAIL"),
    password:env["WORKSPACE_STAGING_"+role+"_PASSWORD"],
  }));
  gate(people.every(p=>p.email.includes("@")&&p.password.length>=8),"invalid-fixture-credentials");
  gate(new Set(people.map(p=>p.email.toLowerCase())).size===4,"four-distinct-accounts-required");
  return {url:parsed.origin,key,ref,ids,people};
}
export function sanitizedWorkspaceStagingReport(names){
  gate(Array.isArray(names)&&names.every(x=>/^[a-z_]{3,55}$/.test(x)),"invalid-report");
  return {schema:"eternyx.workspace.phase21.staging-acceptance",version:1,
    mode:"read_only_authenticated_staging",checks:names.map(key=>({key,status:"pass"})),
    summary:{passed:names.length,failed:0},release_gate:"manual_review_required",
    production_certified:false,realtime_delivery_verified:false,
    migration_history_verified:false,mutating_role_guards_verified:false,
    private_storage_bytes_verified:false,application_data_modified:false,
    limitations:"Read-only Data API checks cannot certify migrations, Realtime, Storage, writes or production."};
}
export function createStagingClient(url,key){
  return createClient(url,key,{
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},
    global:{fetch:(input,init={})=>{
      const timeout=AbortSignal.timeout(12_000);
      const signal=init.signal?AbortSignal.any([init.signal,timeout]):timeout;
      return fetch(input,{...init,signal});
    }},
  });
}
async function authenticate(client,person){
  const login=await client.auth.signInWithPassword({email:person.email,password:person.password});
  gate(!login.error&&!!login.data?.user?.id,"fixture-login-failed");
  const confirmed=await client.auth.getUser();
  gate(!confirmed.error&&confirmed.data?.user?.id===login.data.user.id,"identity-recheck-failed");
  return login.data.user.id;
}
async function selectRows(client,table,filters,columns="id",limit=2,allowDenied=false){
  let query=client.from(table).select(columns);
  for(const [key,val] of Object.entries(filters))query=query.eq(key,val);
  const result=await query.limit(limit);
  if(result.error){
    if(allowDenied&&["42501","PGRST301"].includes(result.error.code))return [];
    if(allowDenied&&[401,403].includes(result.error.status))return [];
    throw Error("Workspace staging blocked: query-unavailable-"+table);
  }
  gate(Array.isArray(result.data),"incomplete-query-"+table);
  return result.data;
}
async function one(client,table,filters,columns="id"){
  const rows=await selectRows(client,table,filters,columns);
  gate(rows.length===1,"fixture-not-visible-"+table);
  return rows[0];
}
async function invisible(client,table,filters,allowDenied=false){
  const rows=await selectRows(client,table,filters,"id",2,allowDenied);
  gate(rows.length===0,"unauthorized-row-visible-"+table);
}
async function notification(client,space){
  const res=await client.rpc("workspace_team_notification_snapshot",{p_space_id:space});
  gate(!res.error&&res.data!==null,"notification-snapshot-unavailable");
  try{return normalizeWorkspaceTeamSnapshot(res.data);}
  catch{throw Error("Workspace staging blocked: invalid-notification-snapshot");}
}
async function checkUnread(client,space,userId,joinedAt){
  const before=await notification(client,space);
  const count=await client.from("workspace_team_events")
    .select("id",{count:"exact",head:true}).eq("space_id",space)
    .neq("actor_id",userId).gte("created_at",joinedAt).gt("id",before.lastSeen);
  gate(!count.error&&Number.isSafeInteger(count.count),"unread-count-query-failed");
  const after=await notification(client,space);
  gate(after.latest===before.latest&&after.lastSeen===before.lastSeen,
    "concurrent-activity-recheck-required");
  gate(after.unread===count.count,"notification-count-mismatch");
}
export async function runWorkspaceStagingAcceptance(config,clientFactory=createStagingClient){
  const clients=ROLES.map(()=>clientFactory(config.url,config.key));
  const anon=clientFactory(config.url,config.key);
  const identities=[];
  for(let i=0;i<4;i++)identities.push(await authenticate(clients[i],config.people[i]));
  gate(new Set(identities).size===4,"fixture-accounts-not-distinct");
  const checks=["verified_four_auth_sessions"];
  const [owner,editor,viewer,outsider]=clients;
  const space=config.ids.SPACE_ID, task=config.ids.TEAM_TASK_ID;
  const team=await one(owner,"workspace_team_spaces",{id:space},"id,owner_id,status");
  gate(team.owner_id===identities[0],"owner-role-mismatch");
  const memberships=[];
  for(let i=0;i<3;i++){
    await one(clients[i],"workspace_team_spaces",{id:space});
    const m=await one(clients[i],"workspace_team_members",
      {space_id:space,user_id:identities[i]},"space_id,user_id,role,joined_at");
    gate(m.role===ROLES[i].toLowerCase()&&Number.isFinite(Date.parse(m.joined_at)),
      "membership-role-invalid");
    memberships.push(m);
  }
  checks.push("real_owner_editor_viewer_memberships");
  const shared=await one(owner,"workspace_team_tasks",{id:task,space_id:space});
  gate(!!shared.id,"missing-team-task");
  for(const client of [owner,editor,viewer]){
    await one(client,"workspace_team_tasks",{id:task,space_id:space});
    await one(client,"workspace_team_task_comments",{task_id:task,space_id:space});
    await one(client,"workspace_team_task_steps",{task_id:task,space_id:space});
  }
  checks.push("shared_task_comment_checklist");
  for(const table of ["workspace_team_members","workspace_team_tasks",
    "workspace_team_events","workspace_team_task_comments",
    "workspace_team_task_steps","workspace_team_read_cursors"])
    await invisible(outsider,table,{space_id:space});
  await invisible(outsider,"workspace_team_spaces",{id:space});
  checks.push("outsider_row_level_denial");
  for(let i=0;i<3;i++){
    const cursor=await selectRows(clients[i],"workspace_team_read_cursors",
      {space_id:space},"user_id,last_seen_event_id",3);
    gate(cursor.length<=1&&cursor.every(x=>x.user_id===identities[i]),
      "cross_member_read_cursor_visible");
    await checkUnread(clients[i],space,identities[i],memberships[i].joined_at);
  }
  const outsiderSnapshot=await outsider.rpc("workspace_team_notification_snapshot",
    {p_space_id:space});
  gate(!outsiderSnapshot.error&&outsiderSnapshot.data===null,"outsider-snapshot-exposed");
  checks.push("exact_team_only_notification_snapshots");
  await one(owner,"workspace_team_events",{space_id:space});
  await one(editor,"workspace_team_events",{space_id:space});
  await one(viewer,"workspace_team_events",{space_id:space});
  checks.push("server_recorded_activity");
  for(const [table,idKey] of [
    ["workspace_projects","PRIVATE_PROJECT_ID"],
    ["workspace_tasks","PRIVATE_TASK_ID"],
    ["workspace_items","PRIVATE_ITEM_ID"]]){
    const id=config.ids[idKey];
    await one(owner,table,{id});
    for(const client of [editor,viewer,outsider])
      await invisible(client,table,{id});
  }
  checks.push("personal_projects_tasks_items_isolated");
  for(const table of ["workspace_team_spaces","workspace_team_tasks",
    "workspace_team_events"])
    await invisible(anon,table,table==="workspace_team_spaces"?
      {id:space}:{space_id:space},true);
  checks.push("anonymous_team_reads_blocked");
  return sanitizedWorkspaceStagingReport(checks);
}
const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  const flag=process.argv[2];
  if(flag==="--help")process.stdout.write("Required variables:\n"+STAGING_KEYS.join("\n")+"\n");
  else if(flag==="--config-check"||flag==="--run"){
    try{
      const config=validateWorkspaceStagingConfig(process.env);
      if(flag==="--config-check")process.stdout.write("Staging config valid; no network queried.\n");
      else process.stdout.write(JSON.stringify(await runWorkspaceStagingAcceptance(config),null,2)+"\n");
    }catch(error){
      // Never print SDK error objects, JWTs, URLs, credentials or record data.
      const label=error instanceof Error&&error.message.startsWith("Workspace staging blocked: ")?
        error.message:"Workspace staging blocked: unexpected-read-only-probe-error";
      process.stderr.write(label+"\n");process.exitCode=1;
    }
  }else{process.stderr.write("Use --help, --config-check or --run.\n");process.exitCode=2;}
}
