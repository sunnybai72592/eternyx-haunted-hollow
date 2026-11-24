import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  LABS_STAGING_SCHEMA,LABS_STAGING_APPROVAL,LABS_STAGING_REQUIRED_CHECKS,
  PUBLIC_RANGE_COLUMNS,PRIVATE_RANGE_COLUMNS,LABS_STAGING_REF,isLabsPublicKey,
  validateLabsStagingConfig,runLabsStagingReadOnly,
} from "../src/lib/eternyxLabsStagingReadiness.mjs";
import {ETERNYX_PRODUCTION_REF} from "../scripts/automation-staging-db-readonly.mjs";
import {VERIFIED_CTF_MISSIONS,tallyVerifiedCtfSolves} from "../src/lib/eternyxVerifiedCtf.mjs";

const stage=LABS_STAGING_REF,ownerA="123e4567-e89b-42d3-a456-426614174001";
const ownerB="223e4567-e89b-42d3-a456-426614174001";
const tokenA=["a".repeat(24),"b".repeat(60),"c".repeat(44)].join(".");
const tokenB=["d".repeat(24),"e".repeat(60),"f".repeat(44)].join(".");
const env=()=>({
  ETERNYX_LABS_STAGING_CONSENT:LABS_STAGING_APPROVAL,
  ETERNYX_LABS_STAGING_REF:stage,
  ETERNYX_LABS_PRODUCTION_REF:ETERNYX_PRODUCTION_REF,
  ETERNYX_LABS_STAGING_PUBLIC_KEY:"sb_publishable_offline_example_only_12345678",
  ETERNYX_LABS_STAGING_JWT_A:tokenA,ETERNYX_LABS_STAGING_JWT_B:tokenB,
});
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,
  headers:{"content-type":"application/json","cache-control":"no-store",...extra}});
const provider=()=>({providerOnline:false,hostedAccessAvailable:false,
  maxConcurrentSessions:0,sessionDurationMinutes:15,dailyLaunchBudgetConfigured:false,
  message:"Staging provider not approved."});
const progress=(ids=[])=>({verifiedByServer:true,
  solves:ids.map(mission_id=>({mission_id,solved_at:"2026-11-22T18:00:00+00:00"})),
  summary:tallyVerifiedCtfSolves(ids)});
const fixtureA="33333333-3333-4333-8333-333333333333",fixtureB="44444444-4444-4444-8444-444444444444";
const row=id=>({id,challenge_pack:"http-basics-v1",status:"stopped",
  requested_at:"2026-11-22T18:00:00Z",updated_at:"2026-11-22T18:01:00Z",
  expires_at:"2026-11-22T18:15:00Z",started_at:null,finished_at:"2026-11-22T18:01:00Z"});
function mock({solvesA=[],solvesB=[],fixtures=false,override=()=>undefined}={}){
  const calls=[];
  const fetcher=async(url,opts)=>{
    const target=new URL(url),path=target.pathname;
    assert.equal(new URL(url).origin,"https://"+stage+".supabase.co");
    assert.equal(opts.redirect,"error");
    assert.equal(opts.cache,"no-store");
    assert.equal(opts.credentials,"omit");
    const auth=opts.headers.Authorization;
    const who=auth==="Bearer "+tokenA?"a":auth==="Bearer "+tokenB?"b":null;
    const action=opts.body?JSON.parse(opts.body).action:null;
    calls.push({path,method:opts.method,action,who,query:target.searchParams});
    let res;
    if(path==="/auth/v1/user")res=json({id:who==="a"?ownerA:ownerB,is_anonymous:false});
    else if(path==="/rest/v1/ctf_verified_solves"){
      const ownId=who==="a"?ownerA:ownerB,solves=who==="a"?solvesA:solvesB;
      const mission=target.searchParams.get("mission_id")?.slice(3);
      res=json(target.searchParams.get("user_id")==="eq."+ownId&&solves.includes(mission)?progress([mission]).solves:[]);
    }
    else if(path==="/rest/v1/ctf_range_sessions"){
      const projection=target.searchParams.get("select"),id=target.searchParams.get("id");
      const blocked=!who||projection==="*"||PRIVATE_RANGE_COLUMNS.includes(projection)||
        PRIVATE_RANGE_COLUMNS.some(col=>target.searchParams.has(col));
      if(blocked)res=json({code:"42501",message:"permission denied"},who?403:401);
      else {
        const own=who==="a"?fixtureA:fixtureB;
        res=json(fixtures&&(!id||id==="eq."+own)?[row(own)]:[]);
      }
    }
    else if(!who)res=json({error:"unauthorized"},401);
    else if(path==="/functions/v1/ctf-verified"){
      if(action==="catalog")res=json({missions:VERIFIED_CTF_MISSIONS,verifiedByServer:true});
      else if(action==="progress")res=json(progress(who==="a"?solvesA:solvesB));
    }else if(path==="/functions/v1/ctf-range-control"){
      if(action==="status")res=json(provider());
      else if(action==="sessions")res=json({source:"authenticated_server",
        hostedAccessAvailable:false,sessions:fixtures?[row(who==="a"?fixtureA:fixtureB)]:[]});
    }
    if(!res)throw Error("Unexpected endpoint/action");
    return override({path,action,who,res,query:target.searchParams})??res;
  };
  return {fetcher,calls};
}
const run=(fetcher)=>runLabsStagingReadOnly(validateLabsStagingConfig(env()),fetcher);

