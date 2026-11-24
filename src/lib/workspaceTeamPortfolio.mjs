// A bounded on-demand portfolio; no task bodies, member IDs or data from unverified teams.
import {verifyWorkspaceTeamSpacePage,verifyWorkspaceTeamCompletePage,verifyWorkspaceTeamDetails} from "./workspaceTeamAccess.mjs";
import {workspaceTeamWorkload,workspaceTeamTaskDueBucket} from "./workspaceTeamTaskOperations.mjs";
import {workspaceValidGregorianDay} from "./workspaceTeamUtils.mjs";
export const WORKSPACE_PORTFOLIO_BATCH=5;
export function workspacePortfolioDirectory(spaces,{query="",status="all",page=0}={}){
  verifyWorkspaceTeamSpacePage(spaces,spaces?.length);
  if(typeof query!=="string"||query.length>120||!["all","active","archived"].includes(status)||
    !Number.isSafeInteger(page)||page<0||spaces.some(s=>typeof s.name!=="string"||!s.name.trim()))
    throw Error("Invalid portfolio directory");
  const term=query.trim().toLocaleLowerCase();
  const filtered=spaces.filter(s=>(status==="all"||s.status===status)&&s.name.toLocaleLowerCase().includes(term))
    .sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  const pages=Math.max(1,Math.ceil(filtered.length/WORKSPACE_PORTFOLIO_BATCH));
  const current=Math.min(page,pages-1);
  return {rows:filtered.slice(current*WORKSPACE_PORTFOLIO_BATCH,(current+1)*WORKSPACE_PORTFOLIO_BATCH),
    total:filtered.length,page:current,pages};
}
export function workspacePortfolioTeam({space,owner,members,memberCount,tasks,taskCount,today}){
  verifyWorkspaceTeamSpacePage([space],1);
  if(typeof space.name!=="string"||!space.name.trim()||!workspaceValidGregorianDay(today))
    throw Error("Invalid team portfolio metadata");
  verifyWorkspaceTeamCompletePage("members",members,memberCount,20,"user_id");
  verifyWorkspaceTeamCompletePage("tasks",tasks,taskCount,500,"id");
  const role=verifyWorkspaceTeamDetails({space,owner,spaceId:space.id,members,tasks,events:[],invites:[]});
  workspaceTeamWorkload(tasks,members,owner,space.id,today);
  const open=tasks.filter(t=>t.status!=="done");
  return {id:space.id,name:space.name,status:space.status,role,memberCount,total:tasks.length,
    done:tasks.length-open.length,open:open.length,overdue:open.filter(t=>workspaceTeamTaskDueBucket(t,today)==="overdue").length,
    urgent:open.filter(t=>t.priority==="urgent").length,mine:open.filter(t=>t.assignee_id===owner).length,
    unassigned:open.filter(t=>t.assignee_id===null).length};
}
export function workspacePortfolioTotals(results,expectedIds){
  if(!Array.isArray(expectedIds)||expectedIds.length<1||expectedIds.length>WORKSPACE_PORTFOLIO_BATCH||
    expectedIds.some(id=>typeof id!=="string"||!id)||new Set(expectedIds).size!==expectedIds.length||
    !Array.isArray(results)||results.length!==expectedIds.length||
    new Set(results.map(r=>r?.id)).size!==results.length||
    results.some(r=>!expectedIds.includes(r?.id)))throw Error("Invalid portfolio result scope");
  const keys=["total","done","open","overdue","urgent","mine","unassigned"];
  if(results.some(r=>r.state!=="verified"))return null;
  const totals=Object.fromEntries(keys.map(k=>[k,0]));
  for(const r of results){
    if(keys.some(k=>!Number.isSafeInteger(r[k])||r[k]<0||r[k]>500)||
      r.open+r.done!==r.total||["overdue","urgent","mine","unassigned"].some(k=>r[k]>r.open))
      throw Error("Invalid portfolio metric");
    for(const k of keys)totals[k]+=r[k];
  }
  return totals;
}
