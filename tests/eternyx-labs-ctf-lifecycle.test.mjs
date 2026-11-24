import test from "node:test";
import assert from "node:assert/strict";
import {decodeCasefile,runCtfLifecycle,SOLVE_APPROVAL} from "../scripts/labs-staging-ctf-lifecycle.mjs";
import {buildVerifiedCtfArtifact,VERIFIED_CTF_MISSIONS,tallyVerifiedCtfSolves} from "../src/lib/eternyxVerifiedCtf.mjs";
import {AUTH_APPROVAL} from "../scripts/labs-staging-fresh-auth.mjs";
import {LABS_STAGING_REF,PUBLIC_RANGE_COLUMNS} from "../src/lib/eternyxLabsStagingReadiness.mjs";
import {ETERNYX_PRODUCTION_REF} from "../scripts/automation-staging-db-readonly.mjs";
const mission="encoded-access-log",origin="https://"+LABS_STAGING_REF+".supabase.co";
const a="123e4567-e89b-42d3-a456-426614174001",b="223e4567-e89b-42d3-a456-426614174001";
const flags={a:"ETERNYX{encoded_access_log_"+"a".repeat(24)+"}",b:"ETERNYX{encoded_access_log_"+"b".repeat(24)+"}"};
const env=()=>({ETERNYX_LABS_CTF_SOLVE_CONSENT:SOLVE_APPROVAL,ETERNYX_LABS_AUTH_CONSENT:AUTH_APPROVAL,
 ETERNYX_LABS_STAGING_REF:LABS_STAGING_REF,ETERNYX_LABS_PRODUCTION_REF:ETERNYX_PRODUCTION_REF,
 ETERNYX_LABS_STAGING_PUBLIC_KEY:"sb_publishable_offline_example_only_12345678",
 ETERNYX_LABS_TEST_EMAIL_A:"test-a@example.invalid",ETERNYX_LABS_TEST_EMAIL_B:"test-b@example.invalid",
 ETERNYX_LABS_TEST_PASSWORD_A:"offline-example-password-a",ETERNYX_LABS_TEST_PASSWORD_B:"offline-example-password-b"});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
function mock({existing=false,sameFlags=false,loseWrite=false}={}){
 const solved={a:existing,b:existing},calls=[];
 const jwt=id=>["a".repeat(24),Buffer.from(JSON.stringify({iss:origin+"/auth/v1",sub:id,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url"),"c".repeat(44)].join(".");
 const tokens={a:jwt(a),b:jwt(b)};
 const row={mission_id:mission,solved_at:"2026-11-24T12:00:00Z"};
 const fetcher=async(url,opts)=>{
  const u=new URL(url);assert.equal(u.origin,origin);assert.equal(opts.redirect,"error");
  const who=opts.headers.Authorization==="Bearer "+tokens.a?"a":opts.headers.Authorization==="Bearer "+tokens.b?"b":null;
  const body=opts.body?JSON.parse(opts.body):null,action=body?.action;
  calls.push({path:u.pathname,action});
  if(u.pathname==="/auth/v1/token"){const key=body.email===env().ETERNYX_LABS_TEST_EMAIL_A?"a":"b";return json({user:{id:key==="a"?a:b,email:body.email,is_anonymous:false},access_token:tokens[key]});}
  if(u.pathname==="/auth/v1/user")return json({id:who==="a"?a:b,is_anonymous:false});
  if(u.pathname==="/rest/v1/ctf_range_sessions"){
   const safe=u.searchParams.get("select")===PUBLIC_RANGE_COLUMNS.join(",");
   return who&&safe?json([]):json({code:"42501"},who?403:401);
  }
  if(u.pathname==="/rest/v1/ctf_verified_solves")return json(who&&solved[who]&&u.searchParams.get("user_id")==="eq."+(who==="a"?a:b)?[row]:[]);
  if(!who)return json({error:"unauthorized"},401);
  if(u.pathname.endsWith("/ctf-range-control"))return action==="status"?json({providerOnline:false,hostedAccessAvailable:false,maxConcurrentSessions:0,sessionDurationMinutes:15,dailyLaunchBudgetConfigured:false,message:"disabled"}):json({source:"authenticated_server",hostedAccessAvailable:false,sessions:[]});
  if(action==="catalog")return json({missions:VERIFIED_CTF_MISSIONS,verifiedByServer:true});
  if(action==="progress")return json({solves:solved[who]?[row]:[],summary:tallyVerifiedCtfSolves(solved[who]?[mission]:[]),verifiedByServer:true});
  if(action==="artifact")return json({missionId:mission,casefile:buildVerifiedCtfArtifact(mission,flags[sameFlags?"a":who])});
  if(action==="submit"){assert.equal(body.flag,flags[who]);assert.equal(body.missionId,mission);if(!loseWrite)solved[who]=true;return json({accepted:true,missionId:mission,verifiedByServer:true});}
  throw Error("unexpected");
 };
 return {fetcher,calls};
}
test("bounded casefile decoder rejects duplicates and wrong mission",()=>{
 const casefile=buildVerifiedCtfArtifact(mission,flags.a);
 assert.equal(decodeCasefile({missionId:mission,casefile}),flags.a);
 for(const data of [{missionId:"other",casefile},{missionId:mission,casefile:casefile+"\n"+casefile},{missionId:mission,casefile:"x".repeat(4097)}])assert.throws(()=>decodeCasefile(data));
});
test("separate explicit write consent is required before any network",async()=>{
 const e=env();delete e.ETERNYX_LABS_CTF_SOLVE_CONSENT;let calls=0;
 await assert.rejects(runCtfLifecycle(e,async()=>{calls++;}),/approval_required/);assert.equal(calls,0);
});
test("two real-shaped solves persist and get positive and negative REST evidence; reports omit flags",async()=>{
 const {fetcher,calls}=mock();const result=await runCtfLifecycle(env(),fetcher);
 assert.equal(result.flagsSubmitted,2);assert.equal(result.ownedRestChecks,2);assert.equal(result.crossOwnerDenials,2);
 assert.equal(result.sessionReservationsMade,0);assert.equal(result.productionReady,false);
 assert.equal(calls.filter(x=>x.action==="submit").length,2);
 for(const secret of Object.values(flags))assert.equal(JSON.stringify(result).includes(secret),false);
});
test("rerun skips previously solved mission without another submission",async()=>{
 const {fetcher,calls}=mock({existing:true});const result=await runCtfLifecycle(env(),fetcher);
 assert.equal(result.flagsSubmitted,0);assert.equal(result.existingSolves,2);assert.equal(calls.filter(x=>x.action==="submit").length,0);
});
test("shared flags fail before writes; accepted but unpersisted solve fails",async()=>{
 const same=mock({sameFlags:true});await assert.rejects(runCtfLifecycle(env(),same.fetcher),/casefiles_not_account_specific/);assert.equal(same.calls.filter(x=>x.action==="submit").length,0);
 const lost=mock({loseWrite:true});await assert.rejects(runCtfLifecycle(env(),lost.fetcher),/solve_not_persisted/);
});
