import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CheckCheck, FileCheck, FileWarning, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES } from "@/lib/workspaceFullBackup.mjs";
import { verifyWorkspaceReviewedArchive } from "@/lib/workspaceReconciliationVerification.mjs";

type Receipt=Database["public"]["Tables"]["workspace_reconciliation_receipts"]["Row"];
const PAGE_SIZE=10;
const errorText=(value:unknown)=>value instanceof Error?value.message:"Cannot verify recovery history";

export default function WorkspaceReconciliationJournal({owner,disabled,refreshKey}:{
  owner:string;disabled:boolean;refreshKey:number;
}) {
  const [rows,setRows]=useState<Receipt[]>([]);
  const [page,setPage]=useState(0);
  const [total,setTotal]=useState(0);
  const [busy,setBusy]=useState(false);
  const [verifying,setVerifying]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [target,setTarget]=useState<Receipt|null>(null);
  const picker=useRef<HTMLInputElement>(null);
  const generation=useRef(0);

  const load=async(nextPage:number)=>{
    const token=++generation.current;
    setBusy(true);
    setError("");
    try {
      const {data,count,error:queryError}=await supabase.from("workspace_reconciliation_receipts")
        .select("*",{count:"exact"}).eq("owner_id",owner)
        .order("created_at",{ascending:false}).order("id",{ascending:false})
        .range(nextPage*PAGE_SIZE,(nextPage+1)*PAGE_SIZE-1);
      if(queryError || !Array.isArray(data) || !Number.isSafeInteger(count))
        throw new Error(queryError?.message??"Private history query did not return exact results");
      if(token!==generation.current)return;
      setRows(data as Receipt[]);
      setPage(nextPage);
      setTotal(count??0);
    }catch(err) {
      if(token===generation.current)setError(errorText(err));
    }finally {
      if(token===generation.current)setBusy(false);
    }
  };

  useEffect(()=>{
    setRows([]);setPage(0);setTotal(0);setTarget(null);setStatus("");setError("");
    void load(0);
    return ()=>{generation.current++;};
  },[owner,refreshKey]);

  const open=(row:Receipt)=>{
    if(disabled || verifying)return;
    setTarget(row);setStatus("");setError("");
    if(picker.current)picker.current.value="";
    picker.current?.click();
  };

  const verify=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0],row=target;
    if(!file || !row)return;
    setError("");setStatus("");
    if(file.size<1 || file.size>WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES){
      setError("Choose a reviewed archive no larger than 24 MiB");
      return;
    }
    setVerifying(true);
    try{
      const bytes=new Uint8Array(await file.arrayBuffer());
      const raw=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
      // Actual local bytes must match the owner-only saved preparation
      // receipt, then the selected records and checklist digest must match.
      const checked=await verifyWorkspaceReviewedArchive(raw,row.archive_sha256,bytes);
      if(!checked.verifiedPayload ||
         checked.payloadSha256!==row.payload_sha256 ||
         checked.sourceSha256!==row.source_sha256 ||
         checked.snapshotSha256!==row.snapshot_sha256 ||
         checked.taskCount!==row.source_tasks+row.current_tasks ||
         checked.itemCount!==row.source_items+row.current_items ||
         checked.stepCount!==row.checklist_steps ||
         checked.excludedFiles!==row.excluded_files ||
         checked.selected.source_tasks!==row.source_tasks ||
         checked.selected.current_tasks!==row.current_tasks ||
         checked.selected.source_items!==row.source_items ||
         checked.selected.current_items!==row.current_items){
        throw new Error("Saved archive metadata differs from the recorded preparation receipt");
      }
      setStatus("Local verification passed: exact archive SHA-256 and selected payload "+
        "match this account's preparation receipt. This is NOT a signed authenticity check "+
        "or proof of a past successful download.");
    }catch(err){
      setError(errorText(err));
    }finally {
      setVerifying(false);setTarget(null);
      if(picker.current)picker.current.value="";
    }
  };

  return <section className="space-y-3 border-t border-border pt-4"
    aria-label="Private reviewed recovery history">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 font-semibold">
        <History className="h-4 w-4 text-cyan-400" aria-hidden="true"/>
        Reviewed recovery history
      </h3>
      <Button size="sm" type="button" variant="outline" disabled={busy||disabled||verifying}
        onClick={()=>void load(0)}>
        <RefreshCw className="mr-1 h-4 w-4"/>Refresh
      </Button>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">
      Owner-only server preparation receipts. No saved task text, private file bytes
      or Storage paths. Records are client-reported digests, not signed proof of
      authenticity or confirmation a download completed.
    </p>
    <input ref={picker} type="file" accept=".json,application/json"
      className="sr-only" aria-label="Choose locally saved reviewed archive to verify"
      onChange={event=>void verify(event)}/>
    {error && <p role="alert" className="break-words text-xs text-destructive">
      <FileWarning className="mr-1 inline h-3.5 w-3.5"/>{error}
    </p>}
    {status && <p role="status" className="break-words text-xs text-cyan-300">
      <CheckCheck className="mr-1 inline h-3.5 w-3.5"/>{status}
    </p>}
    {busy && <p role="status" className="text-xs text-muted-foreground">
      Reading private preparation history…
    </p>}
    {verifying && <p role="status" className="text-xs text-muted-foreground">
      Checking the selected local file, SHA-256 and record contents…
    </p>}
    <div className="space-y-2">
      {rows.map(row=><div key={row.id}
        className="space-y-2 rounded-lg border border-border p-3 text-xs">
        <p className="font-medium">Prepared {new Date(row.created_at).toLocaleString()}</p>
        <p className="text-muted-foreground">
          Original {row.source_tasks} tasks, {row.source_items} notes/links ·
          Current {row.current_tasks} tasks, {row.current_items} notes/links ·
          {row.checklist_steps} steps
        </p>
        <p className="text-muted-foreground">
          {row.excluded_files} private file entries excluded
        </p>
        <p className="break-all text-muted-foreground">
          Archive SHA-256: {row.archive_sha256.slice(0,20)}…
        </p>
        <Button size="sm" variant="outline" type="button"
          disabled={disabled||busy||verifying} onClick={()=>open(row)}>
          <FileCheck className="mr-1 h-3.5 w-3.5"/> Verify a saved local archive
        </Button>
      </div>)}
      {!rows.length && !busy && <p className="text-xs text-muted-foreground">
        No preparation receipts on this page. A reviewed recovery will appear here
        after a server-confirmed preparation.
      </p>}
    </div>
    {total>PAGE_SIZE && <div className="flex flex-wrap items-center gap-2 text-xs">
      <Button size="sm" variant="outline" disabled={busy||page===0}
        onClick={()=>void load(page-1)}>Previous</Button>
      <span>Page {page+1} of {Math.ceil(total/PAGE_SIZE)} · {total} records</span>
      <Button size="sm" variant="outline" disabled={busy||(page+1)*PAGE_SIZE>=total}
        onClick={()=>void load(page+1)}>Next</Button>
    </div>}
  </section>;
}
