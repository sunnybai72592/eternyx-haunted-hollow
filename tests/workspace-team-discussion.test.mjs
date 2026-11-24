import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  validateTeamCommentBody,validateTeamStepTitle,
  workspaceTeamStepProgress,workspaceTeamCommentCanRedact,
  workspaceTeamTaskMatchesFilter,TEAM_COMMENT_LIMIT,TEAM_STEP_LIMIT,
  verifyWorkspaceDiscussionSnapshot,isWorkspaceDiscussionCurrent,
  selectWorkspaceDiscussionComments,selectWorkspaceDiscussionSteps,
} from "../src/lib/workspaceTeamDiscussion.mjs";
import { WORKSPACE_TEAM_EVENT_LABELS } from "../src/lib/workspaceTeamUtils.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
test("comment body and shared checklist titles are strictly validated",()=>{
  assert.equal(validateTeamCommentBody("  A safe update  "),"A safe update");
  assert.equal(validateTeamStepTitle("  Measure coating DFT "),"Measure coating DFT");
  for(const invalid of ["", " \n ", "x".repeat(2001),null,23]) {
    assert.throws(()=>validateTeamCommentBody(invalid),/1–2,000/);
  }
  for(const invalid of ["", "  ", "x".repeat(181),false]) {
    assert.throws(()=>validateTeamStepTitle(invalid),/1–180/);
  }
  assert.equal(TEAM_COMMENT_LIMIT,200);
  assert.equal(TEAM_STEP_LIMIT,30);
});

test("progress derives only from actual saved step state",()=>{
  assert.deepEqual(workspaceTeamStepProgress([]),{done:0,total:0});
  assert.deepEqual(workspaceTeamStepProgress([
    {done:true},{done:false},{done:true},
  ]),{done:2,total:3});
  assert.throws(()=>workspaceTeamStepProgress([{done:"true"}]),/Invalid/);
  assert.throws(()=>workspaceTeamStepProgress(Array(31).fill({done:false})),/Invalid/);
});

test("comment moderation is role and author scoped; viewers cannot redact",()=>{
  const base={owner,authorId:owner,redactedAt:null,active:true};
  assert.equal(workspaceTeamCommentCanRedact({...base,role:"editor"}),true);
  assert.equal(workspaceTeamCommentCanRedact({...base,role:"owner",authorId:other}),true);
  assert.equal(workspaceTeamCommentCanRedact({...base,role:"editor",authorId:other}),false);
  assert.equal(workspaceTeamCommentCanRedact({...base,role:"viewer"}),false);
  assert.equal(workspaceTeamCommentCanRedact({...base,role:"editor",active:false}),false);
  assert.equal(workspaceTeamCommentCanRedact({...base,role:"owner",redactedAt:"2026-11-23T14:00:00Z"}),false);
});

test("assigned-to-me, unassigned and outstanding filters use real task fields",()=>{
  const mine={assignee_id:owner,status:"todo"};
  const unassigned={assignee_id:null,status:"in_progress"};
  const completed={assignee_id:other,status:"done"};
  assert.equal(workspaceTeamTaskMatchesFilter(mine,"mine",owner),true);
  assert.equal(workspaceTeamTaskMatchesFilter(unassigned,"mine",owner),false);
  assert.equal(workspaceTeamTaskMatchesFilter(unassigned,"unassigned",owner),true);
  assert.equal(workspaceTeamTaskMatchesFilter(completed,"outstanding",owner),false);
  assert.equal(workspaceTeamTaskMatchesFilter(mine,"outstanding",owner),true);
  assert.equal(workspaceTeamTaskMatchesFilter(completed,"all",owner),true);
});

test("new activity names distinguish submitted comments, moderation and checklists",()=>{
  assert.equal(WORKSPACE_TEAM_EVENT_LABELS.comment_posted,"Task comment posted");
  assert.equal(WORKSPACE_TEAM_EVENT_LABELS.comment_redacted,"Task comment redacted");
  assert.equal(WORKSPACE_TEAM_EVENT_LABELS.step_checked,"Checklist step completed");
  assert.equal(WORKSPACE_TEAM_EVENT_LABELS.task_unassigned,"Task unassigned");
});

