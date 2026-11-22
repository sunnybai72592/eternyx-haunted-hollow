import {useEffect,useRef,useState} from "react";
import {AlertCircle,ClipboardCheck,History,RefreshCcw,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {supabase} from "@/integrations/supabase/client";

type Workflow={id:string;name:string;revision:number;active:boolean};
type Severity="low"|"medium"|"high";
type Status="open"|"investigating"|"resolved";
type Incident={
  id:string;source_kind:string;source_id:string;workflow_id:string|null;
  title:string;severity:Severity;status:Status;revision:number;
  created_at:string;updated_at:string;
  source_evidence:Record<string,unknown>;
};
type Evidence={kind:string;id:string;label:string};
type Review={
  quarantine_key:string;schedule_id:string;reason:string;new_revision:number;
  quarantined_at:string;current_enabled:boolean|null;
  current_revision:number|null;lease_active:boolean;
  review_id:string|null;review_decision:string|null;reviewed_at:string|null;
};
type Event={
  id:number;kind:"opened"|"transition";from_status:Status|null;
  to_status:Status;note:string;created_at:string;
};
async function invoke(action:string,args:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("automation-control",{
    body:{action,...args},
  });
  if(error){
    let detail="Automation incident service unavailable.";
    try{
      const response=error.context as Response;
      if(response&&typeof response.json==="function"){
        const body=await response.json();
        if(typeof body?.code==="string"&&body.code.length<80){
          detail+=" ("+body.code+")";
        }
      }
    }catch{/* preserve safe generic error */}
    throw Error(detail);
  }
  if(!data||typeof data!=="object"||Array.isArray(data)){
    throw Error("Unexpected incident response.");
  }
  return data as Record<string,unknown>;
}
function date(value:string){
  const d=new Date(value);
  return Number.isNaN(d.getTime())?"Unknown":d.toLocaleString();
}
export default function AutomationIncidentCenter({
  workflows,disabled,
}:{workflows:Workflow[];disabled:boolean;}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [cases,setCases]=useState<Incident[]>([]);
  const [summary,setSummary]=useState<Record<string,number>|null>(null);
  const [total,setTotal]=useState<number|null>(null);
  const [truncated,setTruncated]=useState(false);
  const [statusFilter,setStatusFilter]=useState<"all"|Status>("all");
  const [severityFilter,setSeverityFilter]=useState<"all"|Severity>("all");
  const [selectedIncident,setSelectedIncident]=useState("");
  const [events,setEvents]=useState<Event[]>([]);
  const [evidence,setEvidence]=useState<Evidence[]>([]);
  const [reviews,setReviews]=useState<Review[]>([]);
  const [reviewTotal,setReviewTotal]=useState(0);
  const [sourcesLoaded,setSourcesLoaded]=useState(false);
  const [source,setSource]=useState("");
  const [newTitle,setNewTitle]=useState("");
  const [newSeverity,setNewSeverity]=useState<Severity>("medium");
  const [newNote,setNewNote]=useState("");
  const [transitionNote,setTransitionNote]=useState("");
  const [reviewKey,setReviewKey]=useState("");
  const [reviewChoice,setReviewChoice]=useState<
    "keep_quarantined"|"reviewed_for_manual_restore">("keep_quarantined");
  const [reviewNote,setReviewNote]=useState("");
  const [inspectWorkflow,setInspectWorkflow]=useState("");
  const pendingOpen=useRef<{signature:string;key:string}|null>(null);
  const pendingTransition=useRef<{signature:string;key:string}|null>(null);
  const pendingReview=useRef<{signature:string;key:string}|null>(null);
  useEffect(()=>{
    setCases([]);setSummary(null);setTotal(null);
    setSelectedIncident("");setEvents([]);
  },[statusFilter,severityFilter]);
  useEffect(()=>{
    if(selectedIncident&&!cases.some(c=>c.id===selectedIncident)){
      setSelectedIncident("");setEvents([]);
    }
  },[cases,selectedIncident]);
  async function act(task:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await task();}catch(e){
      setError(e instanceof Error?e.message:"Incident action failed.");
    }finally{setBusy(false);}
  }
  async function loadIncidents(){
    const data=await invoke("incidentInbox",{
      ...(statusFilter==="all"?{}:{status:statusFilter}),
      ...(severityFilter==="all"?{}:{severity:severityFilter}),
      limit:30,
    });
    if(data.ok!==true||data.source!=="authenticated_server"||
      data.allFailuresMeasured!==false||data.autoRecoveryEnabled!==false||
      !Array.isArray(data.rows)||data.rows.length>30||
      !Number.isInteger(data.totalMatching)||
      typeof data.truncated!=="boolean"||
      !data.counts||typeof data.counts!=="object"){
      throw Error("The incident inbox is not backed by verified owner data.");
    }
    const rows=data.rows as Incident[];
    if(rows.some(c=>typeof c.id!=="string"||
      typeof c.title!=="string"||typeof c.revision!=="number"||
      !["open","investigating","resolved"].includes(c.status)||
      !["low","medium","high"].includes(c.severity)||
      !c.source_evidence||typeof c.source_evidence!=="object")){
      throw Error("Invalid incident source details.");
    }
    setCases(rows);setSummary(data.counts as Record<string,number>);
    setTotal(Number(data.totalMatching));setTruncated(data.truncated);
    setNotice("Loaded factual owner incident cases. Incidents are user-reported, not automatic failure detections.");
  }
  async function loadEvidence(){
    const [runData,reviewData]=await Promise.all([
      invoke("runHistory",{pageSize:15}),
      invoke("recoveryReviewInbox"),
    ]);
    if(runData.ok!==true||runData.source!=="authenticated_server"||
       !Array.isArray(runData.rows)||
       reviewData.ok!==true||reviewData.source!=="authenticated_server"||
       !Array.isArray(reviewData.rows)||
       reviewData.automaticRecoveryEnabled!==false||
       typeof reviewData.totalMatching!=="number"){
      throw Error("Evidence could not be verified from existing records.");
    }
    const options:Evidence[]=[];
    for(const entry of runData.rows as Array<Record<string,unknown>>){
      if(typeof entry.id==="string"&&
         typeof entry.created_at==="string"&&
         ["manual","webhook","scheduled"].includes(String(entry.trigger_type))){
        options.push({kind:"completed_run_review",id:entry.id,
          label:"Review actual "+entry.trigger_type+" run · "+date(entry.created_at)});
      }
    }
    const verifiedReviews:Review[]=[];
    for(const entry of reviewData.rows as Array<Record<string,unknown>>){
      if(typeof entry.quarantine_key==="string"&&
         typeof entry.schedule_id==="string"&&
         typeof entry.new_revision==="number"&&
         typeof entry.lease_active==="boolean"){
        const r=entry as unknown as Review;
        verifiedReviews.push(r);
        options.push({kind:"schedule_quarantine",id:r.quarantine_key,
          label:"Quarantine receipt · "+date(r.quarantined_at)});
      }
    }
    setReviews(verifiedReviews);
    setReviewTotal(Number(reviewData.totalMatching));
    setEvidence(options);setSourcesLoaded(true);
    setNotice("Loaded actual run and quarantine receipts. No execution or provider request was sent.");
  }
  async function inspectSchedule(){
    if(!inspectWorkflow)throw Error("Select a saved workflow.");
    const diag=await invoke("triggerDiagnostics",{workflowId:inspectWorkflow});
    if(diag.source!=="authenticated_server"||
      diag.workflowId!==inspectWorkflow||
      diag.executed!==false||diag.externalActionTriggered!==false||
      diag.noNetworkRequest!==true){
      throw Error("Schedule evidence verification failed.");
    }
    const entry=diag.schedule as Record<string,unknown>|null;
    if(!entry||typeof entry.id!=="string")throw Error("No actual schedule for this workflow.");
    const next=[...evidence.filter(e=>!e.kind.startsWith("schedule_failed")&&
      !e.kind.startsWith("schedule_expired_lease"))];
    if(entry.lastStatus==="failed"){
      next.push({kind:"schedule_failed",id:entry.id,
        label:"Actual failed schedule state · "+String(entry.id).slice(0,8)});
    }
    if(entry.expiredLease===true){
      next.push({kind:"schedule_expired_lease",id:entry.id,
        label:"Actual expired worker lease · "+String(entry.id).slice(0,8)});
    }
    setEvidence(next);
    setNotice("Schedule evidence checked locally. Only supported, actually observed states were offered.");
  }
  async function openIncident(){
    const selected=evidence.find(e=>e.kind+":"+e.id===source);
    if(!selected)throw Error("Select verified source evidence before filing a case.");
    const trimmedTitle=newTitle.trim(),trimmedNote=newNote.trim();
    if(trimmedTitle.length<8||trimmedTitle.length>100||
       trimmedNote.length<8||trimmedNote.length>500){
      throw Error("Title must be 8–100 characters and note 8–500 characters.");
    }
    if(!window.confirm("Create an incident linked to this real source record? This does not pause or execute a workflow."))return;
    const signature=JSON.stringify([selected.kind,selected.id,trimmedTitle,
      newSeverity,trimmedNote]);
    const key=pendingOpen.current?.signature===signature
      ?pendingOpen.current.key:crypto.randomUUID();
    pendingOpen.current={signature,key};
    const result=await invoke("incidentOpen",{
      sourceKind:selected.kind,sourceId:selected.id,
      title:trimmedTitle,severity:newSeverity,note:trimmedNote,requestKey:key,
    });
    if(result.ok!==true||result.source!=="authenticated_server"||
       result.externalExecutionTriggered!==false||
       typeof result.incidentId!=="string"){
      throw Error("Incident was not confirmed. Retry will use the original key.");
    }
    pendingOpen.current=null;setNewTitle("");setNewNote("");
    await loadIncidents();
    setSelectedIncident(result.incidentId as string);
    setNotice("Evidence-linked incident recorded. No external action was triggered.");
  }
  async function changeStatus(inc:Incident,next:Status){
    const note=transitionNote.trim();
    if(note.length<8||note.length>500)throw Error("Transition note must be 8–500 characters.");
    if(!window.confirm("Move the incident to "+next+"? This records a timeline event; it never re-enables or retries an automation."))return;
    const signature=JSON.stringify([inc.id,inc.revision,next,note]);
    const key=pendingTransition.current?.signature===signature
      ?pendingTransition.current.key:crypto.randomUUID();
    pendingTransition.current={signature,key};
    const result=await invoke("incidentTransition",{
      incidentId:inc.id,expectedRevision:inc.revision,
      nextStatus:next,note,requestKey:key,
    });
    if(result.ok!==true||result.source!=="authenticated_server"||
       result.externalExecutionTriggered!==false||
       typeof result.revision!=="number"){
      throw Error("Status transition not confirmed. Retry uses the same request key.");
    }
    pendingTransition.current=null;setTransitionNote("");
    await loadIncidents();
    await loadTimeline(inc.id);
    setNotice("Incident status updated; immutable audit timeline retained. No workflow executed.");
  }
  async function loadTimeline(id:string){
    const result=await invoke("incidentTimeline",{incidentId:id});
    if(result.ok!==true||result.source!=="authenticated_server"||
       result.incidentId!==id||!Array.isArray(result.events)||
       result.events.length>30||!Number.isInteger(result.total)){
      throw Error("Private incident event history was not verified.");
    }
    const rows=result.events as Event[];
    if(rows.some(r=>!["opened","transition"].includes(r.kind)||
      typeof r.note!=="string"||typeof r.created_at!=="string")){
      throw Error("Unexpected incident timeline record.");
    }
    setEvents(rows);setSelectedIncident(id);
  }
  async function decideReview(){
    const r=reviews.find(v=>v.quarantine_key===reviewKey);
    if(!r||r.review_id!==null||r.current_enabled!==false||
       r.current_revision!==r.new_revision||r.lease_active){
      throw Error("Receipt must still describe a disabled, unleased schedule at the same revision.");
    }
    const note=reviewNote.trim();
    if(note.length<12||note.length>500)throw Error("Recovery review note must be 12–500 characters.");
    if(!window.confirm("Record '"+reviewChoice+"' for this quarantined schedule? No schedule will be enabled or retried. Any future restore requires separate manual action."))return;
    const signature=JSON.stringify([r.quarantine_key,reviewChoice,note]);
    const key=pendingReview.current?.signature===signature
      ?pendingReview.current.key:crypto.randomUUID();
    pendingReview.current={signature,key};
    const result=await invoke("recoveryReview",{
      quarantineKey:r.quarantine_key,decision:reviewChoice,note,requestKey:key,
    });
    if(result.ok!==true||result.source!=="authenticated_server"||
       result.automaticRestore!==false||
       result.externalExecutionTriggered!==false||
       result.scheduleId!==r.schedule_id){
      throw Error("Recovery review was not verified.");
    }
    pendingReview.current=null;setReviewNote("");setReviewKey("");
    await loadEvidence();
    setNotice("Quarantine review saved. The schedule remains disabled; no retry was queued.");
  }
  const active=cases.find(c=>c.id===selectedIncident);
  const eligibleReview=reviews.find(r=>r.quarantine_key===reviewKey);
  const reviewReady=eligibleReview&&eligibleReview.review_id===null&&
    eligibleReview.current_enabled===false&&
    eligibleReview.current_revision===eligibleReview.new_revision&&
    !eligibleReview.lease_active;
  return <section aria-labelledby="eternyx-incidents-title"
    className="space-y-4 rounded-xl border border-primary/20 p-4">
    <h4 id="eternyx-incidents-title" className="flex items-center gap-2 font-semibold">
      <AlertCircle className="size-4 text-primary"/> Evidence-linked incidents & recovery reviews
    </h4>
    <p className="text-xs text-muted-foreground">
      File an incident using an existing stored run, failed/expired schedule state
      or quarantine receipt. These are manually reported cases—not fabricated
      alert detections. Changing case status or signing off a recovery review
      does not resume, retry or dispatch automation.
    </p>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Real incident inbox & measured case counts</p>
        <Button type="button" size="sm" variant="outline" disabled={disabled||busy}
          onClick={()=>void act(loadIncidents)}><RefreshCcw className="mr-2 size-4"/> Load case inbox</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label>Status
          <select value={statusFilter} disabled={busy||disabled}
            onChange={e=>setStatusFilter(e.target.value as typeof statusFilter)}
            className="ml-2 rounded border border-input bg-background p-1">
            <option value="all">All</option><option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label>Severity
          <select value={severityFilter} disabled={busy||disabled}
            onChange={e=>setSeverityFilter(e.target.value as typeof severityFilter)}
            className="ml-2 rounded border border-input bg-background p-1">
            <option value="all">All</option><option value="low">Low</option>
            <option value="medium">Medium</option><option value="high">High</option>
          </select>
        </label>
      </div>
      {summary&&<p className="text-xs text-muted-foreground">
        Open: {summary.open} · Investigating: {summary.investigating} ·
        Resolved: {summary.resolved} · High severity unresolved: {summary.highUnresolved} ·
        Schedule-linked: {summary.scheduleSources} · Run review: {summary.runReviewSources}.
        Displaying {cases.length} of {total??0}.
        {truncated?" Inbox limited to 30; narrow the filters.":""}
      </p>}
      <div className="space-y-2">
        {cases.map(c=><button type="button" key={c.id} disabled={busy||disabled}
          onClick={()=>void act(()=>loadTimeline(c.id))}
          className={"block w-full rounded-lg border p-3 text-left text-xs focus-visible:ring-2 focus-visible:ring-primary "+
            (selectedIncident===c.id?"border-primary":"border-border/70")}>
          <span className="font-semibold text-foreground">{c.title}</span>
          <span className="ml-2 text-muted-foreground">
            {c.severity} · {c.status} · revision {c.revision}</span>
          <span className="mt-1 block text-muted-foreground">
            Verified at creation: {c.source_kind.replaceAll("_"," ")} ·
            {date(c.created_at)}
          </span>
        </button>)}
      </div>
      {active&&<div className="space-y-2 rounded-lg border border-border/70 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-4"/> Immutable incident timeline
        </p>
        <p className="text-xs text-muted-foreground">
          Source reference: {active.source_id} · current {active.status}.
          Evidence was verified when this incident was opened; it is not a
          continuous worker-health check.
        </p>
        <ol className="space-y-2">
          {events.map(event=><li key={event.id}
            className="rounded border border-border/60 p-2 text-xs text-muted-foreground">
            <p className="font-medium">{event.kind} · {event.from_status??"none"} →
              {event.to_status} · {date(event.created_at)}</p>
            <p className="mt-1 whitespace-pre-wrap">{event.note}</p>
          </li>)}
        </ol>
        <label className="block text-xs">Status transition note (8–500 characters)
          <Textarea rows={2} className="mt-1" maxLength={500} value={transitionNote}
            disabled={busy||disabled} onChange={e=>setTransitionNote(e.target.value)}/>
        </label>
        <div className="flex flex-wrap gap-2">
          {active.status!=="investigating"&&<Button type="button" size="sm" variant="outline"
            disabled={busy||disabled||transitionNote.trim().length<8}
            onClick={()=>void act(()=>changeStatus(active,"investigating"))}>
            Start / reopen investigation
          </Button>}
          {active.status==="investigating"&&<Button type="button" size="sm"
            disabled={busy||disabled||transitionNote.trim().length<8}
            onClick={()=>void act(()=>changeStatus(active,"resolved"))}>
            Mark reviewed and resolved
          </Button>}
        </div>
        <p className="text-xs text-muted-foreground">
          Resolving an incident does not unblock a policy, activate a schedule,
          approve a GitHub issue or erase an evidence record.
        </p>
      </div>}
    </div>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Create a case from verified source evidence</p>
        <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
          onClick={()=>void act(loadEvidence)}>Load real evidence</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The evidence list reads recent completed runs and actual quarantine
        receipts. A completed run is not itself proof of a failure; it can be
        selected for an explicit manual quality review.
      </p>
      {sourcesLoaded&&<div className="space-y-2">
        <label className="block text-xs">Source record
          <select value={source} disabled={disabled||busy}
            onChange={e=>setSource(e.target.value)}
            className="mt-1 w-full rounded border border-input bg-background p-2 text-xs">
            <option value="">Select real source</option>
            {evidence.map(e=><option key={e.kind+":"+e.id} value={e.kind+":"+e.id}>
              {e.label}
            </option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label>Verify schedule state
            <select value={inspectWorkflow}
              disabled={busy||disabled}
              onChange={e=>setInspectWorkflow(e.target.value)}
              className="ml-2 rounded border border-input bg-background p-1">
              <option value="">Select workflow</option>
              {workflows.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <Button type="button" size="sm" variant="outline"
            disabled={busy||disabled||!inspectWorkflow}
            onClick={()=>void act(inspectSchedule)}>Verify failed/expired state</Button>
        </div>
        <label className="block text-xs">Title
          <Input className="mt-1" maxLength={100} disabled={busy||disabled}
            value={newTitle} onChange={e=>setNewTitle(e.target.value)}
            placeholder="e.g. Review unexpected completed output"/>
        </label>
        <label className="block text-xs">Severity
          <select value={newSeverity} disabled={busy||disabled}
            onChange={e=>setNewSeverity(e.target.value as Severity)}
            className="ml-2 rounded border border-input bg-background p-1">
            <option value="low">Low</option><option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="block text-xs">Review note (8–500 characters)
          <Textarea className="mt-1" rows={3} maxLength={500} value={newNote}
            disabled={busy||disabled} onChange={e=>setNewNote(e.target.value)}/>
        </label>
        <Button type="button" size="sm" disabled={busy||disabled||!source||
          newTitle.trim().length<8||newNote.trim().length<8}
          onClick={()=>void act(openIncident)}>Create evidence-linked case</Button>
      </div>}
    </div>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ClipboardCheck className="size-4 text-primary"/> Quarantine recovery review (not restoration)
      </p>
      <p className="text-xs text-muted-foreground">
        A review is permitted only for a real owner quarantine receipt whose
        schedule is still disabled, at its quarantine revision, and unleased.
        Recording "reviewed for manual restore" never enables or retries it.
        Existing Schedule Controls still require a separate owner action.
      </p>
      <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
        onClick={()=>void act(loadEvidence)}>Refresh quarantine receipts</Button>
      {sourcesLoaded&&<>
        <p className="text-xs text-muted-foreground">
          Showing {reviews.length} of {reviewTotal} quarantine receipts from the last 30 days.
        </p>
        <label className="block text-xs">Receipt eligible for manual review
          <select value={reviewKey} disabled={busy||disabled}
            onChange={e=>setReviewKey(e.target.value)}
            className="mt-1 w-full rounded border border-input bg-background p-2 text-xs">
            <option value="">Select an unreviewed receipt</option>
            {reviews.filter(r=>r.review_id===null).map(r=>
              <option key={r.quarantine_key} value={r.quarantine_key}>
                {r.reason} · {date(r.quarantined_at)} ·
                {r.current_enabled===false&&r.current_revision===r.new_revision&&!r.lease_active
                  ?" eligible":" no longer eligible"}
              </option>)}
          </select>
        </label>
        {eligibleReview&&<p className="text-xs text-muted-foreground">
          Schedule {eligibleReview.schedule_id} · quarantine revision
          {eligibleReview.new_revision} · now
          {eligibleReview.current_enabled===true?" enabled":" disabled"}.
          {reviewReady?" Ready for review; not for execution.":" This record is not currently eligible."}
        </p>}
        <label className="block text-xs">Recorded review decision
          <select value={reviewChoice} disabled={busy||disabled}
            onChange={e=>setReviewChoice(e.target.value as typeof reviewChoice)}
            className="ml-2 rounded border border-input bg-background p-1">
            <option value="keep_quarantined">Keep quarantined</option>
            <option value="reviewed_for_manual_restore">Reviewed for separate manual restore</option>
          </select>
        </label>
        <label className="block text-xs">Review rationale (12–500 characters)
          <Textarea className="mt-1" rows={3} maxLength={500} value={reviewNote}
            disabled={busy||disabled} onChange={e=>setReviewNote(e.target.value)}/>
        </label>
        <Button type="button" size="sm" variant="outline"
          disabled={busy||disabled||!reviewReady||reviewNote.trim().length<12}
          onClick={()=>void act(decideReview)}>
          <ShieldCheck className="mr-2 size-4"/> Save manual recovery review
        </Button>
      </>}
    </div>
    <p className="text-xs text-muted-foreground">
      Incident notes are private to this account but can persist in audit history.
      Do not enter passwords, API keys or sensitive customer records.
      Statistics count manually recorded cases, not every unrecorded failure.
    </p>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
