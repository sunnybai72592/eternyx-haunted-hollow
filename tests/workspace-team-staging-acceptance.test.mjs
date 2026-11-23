import test from "node:test";
import assert from "node:assert/strict";
import {STAGING_KEYS,validateWorkspaceStagingConfig,sanitizedWorkspaceStagingReport}
  from "../scripts/workspace-team-staging-acceptance.mjs";
const ref="aaaaaaaaaaaaaaaaaaaa";
const ids=[1,2,3,4,5].map(n=>String(n).repeat(8)+"-1111-4111-8111-"+String(n).repeat(12));
function fixture(){
  const env={
    WORKSPACE_STAGING_URL:"https://"+ref+".supabase.co/",
    WORKSPACE_STAGING_PROJECT_REF:ref,
    WORKSPACE_STAGING_PUBLISHABLE_KEY:"sb_publishable_fixture",
    WORKSPACE_STAGING_CONFIRM:"READ_ONLY_FOUR_ACCOUNT_ACCEPTANCE",
    WORKSPACE_STAGING_SPACE_ID:ids[0],
    WORKSPACE_STAGING_TEAM_TASK_ID:ids[1],
    WORKSPACE_STAGING_PRIVATE_PROJECT_ID:ids[2],
    WORKSPACE_STAGING_PRIVATE_TASK_ID:ids[3],
    WORKSPACE_STAGING_PRIVATE_ITEM_ID:ids[4],
  };
  ["OWNER","EDITOR","VIEWER","OUTSIDER"].forEach((r,i)=>{
    env["WORKSPACE_STAGING_"+r+"_EMAIL"]="actor"+i+"@example.invalid";
    env["WORKSPACE_STAGING_"+r+"_PASSWORD"]="staging_fake_password";
  });
  return env;
}
test("17 required keys and distinct real-account fixture config",()=>{
  assert.equal(STAGING_KEYS.length,17);
  const actual=validateWorkspaceStagingConfig(fixture());
  assert.equal(actual.people.length,4);
  assert.equal(actual.ids.PRIVATE_PROJECT_ID,ids[2]);
});
test("unsafe key, URL, production ref, missing confirm and duplicate identities rejected",()=>{
  let e=fixture();e.WORKSPACE_STAGING_PUBLISHABLE_KEY="sb_secret_faked";
  assert.throws(()=>validateWorkspaceStagingConfig(e),/privileged-key/);
  e=fixture();e.WORKSPACE_STAGING_URL="https://host.invalid/";
  assert.throws(()=>validateWorkspaceStagingConfig(e),/staging-url/);
  e=fixture();e.WORKSPACE_STAGING_PROJECT_REF="wcncuarekaofmfurbtbh";
  e.WORKSPACE_STAGING_URL="https://wcncuarekaofmfurbtbh.supabase.co/";
  assert.throws(()=>validateWorkspaceStagingConfig(e),/nonproduction/);
  e=fixture();e.WORKSPACE_STAGING_CONFIRM="OK";
  assert.throws(()=>validateWorkspaceStagingConfig(e),/operator-confirmation/);
  e=fixture();e.WORKSPACE_STAGING_VIEWER_EMAIL=e.WORKSPACE_STAGING_OWNER_EMAIL;
  assert.throws(()=>validateWorkspaceStagingConfig(e),/four-distinct/);
  e=fixture();e.WORKSPACE_STAGING_TEAM_TASK_ID=e.WORKSPACE_STAGING_SPACE_ID;
  assert.throws(()=>validateWorkspaceStagingConfig(e),/duplicate-fixture/);
  e=fixture();delete e.WORKSPACE_STAGING_OWNER_PASSWORD;
  assert.throws(()=>validateWorkspaceStagingConfig(e),/OWNER_PASSWORD/);
});
test("read-only report never claims production, realtime, migration or write verification",()=>{
  const r=sanitizedWorkspaceStagingReport(["verified_four_auth_sessions"]);
  assert.equal(r.production_certified,false);
  assert.equal(r.release_gate,"manual_review_required");
  assert.equal(r.realtime_delivery_verified,false);
  assert.equal(r.mutating_role_guards_verified,false);
  assert.equal(r.summary.passed,1);
  assert.equal(JSON.stringify(r).includes("staging_fake_password"),false);
  assert.throws(()=>sanitizedWorkspaceStagingReport(["secret 1"]),/invalid-report/);
});
