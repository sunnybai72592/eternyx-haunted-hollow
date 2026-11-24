import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {AUTH_APPROVAL,validateAuthInputs,runFreshLabsAcceptance} from "../scripts/labs-staging-fresh-auth.mjs";
import {LABS_STAGING_REF} from "../src/lib/eternyxLabsStagingReadiness.mjs";
import {ETERNYX_PRODUCTION_REF} from "../scripts/automation-staging-db-readonly.mjs";
import {MIGRATIONS} from "../scripts/labs-bootstrap-manifest.mjs";
const env=()=>({ETERNYX_LABS_AUTH_CONSENT:AUTH_APPROVAL,ETERNYX_LABS_STAGING_REF:LABS_STAGING_REF,
  ETERNYX_LABS_PRODUCTION_REF:ETERNYX_PRODUCTION_REF,ETERNYX_LABS_STAGING_PUBLIC_KEY:"sb_publishable_offline_example_only_12345678",
  ETERNYX_LABS_TEST_EMAIL_A:"test-a@example.invalid",ETERNYX_LABS_TEST_EMAIL_B:"test-b@example.invalid",
  ETERNYX_LABS_TEST_PASSWORD_A:"offline-example-password-a",ETERNYX_LABS_TEST_PASSWORD_B:"offline-example-password-b"});
const origin="https://"+LABS_STAGING_REF+".supabase.co";
const a="123e4567-e89b-42d3-a456-426614174001",b="223e4567-e89b-42d3-a456-426614174001";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
function token(id,overrides={}){return ["a".repeat(24),Buffer.from(JSON.stringify({iss:origin+"/auth/v1",sub:id,role:"authenticated",exp:2000,...overrides})).toString("base64url"),"b".repeat(44)].join(".");}
test("refuses wrong project, missing consent, private key and reused credentials before network",async()=>{
  for(const change of [
    x=>delete x.ETERNYX_LABS_AUTH_CONSENT,
    x=>x.ETERNYX_LABS_STAGING_REF=ETERNYX_PRODUCTION_REF,
    x=>x.ETERNYX_LABS_STAGING_PUBLIC_KEY="sb_secret_example_only_12345678",
    x=>x.ETERNYX_LABS_TEST_EMAIL_B=x.ETERNYX_LABS_TEST_EMAIL_A,
    x=>x.ETERNYX_LABS_TEST_PASSWORD_B=x.ETERNYX_LABS_TEST_PASSWORD_A,
  ]){const e=env();change(e);let calls=0;await assert.rejects(runFreshLabsAcceptance(e,async()=>{calls++;}));assert.equal(calls,0);}
});
test("fresh sign-in uses exact staging route and refuses expired, wrong-project or privileged tokens",async()=>{
  for(const override of [{exp:1001},{iss:"https://example.invalid/auth/v1"},{role:"service_role"},{sub:b}]){
    let calls=0;
    await assert.rejects(runFreshLabsAcceptance(env(),async(url,opts)=>{
      calls++;assert.equal(url,origin+"/auth/v1/token?grant_type=password");assert.equal(opts.redirect,"error");
      return json({user:{id:a,is_anonymous:false,email:env().ETERNYX_LABS_TEST_EMAIL_A},access_token:token(a,override)});
    },()=>1000),/labs_auth_invalid_token_scope/);assert.equal(calls,1);
  }
});
test("two fresh sessions reach existing server-verified identity acceptance, no extra writes",async()=>{
  const calls=[];
  await assert.rejects(runFreshLabsAcceptance(env(),async(url,opts)=>{
    calls.push({url,method:opts.method});
    if(url.endsWith("grant_type=password")){
      const account=JSON.parse(opts.body),id=account.email===env().ETERNYX_LABS_TEST_EMAIL_A?a:b;
      return json({user:{id,is_anonymous:false,email:account.email},access_token:token(id)});
    }
    if(url.endsWith("/auth/v1/user"))return json({id:a,is_anonymous:false});
    throw Error("unexpected request");
  },()=>1000),/labs_staging_same_account_supplied/);
  assert.equal(calls.length,4);assert.equal(calls.filter(x=>x.method==="POST").length,2);
});
test("deployment record maps six exact source blobs to observed generated history versions",async()=>{
  const record=JSON.parse(await readFile(new URL("../docs/examples/labs-staging-deployment-observation.json",import.meta.url),"utf8"));
  assert.equal(record.projectRef,LABS_STAGING_REF);
  assert.deepEqual(record.migrations.map(x=>x.source),MIGRATIONS);
  assert.equal(new Set(record.migrations.map(x=>x.version)).size,6);
  for(const m of record.migrations){
    const data=await readFile(new URL("../supabase/migrations/"+m.source,import.meta.url));
    assert.equal(createHash("sha1").update("blob "+data.length+"\0").update(data).digest("hex"),m.gitBlobSha1);
    assert.equal(m.name,"labs_"+m.source.slice(0,-4));
  }
  assert.equal(record.authenticatedAcceptanceVerified,false);
  assert.equal(record.productionReady,false);
});
