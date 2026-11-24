import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  validateTeamInviteToken, teamCanEdit, teamCanInvite,
  normalizeTeamTaskDraft, teamMemberLabel, WORKSPACE_TEAM_EVENT_LABELS,
  workspaceTeamMemberImpact,workspaceTeamInviteState,workspaceTeamInviteReceipt,
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

test("membership impact counts completed and outstanding assignments without changing tasks",()=>{
 const tasks=[{id:"a",space_id:"s",status:"todo",assignee_id:editor},
  {id:"b",space_id:"s",status:"done",assignee_id:editor},
  {id:"c",space_id:"s",status:"in_progress",assignee_id:owner}];
 const original=structuredClone(tasks);
 assert.deepEqual(workspaceTeamMemberImpact(tasks,"s",editor),{total:2,open:1,completed:1});
 assert.deepEqual(workspaceTeamMemberImpact(tasks,"s",viewer),{total:0,open:0,completed:0});
 assert.throws(()=>workspaceTeamMemberImpact(tasks,"foreign",editor));
 assert.throws(()=>workspaceTeamMemberImpact([tasks[0],tasks[0]],"s",editor));
 assert.deepEqual(tasks,original);
});
const now=Date.parse("2026-11-24T12:00:00Z");
const invitation={role:"editor",expires_at:"2026-11-25T12:00:00Z",revoked_at:null,consumed_at:null,consumed_by:null};
test("invitation lifecycle distinguishes accepted, revoked, expired and pending",()=>{
 assert.equal(workspaceTeamInviteState(invitation,now),"pending");
 assert.equal(workspaceTeamInviteState(invitation,Date.parse(invitation.expires_at)),"expired");
 assert.equal(workspaceTeamInviteState({...invitation,consumed_by:viewer,consumed_at:"2026-11-24T12:00:00Z"},now),"accepted");
 assert.equal(workspaceTeamInviteState({...invitation,revoked_at:"2026-11-24T12:00:00Z"},now),"revoked");
 for(const change of [{role:"owner"},{expires_at:"bad"},{consumed_by:viewer}])
  assert.throws(()=>workspaceTeamInviteState({...invitation,...change},now));
});
test("one-time invitation receipt requires exact token, server id, role and future expiry",()=>{
 const raw={invite_id:owner,role:"editor",token,expires_at:invitation.expires_at};
 assert.deepEqual(workspaceTeamInviteReceipt(raw,"editor",now),{id:owner,role:"editor",token,expires:invitation.expires_at});
 for(const change of [{invite_id:"bad"},{role:"viewer"},{token:" "+token},{expires_at:"2026-11-23T12:00:00Z"}])
  assert.throws(()=>workspaceTeamInviteReceipt({...raw,...change},"editor",now));
});
test("governance controls remain scoped, invitation history is bounded and raw member IDs are not tooltips",()=>{
 const source=readFileSync(new URL("../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
 for(const anchor of ["const canManage=Boolean(selected","workspaceTeamMemberImpact(tasks,selected.id,member.user_id)",
   "workspaceTeamInviteReceipt(data,inviteRole,Date.now())","Hide code permanently",
   "These are not complete historical totals.","Date.parse(revealedToken.expires)<=Date.now()",
   'state==="pending"||state==="expired"','setInviteView("pending");setMemberView("all")'])
  assert.ok(source.includes(anchor),anchor);
 assert.ok(!source.includes("title={member.user_id}"));
});

test("invitation receipt cannot reappear after a team verification epoch changes",()=>{
 const s=readFileSync(new URL("../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
 const invite=s.slice(s.indexOf("const invite=()=>"),s.indexOf("const saveTask="));
 assert.ok(invite.includes("const inviteEpoch=detailsEpoch.current;"));
 assert.ok(invite.includes("if(inviteEpoch!==detailsEpoch.current)throw"));
 assert.ok(invite.includes("if(inviteEpoch!==detailsEpoch.current||Date.parse(receipt.expires)<=Date.now())"));
 assert.ok(s.includes("for(const row of i.data)workspaceTeamInviteState(row,Date.now());"));
});
