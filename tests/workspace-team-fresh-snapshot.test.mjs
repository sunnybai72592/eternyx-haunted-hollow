import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  chooseWorkspaceTeam,assertWorkspaceTeamState,requireWorkspacePreferredTeam,
  retainWorkspaceTeamDraft,verifyWorkspaceTeamDetails,
} from "../src/lib/workspaceTeamAccess.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const editor="22222222-2222-4222-8222-222222222222";
const fresh=(status="active")=>({id:"team-1",owner_id:owner,status});
const member=(user_id,role)=>({space_id:"team-1",user_id,role});
const task={id:"task-1",space_id:"team-1"};
const draft={id:"task-1",title:"Ongoing review",updatedAt:"t0"};

test("Phase 30 refuses unknown server team statuses and malformed identities",()=>{
  assert.equal(assertWorkspaceTeamState(fresh()).status,"active");
  assert.equal(assertWorkspaceTeamState(fresh("archived")).status,"archived");
  for(const space of [null,{},fresh("deleted"),fresh("paused"),{...fresh(),id:""},{...fresh(),owner_id:null}]){
    assert.throws(()=>assertWorkspaceTeamState(space),/status or identity/);
  }
});
test("explicit create/join target cannot silently fall back to a former team",()=>{
  const teams=[fresh(),{id:"team-2",owner_id:editor,status:"active"}];
  assert.equal(requireWorkspacePreferredTeam(teams,"team-2"),true);
  assert.equal(requireWorkspacePreferredTeam(teams,null),true);
  assert.equal(chooseWorkspaceTeam(teams,"team-1","missing"),"team-1");
  assert.throws(()=>requireWorkspacePreferredTeam(teams,"missing"),/not visible/);
  assert.throws(()=>requireWorkspacePreferredTeam(teams,42),/not visible/);
});
test("fresh archive snapshot clears local editor draft despite an old active closure",()=>{
  const previous=fresh("active"),newList=[fresh("archived")];
  assert.equal(retainWorkspaceTeamDraft(draft,"editor",previous.status,[task]),true);
  requireWorkspacePreferredTeam(newList);
  const chosen=chooseWorkspaceTeam(newList,"team-1");
  const current=assertWorkspaceTeamState(newList.find(space=>space.id===chosen));
  assert.equal(current.status,"archived");
  const role=verifyWorkspaceTeamDetails({
    space:current,owner:editor,spaceId:"team-1",
    members:[member(owner,"owner"),member(editor,"editor")],
    tasks:[task],events:[],invites:[],
  });
  assert.equal(retainWorkspaceTeamDraft(draft,role,current.status,[task]),false);
});
test("same authorized active team retains unfinished edit; revoked task never does",()=>{
  const serverTeam=fresh("active");
  const role=verifyWorkspaceTeamDetails({
    space:serverTeam,owner:editor,spaceId:"team-1",
    members:[member(owner,"owner"),member(editor,"editor")],
    tasks:[task],events:[],invites:[],
  });
  assert.equal(retainWorkspaceTeamDraft(draft,role,serverTeam.status,[task]),true);
  assert.equal(retainWorkspaceTeamDraft(draft,role,serverTeam.status,[]),false);
});
test("refresh uses exact new snapshot for details rather than closure-captured spaces",()=>{
  const source=readFileSync(new URL("../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
  for(const line of [
    "rows.forEach(assertWorkspaceTeamState);",
    "requireWorkspacePreferredTeam(rows,prefer);",
    "const chosen=chooseWorkspaceTeam(rows,selectedId,prefer);",
    "return {chosen,rows};",
    "const snapshot=await loadSpaces(owner,spaceToken,target);",
    "const {chosen,rows}=snapshot;",
    "await loadDetails(chosen,owner,detailToken,rows);",
    "if(!verified)throw Error(",
    "assertWorkspaceTeamState(target);",
  ]) assert.ok(source.includes(line),"Fresh-snapshot guard missing: "+line);
  assert.ok(!source.includes("await loadDetails(chosen,owner,detailToken);"),
    "Must not use stale React-render team list during refresh");
});
test("create/join avoid a duplicate refresh and invitation codes remain visible",()=>{
  const source=readFileSync(new URL("../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
  for(const label of [
    "Team space created. Only explicitly invited members can access its tasks.",
    "Team invitation accepted. Your new membership is private to this account.",
    "One-time invitation created. Share the code securely; it will not be shown again after leaving this team.",
  ])assert.ok(source.includes(label+'",false,')),"Should skip duplicate/destructive refresh: "+label);
  assert.ok(source.includes("if(refreshAfter)await refresh();"));
  assert.ok(source.includes("setRevealedToken({token:receipt.token,role:receipt.role,expires:receipt.expires_at});"));
  assert.ok(source.includes('setRevealedToken(null); // one-time invite secrets should not reappear'));
});
test("mutation success message is shown only after successful verification refresh",()=>{
  const source=readFileSync(new URL("../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
  const run=source.slice(source.indexOf("const run=async("),source.indexOf("const createTeam="));
  assert.match(run,/const result=await action\(\);[\s\S]*if\(refreshAfter\)await refresh\(\);[\s\S]*onConfirmed\?\.\(result\);[\s\S]*setNotice\(success\)/);
  assert.ok(!/setNotice\(success\);[\s\S]*await refresh\(\);/.test(run));
});
