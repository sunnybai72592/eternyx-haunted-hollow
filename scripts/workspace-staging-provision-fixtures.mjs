#!/usr/bin/env node
// Explicitly approved operator-only staging fixture setup. No browser/service-role exposure.
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {openSync,writeSync,fsyncSync,closeSync,realpathSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createStagingClient,validateWorkspaceStagingConfig} from "./workspace-team-staging-acceptance.mjs";
import {WRITE_PROBE_SPACE_NAME,WRITE_PROBE_APPROVAL,WRITE_AUDIT_APPROVAL} from "../src/lib/workspaceRoleWriteAcceptance.mjs";
import {REVOCATION_TEAM_NAME,REVOCATION_CONFIRM,REVOCATION_HISTORY_CONFIRM} from "../src/lib/workspaceRevocationAcceptance.mjs";
import {STORAGE_APPROVAL,STORAGE_BUCKET} from "../src/lib/workspaceStorageAcceptance.mjs";

export const FIXTURE_REF="mhodwvypfbxafamkrgsk";
export const FIXTURE_APPROVAL="PROVISION_FOUR_DISPOSABLE_WORKSPACE_STAGING_ACCOUNTS";
const ROLES=["OWNER","EDITOR","VIEWER","OUTSIDER"];
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function gate(ok,code){if(!ok)throw Error("Workspace fixture blocked: "+code);}
function legacyClaims(key){try{return JSON.parse(Buffer.from(key.split(".")[1],"base64url").toString("utf8"));}catch{return null;}}
export function validateFixtureProvisionConfig(env){
  gate(env.WORKSPACE_FIXTURE_CONFIRM===FIXTURE_APPROVAL,"explicit-approval-required");
  gate(env.WORKSPACE_FIXTURE_PROJECT_REF===FIXTURE_REF,"exact-staging-reference-required");
  const admin=String(env.WORKSPACE_FIXTURE_ADMIN_KEY??"");
  const key=String(env.WORKSPACE_FIXTURE_PUBLISHABLE_KEY??"");
  const a=legacyClaims(admin),k=legacyClaims(key);
  gate(admin.startsWith("sb_secret_")||a?.role==="service_role"&&a?.ref===FIXTURE_REF,"staging-admin-key-required");
  gate(key.startsWith("sb_publishable_")||k?.role==="anon"&&k?.ref===FIXTURE_REF,"staging-publishable-key-required");
  gate(admin!==key&&!/[\s"'\r\n]/.test(admin+key),"invalid-key-format");
  const output=String(env.WORKSPACE_FIXTURE_OUTPUT??"");
  gate(path.isAbsolute(output),"absolute-protected-output-path-required");
  return {admin,key,output,url:"https://"+FIXTURE_REF+".supabase.co"};
}
function receiptFile(output){
  const parent=realpathSync(path.dirname(output));
  const resolved=path.join(parent,path.basename(output)),root=realpathSync(repo);
  gate(resolved!==root&&!resolved.startsWith(root+path.sep),"output-must-be-outside-repository");
  // Exclusive file: a previous partial run is never overwritten.
  const fd=openSync(resolved,"wx",0o600);
  return {put(entries){
    for(const [key,value] of Object.entries(entries)){
      gate(/^[A-Z0-9_]+$/.test(key)&&typeof value==="string"&&!/[\r\n"'\s]/.test(value),"unsafe-receipt-value");
      writeSync(fd,key+"="+value+"\n");
    }
    fsyncSync(fd);
  },close(){closeSync(fd);}};
}
const take=(r,code)=>{gate(!r.error&&r.data!=null,code);return r.data;};
const uuid=(value,code)=>{gate(typeof value==="string"&&UUID.test(value),code);return value;};
async function rpc(client,name,args){return take(await client.rpc(name,args),"rpc-"+name);}
async function row(client,table,values){
  return uuid(take(await client.from(table).insert(values).select("id").single(),"insert-"+table).id,"invalid-insert-id");
}
export async function provisionWorkspaceFixtures(config,{factory=createStagingClient,openReceipt=receiptFile}={}){
  const journal=openReceipt(config.output);
  const nonce=randomBytes(8).toString("hex");
  const people=ROLES.map(role=>({role,email:"eternyx-workspace-"+nonce+"-"+role.toLowerCase()+"@example.com",password:"Aa1!"+randomBytes(24).toString("base64url")}));
  const env={
    WORKSPACE_STAGING_URL:config.url,
    WORKSPACE_STAGING_PROJECT_REF:FIXTURE_REF,
    WORKSPACE_STAGING_PUBLISHABLE_KEY:config.key,
    WORKSPACE_STAGING_CONFIRM:"READ_ONLY_FOUR_ACCOUNT_ACCEPTANCE",
  };
  for(const p of people){
    env["WORKSPACE_STAGING_"+p.role+"_EMAIL"]=p.email;
    env["WORKSPACE_STAGING_"+p.role+"_PASSWORD"]=p.password;
  }
  const record=entries=>{journal.put(entries);Object.assign(env,entries);};
  try{
    journal.put(env); // persist credentials BEFORE the first remote mutation; never store admin key
    const admin=factory(config.url,config.admin);
    const clients=people.map(()=>factory(config.url,config.key));
    const ids=[];
    for(let i=0;i<4;i++){
      const p=people[i];
      const created=take(await admin.auth.admin.createUser({
        email:p.email,password:p.password,email_confirm:true,
        app_metadata:{eternyx_workspace_test_fixture:nonce},
      }),"auth-admin-create-failed");
      const id=uuid(created.user?.id,"invalid-created-account");
      record({["WORKSPACE_FIXTURE_CREATED_"+p.role+"_ID"]:id});
      const signed=take(await clients[i].auth.signInWithPassword({email:p.email,password:p.password}),"fixture-login-failed");
      const verified=take(await clients[i].auth.getUser(),"fixture-identity-unavailable");
      gate(signed.user?.id===id&&verified.user?.id===id,"fixture-identity-mismatch");
      ids.push(id);
    }
    gate(new Set(ids).size===4,"accounts-not-distinct");
    const [owner,editor,viewer,outsider]=clients;
    async function team(name,key){
      const sid=uuid(await rpc(owner,"workspace_team_create",{p_name:name,p_description:"Dedicated synthetic staging acceptance "+nonce}),"invalid-team-id");
      record({[key]:sid});
      for(const [client,role] of [[editor,"editor"],[viewer,"viewer"]]){
        const invitation=await rpc(owner,"workspace_team_invite",{p_space_id:sid,p_role:role});
        gate(invitation.role===role&&/^[a-f0-9]{64}$/.test(invitation.token),"invalid-invite-receipt");
        gate(await rpc(client,"workspace_team_accept_invite",{p_token:invitation.token})===sid,"invite-accept-mismatch");
      }
      const members=take(await owner.from("workspace_team_members").select("user_id,role").eq("space_id",sid).limit(4),"team-members-unavailable");
      gate(members.length===3&&["owner","editor","viewer"].every((role,i)=>members.some(m=>m.role===role&&m.user_id===ids[i])),"fixture-role-mismatch");
      const denied=take(await outsider.from("workspace_team_spaces").select("id").eq("id",sid).limit(1),"outsider-control-unavailable");
      gate(denied.length===0,"outsider-team-visible");
      return sid;
    }
    const sid=await team("ETERNYX STAGING READ ACCEPTANCE","WORKSPACE_STAGING_SPACE_ID");
    const task=uuid(await rpc(editor,"workspace_team_save_task",{p_space_id:sid,p_task_id:null,p_title:"Synthetic staging task",p_details:"Non-sensitive acceptance fixture",p_status:"todo",p_priority:"normal",p_due_on:null,p_assignee_id:null,p_expected_updated_at:null}),"invalid-team-task");
    record({WORKSPACE_STAGING_TEAM_TASK_ID:task});
    await rpc(editor,"workspace_team_post_comment",{p_space_id:sid,p_task_id:task,p_body:"Synthetic test comment"});
    await rpc(owner,"workspace_team_add_step",{p_space_id:sid,p_task_id:task,p_title:"Synthetic checklist"});
    await team(WRITE_PROBE_SPACE_NAME,"WORKSPACE_STAGING_WRITE_SPACE_ID");
    await team(REVOCATION_TEAM_NAME,"WORKSPACE_STAGING_REVOKE_SPACE_ID");
    const project=await row(owner,"workspace_projects",{owner_id:ids[0],name:"ETERNYX STAGING PRIVATE FIXTURE",description:"Non-sensitive synthetic fixture"});
    record({WORKSPACE_STAGING_PRIVATE_PROJECT_ID:project});
    const privateTask=await row(owner,"workspace_tasks",{owner_id:ids[0],project_id:project,title:"Private fixture task"});
    record({WORKSPACE_STAGING_PRIVATE_TASK_ID:privateTask});
    const note=await row(owner,"workspace_items",{owner_id:ids[0],project_id:project,kind:"note",title:"Private fixture note",note_text:"Non-sensitive synthetic text"});
    record({WORKSPACE_STAGING_PRIVATE_ITEM_ID:note});
    const bytes=Buffer.from("Eternyx disposable staging file "+nonce+"\n","utf8");
    const fileKey=ids[0]+"/"+project+"/"+randomUUID()+"-fixture.txt";
    // Journal the exact object key before attempting upload, for manual recovery if interrupted.
    record({WORKSPACE_FIXTURE_FILE_KEY:fileKey});
    const upload=take(await owner.storage.from(STORAGE_BUCKET).upload(fileKey,bytes,{contentType:"text/plain",upsert:false}),"private-upload-failed");
    gate(upload.path===fileKey,"private-upload-path-mismatch");
    const file=await row(owner,"workspace_items",{owner_id:ids[0],project_id:project,kind:"file",title:"Private fixture file",storage_path:fileKey,file_size:bytes.length,mime_type:"text/plain"});
    record({
      WORKSPACE_STAGING_STORAGE_FILE_ITEM_ID:file,
      WORKSPACE_STAGING_STORAGE_SHA256:createHash("sha256").update(bytes).digest("hex"),
      WORKSPACE_STAGING_STORAGE_CONFIRM:STORAGE_APPROVAL,
      WORKSPACE_STAGING_WRITE_CONFIRM:WRITE_PROBE_APPROVAL,
      WORKSPACE_STAGING_WRITE_AUDIT_CONFIRM:WRITE_AUDIT_APPROVAL,
      WORKSPACE_STAGING_REVOKE_CONFIRM:REVOCATION_CONFIRM,
      WORKSPACE_STAGING_REVOKE_HISTORY_CONFIRM:REVOCATION_HISTORY_CONFIRM,
      WORKSPACE_STAGING_REALTIME_CONFIRM:"READ_ONLY_REALTIME_WINDOW",
    });
    validateWorkspaceStagingConfig(env);
    record({WORKSPACE_FIXTURE_COMPLETE:"true"});
    return {accounts:4,teams:3,private_files:1,real_auth_sessions_verified:true,
      full_acceptance_verified:false,production_modified:false,release_gate:"manual_review_required"};
  }finally{journal.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const cfg=validateFixtureProvisionConfig(process.env);
    if(process.argv[2]==="--config-check")process.stdout.write("Staging fixture configuration valid; no network calls.\n");
    else if(process.argv[2]==="--run")process.stdout.write(JSON.stringify(await provisionWorkspaceFixtures(cfg),null,2)+"\n");
    else throw Error("Workspace fixture blocked: invalid-command");
  }catch{
    // Never emit raw errors, credentials, identities, signed URLs or invitation tokens.
    process.stderr.write("Workspace fixture provisioning blocked or incomplete. Inspect the protected local receipt before retrying; no automatic deletion.\n");
    process.exitCode=1;
  }
}