test("no live requests permitted without explicit staging approval and two distinct JWTs",()=>{
  assert.equal(validateLabsStagingConfig(env()).origin,"https://"+stage+".supabase.co");
  for(const alter of [
    x=>delete x.ETERNYX_LABS_STAGING_CONSENT,
    x=>x.ETERNYX_LABS_STAGING_CONSENT="yes",
    x=>x.ETERNYX_LABS_STAGING_REF=ETERNYX_PRODUCTION_REF,
    x=>x.ETERNYX_LABS_PRODUCTION_REF=stage,
    x=>x.ETERNYX_LABS_STAGING_JWT_B=tokenA,
    x=>x.ETERNYX_LABS_STAGING_JWT_A="not-a-jwt",
    x=>x.ETERNYX_LABS_STAGING_PUBLIC_KEY="invalid",
  ]){
    const bad=env();alter(bad);assert.throws(()=>validateLabsStagingConfig(bad));
  }
});

test("real-shaped two-owner CTF and range reads yield complete sanitized report",async()=>{
  const {fetcher,calls}=mock();
  const result=await run(fetcher);
  assert.equal(result.schema,LABS_STAGING_SCHEMA);
  assert.deepEqual(result.checks.map(x=>x.id),LABS_STAGING_REQUIRED_CHECKS);
  assert.equal(result.checks.length,17);
  assert.equal(calls.length,33);
  assert.equal(result.rangeRestPrivatePermissionDenials,18);
  assert.equal(result.rangeRestIsolation,"not_tested_no_two_owned_session_fixtures");
  assert.equal(result.rangeRestCrossOwnerChecks,0);
  assert.equal(result.disabledProviderConfirmed,true);
  assert.equal(calls.filter(x=>x.method==="POST").length,10);
  assert.ok(calls.every(x=>x.action===null||["catalog","progress","status","sessions"].includes(x.action)));
  assert.equal(result.crossOwnerStatus,"not_tested_no_owned_solve_fixture");
  assert.equal(result.cloudProviderDeployedVerified,false);
  assert.equal(result.productionReady,false);
  assert.equal(result.releaseAuthorized,false);
  assert.equal(result.flagsSubmitted,0);
  assert.equal(result.sessionReservationsMade,0);
  const report=JSON.stringify(result);
  for(const secret of [tokenA,tokenB,ownerA,ownerB,env().ETERNYX_LABS_STAGING_PUBLIC_KEY])
    assert.equal(report.includes(secret),false);
});

test("existing real solved fixtures permit two cross-account PostgREST denials",async()=>{
  const {fetcher,calls}=mock({solvesA:["encoded-access-log"],solvesB:["header-evidence"]});
  const result=await run(fetcher);
  assert.equal(result.crossOwnerChecks,2);
  assert.equal(result.crossOwnerStatus,"two_cross_owner_rows_denied");
  assert.equal(calls.filter(x=>x.path==="/rest/v1/ctf_verified_solves").length,4);
  assert.equal(result.ownedSolveRestChecks,2);
});

