import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  retainWorkspaceTeamDraft,shouldQuarantineWorkspaceAuth,workspaceResumeAction,
} from "../src/lib/workspaceTeamAccess.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const outsider="22222222-2222-4222-8222-222222222222";
const unsaved={id:null,title:"Coating inspection",details:"Unsent field readings"};
const existing={id:"task-1",title:"Inspect test station"};

test("a still-authorized owner/editor retains a new or existing unsaved edit",()=>{
  for(const role of ["owner","editor"]){
    assert.equal(retainWorkspaceTeamDraft(unsaved,role,"active",[]),true);
    assert.equal(retainWorkspaceTeamDraft(existing,role,"active",[{id:"task-1"}]),true);
  }
});
test("drafts are discarded after role downgrade, archive, delete or bad API data",()=>{
  assert.equal(retainWorkspaceTeamDraft(unsaved,"viewer","active",[]),false);
  assert.equal(retainWorkspaceTeamDraft(unsaved,null,"active",[]),false);
  assert.equal(retainWorkspaceTeamDraft(unsaved,"editor","archived",[]),false);
  assert.equal(retainWorkspaceTeamDraft(existing,"editor","active",[{id:"another"}]),false);
  assert.equal(retainWorkspaceTeamDraft(existing,"editor","active",null),false);
  assert.equal(retainWorkspaceTeamDraft({id:""},"editor","active",[]),false);
  assert.equal(retainWorkspaceTeamDraft(null,"editor","active",[]),false);
});
test("sign out/account change quarantines; same account refresh does not",()=>{
  assert.equal(shouldQuarantineWorkspaceAuth("SIGNED_OUT",null,owner),true);
  for(const event of ["INITIAL_SESSION","SIGNED_IN","TOKEN_REFRESHED","USER_UPDATED"]){
    assert.equal(shouldQuarantineWorkspaceAuth(event,{user:{id:outsider}},owner),true);
    assert.equal(shouldQuarantineWorkspaceAuth(event,{user:{id:owner}},owner),false);
  }
  assert.equal(shouldQuarantineWorkspaceAuth("TOKEN_REFRESHED",null,owner),false);
  assert.equal(shouldQuarantineWorkspaceAuth("INITIAL_SESSION",null,owner),false);
});
test("background masks, foreground replay queues, disabled avoids refresh",()=>{
  assert.equal(workspaceResumeAction("hidden",false),"mask");
  assert.equal(workspaceResumeAction("hidden",true),"mask");
  assert.equal(workspaceResumeAction("visible",false),"revalidate");
  assert.equal(workspaceResumeAction("visible",true),"queue");
  assert.equal(workspaceResumeAction("prerender",false),"ignore");
  assert.equal(workspaceResumeAction("visible",false,true),"ignore");
});
test("browser wiring invokes the pure guards and cleans up auth subscribers",()=>{
  const source=readFileSync(
    new URL("../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
  for(const marker of [
    "const maskTeam=()=>",
    "const quarantineTeam=()=>",
    "setDraft(previous=>retainWorkspaceTeamDraft(",
    "const action=workspaceResumeAction(",
    "resumePending.current=true",
    "resumePending.current=false",
    "const pending=refresh();",
    'document.visibilityState==="visible"',
    "supabase.auth.onAuthStateChange(",
    "subscription.unsubscribe()",
    "shouldQuarantineWorkspaceAuth(event,session,owner)",
    "maskTeam(); // cached membership can never authorize a pending request",
  ])assert.ok(source.includes(marker),"Missing Phase 27 wiring: "+marker);
});
