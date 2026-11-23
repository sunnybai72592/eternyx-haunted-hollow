import test from "node:test";
import assert from "node:assert/strict";
import {workspaceTeamEventGroup,workspaceTeamEventUnread,
  workspaceTeamVisibleEvents} from "../src/lib/workspaceTeamLive.mjs";
const owner="11111111-1111-4111-8111-111111111111";
const teammate="22222222-2222-4222-8222-222222222222";
const joined="2026-11-23T12:00:00Z";
const base={id:12,actor_id:teammate,event_type:"comment_posted",
  created_at:"2026-11-23T12:05:00Z"};
test("only genuine post-join teammate events beyond the server cursor are unread",()=>{
  assert.equal(workspaceTeamEventUnread(base,owner,joined,11),true);
  assert.equal(workspaceTeamEventUnread(base,owner,joined,12),false);
  assert.equal(workspaceTeamEventUnread({...base,actor_id:owner},owner,joined,0),false);
  assert.equal(workspaceTeamEventUnread({...base,created_at:"2026-11-23T11:59:59Z"},owner,joined,0),false);
  assert.equal(workspaceTeamEventUnread({...base,id:-1},owner,joined,0),false);
  assert.equal(workspaceTeamEventUnread({...base,id:"12"},owner,joined,0),false);
  assert.equal(workspaceTeamEventUnread({...base,created_at:"bad"},owner,joined,0),false);
  assert.equal(workspaceTeamEventUnread(base,owner,"unknown",0),false);
});
test("activity groups distinguish team lifecycle, people, tasks and discussions",()=>{
  assert.equal(workspaceTeamEventGroup("task_assigned"),"tasks");
  assert.equal(workspaceTeamEventGroup("comment_redacted"),"discussion");
  assert.equal(workspaceTeamEventGroup("step_unchecked"),"discussion");
  assert.equal(workspaceTeamEventGroup("member_removed"),"people");
  assert.equal(workspaceTeamEventGroup("space_archived"),"space");
  assert.equal(workspaceTeamEventGroup("unknown"),"other");
});
test("activity filters operate only on provided server event rows",()=>{
  const rows=[base,{...base,id:13,event_type:"task_created"},
    {...base,id:14,event_type:"member_joined",actor_id:owner}];
  assert.deepEqual(workspaceTeamVisibleEvents(rows,"discussion","others",owner).map(x=>x.id),[12]);
  assert.deepEqual(workspaceTeamVisibleEvents(rows,"all","mine",owner).map(x=>x.id),[14]);
  assert.deepEqual(workspaceTeamVisibleEvents(rows,"tasks","all",owner).map(x=>x.id),[13]);
  assert.deepEqual(workspaceTeamVisibleEvents(null,"all","all",owner),[]);
});
