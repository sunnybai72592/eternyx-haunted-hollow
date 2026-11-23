import test from "node:test";
import assert from "node:assert/strict";
import { TEAM_ACTIVITY_PAGE_SIZE,TEAM_ACTIVITY_VIEW_CAP,
  mergeWorkspaceTeamHistory,normalizeWorkspaceTeamSnapshot,
  teamHistorySearch,buildWorkspaceTeamActivityCsv,
} from "../src/lib/workspaceTeamActivityHistory.mjs";

const sid="11111111-1111-4111-8111-111111111111";
const owner="22222222-2222-4222-8222-222222222222";
const event=(id,space_id=sid)=>({
 id,space_id,actor_id:owner,event_type:"task_updated",
 entity_id:"task",created_at:"2026-11-23T13:00:00Z",
});
test("notification snapshot must be complete, safe integer, and monotonic",()=>{
 assert.deepEqual(normalizeWorkspaceTeamSnapshot({
  last_seen_event_id:8,unread_count:3,latest_event_id:11,
 }),{lastSeen:8,unread:3,latest:11});
 assert.deepEqual(normalizeWorkspaceTeamSnapshot({
  last_seen_event_id:0,unread_count:0,latest_event_id:null,
 }),{lastSeen:0,unread:0,latest:null});
 for(const invalid of [null,[],{},{
  last_seen_event_id:12,unread_count:0,latest_event_id:11,
 },{
  last_seen_event_id:0,unread_count:"7",latest_event_id:11,
 },{
  last_seen_event_id:0,unread_count:-1,latest_event_id:11,
 }]) assert.throws(()=>normalizeWorkspaceTeamSnapshot(invalid),/snapshot|member/);
});
test("history pages reject cross-team rows and merge repeated events by stable id",()=>{
 const history=mergeWorkspaceTeamHistory([event(4),event(3)],[event(3),event(2),event(1)],sid);
 assert.deepEqual(history.map(item=>item.id),[4,3,2,1]);
 assert.throws(()=>mergeWorkspaceTeamHistory([event(2,"other")],[],sid),/cross-team/);
 assert.throws(()=>mergeWorkspaceTeamHistory([event(1.3)],[],sid),/Malformed/);
 assert.throws(()=>mergeWorkspaceTeamHistory([],null,sid),/Invalid/);
 assert.equal(TEAM_ACTIVITY_PAGE_SIZE,40);
 assert.equal(TEAM_ACTIVITY_VIEW_CAP,400);
 assert.equal(mergeWorkspaceTeamHistory([],Array.from({length:450},(_,i)=>event(i+1)),sid).length,400);
});
test("local search is constrained to present loaded event metadata",()=>{
 assert.equal(teamHistorySearch(event(1),"Task updated","Field readings","field"),true);
 assert.equal(teamHistorySearch(event(1),"Task updated","Field readings","password"),false);
 assert.equal(teamHistorySearch(event(1),"Task updated","","  TASK"),true);
});
test("CSV output quotes untrusted titles and defeats spreadsheet formulas",()=>{
 const csv=buildWorkspaceTeamActivityCsv([event(3)],owner,{
   task:'=HYPERLINK("evil","click")'
 },{task_updated:"Task updated"});
 assert.match(csv,/Event ID/);
 assert.match(csv,/"You"/);
 assert.match(csv,/'=HYPERLINK/);
 assert.doesNotMatch(csv,/^=HYPERLINK/m);
 assert.equal(csv.split("\r\n").length,3);
});
