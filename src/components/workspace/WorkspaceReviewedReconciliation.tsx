import { useMemo, useState } from "react";
import { CheckSquare, Download, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createWorkspaceReviewedReconciliation,
  emptyWorkspaceReviewSelection,
  selectWorkspaceReviewRecord,
  WORKSPACE_RECONCILIATION_PAGE_SIZE,
  fingerprintWorkspaceReviewSnapshot,
} from "@/lib/workspaceReconciliation.mjs";
import { fetchWorkspaceReviewSnapshot } from "@/lib/workspaceReconciliationReader.mjs";
import { sha256Hex } from "@/lib/workspaceImportRecovery.mjs";
import { supabase } from "@/integrations/supabase/client";

type ReviewTarget={sessionId:string;sourceHash:string;projectId:string;projectName:string};
type ReviewChoice="sourceTasks" | "currentTasks" | "sourceItems" | "currentItems";
type ReviewSelection=Record<ReviewChoice,number[]>;
type TaskRow={title:string;details?:string;status:string;priority?:string;
  checklist?:Array<{title:string;done:boolean}>};
type ItemRow={title:string;kind:string;note_text?:string|null;target_url?:string|null};
type Snapshot={tasks:Array<TaskRow & {id:string;owner_id:string;project_id:string}>;
  items:Array<ItemRow & {id:string;owner_id:string;project_id:string}>;
  steps:Array<{id:string;task_id:string;title:string;done:boolean;owner_id:string}>};
const groups: Array<{key:ReviewChoice;label:string}>=[
  {key:"sourceTasks",label:"Original archive tasks"},
  {key:"currentTasks",label:"Current project tasks"},
  {key:"sourceItems",label:"Original archive notes and links"},
  {key:"currentItems",label:"Current project notes and links"},
];
const failureText=(value:unknown)=>value instanceof Error?value.message:"Reviewed recovery failed";

