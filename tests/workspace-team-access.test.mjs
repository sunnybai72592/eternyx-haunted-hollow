import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  TEAM_DETAIL_ACCESS_LOST,chooseWorkspaceTeam,verifyWorkspaceTeamDetails,
  isWorkspaceTeamAccessLoss,
} from "../src/lib/workspaceTeamAccess.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const editor="22222222-2222-4222-8222-222222222222";
const other="33333333-3333-4333-8333-333333333333";
const a={id:"a",owner_id:owner,status:"active"};
const b={id:"b",owner_id:other,status:"active"};
const r=(id,role,spaceId="a")=>({user_id:id,role,space_id:spaceId});

test("selection follows only a freshly available team, never stale preference",()=>{
 assert.equal(chooseWorkspaceTeam([a,b],"a","b"),"b");
 assert.equal(chooseWorkspaceTeam([a,b],"a","revoked"),"a");
 assert.equal(chooseWorkspaceTeam([b],"a","a"),"b");
 assert.equal(chooseWorkspaceTeam([],"a","a"),null);
 assert.throws(()=>chooseWorkspaceTeam([{...a,id:null}]),/verified server/);
 assert.throws(()=>chooseWorkspaceTeam([a,a]),/duplicate identities/);
});
test("role and row scope must agree with current authenticated owner",()=>{
 const fixture={space:a,owner,spaceId:"a",members:[r(owner,"owner"),r(editor,"editor")],
   tasks:[{space_id:"a",id:"task"}],events:[{space_id:"a",id:1}],invites:[]};
 assert.equal(verifyWorkspaceTeamDetails(fixture),"owner");
 assert.throws(()=>verifyWorkspaceTeamDetails({...fixture,tasks:[{space_id:"b"}]}),/scope/);
 assert.throws(()=>verifyWorkspaceTeamDetails({...fixture,members:[r(editor,"editor")]}),
  x=>x.code===TEAM_DETAIL_ACCESS_LOST);
 assert.throws(()=>verifyWorkspaceTeamDetails({...fixture,members:[r(owner,"viewer")]}),
  x=>x.code===TEAM_DETAIL_ACCESS_LOST);
 assert.throws(()=>verifyWorkspaceTeamDetails({...fixture,members:[r(owner,"owner"),r(owner,"owner")]}),
  x=>x.code===TEAM_DETAIL_ACCESS_LOST);
 assert.throws(()=>verifyWorkspaceTeamDetails({...fixture,members:[r(owner,"owner"),r(editor,"admin")]}),/roles/);
});
test("nonowner cannot receive private invitations, network loss is not revocation",()=>{
 const fixture={space:b,owner:editor,spaceId:"b",members:[r(editor,"viewer","b")],
   tasks:[],events:[],invites:[]};
 assert.equal(verifyWorkspaceTeamDetails(fixture),"viewer");
 assert.throws(()=>verifyWorkspaceTeamDetails({...fixture,invites:[{space_id:"b"}]}),
  x=>x.code===TEAM_DETAIL_ACCESS_LOST);
 assert.equal(isWorkspaceTeamAccessLoss({code:"42501"}),true);
 assert.equal(isWorkspaceTeamAccessLoss({status:403}),true);
 assert.equal(isWorkspaceTeamAccessLoss({code:TEAM_DETAIL_ACCESS_LOST}),true);
 assert.equal(isWorkspaceTeamAccessLoss({status:500}),false);
 assert.equal(isWorkspaceTeamAccessLoss(new Error("Offline")),false);
});
test("UI is wired to quarantine on tab hide, focus, and lost membership",()=>{
 const component=readFileSync(
   new URL("../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
 for(const anchor of [
  'verifyWorkspaceTeamDetails({',
  'chooseWorkspaceTeam(rows,selectedId,prefer)',
  'setVerifiedSpaceId(null)',
  'document.visibilityState==="hidden"',
  'window.addEventListener("focus",resume)',
  'document.addEventListener("visibilitychange",resume)',
  'setInterval(resume,60000)',
  'const currentRole=verifiedSpaceId===selectedId',
  'if(!rows.some(space=>space.id===selectedId))',
 ])assert.ok(component.includes(anchor),"Missing browser quarantine: "+anchor);
});
