import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {FIXTURE_REF,FIXTURE_APPROVAL,validateFixtureProvisionConfig} from "../scripts/workspace-staging-provision-fixtures.mjs";
const env={WORKSPACE_FIXTURE_CONFIRM:FIXTURE_APPROVAL,WORKSPACE_FIXTURE_PROJECT_REF:FIXTURE_REF,
 WORKSPACE_FIXTURE_ADMIN_KEY:"sb_secret_fixture_only",WORKSPACE_FIXTURE_PUBLISHABLE_KEY:"sb_publishable_fixture_only",
 WORKSPACE_FIXTURE_OUTPUT:"/tmp/workspace-fixture.env"};
test("provisioning requires exact staging target, separate keys, approval and absolute output",()=>{
 assert.equal(validateFixtureProvisionConfig(env).url,"https://"+FIXTURE_REF+".supabase.co");
 for(const patch of [{WORKSPACE_FIXTURE_PROJECT_REF:"wcncuarekaofmfurbtbh"},{WORKSPACE_FIXTURE_CONFIRM:"yes"},
  {WORKSPACE_FIXTURE_ADMIN_KEY:"sb_publishable_fixture_only"},{WORKSPACE_FIXTURE_PUBLISHABLE_KEY:"sb_secret_fixture_only"},
  {WORKSPACE_FIXTURE_OUTPUT:".env"},{WORKSPACE_FIXTURE_ADMIN_KEY:""}])
  assert.throws(()=>validateFixtureProvisionConfig({...env,...patch}));
});
test("fixture runner uses Auth Admin only for account creation and all application writes through verified user clients",()=>{
 const src=readFileSync(new URL("../scripts/workspace-staging-provision-fixtures.mjs",import.meta.url),"utf8");
 for(const marker of ['openSync(resolved,"wx",0o600)','output-must-be-outside-repository',
  'admin.auth.admin.createUser','email_confirm:true','clients[i].auth.signInWithPassword','clients[i].auth.getUser',
  'owner.storage.from(STORAGE_BUCKET).upload','upsert:false','WORKSPACE_FIXTURE_COMPLETE:"true"'])
  assert.ok(src.includes(marker),marker);
 assert.ok(!src.includes("admin.from(")&&!src.includes("admin.storage.")&&!src.includes("admin.rpc("));
});
