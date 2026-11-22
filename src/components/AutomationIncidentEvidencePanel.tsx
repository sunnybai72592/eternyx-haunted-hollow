import {useEffect,useRef,useState} from "react";
import {Activity,Download,ShieldCheck,FileSearch,RefreshCcw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {supabase} from "@/integrations/supabase/client";
import {checkedIncidentReport,incidentReportCsv} from "@/lib/automationIncidentReport.mjs";

type Case={id:string;title:string;status:string;severity:string;
  workflow_id:string|null;source_kind:string;source_id:string;revision:number};
type Kind="incident_origin"|"completed_run"|"schedule_state"|"quarantine_receipt";
type Source={kind:Kind;id:string;label:string};
type Evidence={
  id:string;incident_id:string;evidence_kind:Kind;source_id:string;
  captured_at:string;snapshot:Record<string,unknown>;
};
type Recovery={
  quarantineKey:string;scheduleId:string;expectedRevision:number;
  currentRevision:number|null;scheduleExists:boolean;stillDisabled:boolean;
  sameRevision:boolean;noLease:boolean;reviewExists:boolean;
  reviewDecision:string|null;manualReviewEligible:boolean;
  separateManualRestoreConsideration:boolean;
  automaticRestore:false;executed:false;workerLivenessVerified:false;
};
type Report=ReturnType<typeof checkedIncidentReport>;

async function call(action:string,params:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("automation-control",{
    body:{action,...params},
  });
  if(error){
    let message="Automation evidence service unavailable; check backend deployment.";
    try{
      const res=error.context as Response;
      if(res&&typeof res.json==="function"){
        const problem=await res.json();
        if(typeof problem?.code==="string"&&problem.code.length<70){
          message+=" ("+problem.code+")";
        }
      }
    }catch{/* retain safe status */}
    throw Error(message);
  }
  if(!data||typeof data!=="object"||Array.isArray(data)){
    throw Error("Unexpected evidence response.");
  }
  return data as Record<string,unknown>;
}
function fmt(value:string|null|undefined){
  if(!value)return "Never";
  const d=new Date(value);return Number.isNaN(d.getTime())?"Unknown":d.toLocaleString();
}
function download(filename:string,body:string,mime:string){
  const url=URL.createObjectURL(new Blob([body],{type:mime}));
  const a=document.createElement("a");a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),0);
}
export default function AutomationIncidentEvidencePanel({disabled}:{disabled:boolean}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [cases,setCases]=useState<Case[]>([]);
  const [selected,setSelected]=useState("");
  const [evidence,setEvidence]=useState<Evidence[]>([]);
  const [sources,setSources]=useState<Source[]>([]);
  const [selectedSource,setSelectedSource]=useState("");
  const [reportDays,setReportDays]=useState<7|30>(7);
  const [report,setReport]=useState<Report|null>(null);
  const [receipts,setReceipts]=useState<Array<{quarantine_key:string;reason:string}>>([]);
  const [quarantineKey,setQuarantineKey]=useState("");
  const [recovery,setRecovery]=useState<Recovery|null>(null);
  const pending=useRef<{signature:string;key:string}|null>(null);
  const active=cases.find(x=>x.id===selected);
  useEffect(()=>{
    setSources([]);setSelectedSource("");setEvidence([]);
  },[selected]);
  useEffect(()=>{setReport(null);},[reportDays]);
  async function perform(work:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await work();}catch(e){setError(e instanceof Error?e.message:"Evidence action failed.");}
    finally{setBusy(false);}
  }
  async function loadCases(){
    const res=await call("incidentInbox",{limit:30});
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.allFailuresMeasured!==false||!Array.isArray(res.rows)||res.rows.length>30){
      throw Error("Incident list is not verified.");
    }
    const rows=res.rows as Case[];
    if(rows.some(x=>typeof x.id!=="string"||typeof x.title!=="string"||
      typeof x.source_id!=="string"||typeof x.source_kind!=="string")){
      throw Error("Invalid incident record.");
    }
    setCases(rows);
    if(selected&&!rows.some(x=>x.id===selected))setSelected("");
    setNotice("Loaded actual owner incident cases, not automatically detected failures.");
  }
  async function loadCaptured(){
    if(!active)throw Error("Select an actual incident.");
    const res=await call("incidentEvidence",{incidentId:active.id});
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.source!=="authenticated_server"||
       res.source!=="authenticated_server"||
       res.incidentId!==active.id||res.rawInputsIncluded!==false||
       res.rawOutputsIncluded!==false||res.liveWorkerVerified!==false||
       !Array.isArray(res.rows)||res.rows.length>8||
       !Number.isInteger(res.total)){
      throw Error("Persisted incident evidence list is not verified.");
    }
    const rows=res.rows as Evidence[];
    if(rows.some(x=>typeof x.id!=="string"||x.incident_id!==active.id||
      !["incident_origin","completed_run","schedule_state","quarantine_receipt"].includes(x.evidence_kind)||
      !x.snapshot||typeof x.snapshot!=="object"||
      typeof x.captured_at!=="string")){
      throw Error("Evidence record has unexpected metadata.");
    }
    setEvidence(rows);setNotice("Loaded stored, owner-scoped metadata snapshots. No run executed.");
  }
  async function loadRelatedSources(){
    if(!active)throw Error("Choose an incident.");
    const list:Source[]=[{
      kind:"incident_origin",id:active.id,
      label:"Stored incident origin · "+active.source_kind.replaceAll("_"," "),
    }];
    const [history,review]=await Promise.all([
      call("runHistory",{pageSize:30,
        ...(active.workflow_id?{workflowId:active.workflow_id}:{})}),
      call("recoveryReviewInbox"),
    ]);
    if(history.ok!==true||history.source!=="authenticated_server"||
       !Array.isArray(history.rows)||
       review.ok!==true||review.source!=="authenticated_server"||
       !Array.isArray(review.rows)||review.automaticRecoveryEnabled!==false){
      throw Error("Cannot verify related source records.");
    }
    for(const item of history.rows as Array<Record<string,unknown>>){
      if(typeof item.id==="string"&&
         (active.workflow_id===null?item.id===active.source_id:
           item.workflow_id===active.workflow_id)){
        list.push({kind:"completed_run",id:item.id,
          label:"Completed "+String(item.trigger_type)+" receipt · "+String(item.id).slice(0,8)});
      }
    }
    for(const item of review.rows as Array<Record<string,unknown>>){
      if(typeof item.quarantine_key==="string"){
        // The PostgreSQL capture endpoint still validates workflow relatedness.
        list.push({kind:"quarantine_receipt",id:item.quarantine_key,
          label:"Persisted quarantine · "+String(item.quarantine_key).slice(0,8)});
      }
    }
    if(active.workflow_id){
      const diag=await call("triggerDiagnostics",{workflowId:active.workflow_id});
      if(diag.source!=="authenticated_server"||diag.executed!==false||
         diag.externalActionTriggered!==false||diag.noNetworkRequest!==true){
        throw Error("Live schedule metadata cannot be verified.");
      }
      const schedule=diag.schedule as Record<string,unknown>|null;
      if(schedule&&typeof schedule.id==="string"){
        list.push({kind:"schedule_state",id:schedule.id,
          label:"Current saved schedule state · "+schedule.id.slice(0,8)});
      }
    }
    setSources(list);setSelectedSource("");
    setNotice("Loaded existing evidence sources. Database verifies ownership and workflow relationship again at capture.");
  }
  async function capture(){
    if(!active)throw Error("Choose an incident.");
    const source=sources.find(x=>x.kind+":"+x.id===selectedSource);
    if(!source)throw Error("Select one verified source.");
    if(!window.confirm("Save a point-in-time copy of this source's nonsecret metadata to the incident audit ledger? Nothing will execute."))return;
    const signature=active.id+":"+source.kind+":"+source.id;
    const key=pending.current?.signature===signature
      ?pending.current.key:crypto.randomUUID();
    pending.current={signature,key};
    const res=await call("incidentCaptureEvidence",{
      incidentId:active.id,evidenceKind:source.kind,
      sourceId:source.id,requestKey:key,
    });
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.executed!==false||res.externalExecutionTriggered!==false||
       typeof res.evidenceId!=="string"){
      throw Error("Server did not confirm a metadata-only evidence capture.");
    }
    pending.current=null;
    await loadCaptured();setNotice("Real nonsecret evidence snapshot stored. No webhook, schedule or provider call ran.");
  }
  async function loadReport(){
    const res=await call("incidentReport",{days:reportDays});
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.executed!==false||res.rawInputsIncluded!==false||
       res.rawOutputsIncluded!==false){
      throw Error("Report is not verified.");
    }
    const parsed=checkedIncidentReport(res);
    if(parsed.rangeDays!==reportDays)throw Error("Report period mismatch.");
    setReport(parsed);setNotice("Loaded measured incident activity from PostgreSQL; not an automated failure rate.");
  }
  async function loadReceipts(){
    const res=await call("recoveryReviewInbox");
    if(res.ok!==true||res.source!=="authenticated_server"||
       !Array.isArray(res.rows)||res.automaticRecoveryEnabled!==false){
      throw Error("Quarantine receipts could not be verified.");
    }
    const rows=(res.rows as Array<Record<string,unknown>>)
      .filter(x=>typeof x.quarantine_key==="string")
      .map(x=>({quarantine_key:String(x.quarantine_key),reason:String(x.reason)}));
    setReceipts(rows);setQuarantineKey("");setRecovery(null);
  }
  async function inspectRecovery(){
    if(!quarantineKey)throw Error("Select a real quarantine receipt.");
    const res=await call("incidentRecoveryCheck",{quarantineKey});
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.quarantineKey!==quarantineKey||
       res.automaticRestore!==false||res.executed!==false||
       res.externalExecutionTriggered!==false||
       res.workerLivenessVerified!==false||
       typeof res.sameRevision!=="boolean"||
       typeof res.noLease!=="boolean"||
       typeof res.manualReviewEligible!=="boolean"){
      throw Error("Recovery check is not verified as non-executing.");
    }
    setRecovery(res as unknown as Recovery);
    setNotice("Checked recorded quarantine, current schedule revision and lease status only. No restore requested.");
  }
  return <section aria-labelledby="eternyx-phase-2n-heading"
    className="space-y-4 rounded-xl border border-primary/20 p-4">
    <h4 id="eternyx-phase-2n-heading" className="flex items-center gap-2 font-semibold">
      <FileSearch className="size-4 text-primary"/> Incident evidence & factual operational reports
    </h4>
    <p className="text-xs leading-5 text-muted-foreground">
      Capture source metadata directly from existing database records, analyze
      explicitly reported incidents, and inspect quarantine recovery conditions.
      No automatic detection, external request, scheduled execution or credential export.
    </p>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Append-only verified evidence ledger</p>
      <p className="text-xs text-muted-foreground">
        Up to eight distinct snapshots per case and 30 new snapshots per account
        per rolling 24 hours. A real owner/workflow source check is required;
        raw run inputs, outputs, encrypted schedule fields and credentials are
        excluded. Snapshots reflect the moment captured, not live uptime.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <Button type="button" size="sm" variant="outline" disabled={disabled||busy}
          onClick={()=>void perform(loadCases)}><RefreshCcw className="mr-2 size-4"/> Load incident cases</Button>
        <label className="text-xs">Incident
          <select className="ml-2 max-w-60 rounded border border-input bg-background p-2"
            value={selected} disabled={disabled||busy}
            onChange={e=>setSelected(e.target.value)}>
            <option value="">Select owner case</option>
            {cases.map(c=><option key={c.id} value={c.id}>
              {c.title.slice(0,65)} · {c.status}</option>)}
          </select>
        </label>
      </div>
      {active&&<>
        <p className="text-xs text-muted-foreground">
          Source {active.source_kind.replaceAll("_"," ")} · status {active.status} ·
          severity {active.severity}. Evidence must belong to this case's workflow.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" type="button" variant="outline" disabled={disabled||busy}
            onClick={()=>void perform(loadRelatedSources)}>Find actual related sources</Button>
          <Button size="sm" type="button" variant="outline" disabled={disabled||busy}
            onClick={()=>void perform(loadCaptured)}>Load captured evidence</Button>
        </div>
        {sources.length>0&&<div className="flex flex-wrap items-center gap-2">
          <label className="text-xs">Source record
            <select className="ml-2 max-w-72 rounded border border-input bg-background p-2"
              disabled={disabled||busy} value={selectedSource}
              onChange={e=>setSelectedSource(e.target.value)}>
              <option value="">Select verified source</option>
              {sources.map(s=><option key={s.kind+":"+s.id} value={s.kind+":"+s.id}>
                {s.label}</option>)}
            </select>
          </label>
          <Button size="sm" type="button" disabled={disabled||busy||!selectedSource}
            onClick={()=>void perform(capture)}>
            <ShieldCheck className="mr-2 size-4"/> Capture real metadata
          </Button>
        </div>}
        {evidence.length>0&&<ol className="space-y-2">
          {evidence.map(x=><li key={x.id}
            className="space-y-1 rounded border border-border/60 p-3 text-xs">
            <p className="font-semibold">
              {x.evidence_kind.replaceAll("_"," ")} · {fmt(x.captured_at)}
            </p>
            <p className="break-all text-muted-foreground">Source {x.source_id}</p>
            <pre className="max-h-40 overflow-auto rounded bg-muted/30 p-2 text-muted-foreground">
              {JSON.stringify(x.snapshot,null,2)}
            </pre>
          </li>)}
        </ol>}
      </>}
    </div>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="flex items-center gap-2 font-semibold text-sm">
        <Activity className="size-4 text-primary"/> Database-measured incident reporting
      </p>
      <p className="text-xs text-muted-foreground">
        Seven- or thirty-day creation, severity, source and resolution-event
        counts, plus current unresolved age and evidence coverage.
        These are reports of manually recorded cases, not failure rates.
        Exports are generated locally from server-validated count fields.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs">Reporting period
          <select className="ml-2 rounded border border-input bg-background p-2"
            value={reportDays} disabled={disabled||busy}
            onChange={e=>setReportDays(Number(e.target.value) as 7|30)}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </label>
        <Button type="button" size="sm" variant="outline"
          disabled={busy||disabled} onClick={()=>void perform(loadReport)}>
          Load factual report
        </Button>
      </div>
      {report&&<div className="space-y-2 text-xs text-muted-foreground">
        <p>Report generated {fmt(report.generatedAt)} · opened in {report.rangeDays} days:
          <strong> {report.casesOpenedInWindow}</strong> · recorded resolution transitions:
          {" "}{report.resolutionEventsInWindow}.</p>
        <p>Current: {report.currentOpen} open, {report.currentInvestigating} investigating,
          {" "}{report.currentResolved} resolved; {report.currentHighUnresolved} high-severity unresolved.
          {" "}{report.unresolvedOlder24h} unresolved older than a day;
          {" "}{report.unresolvedOlder7d} older than a week.</p>
        <p>Sources recorded in period: {report.sourcesInWindow.failedSchedule} failed-schedule cases;
          {" "}{report.sourcesInWindow.expiredLease} expired-lease cases;
          {" "}{report.sourcesInWindow.quarantine} quarantine cases;
          {" "}{report.sourcesInWindow.manualRunReview} manual run-review cases.</p>
        <p>Severity: {report.severitiesInWindow.low} low,
          {" "}{report.severitiesInWindow.medium} medium,
          {" "}{report.severitiesInWindow.high} high.
          {" "}{report.capturedEvidenceInWindow} evidence snapshots in period;
          {" "}{report.currentUnresolvedWithEvidence} unresolved cases have additional evidence,
          {" "}{report.currentUnresolvedWithoutEvidence} do not.</p>
        <div className="flex gap-2 flex-wrap">
          <Button type="button" size="sm" variant="outline" disabled={disabled||busy}
            onClick={()=>download("eternyx-incident-report.json",
              JSON.stringify(report,null,2),"application/json;charset=utf-8")}>
            <Download className="mr-2 size-4"/> JSON report
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled||busy}
            onClick={()=>download("eternyx-incident-report.csv",
              incidentReportCsv(report),"text/csv;charset=utf-8")}>
            <Download className="mr-2 size-4"/> Safe CSV report
          </Button>
        </div>
        <p>No automated failure detection, worker uptime measurement,
          external delivery verification or recovery execution is claimed.</p>
      </div>}
    </div>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Non-executing quarantine recovery check</p>
      <p className="text-xs text-muted-foreground">
        Compare an actual quarantine receipt with the current schedule revision,
        enabled state, active lease and separately recorded recovery review.
        This never authorizes or performs a restore.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
          onClick={()=>void perform(loadReceipts)}>Load real quarantine receipts</Button>
        <label className="text-xs">Receipt
          <select className="ml-2 rounded border border-input bg-background p-2"
            disabled={busy||disabled} value={quarantineKey}
            onChange={e=>{setQuarantineKey(e.target.value);setRecovery(null);}}>
            <option value="">Select receipt</option>
            {receipts.map(x=><option key={x.quarantine_key} value={x.quarantine_key}>
              {x.reason} · {x.quarantine_key.slice(0,8)}</option>)}
          </select>
        </label>
        <Button size="sm" type="button" disabled={busy||disabled||!quarantineKey}
          onClick={()=>void perform(inspectRecovery)}>Check without restoring</Button>
      </div>
      {recovery&&<div className="text-xs text-muted-foreground space-y-1">
        <p>Schedule exists: {recovery.scheduleExists?"Yes":"No"} ·
          still disabled: {recovery.stillDisabled?"Yes":"No"} ·
          revision matches: {recovery.sameRevision?"Yes":"No"} ·
          no active/expired lease: {recovery.noLease?"Yes":"No"}.</p>
        <p>Separate manual review eligible: {recovery.manualReviewEligible?"Yes":"No"} ·
          review stored: {recovery.reviewExists?"Yes":"No"} ·
          decision: {recovery.reviewDecision??"None"}.</p>
        <p>Separate manual restore consideration:
          {" "}{recovery.separateManualRestoreConsideration?"Conditionally reviewed":"Not reviewed"}.
          Worker activity was not verified, and no workflow was executed.</p>
      </div>}
    </div>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
