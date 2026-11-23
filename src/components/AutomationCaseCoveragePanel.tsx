import {useState} from "react";
import {ScanSearch,Download,RefreshCcw,ShieldAlert,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Checkbox} from "@/components/ui/checkbox";
import {supabase} from "@/integrations/supabase/client";
import {verifiedCaseIntegrity} from "@/lib/automationCaseReadiness.mjs";
import {appendCaseCoverage,caseCoverageCsv} from "@/lib/automationCaseCoverage.mjs";

type Coverage=ReturnType<typeof appendCaseCoverage>;
type Integrity=ReturnType<typeof verifiedCaseIntegrity>;
async function invoke(action:string,params:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("automation-control",{
    body:{action,...params},
  });
  if(error){
    let reason="Audit coverage API unavailable; check migration and Edge deployment.";
    try{
      const response=error.context as Response;
      if(response&&typeof response.json==="function"){
        const body=await response.json();
        if(typeof body?.code==="string"&&body.code.length<=70)reason+=" ("+body.code+")";
      }
    }catch{/* safe message */}
    throw Error(reason);
  }
  if(!data||typeof data!=="object"||Array.isArray(data)){
    throw Error("Unexpected audit coverage response.");
  }
  return data as Record<string,unknown>;
}
function download(name:string,contents:string,type:string){
  const uri=URL.createObjectURL(new Blob([contents],{type}));
  const a=document.createElement("a");
  a.href=uri;a.download=name;document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(uri),0);
}
function displayDate(value:string){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"Unknown":date.toLocaleString();
}
export default function AutomationCaseCoveragePanel({disabled}:{disabled:boolean}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [coverage,setCoverage]=useState<Coverage|null>(null);
  const [details,setDetails]=useState<Integrity|null>(null);
  const [onlyIssues,setOnlyIssues]=useState(false);
  const [query,setQuery]=useState("");
  async function perform(action:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await action();}
    catch(err){setError(err instanceof Error?err.message:"Audit scan could not complete.");}
    finally{setBusy(false);}
  }
  async function loadInitial(){
    const res=await invoke("incidentCoveragePage",{pageSize:20});
    if(res.ok!==true||res.source!=="authenticated_server"||
      res.externalExecutionTriggered!==false){
      throw Error("Unverified owner audit page.");
    }
    const inspected=appendCaseCoverage(null,res);
    setCoverage(inspected);
    setDetails(null);
    setNotice("Started a fresh manual owner-case scan from the newest creation time.");
  }
  async function loadNext(){
    if(!coverage||coverage.complete||!coverage.nextCursor||
      coverage.pages.length>=50){
      throw Error("There is no remaining page within the 50-page inspection budget.");
    }
    const res=await invoke("incidentCoveragePage",{
      pageSize:20,
      beforeCreatedAt:coverage.nextCursor.beforeCreatedAt,
      beforeId:coverage.nextCursor.beforeId,
    });
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.externalExecutionTriggered!==false){
      throw Error("Owner audit continuation could not be verified.");
    }
    const combined=appendCaseCoverage(coverage,res);
    setCoverage(combined);
    setDetails(null);
    setNotice(combined.complete?
      "Reached end of available creation-order pages. This was NOT an atomic snapshot.":
      "Loaded one more actual owner-case page. Continue manually to inspect older cases.");
  }
  async function checkCase(incidentId:string){
    const res=await invoke("incidentLifecycleCheck",{incidentId});
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.incidentId!==incidentId||res.externalExecutionTriggered!==false){
      throw Error("Cannot verify the selected owner incident.");
    }
    setDetails(verifiedCaseIntegrity(res));
    setNotice("Checked exact current case ledger state, not a cached scan summary.");
  }
  const filtered=(coverage?.rows??[]).filter(c=>
    (!onlyIssues||!c.consistent)&&
    (!query.trim()||c.incidentId.includes(query.trim().toLowerCase())||
       c.status.includes(query.trim().toLowerCase())||
       c.findings.some(f=>f.includes(query.trim().toLowerCase()))));
  return <section aria-labelledby="eternyx-case-coverage-title"
    className="space-y-4 rounded-xl border border-primary/20 p-4">
    <h4 id="eternyx-case-coverage-title" className="flex items-center gap-2 font-semibold">
      <ScanSearch className="size-4 text-primary"/> Manual multi-page case audit coverage
    </h4>
    <p className="text-xs leading-5 text-muted-foreground">
      Inspect actual incident ledgers beyond the 30-case readiness sample, in
      batches of up to 20 cases. Pages use stable creation-time ordering.
      This is a best-effort, multi-request inspection—not a transactional
      snapshot, cryptographic verification, or automatic remediation.
    </p>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
        onClick={()=>void perform(loadInitial)}>
        <RefreshCcw className="mr-2 size-4"/> Start new owner scan
      </Button>
      {coverage&&<>
        <Button type="button" size="sm"
          disabled={busy||disabled||coverage.complete||coverage.pages.length>=50}
          onClick={()=>void perform(loadNext)}>
          Load next 20 cases
        </Button>
        <Button type="button" size="sm" variant="outline"
          disabled={busy||disabled}
          onClick={()=>download("eternyx-owner-case-coverage.json",
            JSON.stringify({
              schema:coverage.schema,rows:coverage.rows,
              scanned:coverage.scanned,inconsistent:coverage.inconsistent,
              historical:coverage.historical,withoutEvidence:coverage.withoutEvidence,
              complete:coverage.complete,countChanged:coverage.countChanged,
              ownerCaseTotalAtStart:coverage.ownerCaseTotalAtStart,
              ownerCaseTotalAtLastRead:coverage.ownerCaseTotalAtLastRead,
              firstCheckedAt:coverage.firstCheckedAt,lastCheckedAt:coverage.lastCheckedAt,
              transactionallyConsistentAcrossPages:false,
              cryptographicIntegrityVerified:false,workerLivenessVerified:false,
            },null,2),"application/json;charset=utf-8")}>
          <Download className="mr-2 size-4"/> Private JSON
        </Button>
        <Button type="button" size="sm" variant="outline"
          disabled={busy||disabled}
          onClick={()=>download("eternyx-owner-case-coverage.csv",
            caseCoverageCsv(coverage),"text/csv;charset=utf-8")}>
          <Download className="mr-2 size-4"/> Safe CSV
        </Button>
      </>}
    </div>
    {coverage&&<div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Cases inspected",coverage.scanned],
          ["Pages examined",coverage.pages.length],
          ["Detected mismatches",coverage.inconsistent],
          ["Cases without evidence",coverage.withoutEvidence],
        ].map(([k,v])=><div key={k}
          className="rounded border border-border/70 p-2 text-xs">
          <p className="text-muted-foreground">{k}</p>
          <p className="font-semibold text-lg tabular-nums">{v}</p>
        </div>)}
      </div>
      <p className="text-xs text-muted-foreground">
        Owner cases recorded when scan started:
        {" "}{coverage.ownerCaseTotalAtStart}. On last page request:
        {" "}{coverage.ownerCaseTotalAtLastRead}. Cases with historical
        closed plans after reopening: {coverage.historical} (informational).
      </p>
      {coverage.countChanged&&<p className="flex gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="size-4 shrink-0"/>
        Owner case count changed during this scan. Start a new scan to
        include newly created cases. Do not treat this as one fixed snapshot.
      </p>}
      {coverage.complete?<p className="flex gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0"/>
        Reached the end of this best-effort creation-time traversal.
        Current totals may have changed during inspection; the result is
        not a point-in-time certification.
      </p>:<p className="flex gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="size-4 shrink-0"/>
        Partial coverage. Older cases remain unread. No account-wide
        integrity claim can be made from this incomplete traversal.
      </p>}
      {coverage.pages.length>=50&&!coverage.complete&&<p className="text-xs text-muted-foreground">
        This interactive scan reached its 50-page (1,000-case) safety cap.
        Older cases are not covered; use an authorized offline report process
        for very large accounts.
      </p>}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex gap-2 items-center text-xs">
          <Checkbox checked={onlyIssues} disabled={busy||disabled}
            onCheckedChange={v=>setOnlyIssues(v===true)}/>
          Show only cases with recorded inconsistencies
        </label>
        <label className="flex gap-2 items-center text-xs">
          Filter inspected cases
          <Input className="h-8 w-44" disabled={busy||disabled}
            value={query} placeholder="ID, status, finding"
            onChange={e=>setQuery(e.target.value)}/>
        </label>
      </div>
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {filtered.map(c=><div key={c.incidentId}
          className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/70 p-2 text-xs">
          <div className="space-y-1">
            <p className="font-mono">{c.incidentId.slice(0,16)}…</p>
            <p className="text-muted-foreground">
              {c.consistent?"✓ Current ledgers align":"⚠ Review inconsistencies"}
              {" · "}{c.status} · case rev {c.revision}
              {" · "}evidence {c.evidenceCount}
              {" · "}{displayDate(c.createdAt)}
            </p>
            {c.findings.length>0&&<p className="text-muted-foreground">
              {c.findings.join(", ")}
            </p>}
          </div>
          <Button type="button" size="sm" variant="outline"
            disabled={busy||disabled}
            onClick={()=>void perform(()=>checkCase(c.incidentId))}>
            Recheck current case
          </Button>
        </div>)}
        {filtered.length===0&&<p className="text-xs text-muted-foreground">
          No inspected cases match these filters.
        </p>}
      </div>
    </div>}
    {details&&<div className="space-y-2 rounded border border-border/70 p-3 text-xs text-muted-foreground">
      <p className="font-semibold text-foreground">
        Latest live ledger check: {details.consistent?"Consistent":"Findings recorded"}</p>
      <p>Case {details.incidentId} · {details.incidentStatus} ·
        revision {details.incidentRevision} · {details.incidentEventCount} events.</p>
      <p>Evidence snapshots {details.capturedEvidenceCount} ·
        plan {details.planStage??"none"} · plan events {details.planEventCount} ·
        unified audit rows {details.auditProjectionCount}/{details.auditLedgerCount}.</p>
      {details.findings.length>0&&<p>{details.findings.join("; ")}</p>}
    </div>}
    <p className="text-xs text-muted-foreground">
      Scanning and rechecking only read owner-owned database records.
      They cannot execute workflows, restore quarantines, verify worker health,
      or certify deploy readiness. A green scan does not replace production
      migrations, CI checks or real operator review.
    </p>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
