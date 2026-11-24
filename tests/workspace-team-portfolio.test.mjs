import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {workspacePortfolioDirectory,workspacePortfolioTeam,workspacePortfolioTotals,WORKSPACE_PORTFOLIO_BATCH} from "../src/lib/workspaceTeamPortfolio.mjs";
const owner="self",today="2026-11-24";
const space={id:"a",owner_id:owner,name:"Alpha",status:"active"};
const members=[{user_id:owner,space_id:"a",role:"owner"}];
const task=(id,patch={})=>({id,space_id:"a",status:"todo",priority:"normal",due_on:null,assignee_id:null,...patch});
const tasks=[task("a",{due_on:"2026-11-23",priority:"urgent",assignee_id:owner}),task("b",{status:"done"}),task("c")];
const input={space,owner,members,memberCount:1,tasks,taskCount:3,today};
test("directory search and status filters paginate deterministically without extra teams",()=>{
 const rows=[space,...Array.from({length:11},(_,i)=>({...space,id:String(i),name:"Beta "+String(i).padStart(2,"0"),status:i%2?"active":"archived"}))];
 const d=workspacePortfolioDirectory(rows,{query:" beta ",page:0});
 assert.equal(d.total,11);assert.equal(d.rows.length,WORKSPACE_PORTFOLIO_BATCH);assert.equal(d.pages,3);
 assert.equal(workspacePortfolioDirectory(rows,{query:"beta",page:99}).rows.length,1);
 assert.equal(workspacePortfolioDirectory(rows,{status:"archived"}).total,6);
 assert.throws(()=>workspacePortfolioDirectory([space,space]));
});
test("portfolio summaries require full scope, exact counts and current membership",()=>{
 const result=workspacePortfolioTeam(input);
 assert.deepEqual(result,{id:"a",name:"Alpha",status:"active",role:"owner",memberCount:1,total:3,done:1,open:2,overdue:1,urgent:1,mine:1,unassigned:1});
 for(const patch of [{memberCount:2},{taskCount:4},{members:[],memberCount:0},{tasks:[task("a",{space_id:"foreign"})],taskCount:1},{tasks:[tasks[0],tasks[0]],taskCount:2}])
  assert.throws(()=>workspacePortfolioTeam({...input,...patch}));
 assert.ok(!JSON.stringify(result).includes(owner));
});
test("page totals only exist when every requested team is verified",()=>{
 const row={...workspacePortfolioTeam(input),state:"verified"};
 assert.equal(workspacePortfolioTotals([row],["a"]).total,3);
 assert.equal(workspacePortfolioTotals([row,{id:"b",state:"unavailable"}],["a","b"]),null);
 assert.throws(()=>workspacePortfolioTotals([row],["b"]));
 assert.throws(()=>workspacePortfolioTotals([row,row],["a","b"]));
 assert.throws(()=>workspacePortfolioTotals([{...row,overdue:3}],["a"]));
});
test("portfolio permits genuine empty authorized teams but never treats failure as empty",()=>{
 const row={...workspacePortfolioTeam({...input,tasks:[],taskCount:0}),state:"verified"};
 assert.equal(workspacePortfolioTotals([row],["a"]).total,0);
 assert.equal(workspacePortfolioTotals([{id:"a",state:"unavailable"}],["a"]),null);
});
test("portfolio client uses bounded reads, post-read membership check and invalidates old requests",()=>{
 const s=readFileSync(new URL("../src/components/workspace/WorkspaceTeamPortfolio.tsx",import.meta.url),"utf8");
 for(const anchor of ['.eq("space_id",id).limit(20)','.eq("space_id",id).limit(500)',
  '.eq("space_id",id).eq("user_id",owner).single()',"await checkOwner()","if(!current())return;",
  'epoch.current++;lock.current=false;','output.push({id,state:"unavailable"})','workspacePortfolioTotals(results,ids)'])
  assert.ok(s.includes(anchor),anchor);
 assert.ok(!s.includes(".rpc(")&&!s.includes(".insert(")&&!s.includes("localStorage"));
 const panel=readFileSync(new URL("../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
 assert.ok(panel.includes("spaceListVerified&&!disabled&&!busy&&!loading&&spaces.length>0&&<WorkspaceTeamPortfolio"));
});