export default function WorkspaceReviewedReconciliation({
  target,owner,rawSource,sourceBytes,sourceArchive,snapshot,initialFingerprint,disabled,onDone,
}:{
  target:ReviewTarget; owner:string; rawSource:string; sourceBytes:Uint8Array;
  sourceArchive:{tasks:TaskRow[];items:ItemRow[]};
  snapshot:Snapshot; initialFingerprint:string; disabled:boolean;
  onDone:(message:string)=>void;
}) {
  const [selection,setSelection]=useState<ReviewSelection>(()=>emptyWorkspaceReviewSelection());
  const [pages,setPages]=useState<Record<ReviewChoice,number>>({
    sourceTasks:0,currentTasks:0,sourceItems:0,currentItems:0,
  });
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const currentItems=useMemo(()=>snapshot.items.filter(i=>i.kind==="note" || i.kind==="link"),[snapshot]);
  const data:Record<ReviewChoice,Array<TaskRow|ItemRow>>=useMemo(()=>({
    sourceTasks:sourceArchive.tasks,
    currentTasks:snapshot.tasks,
    sourceItems:sourceArchive.items,
    currentItems,
  }),[sourceArchive,snapshot,currentItems]);
  const total=groups.reduce((sum,g)=>sum+selection[g.key].length,0);
  const selectedTasks=selection.sourceTasks.length+selection.currentTasks.length;
  const selectedItems=selection.sourceItems.length+selection.currentItems.length;

  const toggle=(key:ReviewChoice,index:number,enabled:boolean)=>
    setSelection(old=>selectWorkspaceReviewRecord(old,key,index,enabled));
  const selectPage=(key:ReviewChoice,enabled:boolean)=>{
    const first=pages[key]*WORKSPACE_RECONCILIATION_PAGE_SIZE;
    const last=Math.min(data[key].length,first+WORKSPACE_RECONCILIATION_PAGE_SIZE);
    setSelection(old=>{
      let next=old;
      for(let i=first;i<last;i++)next=selectWorkspaceReviewRecord(next,key,i,enabled);
      return next;
    });
  };

  const download=async()=>{
    if(disabled || busy || !total) return;
    if(selectedTasks>1000 || selectedItems>1000) {
      setError("Reviewed recovery is limited to 1,000 chosen tasks and 1,000 notes/links.");
      return;
    }
    if(!window.confirm(
      "Create a NEW private project archive containing ONLY your " + total +
      " explicitly selected records? Original " + selectedTasks +
      " selected tasks will preserve their included checklist steps. " +
      "Current tasks preserve their saved checklist steps too. " +
      "Private FILE CONTENTS and FILE MANIFESTS are EXCLUDED. " +
      "Both existing projects remain unchanged. Download this reviewed archive?"
    ))return;
    setBusy(true);setError("");
    try{
      // Re-query the entire owner-scoped project, including steps. Any drift
      // since the user reviewed these exact records invalidates the plan.
      const fresh=await fetchWorkspaceReviewSnapshot(supabase,owner,target.projectId);
      if(fresh.fingerprint!==initialFingerprint)
        throw new Error("Current project changed since review. No archive was downloaded. Reopen the comparison to review the latest work.");
      if(await sha256Hex(sourceBytes)!==target.sourceHash)
        throw new Error("Original archive bytes no longer match this import. No recovery was downloaded.");
      const fork=await createWorkspaceReviewedReconciliation({
        rawSource,sourceBytes,sourceSha256:target.sourceHash,
        snapshot, snapshotSha256:initialFingerprint,
        owner,projectId:target.projectId,selection,
        forkId:crypto.randomUUID(),createdAt:new Date().toISOString(),
      });
      // Last local check: never claim a successful fork based on a stale
      // helper response or data from a different signed-in account.
      if(await fingerprintWorkspaceReviewSnapshot(snapshot,owner,target.projectId)!==initialFingerprint)
        throw new Error("Review snapshot verification failed");
      const blob=new Blob([fork.content],{type:"application/json;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;
      link.download="eternyx-reviewed-recovery-"+fork.fingerprint.slice(0,12)+".json";
      link.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),30000);
      onDone("Reviewed recovery download started: "+fork.taskCount+" tasks, "+
        fork.stepCount+" steps and "+fork.itemCount+" notes/links, no file bytes. "+
        "Choose that exact downloaded archive in Restore an export to create a NEW private project. "+
        "Neither original project was changed.");
    }catch(failure){setError(failureText(failure));}
    finally{setBusy(false);}
  };

  return <section className="space-y-3 rounded-lg border border-border p-3"
    aria-label="Record-by-record reviewed reconciliation">
    <div className="flex flex-wrap items-center gap-2 font-medium">
      <CheckSquare className="h-4 w-4 text-cyan-400" aria-hidden="true"/>
      Build a reviewed reconciliation archive
    </div>
    <p className="text-xs leading-5 text-muted-foreground">
      Choose individual ORIGINAL or CURRENT records below. Nothing is preselected,
      and duplicate names are kept separate. Selected current tasks retain saved
      checklist steps. No existing task, note or project is edited.
    </p>
    {groups.map(({key,label})=>{
      const rows=data[key],page=pages[key];
      const start=page*WORKSPACE_RECONCILIATION_PAGE_SIZE;
      const end=Math.min(rows.length,start+WORKSPACE_RECONCILIATION_PAGE_SIZE);
      return <div key={key} className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-xs">{label}: {selection[key].length} selected of {rows.length}</strong>
          <div className="flex flex-wrap gap-1">
            <Button type="button" size="sm" variant="outline" disabled={busy||disabled||!rows.length}
              onClick={()=>selectPage(key,true)}>Select shown</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy||disabled||!rows.length}
              onClick={()=>selectPage(key,false)}>Clear shown</Button>
          </div>
        </div>
        {rows.slice(start,end).map((row,i)=>{
          const index=start+i;
          const isTask=key==="sourceTasks"||key==="currentTasks";
          const task=row as TaskRow,item=row as ItemRow;
          return <label key={key+index} className="flex cursor-pointer items-start gap-2 rounded-md border border-border/50 p-2 text-xs">
            <input type="checkbox" className="mt-0.5 accent-cyan-500"
              aria-label={"Include "+label+" record "+(index+1)+": "+row.title}
              checked={selection[key].includes(index)}
              disabled={disabled||busy}
              onChange={event=>toggle(key,index,event.target.checked)}/>
            <span className="min-w-0 flex-1 break-words">
              <strong className="block">{index+1}. {row.title}</strong>
              <span className="block text-muted-foreground">
                {isTask
                  ? task.status+" · "+(task.priority??"normal")+
                    (task.details?" · "+task.details.slice(0,180):"")+
                    (key==="sourceTasks"?" · "+(task.checklist?.length??0)+" source checklist steps":"")
                  : item.kind+" · "+String(item.kind==="note"?item.note_text??"":item.target_url??"").slice(0,180)}
              </span>
            </span>
          </label>;
        })}
        {!rows.length && <p className="text-xs text-muted-foreground">No eligible records.</p>}
        {rows.length>WORKSPACE_RECONCILIATION_PAGE_SIZE &&
          <div className="flex items-center gap-2 text-xs">
            <Button type="button" size="sm" variant="outline" disabled={page===0||busy}
              onClick={()=>setPages(prev=>({...prev,[key]:page-1}))}>Previous</Button>
            <span>Page {page+1}/{Math.ceil(rows.length/WORKSPACE_RECONCILIATION_PAGE_SIZE)}</span>
            <Button type="button" size="sm" variant="outline" disabled={end>=rows.length||busy}
              onClick={()=>setPages(prev=>({...prev,[key]:page+1}))}>Next</Button>
          </div>}
      </div>;
    })}
    <p className="text-xs font-medium" role="status">
      Selected: {selectedTasks} tasks, {selectedItems} notes/links.
      This will create a separate v3 metadata archive.
    </p>
    <p className="text-xs text-amber-400">
      <ShieldAlert className="mr-1 inline h-3.5 w-3.5" aria-hidden="true"/>
      Private files (original or current) are excluded. Preserve their bytes with
      the existing complete project backup before using this feature. Historical
      revisions, activity and original completion timestamps are not restored.
    </p>
    {error&&<p role="alert" className="text-xs break-words text-destructive">{error}</p>}
    <Button type="button" size="sm" disabled={!total||busy||disabled||
      selectedTasks>1000||selectedItems>1000} onClick={()=>void download()}>
      <Download className="mr-1 h-4 w-4" aria-hidden="true"/>
      Download reviewed selections as NEW project archive
    </Button>
  </section>;
}
