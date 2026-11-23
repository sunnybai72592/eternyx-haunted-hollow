import test from "node:test";
import assert from "node:assert/strict";
import {
  validateTeamCommentBody,validateTeamStepTitle,
  workspaceTeamStepProgress,workspaceTeamCommentCanRedact,
  workspaceTeamTaskMatchesFilter,TEAM_COMMENT_LIMIT,TEAM_STEP_LIMIT,
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
