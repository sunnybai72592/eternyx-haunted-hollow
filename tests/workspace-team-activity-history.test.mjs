import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import { TEAM_ACTIVITY_PAGE_SIZE,TEAM_ACTIVITY_VIEW_CAP,
  mergeWorkspaceTeamHistory,normalizeWorkspaceTeamSnapshot,
  teamHistorySearch,buildWorkspaceTeamActivityCsv,workspaceTeamAcknowledgementTarget,
  workspaceTeamActivityDateMatches,workspaceTeamActivityDateRangeValid,
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

test("notification targets are captured from the verified displayed snapshot, never future events",()=>{
 const snap=normalizeWorkspaceTeamSnapshot({last_seen_event_id:8,unread_count:3,latest_event_id:11});
 assert.equal(workspaceTeamAcknowledgementTarget(snap),11);
 for(const value of [null,{lastSeen:0,unread:0,latest:1},{lastSeen:10,unread:2,latest:11}])
  assert.throws(()=>workspaceTeamAcknowledgementTarget(value));
 for(const value of [{last_seen_event_id:0,unread_count:1,latest_event_id:null},
  {last_seen_event_id:2,unread_count:5,latest_event_id:4}])
  assert.throws(()=>normalizeWorkspaceTeamSnapshot(value));
});
test("activity date range uses inclusive UTC days and rejects invalid or reversed ranges",()=>{
 const row={...event(1),created_at:"2026-11-24T00:30:00+03:00"};
 assert.equal(workspaceTeamActivityDateMatches(row,"2026-11-23","2026-11-23"),true);
 assert.equal(workspaceTeamActivityDateMatches(row,"2026-11-24",""),false);
 assert.equal(workspaceTeamActivityDateRangeValid("",""),true);
 assert.equal(workspaceTeamActivityDateRangeValid("2026-11-23","2026-11-24"),true);
 assert.equal(workspaceTeamActivityDateRangeValid("2026-11-25","2026-11-24"),false);
 assert.equal(workspaceTeamActivityDateRangeValid("2026-02-30",""),false);
});
test("activity CSV rejects foreign and duplicate rows, protects Unicode formulas",()=>{
 for(const rows of [[event(1,"foreign")],[event(1),event(1)]])
  assert.throws(()=>buildWorkspaceTeamActivityCsv(rows,owner,{}, {},sid));
 const csv=buildWorkspaceTeamActivityCsv([event(1)],owner,{task:"＝SUM(1,2)"},{},sid);
 assert.ok(csv.includes("\"'＝SUM"));
});
test("UI binds acknowledgement to captured cursor, fences stale reads and unlocks history on head change",()=>{
 const s=readFileSync(new URL("../src/components/workspace/WorkspaceTeamLiveFeed.tsx",import.meta.url),"utf8");
 const mark=s.slice(s.indexOf("const markSeen="),s.indexOf("const history="));
 assert.ok(mark.includes("p_event_id:target"));
 assert.ok(!mark.includes('rpc("workspace_team_notification_snapshot"'));
 assert.ok(mark.includes("markLock.current=true"));
 assert.ok(s.includes("read===snapshotEpoch.current"));
 assert.ok(s.includes("historyEpoch.current++;historyLock.current=false;setHistoryLoading(false);"));
 assert.ok(s.includes("const isNew=unread!==null&&"));
 assert.ok(s.includes("Reset activity filters"));
});
