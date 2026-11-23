import test from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_APPROVAL,STORAGE_BUCKET,validateStorageConfig,
  validateFileFixture,explicitlyDenied,safePrivateStorageReport,
} from "../src/lib/workspaceStorageAcceptance.mjs";
import {validatePrivateStorageConfig} from "../scripts/workspace-team-staging-storage.mjs";
const id=n=>String(n).repeat(8)+"-1111-4111-8111-"+String(n).repeat(12);
function env(){
  const e={
    WORKSPACE_STAGING_URL:"https://aaaaaaaaaaaaaaaaaaaa.supabase.co/",
    WORKSPACE_STAGING_PROJECT_REF:"aaaaaaaaaaaaaaaaaaaa",
    WORKSPACE_STAGING_PUBLISHABLE_KEY:"sb_publishable_fixture",
    WORKSPACE_STAGING_CONFIRM:"READ_ONLY_FOUR_ACCOUNT_ACCEPTANCE",
    WORKSPACE_STAGING_SPACE_ID:id(1),
    WORKSPACE_STAGING_TEAM_TASK_ID:id(2),
    WORKSPACE_STAGING_PRIVATE_PROJECT_ID:id(3),
    WORKSPACE_STAGING_PRIVATE_TASK_ID:id(4),
    WORKSPACE_STAGING_PRIVATE_ITEM_ID:id(5),
    WORKSPACE_STAGING_STORAGE_FILE_ITEM_ID:id(6),
    WORKSPACE_STAGING_STORAGE_SHA256:"aa".repeat(32),
    WORKSPACE_STAGING_STORAGE_CONFIRM:STORAGE_APPROVAL,
  };
  for(const r of ["OWNER","EDITOR","VIEWER","OUTSIDER"]){
    e["WORKSPACE_STAGING_"+r+"_EMAIL"]=r+"@example.invalid";
    e["WORKSPACE_STAGING_"+r+"_PASSWORD"]="staging-credentials-only";
  }
  return e;
}
test("approved private Storage fixture must be on distinct nonproduction project",()=>{
  assert.equal(validatePrivateStorageConfig(env()).storageItemId,id(6));
  let e=env();e.WORKSPACE_STAGING_STORAGE_SHA256="bad";
  assert.throws(()=>validatePrivateStorageConfig(e),/trusted-fixture-sha256/);
  e=env();e.WORKSPACE_STAGING_STORAGE_CONFIRM="yes";
  assert.throws(()=>validatePrivateStorageConfig(e),/explicit-fixture-read-approval/);
  e=env();e.WORKSPACE_STAGING_PROJECT_REF="wcncuarekaofmfurbtbh";
  e.WORKSPACE_STAGING_URL="https://wcncuarekaofmfurbtbh.supabase.co/";
  assert.throws(()=>validatePrivateStorageConfig(e),/nonproduction/);
});
test("file record requires strict owner, project, MIME, size and scoped key",()=>{
  const owner=id(7),proj=id(8),file=id(9),item=id(6);
  const row={id:item,kind:"file",owner_id:owner,project_id:proj,
    storage_path:owner+"/"+proj+"/"+file+"-fixture.txt",
    mime_type:"text/plain",file_size:10};
  assert.deepEqual(validateFileFixture(row,item,owner),{path:row.storage_path,size:10});
  assert.throws(()=>validateFileFixture({...row,storage_path:"bad/name"},item,owner),/unsafe-object/);
  assert.throws(()=>validateFileFixture({...row,kind:"note"},item,owner),/invalid-file/);
  assert.throws(()=>validateFileFixture({...row,file_size:0},item,owner),/invalid-file/);
});
test("storage API errors count as denials only when status explicitly proves them",()=>{
  assert.equal(explicitlyDenied({error:{statusCode:"404"},data:null}),true);
  assert.equal(explicitlyDenied({error:{status:403}}),true);
  assert.equal(explicitlyDenied({error:{status:500}}),false);
  assert.equal(explicitlyDenied({error:new Error("network")}),false);
  assert.equal(explicitlyDenied({data:{signedUrl:"secret"},error:null}),false);
  assert.equal(STORAGE_BUCKET,"workspace-private");
});
test("report never certifies production, migrations or live realtime",()=>{
  const checks=["four_distinct_verified_accounts",
    "verified_private_file_and_owner_project",
    "private_metadata_hidden_from_other_accounts",
    "owner_bytes_match_size_and_trusted_hash",
    "other_accounts_cannot_download_or_sign",
    "anonymous_public_url_is_not_accessible"];
  const r=safePrivateStorageReport(checks);
  assert.equal(r.production_certified,false);
  assert.equal(r.application_data_modified,false);
  assert.equal(r.verified_exact_sha256,true);
  assert.equal(r.migration_history_verified,false);
  assert.throws(()=>safePrivateStorageReport(["bad"]),/unsafe-evidence/);
});