const scope={spaceId:"team",taskId:"task"};
const stamp="2026-11-24T12:00:00Z";
const comment={id:"c",space_id:"team",task_id:"task",author_id:owner,body:"Handover",created_at:stamp,redacted_at:null};
const step={id:"s",space_id:"team",task_id:"task",created_by:owner,title:"Inspect",done:false,done_by:null,completed_at:null,created_at:stamp,updated_at:stamp};
const snapshot={...scope,comments:[comment],steps:[step],commentCount:1,stepCount:1};
test("discussion publishes only complete exact scoped pages",()=>{
  assert.deepEqual(verifyWorkspaceDiscussionSnapshot(snapshot),{comments:[comment],steps:[step]});
  for(const change of [{commentCount:2},{stepCount:null},{comments:[{...comment,task_id:"foreign"}]},
    {steps:[{...step,space_id:"foreign"}]},{comments:[comment,comment],commentCount:2},
    {steps:[{...step,done:true}]},{comments:[{...comment,created_at:"bad"}]},
    {steps:[{...step,title:""}]},{comments:null}])
    assert.throws(()=>verifyWorkspaceDiscussionSnapshot({...snapshot,...change}));
  assert.deepEqual(verifyWorkspaceDiscussionSnapshot({...scope,comments:[],steps:[],commentCount:0,stepCount:0}),{comments:[],steps:[]});
});
test("read receipts refuse stale task scopes and superseded refreshes",()=>{
  assert.equal(isWorkspaceDiscussionCurrent(1,3,1,3),true);
  assert.equal(isWorkspaceDiscussionCurrent(1,3,1,4),false);
  assert.equal(isWorkspaceDiscussionCurrent(1,3,2,3),false);
});
test("comment search composes with author and order without searching redacted content",()=>{
  const rows=[comment,{...comment,id:"d",author_id:other,created_at:"2026-11-25T12:00:00Z",body:"handover"},
    {...comment,id:"e",redacted_at:stamp,body:"private original"}];
  const ids=opts=>selectWorkspaceDiscussionComments(rows,opts).map(c=>c.id);
  assert.deepEqual(ids({query:" HANDOVER "}),["d","c"]);
  assert.deepEqual(ids({query:"handover",sort:"oldest"}),["c","d"]);
  assert.deepEqual(ids({filter:"mine",owner,query:"handover"}),["c"]);
  assert.deepEqual(ids({filter:"redacted"}),["e"]);
  assert.deepEqual(ids({query:"private"}),[]);
  assert.deepEqual(rows.map(c=>c.id),["c","d","e"]);
});
test("checklist views preserve the full saved progress and reject invented filters",()=>{
  const rows=[step,{...step,id:"done",done:true,done_by:owner,completed_at:stamp}];
  assert.deepEqual(selectWorkspaceDiscussionSteps(rows,"open").map(s=>s.id),["s"]);
  assert.deepEqual(selectWorkspaceDiscussionSteps(rows,"done").map(s=>s.id),["done"]);
  assert.deepEqual(workspaceTeamStepProgress(rows),{done:1,total:2});
  assert.throws(()=>selectWorkspaceDiscussionSteps(rows,"fake"));
});
test("discussion UI gates writes, hides stale pages and clears drafts only on current confirmed actions",()=>{
  const source=readFileSync(new URL("../src/components/workspace/WorkspaceTeamTaskDiscussion.tsx",import.meta.url),"utf8");
  for(const anchor of ["verifyWorkspaceDiscussionSnapshot({","isWorkspaceDiscussionCurrent(version,read,token.current,request.current)",
    "if(!current())return;","setComments([]);setSteps([]);setVerified(false);",
    "actionLock.current=true;","if(version!==token.current||!writeAllowed.current)return;",
    "onConfirmed?.();","{verified&&<div","comment.redacted_at?","visibleSteps.map","visibleComments.map"])
    assert.ok(source.includes(anchor),anchor);
  assert.ok(!source.includes("setComments(old=>")&&!source.includes("setSteps(old=>"));
});
