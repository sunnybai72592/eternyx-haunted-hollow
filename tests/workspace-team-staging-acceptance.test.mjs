import test from "node:test";
import assert from "node:assert/strict";
import {STAGING_KEYS,validateWorkspaceStagingConfig,sanitizedWorkspaceStagingReport,invisible,requireWorkspaceActivity,verifyWorkspacePortfolioProbe}
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

/* Injected local query double; no network, no real credentials, no release claim. */
function localClient(tables,{identity="owner",overrideCount={},deny=false}={}){
 const calls=[];
 return {calls,auth:{getUser:async()=>({data:{user:{id:identity}},error:null})},
 from(table){
  let columns,exact=false,filters=[];
  return {select(value,options){columns=value;exact=options?.count==="exact";return this;},
   eq(key,value){filters.push([key,value]);return this;},
   async limit(limit){
    calls.push({table,columns,exact,limit});
    const rows=tables[table]??[];
    if(deny)return {data:null,error:{code:"42501"}};
    if(rows.length&&columns.split(",").some(c=>!Object.hasOwn(rows[0],c)))return {data:null,error:{code:"42703"}};
    const selected=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
    return {data:selected.slice(0,limit).map(row=>Object.fromEntries(columns.split(",").map(k=>[k,row[k]]))),
      error:null,count:exact?(overrideCount[table]??selected.length):null};
   }};
 }};
}
const metadata={id:"team",owner_id:"owner",name:"Team",status:"active"};
const member={space_id:"team",user_id:"owner",role:"owner"};
const task={id:"task",space_id:"team",status:"todo",priority:"urgent",due_on:"2026-11-23",assignee_id:"owner"};
const tables={workspace_team_spaces:[metadata],workspace_team_members:[member],workspace_team_tasks:[task],
 workspace_team_events:[{id:1,space_id:"team"},{id:2,space_id:"team"}],
 workspace_team_read_cursors:[{user_id:"owner",space_id:"team"}]};
test("outsider composite-key reads use real columns and reject visible rows",async()=>{
 const c=localClient(tables);
 for(const table of ["workspace_team_members","workspace_team_read_cursors"]){
  await invisible(c,table,{space_id:"foreign"});
  assert.equal(c.calls.at(-1).columns,"user_id");
  await assert.rejects(invisible(c,table,{space_id:"team"}),/unauthorized-row-visible/);
 }
 await assert.rejects(invisible(localClient(tables,{deny:true}),"workspace_team_members",{space_id:"team"}),/query-unavailable/);
});
test("activity fixture supports multiple real events without silently accepting an empty feed",async()=>{
 const c=localClient(tables);
 await requireWorkspaceActivity(c,"team");
 assert.equal(c.calls.at(-1).limit,1);
 await assert.rejects(requireWorkspaceActivity(c,"foreign"),/activity-fixture-missing/);
});
test("portfolio acceptance reads only minimal projections and checks exact counts and identity",async()=>{
 const c=localClient(tables);
 const result=await verifyWorkspacePortfolioProbe(c,"team","owner","owner","2026-11-24");
 assert.equal(result.open,1);assert.equal(result.overdue,1);assert.equal(result.mine,1);
 assert.ok(c.calls.some(x=>x.columns==="id,space_id,status,priority,due_on,assignee_id"&&x.exact&&x.limit===500));
 assert.ok(c.calls.some(x=>x.columns==="user_id,space_id,role"&&x.exact&&x.limit===20));
 await assert.rejects(verifyWorkspacePortfolioProbe(localClient(tables,{overrideCount:{workspace_team_tasks:2}}),"team","owner","owner","2026-11-24"),/portfolio-snapshot-incomplete/);
 await assert.rejects(verifyWorkspacePortfolioProbe(localClient(tables,{identity:"changed"}),"team","owner","owner","2026-11-24"),/portfolio-membership-changed/);
 await assert.rejects(verifyWorkspacePortfolioProbe(c,"team","owner","viewer","2026-11-24"),/portfolio-membership-changed/);
});
