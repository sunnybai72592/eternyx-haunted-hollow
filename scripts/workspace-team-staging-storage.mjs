#!/usr/bin/env node
// Phase 24: operator-run real private Storage read checks, staging ONLY.
// No uploads, file deletions, data updates, migrations or token logging.
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {createStagingClient,validateWorkspaceStagingConfig}
  from "./workspace-team-staging-acceptance.mjs";
import {
  STORAGE_BUCKET,validateStorageConfig,validateFileFixture,
  explicitlyDenied,safePrivateStorageReport
} from "../src/lib/workspaceStorageAcceptance.mjs";
function guard(ok,name){
  if(!ok)throw Error("Workspace storage blocked: "+name);
}
export function validatePrivateStorageConfig(env){
  return validateStorageConfig(env,validateWorkspaceStagingConfig(env));
}
async function auth(client,person){
  const s=await client.auth.signInWithPassword({email:person.email,password:person.password});
  guard(!s.error&&!!s.data?.user?.id,"real-staging-auth-required");
  const verified=await client.auth.getUser();
  guard(!verified.error&&verified.data?.user?.id===s.data.user.id,"auth-identity-drift");
  return s.data.user.id;
}
async function ownerRow(client,table,id,fields){
  const r=await client.from(table).select(fields).eq("id",id).limit(2);
  guard(!r.error&&r.data?.length===1,"owner-fixture-unavailable");
  return r.data[0];
}
async function unrelated(client,table,id){
  const r=await client.from(table).select("id").eq("id",id).limit(1);
  guard(!r.error&&Array.isArray(r.data)&&r.data.length===0,
    "unrelated-account-can-read-private-metadata");
}
async function deniedStorage(client,key){
  const storage=client.storage.from(STORAGE_BUCKET);
  const file=await storage.download(key);
  guard(explicitlyDenied(file),"unauthorized-private-bytes-not-denied");
  const signed=await storage.createSignedUrl(key,60);
  guard(explicitlyDenied(signed),"unauthorized-signed-url-not-denied");
}
async function publicEndpointBlocked(owner,key,fetcher){
  const publicUrl=owner.storage.from(STORAGE_BUCKET).getPublicUrl(key).data?.publicUrl;
  guard(typeof publicUrl==="string"&&
    new URL(publicUrl).pathname.startsWith("/storage/v1/object/public/workspace-private/"),
    "invalid-public-file-url");
  let response;
  try{
    response=await fetcher(publicUrl,{method:"GET",redirect:"manual",
      signal:AbortSignal.timeout(12000)});
  }catch{throw Error("Workspace storage blocked: unauthenticated-public-endpoint-unreachable");}
  guard([400,401,403,404].includes(response.status),"private-file-publicly-accessible");
  try{await response.body?.cancel();}catch{}
}
export async function runPrivateStorageReadOnly(config,clientFactory=createStagingClient,fetcher=fetch){
  const clients=config.people.map(()=>clientFactory(config.url,config.key));
  const anon=clientFactory(config.url,config.key);
  const ids=[];
  for(let i=0;i<4;i++)ids.push(await auth(clients[i],config.people[i]));
  guard(new Set(ids).size===4,"identities-not-distinct");
  const checks=["four_distinct_verified_accounts"];
  const owner=clients[0];
  const row=await ownerRow(owner,"workspace_items",config.storageItemId,
    "id,kind,owner_id,project_id,storage_path,file_size,mime_type");
  const {path:key,size}=validateFileFixture(row,config.storageItemId,ids[0]);
  const project=await ownerRow(owner,"workspace_projects",row.project_id,"id,owner_id");
  guard(project.owner_id===ids[0],"file-project-owner-mismatch");
  checks.push("verified_private_file_and_owner_project");
  for(const client of [...clients.slice(1),anon]){
    await unrelated(client,"workspace_items",row.id);
    await unrelated(client,"workspace_projects",row.project_id);
  }
  checks.push("private_metadata_hidden_from_other_accounts");
  const download=await owner.storage.from(STORAGE_BUCKET).download(key);
  guard(!download.error&&download.data?.size===size&&
    typeof download.data.arrayBuffer==="function","owner-file-download-or-size-failed");
  const bytes=Buffer.from(await download.data.arrayBuffer());
  guard(bytes.length===size,"owner-download-truncated");
  guard(createHash("sha256").update(bytes).digest("hex")===config.expectedDigest,
    "trusted-file-hash-mismatch");
  checks.push("owner_bytes_match_size_and_trusted_hash");
  for(const client of [...clients.slice(1),anon])await deniedStorage(client,key);
  checks.push("other_accounts_cannot_download_or_sign");
  await publicEndpointBlocked(owner,key,fetcher);
  checks.push("anonymous_public_url_is_not_accessible");
  return safePrivateStorageReport(checks);
}
const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  const arg=process.argv[2];
  if(arg==="--help")process.stdout.write(
    "Read-only staging Storage check requires Phase21 WORKSPACE_STAGING_* keys and:\n"+
    "WORKSPACE_STAGING_STORAGE_FILE_ITEM_ID=<existing file item UUID>\n"+
    "WORKSPACE_STAGING_STORAGE_SHA256=<trusted 64-digit SHA256 hex>\n"+
    "WORKSPACE_STAGING_STORAGE_CONFIRM=PRIVATE_FIXTURE_BYTES_READ_ONLY_STAGING\n");
  else if(arg==="--config-check"||arg==="--run"){
    try{
      const cfg=validatePrivateStorageConfig(process.env);
      if(arg==="--config-check")process.stdout.write(
        "Staging private file config accepted; no network or Storage reads.\n");
      else process.stdout.write(JSON.stringify(await runPrivateStorageReadOnly(cfg),null,2)+"\n");
    }catch(e){
      // Stable error codes only. Never log SDK error data, private keys or bytes.
      const msg=e instanceof Error&&e.message.startsWith("Workspace storage blocked: ")?
        e.message:"Workspace storage blocked: unexpected-private-object-check-failure";
      process.stderr.write(msg+"\n");process.exitCode=1;
    }
  }else{
    process.stderr.write("Use --help, --config-check or --run.\n");
    process.exitCode=2;
  }
}
