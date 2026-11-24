// A bounded on-demand portfolio; no task bodies, member IDs or data from unverified teams.
import {verifyWorkspaceTeamSpacePage,verifyWorkspaceTeamCompletePage,verifyWorkspaceTeamDetails} from "./workspaceTeamAccess.mjs";
import {workspaceTeamWorkload,workspaceTeamTaskDueBucket,csvCell} from "./workspaceTeamTaskOperations.mjs";
import {workspaceValidGregorianDay} from "./workspaceTeamUtils.mjs";
export const WORKSPACE_PORTFOLIO_BATCH=5;
export function workspacePortfolioDirectory(spaces,{query="",status="all",page=0}={}){
  verifyWorkspaceTeamSpacePage(spaces,spaces?.length,150);
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

export function workspacePortfolioScope(owner,today,spaces){
  if(typeof owner!=="string"||!owner||!workspaceValidGregorianDay(today)||
    !Array.isArray(spaces)||spaces.length>WORKSPACE_PORTFOLIO_BATCH)
    throw Error("Invalid portfolio review scope");
  verifyWorkspaceTeamSpacePage(spaces,spaces.length,WORKSPACE_PORTFOLIO_BATCH);
  return JSON.stringify([owner,today,spaces.map(s=>[s.id,s.owner_id,s.status,s.name])]);
}
export function workspacePortfolioReportRows(results,expectedIds,sort="name"){
  const totals=workspacePortfolioTotals(results,expectedIds);
  if(!totals)throw Error("Complete verified portfolio page required");
  if(!["name","overdue","urgent","mine"].includes(sort)||
    results.some(r=>typeof r.name!=="string"||!r.name.trim()||r.name.length>120||
      !["active","archived"].includes(r.status)||!["owner","editor","viewer"].includes(r.role)||
      !Number.isSafeInteger(r.memberCount)||r.memberCount<1||r.memberCount>20))
    throw Error("Invalid portfolio report metadata");
  return [...results].sort((a,b)=>(sort==="name"?0:b[sort]-a[sort])||
    a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
export function buildWorkspacePortfolioCsv(results,expectedIds,today,reviewedAt,sort="name"){
  if(!workspaceValidGregorianDay(today)||typeof reviewedAt!=="string"||
    !Number.isFinite(Date.parse(reviewedAt)))throw Error("Invalid portfolio report timestamp");
  const rows=workspacePortfolioReportRows(results,expectedIds,sort);
  const header=["Team","Team status","My role","Members","Tasks","Completed","Open","Overdue","Urgent open","My open","Unassigned open","Local reference day","Review completed UTC"];
  const body=rows.map(r=>[r.name,r.status,r.role,r.memberCount,r.total,r.done,r.open,r.overdue,r.urgent,r.mine,r.unassigned,today,new Date(reviewedAt).toISOString()]);
  return "\uFEFF"+[header,...body].map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";
}
