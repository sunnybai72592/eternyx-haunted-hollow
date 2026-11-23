import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyWorkspaceTeamCompletePage,isWorkspaceActionCurrent}
 from "../src/lib/workspaceTeamAccess.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const members=[{user_id:owner},{user_id:other}],tasks=[{id:"task-1"},{id:"task-2"}];
const component=()=>readFileSync(new URL(
 "../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
test("accurate 20-member and 500-task pages are accepted only with exact totals",()=>{
 assert.deepEqual(verifyWorkspaceTeamCompletePage("members",members,2,20,"user_id"),members);
 assert.deepEqual(verifyWorkspaceTeamCompletePage("tasks",tasks,2,500,"id"),tasks);
 assert.deepEqual(verifyWorkspaceTeamCompletePage("tasks",[],0,500,"id"),[]);
 const full=Array.from({length:20},(_,i)=>({user_id:"member-"+i}));
 assert.equal(verifyWorkspaceTeamCompletePage("members",full,20,20,"user_id").length,20);
});
test("truncated, missing or noninteger server counts fail closed",()=>{
 for(const count of [3,21,NaN,-1,null,undefined,1.5,999999])
   assert.throws(()=>verifyWorkspaceTeamCompletePage("members",members,count,20,"user_id"),
     /incomplete or untrusted/);
 assert.throws(()=>verifyWorkspaceTeamCompletePage("tasks",tasks,501,500,"id"));
 assert.throws(()=>verifyWorkspaceTeamCompletePage("tasks",tasks,1,500,"id"));
});
test("duplicate/missing/foreign identities and wrong page contract fail closed",()=>{
 for(const bad of [[members[0],members[0]],[members[0],{user_id:""}],
                   [null,members[1]],[members[0],{id:"foreign"}]])
   assert.throws(()=>verifyWorkspaceTeamCompletePage("members",bad,2,20,"user_id"));
 assert.throws(()=>verifyWorkspaceTeamCompletePage("tasks",[{id:"a"},{id:"a"}],2,500,"id"));
 assert.throws(()=>verifyWorkspaceTeamCompletePage("wrong",members,2,20,"user_id"));
 assert.throws(()=>verifyWorkspaceTeamCompletePage("members",members,2,0,"user_id"));
});
test("action receipts require the same user and unchanged generation",()=>{
 assert.equal(isWorkspaceActionCurrent(owner,owner,5,5),true);
 assert.equal(isWorkspaceActionCurrent(owner,other,5,5),false);
 assert.equal(isWorkspaceActionCurrent(owner,owner,5,6),false);
 assert.equal(isWorkspaceActionCurrent(owner,owner,0,0),false);
 assert.equal(isWorkspaceActionCurrent("","",1,1),false);
 assert.equal(isWorkspaceActionCurrent(owner,owner,1.1,1.1),false);
});
test("server queries use exact counts for full team lists",()=>{
 const source=component();
 for(const anchor of [
  'supabase.from("workspace_team_members").select("*",{count:"exact"})',
  'supabase.from("workspace_team_tasks").select("*",{count:"exact"})',
  '"members",m.data,m.count,20,"user_id"',
  '"tasks",t.data,t.count,500,"id"',
  'members:verifiedMembers,tasks:verifiedTasks,events:e.data,',
  'setMembers(verifiedMembers as Member[]);',
  'if(!Array.isArray(e.data)||!Array.isArray(i.data))',
 ])assert.ok(source.includes(anchor),anchor);
});
test("synchronous lock, owner epoch and late-response quarantine stay wired",()=>{
 const source=component();
 for(const anchor of [
  "const actionBusyRef=useRef(false);","const actionEpoch=useRef(0);",
  "if(disabled||actionBusyRef.current)return;","actionBusyRef.current=true;",
  "const epoch=++actionEpoch.current;",
  "const current=()=>isWorkspaceActionCurrent(",
  "actionEpoch.current++;actionBusyRef.current=false;setBusy(false);",
  "const result=await action();","onConfirmed?.(result);",
  "if(current()){actionBusyRef.current=false;setBusy(false);}",
 ])assert.ok(source.includes(anchor),anchor);
 const run=source.slice(source.indexOf("const run=async("),source.indexOf("const createTeam="));
 assert.ok(run.indexOf("onConfirmed?.(result);")>run.indexOf("if(refreshAfter)await refresh();"));
 assert.ok(run.indexOf("onConfirmed?.(result);")>run.lastIndexOf("await assureOwner(initialOwner);"));
});
test("invite secrets and saved drafts are published only in confirmed callbacks",()=>{
 const source=component();
 const invite=source.slice(source.indexOf("const invite=()=>"),source.indexOf("const saveTask="));
 assert.ok(invite.indexOf("return receipt;")>0);
 assert.ok(invite.indexOf("return receipt;")<invite.indexOf("setRevealedToken({token:receipt.token"));
 const save=source.slice(source.indexOf("const saveTask="),source.indexOf("const editTask="));
 assert.ok(save.includes('true,\n    ()=>setDraft(freshDraft())'));
 assert.ok(!save.includes('setDraft(freshDraft());'));
});
test("first team selection is not fabricated as revocation; stale refresh is not success",()=>{
 const source=component();
 assert.ok(source.includes("if(selectedId && !rows.some(space=>space.id===selectedId))"));
 assert.ok(source.includes('if(!snapshot)throw Error("Team verification was superseded by another refresh")'));
});