test("foreign solve record disclosure fails instead of fabricating verified isolation",async()=>{
  const {fetcher}=mock({solvesA:["encoded-access-log"],solvesB:["header-evidence"],
    override:({path,who,query})=>path==="/rest/v1/ctf_verified_solves"&&query.get("user_id")!=="eq."+(who==="a"?ownerA:ownerB)?
      json([{mission_id:"encoded-access-log"}]):undefined});
  await assert.rejects(run(fetcher),/labs_staging_cross_owner_row_disclosed/);
});

test("different tokens resolving to same account do not count as two test identities",async()=>{
  const {fetcher}=mock({override:({path})=>path==="/auth/v1/user"?
    json({id:ownerA,is_anonymous:false}):undefined});
  await assert.rejects(run(fetcher),/labs_staging_same_account_supplied/);
});

test("catalog, verified score, hosted status and session results reject fake successes",async()=>{
  const alterations=[
    ({path,action})=>path.endsWith("/ctf-verified")&&action==="catalog"?
      json({verifiedByServer:true,missions:[VERIFIED_CTF_MISSIONS[0]]}):undefined,
    ({path,action})=>path.endsWith("/ctf-verified")&&action==="progress"?
      json({...progress(),summary:{...tallyVerifiedCtfSolves([]),points:999}}):undefined,
    ({path,action})=>path.endsWith("/ctf-range-control")&&action==="status"?
      json({...provider(),hostedAccessAvailable:true}):undefined,
    ({path,action})=>path.endsWith("/ctf-range-control")&&action==="sessions"?
      json({source:"browser_only",hostedAccessAvailable:false,sessions:[]}):undefined,
  ];
  for(const override of alterations)await assert.rejects(run(mock({override}).fetcher));
});

test("unavailable, oversized, mislabelled, cacheable and unauthenticated success all fail",async()=>{
  const alterations=[
    ({path})=>path.endsWith("/ctf-verified")?json({error:"missing"},503):undefined,
    ({path})=>path.endsWith("/ctf-verified")?
      new Response("{}",{status:200,headers:{"content-type":"text/plain","cache-control":"no-store"}}):undefined,
    ({path})=>path.endsWith("/ctf-verified")?
      new Response("x".repeat(33000),{status:200,headers:{"content-type":"application/json","cache-control":"no-store"}}):undefined,
    ({path})=>path.endsWith("/ctf-verified")?
      json({verifiedByServer:true,missions:VERIFIED_CTF_MISSIONS},200,{"cache-control":"public"}):undefined,
    ({path,who})=>path.endsWith("/ctf-verified")&&!who?
      json({verifiedByServer:true},200):undefined,
  ];
  for(const override of alterations)await assert.rejects(run(mock({override}).fetcher));
});

