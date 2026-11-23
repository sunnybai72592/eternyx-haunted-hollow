import test from "node:test";
import assert from "node:assert/strict";
import {
  validateTeamInviteToken, teamCanEdit, teamCanInvite,
  normalizeTeamTaskDraft, teamMemberLabel, WORKSPACE_TEAM_EVENT_LABELS,
} from "../src/lib/workspaceTeamUtils.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const editor="22222222-2222-4222-8222-222222222222";
const viewer="33333333-3333-4333-8333-333333333333";
const token="a".repeat(64);

test("invite codes require exact random-secret format and cannot be URLs or short values",()=>{
  assert.equal(validateTeamInviteToken(token),token);
  assert.equal(validateTeamInviteToken("  "+token+" \t"),token);
  for(const bad of ["", "short", "https://example.test/?token="+token,
    "a".repeat(63), "A".repeat(64), "z".repeat(64), null]){
    assert.throws(()=>validateTeamInviteToken(bad),/Invitation code/);
  }
});

test("owner, editor and viewer authorization is explicit and archived spaces are read-only",()=>{
  assert.equal(teamCanEdit("owner","active"),true);
  assert.equal(teamCanEdit("editor","active"),true);
  assert.equal(teamCanEdit("viewer","active"),false);
  assert.equal(teamCanEdit(null,"active"),false);
  assert.equal(teamCanEdit("owner","archived"),false);
  assert.equal(teamCanInvite("owner","active"),true);
  assert.equal(teamCanInvite("editor","active"),false);
  assert.equal(teamCanInvite("owner","archived"),false);
});

test("task drafts accept only current members and bounded, supported fields",()=>{
  const good=normalizeTeamTaskDraft({
    title:"  Pipe inspection  ",details:"Check CP potential",
    status:"in_progress",priority:"high",due:"2026-12-01",assignee:editor,
  },[owner,editor]);
  assert.deepEqual(good,{
    p_title:"Pipe inspection",p_details:"Check CP potential",
    p_status:"in_progress",p_priority:"high",
    p_due_on:"2026-12-01",p_assignee_id:editor,
  });
  const emptyAssignee=normalizeTeamTaskDraft({
    title:"Unassigned",details:"",status:"todo",priority:"normal",
    due:"",assignee:"",
  },[owner,editor]);
  assert.equal(emptyAssignee.p_assignee_id,null);
  assert.equal(emptyAssignee.p_due_on,null);
  const base={title:"Safe",details:"",status:"todo",priority:"normal",due:"",assignee:""};
  for(const changed of [
    {title:""}, {title:"x".repeat(201)}, {details:"x".repeat(4001)},
    {status:"deleted"}, {priority:"immediate"}, {due:"tomorrow"},
    {assignee:viewer},
  ]){
    assert.throws(()=>normalizeTeamTaskDraft({...base,...changed},[owner,editor]),/Review title/);
  }
});
test("member labels and activity events avoid invented names or fabricated timeline",()=>{
  assert.equal(teamMemberLabel(owner,owner),"You");
  assert.match(teamMemberLabel(editor,owner),/Member 22222222/);
  assert.equal(WORKSPACE_TEAM_EVENT_LABELS.member_joined,"Member joined");
  assert.equal(WORKSPACE_TEAM_EVENT_LABELS.task_deleted,"Task deleted");
});
