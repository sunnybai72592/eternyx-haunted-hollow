import { fetchWorkspaceChecklistSnapshot } from "./workspaceChecklistPaging.mjs";
import {
  WORKSPACE_RECONCILIATION_MAX_ITEMS,
  WORKSPACE_RECONCILIATION_MAX_TASKS,
  fingerprintWorkspaceReviewSnapshot,
} from "./workspaceReconciliation.mjs";

// Exact-count, RLS-filtered pagination; a short or shifted page is an error.
// A comparison is never called "complete" if a backend result is truncated.
async function exactRows(client,table,columns,owner,projectId,max,pageSize) {
  const rows=[], ids=new Set();
  let expected=null;
  for(let start=0;start<=max;start+=pageSize) {
    const {data,count,error}=await client.from(table).select(columns,{count:"exact"})
      .eq("owner_id",owner).eq("project_id",projectId)
      .order("id",{ascending:true}).range(start,start+pageSize-1);
    if(error) throw new Error("Could not review "+table+": "+error.message);
    if(!Array.isArray(data) || !Number.isSafeInteger(count) || count<0 || count>max)
      throw new Error("Project is too large or its exact row count is unavailable");
    if(expected===null)expected=count;
    if(count!==expected || data.length>pageSize || rows.length+data.length>count)
      throw new Error("Project records changed while reading; refresh the review");
    for(const row of data) {
      if(!row || typeof row.id!=="string" || !row.id || ids.has(row.id) ||
         row.owner_id!==owner || row.project_id!==projectId)
        throw new Error("Review returned a foreign, repeated or invalid record");
      ids.add(row.id);rows.push(row);
    }
    if(rows.length===count)return rows;
    if(data.length!==pageSize)
      throw new Error("Project review returned a truncated page; no archive created");
  }
  throw new Error("Project review was not complete");
}

export async function fetchWorkspaceReviewSnapshot(client,owner,projectId,pageSize=200) {
  if(!client || typeof owner!=="string" || !owner ||
     typeof projectId!=="string" || !projectId ||
     !Number.isSafeInteger(pageSize) || pageSize<1 || pageSize>500)
    throw new Error("A valid private project and pagination are required");
  const {data:project,error:projectError}=await client.from("workspace_projects")
    .select("id,owner_id,status").eq("owner_id",owner).eq("id",projectId).single();
  if(projectError || !project || project.owner_id!==owner || project.id!==projectId)
    throw new Error("Cannot review a project outside the signed-in account");
  const [tasks,items]=await Promise.all([
    exactRows(client,"workspace_tasks",
      "id,owner_id,project_id,title,details,status,priority,due_on,updated_at,completed_at",
      owner,projectId,WORKSPACE_RECONCILIATION_MAX_TASKS,pageSize),
    exactRows(client,"workspace_items",
      "id,owner_id,project_id,kind,title,note_text,target_url,file_size,mime_type,storage_path,updated_at",
      owner,projectId,WORKSPACE_RECONCILIATION_MAX_ITEMS,pageSize),
  ]);
  // All owned current steps or a failure; never silently omit later pages.
  const steps=await fetchWorkspaceChecklistSnapshot(client,owner,tasks);
  const snapshot={tasks,items,steps};
  return {
    project:{id:project.id,status:project.status},
    snapshot,
    fingerprint:await fingerprintWorkspaceReviewSnapshot(snapshot,owner,projectId),
  };
}
