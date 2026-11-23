import { useEffect, useRef, useState } from "react";
import { Activity, Download, ShieldAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { checkWorkspaceReadiness, workspaceReadinessSafeReport } from "@/lib/workspaceReadiness.mjs";

type Check = {key:string; title:string; status:"pass"|"fail";detail:string};
type Report = { format:string; version:number; checked_at:string;
  release_gate:string; summary?:{pass:number;fail:number};
  checks:Check[]; limitations?:string };
export default function WorkspaceReadinessPanel({
  owner, disabled,
}: {owner:string;disabled:boolean}) {
  const [report,setReport]=useState<Report|null>(null);
  const [reportOwner,setReportOwner]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const ownerRef=useRef(owner);
  const nonce=useRef(0);
  if(ownerRef.current!==owner) {
    ownerRef.current=owner;
    nonce.current++;
  }
  useEffect(()=>{
    nonce.current++;
    setReport(null);
    setReportOwner(null);
    setBusy(false);
    setError("");
  },[owner]);
  const visibleReport=reportOwner===owner?report:null;
  const check=async()=>{
    if(disabled || busy || !owner)return;
    const token=++nonce.current;
    setBusy(true);setError("");setReport(null);setReportOwner(null);
    try {
      const result=await checkWorkspaceReadiness(supabase,owner);
      if(nonce.current!==token || ownerRef.current!==owner)return;
      setReport(result as Report);
      setReportOwner(owner);
    } catch {
      if(nonce.current===token && ownerRef.current===owner)
        setError("Workspace reachability could not be checked. No project data was modified.");
    } finally {
      if(nonce.current===token && ownerRef.current===owner)setBusy(false);
    }
  };
  const download=()=>{
    if(!visibleReport)return;
    const body=workspaceReadinessSafeReport(visibleReport);
    const url=URL.createObjectURL(new Blob([body],{type:"application/json"}));
    const link=document.createElement("a");
    link.href=url;link.download="eternyx-workspace-readiness.json";link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  };
  return <section className="space-y-3 border-t border-border pt-4"
    aria-label="Workspace read-only release readiness check">
    <h3 className="flex items-center gap-2 font-semibold">
      <Activity className="h-4 w-4 text-cyan-400" aria-hidden="true"/>
      Workspace deployment readiness
    </h3>
    <p className="text-xs leading-5 text-muted-foreground">
      Probe actual account-scoped Auth, project/task/checklist, import,
      reconciliation and private Storage API reachability. All checks are
      read-only; no test project or Storage object is created.
    </p>
    <Button size="sm" variant="outline" type="button" disabled={disabled||busy}
      onClick={()=>void check()}>
      <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true"/>
      {busy?"Checking account and APIs…":"Run read-only checks"}
    </Button>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {visibleReport&&<div className="space-y-3 rounded-lg border border-border p-3 text-xs">
      <p role="status" className={visibleReport.release_gate==="blocked"?
        "text-amber-400 font-medium":"text-cyan-300 font-medium"}>
        {visibleReport.release_gate==="blocked"?"Read-only readiness blocked":
          "API reachability confirmed — manual release review still required"} ·
        {" "+(visibleReport.summary?.pass??0)} passed, {visibleReport.summary?.fail??0} failed
      </p>
      <p className="text-muted-foreground">
        Checked {new Date(visibleReport.checked_at).toLocaleString()}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {visibleReport.checks.map(entry=><div key={entry.key}
          className="rounded-md border border-border/70 p-2">
          <p className={entry.status==="pass"?"text-cyan-300":"text-amber-400"}>
            {entry.status==="pass"?"Reachable":"Could not verify"} · {entry.title}
          </p>
          <p className="text-muted-foreground">{entry.detail}</p>
        </div>)}
      </div>
      <p className="flex items-start gap-2 text-amber-400">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/>
        No cross-account RLS tests, real restore, private file byte checks or
        production migration audit were performed here. Passing is NOT
        production certification.
      </p>
      <Button size="sm" type="button" variant="outline" onClick={download}>
        <Download className="mr-1 h-4 w-4" aria-hidden="true"/>
        Download metadata-only check results
      </Button>
    </div>}
  </section>;
}