test("real staging workflow requires manual action and contains no mutation or production deploy",async()=>{
  const [source,runner,yml]=await Promise.all([
    readFile(new URL("../src/lib/eternyxLabsStagingReadiness.mjs",import.meta.url),"utf8"),
    readFile(new URL("../scripts/labs-staging-readonly.mjs",import.meta.url),"utf8"),
    readFile(new URL("../.github/workflows/labs-staging-readonly.yml",import.meta.url),"utf8"),
  ]);
  assert.match(yml,/workflow_dispatch:/);
  assert.match(yml,/environment: eternyx-staging/);
  assert.doesNotMatch(yml,/\bpush:|\bpull_request:/);
  assert.match(runner,/--check-config/);
  assert.doesNotMatch(source,/service_role|createClient|upsert\(|delete\(|createServer|localStorage/);
  assert.doesNotMatch(yml,/supabase deploy|supabase db push|--force/);
});

test("two existing Edge-correlated session fixtures prove positive REST projection and cross-owner denials",async()=>{
  const {fetcher,calls}=mock({fixtures:true});
  const result=await run(fetcher);
  assert.equal(result.rangeRestIsolation,"two_edge_correlated_owned_fixtures_cross_denied");
  assert.equal(result.rangeRestCrossOwnerChecks,2);
  assert.equal(calls.filter(x=>x.path==="/rest/v1/ctf_range_sessions").length,23);
  assert.ok(calls.filter(x=>x.path==="/rest/v1/ctf_range_sessions").every(x=>x.method==="GET"));
  assert.equal(JSON.stringify(result).includes(fixtureA),false);
});
test("private columns, private filters and wildcard must receive real permission denial",async()=>{
  for(const select of [...PRIVATE_RANGE_COLUMNS,"*","id"]){
    const {fetcher}=mock({override:({path,query,who})=>path==="/rest/v1/ctf_range_sessions"&&who==="a"&&query.get("select")===select?json([]):undefined});
    await assert.rejects(run(fetcher),/labs_staging_range_rest_permission_not_denied/);
  }
});
test("generic HTTP 403, missing table, and fake permission responses cannot prove column isolation",async()=>{
  for(const response of [()=>json({code:"PGRST301"},403),()=>json({code:"42P01"},404),()=>json({code:"42501"},200)]){
    const {fetcher}=mock({override:({path,who,query})=>path==="/rest/v1/ctf_range_sessions"&&who==="a"&&query.get("select")==="*"?response():undefined});
    await assert.rejects(run(fetcher),/labs_staging_range_rest_(wrong_denial_reason|permission_not_denied)/);
  }
});
test("own fixtures must exist and cross-owner session row leakage refuses acceptance",async()=>{
  const missing=mock({fixtures:true,override:({path,query,who})=>path==="/rest/v1/ctf_range_sessions"&&who==="a"&&query.get("select")===PUBLIC_RANGE_COLUMNS.join(",")&&query.get("id")==="eq."+fixtureA?json([]):undefined});
  await assert.rejects(run(missing.fetcher),/labs_staging_range_rest_owned_fixture_missing/);
  const leaked=mock({fixtures:true,override:({path,query,who})=>path==="/rest/v1/ctf_range_sessions"&&who==="a"&&query.get("select")===PUBLIC_RANGE_COLUMNS.join(",")&&query.get("id")==="eq."+fixtureB?json([row(fixtureB)]):undefined});
  await assert.rejects(run(leaked.fetcher),/labs_staging_range_rest_foreign_session_disclosed/);
});
test("unexpected Edge and REST fields, or enabled staging provider, fail closed",async()=>{
  const cases=[
    ({path,action})=>path.endsWith("/ctf-range-control")&&action==="sessions"?json({source:"authenticated_server",hostedAccessAvailable:false,sessions:[{...row(fixtureA),worker_fence_id:"internal"}]}):undefined,
    ({path,query,who})=>path==="/rest/v1/ctf_range_sessions"&&who==="a"&&query.get("select")===PUBLIC_RANGE_COLUMNS.join(",")?json([{...row(fixtureA),user_id:ownerA}]):undefined,
    ({path,action})=>path.endsWith("/ctf-range-control")&&action==="status"?json({...provider(),maxConcurrentSessions:1}):undefined,
  ];
  for(const override of cases)await assert.rejects(run(mock({override}).fetcher));
});

test("exact staging target and validated config identity cannot be bypassed",async()=>{
  const other=env();other.ETERNYX_LABS_STAGING_REF="abcdefghijklmnopqrst";
  assert.throws(()=>validateLabsStagingConfig(other),/target_not_isolated/);
  assert.equal(isLabsPublicKey("sb_secret_offline_example_only_12345678"),false);
  const fake=(role,ref)=>["a".repeat(24),Buffer.from(JSON.stringify({role,ref})).toString("base64url"),"c".repeat(44)].join(".");
  assert.equal(isLabsPublicKey(fake("anon",stage)),true);
  assert.equal(isLabsPublicKey(fake("anon",ETERNYX_PRODUCTION_REF)),false);
  assert.equal(isLabsPublicKey(fake("service_role",stage)),false);
  let calls=0;
  await assert.rejects(runLabsStagingReadOnly({...validateLabsStagingConfig(env())},async()=>{calls++;}),/unverified_configuration/);
  assert.equal(calls,0);
});

test("two empty REST responses cannot masquerade as proof of isolation",async()=>{
  const {fetcher}=mock({solvesA:["encoded-access-log"],solvesB:["header-evidence"],override:({path})=>path==="/rest/v1/ctf_verified_solves"?json([]):undefined});
  await assert.rejects(run(fetcher),/owned_solve_rest_fixture_missing/);
});
