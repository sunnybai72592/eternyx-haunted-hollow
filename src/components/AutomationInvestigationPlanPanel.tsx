import {useEffect,useRef,useState} from "react";
import {BookOpen,ClipboardCheck,RefreshCcw,Download,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/checkbox";
import {supabase} from "@/integrations/supabase/client";
import {incidentTrendCsv,verifiedIncidentTrend} from "@/lib/automationIncidentTrend.mjs";

const catalog=[
  {id:"review_evidence",label:"Review stored case evidence"},
  {id:"inspect_run_history",label:"Inspect completed execution history"},
  {id:"inspect_workflow_policy",label:"Inspect workflow execution policies"},
  {id:"verify_schedule_state",label:"Inspect actual schedule/lease state"},
  {id:"review_quarantine",label:"Review quarantine and operator decisions"},
  {id:"document_outcome",label:"Document manual findings and outcome"},
] as const;
type Step=typeof catalog[number]["id"];
type Incident={
  id:string;title:string;revision:number;status:"open"|"investigating"|"resolved";
  severity:string;
};
type Plan={
  id:string;stage:"draft"|"reviewed"|"closed";revision:number;
  steps:Step[];acknowledged:number;createdAt:string;updatedAt:string;
};
type Event={id:number;kind:"step_acknowledged"|"reviewed"|"closed";
  step_kind:Step|null;note:string;created_at:string};
type Details={
  incidentId:string;incidentStatus:Incident["status"];incidentRevision:number;
  evidenceCount:number;plan:Plan|null;events:Event[];
};
type Trend=ReturnType<typeof verifiedIncidentTrend>;
async function call(action:string,params:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("automation-control",{
    body:{action,...params},
  });
  if(error){
    let reason="Investigation service unavailable; verify backend deployment.";
    try{
      const response=error.context as Response;
      if(response&&typeof response.json==="function"){
        const obj=await response.json();
        if(typeof obj?.code==="string"&&obj.code.length<70)reason+=" ("+obj.code+")";
      }
    }catch{/* keep safe message */}
    throw Error(reason);
  }
  if(!data||typeof data!=="object"||Array.isArray(data)){
    throw Error("Unexpected investigation response.");
  }
  return data as Record<string,unknown>;
}
function fmt(timestamp:string){
  const date=new Date(timestamp);
  return Number.isNaN(date.getTime())?"Unknown":date.toLocaleString();
}
function downloadCSV(csv:string){
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;
  a.download="eternyx-incident-daily-trend.csv";
  document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),0);
}
export default function AutomationInvestigationPlanPanel({disabled}:{disabled:boolean}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [cases,setCases]=useState<Incident[]>([]);
  const [selected,setSelected]=useState("");
  const [details,setDetails]=useState<Details|null>(null);
  const [selectedSteps,setSelectedSteps]=useState<Step[]>([
    "review_evidence","inspect_run_history","document_outcome",
  ]);
  const [stepToAck,setStepToAck]=useState<Step>("review_evidence");
  const [ackNote,setAckNote]=useState("");
  const [stageNote,setStageNote]=useState("");
  const [days,setDays]=useState<7|30>(7);
  const [trend,setTrend]=useState<Trend|null>(null);
  const pending=useRef<{signature:string;key:string}|null>(null);
  const active=cases.find(c=>c.id===selected);
  useEffect(()=>{setDetails(null);setAckNote("");setStageNote("");pending.current=null;},[selected]);
  useEffect(()=>setTrend(null),[days]);
  async function perform(action:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await action();}
    catch(e){setError(e instanceof Error?e.message:"Investigation operation failed.");}
    finally{setBusy(false);}
  }
  async function loadCases(){
    const response=await call("incidentInbox",{limit:30});
    if(response.ok!==true||response.source!=="authenticated_server"||
       response.allFailuresMeasured!==false||!Array.isArray(response.rows)||
       response.rows.length>30){
      throw Error("Unverified owner incident list.");
    }
    const rows=response.rows as Incident[];
    if(rows.some(c=>typeof c.id!=="string"||typeof c.title!=="string"||
      !Number.isInteger(c.revision)||
      !["open","investigating","resolved"].includes(c.status))){
      throw Error("Incorrect case metadata.");
    }
    setCases(rows);
    if(selected&&!rows.some(c=>c.id===selected))setSelected("");
    setNotice("Loaded existing cases; this is not automated incident detection.");
  }
  async function loadDetails(id=selected){
    if(!id)throw Error("Select a real incident.");
    const response=await call("investigationPlanRead",{incidentId:id});
    if(response.ok!==true||response.source!=="authenticated_server"||
       response.incidentId!==id||
       response.externalExecutionTriggered!==false||
       !Number.isInteger(response.incidentRevision)||
       !Number.isInteger(response.evidenceCount)||
       !["open","investigating","resolved"].includes(String(response.incidentStatus))||
       !Array.isArray(response.events)||response.events.length>8){
      throw Error("Unverified investigation detail response.");
    }
    const plan=response.plan as Plan|null;
    if(plan&&(
      typeof plan.id!=="string"||!["draft","reviewed","closed"].includes(plan.stage)||
      !Number.isInteger(plan.revision)||!Array.isArray(plan.steps)||
      plan.steps.some(s=>!catalog.some(x=>x.id===s))||
      !Number.isInteger(plan.acknowledged))){
      throw Error("Invalid stored plan.");
    }
    const entries=response.events as Event[];
    if(entries.some(e=>typeof e.id!=="number"||
      !["step_acknowledged","reviewed","closed"].includes(e.kind)||
      typeof e.note!=="string"||typeof e.created_at!=="string")){
      throw Error("Invalid plan audit event.");
    }
    setDetails({
      incidentId:id,incidentStatus:response.incidentStatus as Incident["status"],
      incidentRevision:Number(response.incidentRevision),
      evidenceCount:Number(response.evidenceCount),plan,events:entries,
    });
    const next=plan?.steps.find(s=>!entries.some(e=>
      e.kind==="step_acknowledged"&&e.step_kind===s));
    if(next)setStepToAck(next);
    setNotice("Loaded real plan state and recorded review attestations.");
  }
  async function createPlan(){
    if(!details||!active||details.incidentId!==active.id||
      details.plan||details.incidentStatus!=="investigating"||
      details.evidenceCount<1||selectedSteps.length<1){
      throw Error("An investigating case with captured evidence is required.");
    }
    if(!window.confirm("Create a manual-only investigation checklist for this evidence-backed incident? No external remediation will be started."))return;
    const signature=JSON.stringify(["create",active.id,details.incidentRevision,selectedSteps]);
    const key=pending.current?.signature===signature
      ?pending.current.key:crypto.randomUUID();
    pending.current={signature,key};
    const res=await call("investigationPlanCreate",{
      incidentId:active.id,incidentRevision:details.incidentRevision,
      steps:selectedSteps,requestKey:key,
    });
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.externalExecutionTriggered!==false||res.automaticRestore!==false||
       res.noExternalExecution!==true||typeof res.planId!=="string"){
      throw Error("Plan creation not verified. Retry uses the original request key.");
    }
    pending.current=null;await loadDetails(active.id);
    setNotice("Evidence-gated investigation plan created. No workflow was run.");
  }
  async function acknowledgeStep(){
    const plan=details?.plan;
    if(!plan||plan.stage!=="draft"||
      !plan.steps.includes(stepToAck)||
      details?.events.some(e=>e.kind==="step_acknowledged"&&e.step_kind===stepToAck)){
      throw Error("Choose an unacknowledged planned review step.");
    }
    const note=ackNote.trim();
    if(note.length<12||note.length>500)throw Error("Enter a 12–500 character personal review note.");
    if(!window.confirm("Record YOUR review acknowledgment for "+stepToAck.replaceAll("_"," ")+"? This is not automated verification or execution."))return;
    const signature=JSON.stringify(["ack",plan.id,plan.revision,stepToAck,note]);
    const key=pending.current?.signature===signature
      ?pending.current.key:crypto.randomUUID();
    pending.current={signature,key};
    const res=await call("investigationStepAck",{
      planId:plan.id,expectedRevision:plan.revision,
      stepKind:stepToAck,note,requestKey:key,
    });
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.externalExecutionTriggered!==false||res.userAttestationOnly!==true||
       res.noExternalExecution!==true||typeof res.revision!=="number"){
      throw Error("Review acknowledgment was not verified.");
    }
    pending.current=null;setAckNote("");
    await loadDetails();
    setNotice("Manual acknowledgment stored. No system health or workflow execution was inferred.");
  }
  async function transition(nextStage:"reviewed"|"closed"){
    const plan=details?.plan;
    if(!plan)throw Error("Load an existing plan.");
    const note=stageNote.trim();
    if(note.length<12||note.length>500)throw Error("Add a 12–500 character sign-off explanation.");
    if(nextStage==="reviewed"&&
       (plan.stage!=="draft"||plan.acknowledged!==plan.steps.length||
        details?.incidentStatus!=="investigating")){
      throw Error("All chosen steps require recorded acknowledgments and the case must be investigating.");
    }
    if(nextStage==="closed"&&
       (plan.stage!=="reviewed"||details?.incidentStatus!=="resolved")){
      throw Error("Close a reviewed plan only after the separate incident has been resolved.");
    }
    if(!window.confirm("Record "+nextStage+" for this manual investigation plan? This does NOT start a retry, change a schedule or approve any external action."))return;
    const signature=JSON.stringify(["transition",plan.id,plan.revision,nextStage,note]);
    const key=pending.current?.signature===signature
      ?pending.current.key:crypto.randomUUID();
    pending.current={signature,key};
    const res=await call("investigationPlanTransition",{
      planId:plan.id,expectedRevision:plan.revision,
      nextStage,note,requestKey:key,
    });
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.externalExecutionTriggered!==false||res.userAttestationOnly!==true||
       res.noExternalExecution!==true||res.stage!==nextStage){
      throw Error("Plan stage change was not verified.");
    }
    pending.current=null;setStageNote("");
    await loadDetails();
    setNotice("Manual plan sign-off stored. The workflow, triggers and schedules were unchanged.");
  }
  async function loadTrend(){
    const res=await call("incidentDailyTrend",{days});
    if(res.ok!==true||res.source!=="authenticated_server"||
      res.executed!==false||res.reportSource!=="recorded_incident_activity"){
      throw Error("Daily trend source could not be authenticated.");
    }
    const rows=verifiedIncidentTrend(res);
    if(rows.rangeDays!==days)throw Error("Unexpected trend report period.");
    setTrend(rows);
    setNotice("Loaded actual UTC day counts for manually reported cases.");
  }
  const acknowledged=new Set(details?.events.filter(e=>e.kind==="step_acknowledged")
    .map(e=>e.step_kind));
  const remaining=details?.plan?.steps.filter(s=>!acknowledged.has(s))??[];
  const maxTrend=Math.max(1,...(trend?.days.map(r=>Math.max(r.casesOpened,r.resolutionEvents))??[1]));
  return <section aria-labelledby="eternyx-investigation-title"
    className="space-y-4 rounded-xl border border-primary/20 p-4">
    <h4 id="eternyx-investigation-title" className="flex items-center gap-2 font-semibold">
      <BookOpen className="size-4 text-primary"/> Manual investigation plans & measured case trends
    </h4>
    <p className="text-xs leading-5 text-muted-foreground">
      Evidence-gated checklists, recorded human review acknowledgments, separate
      case/plan closure, and real UTC activity. Nothing here runs a workflow,
      changes an active schedule, restores a quarantine, or verifies worker uptime.
    </p>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Review plan tied to a real incident</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
          onClick={()=>void perform(loadCases)}><RefreshCcw className="mr-2 size-4"/> Load cases</Button>
        <label className="text-xs">Incident
          <select className="ml-2 max-w-64 rounded border border-input bg-background p-2"
            value={selected} disabled={busy||disabled}
            onChange={e=>setSelected(e.target.value)}>
            <option value="">Select owner case</option>
            {cases.map(c=><option key={c.id} value={c.id}>
              {c.title.slice(0,55)} · {c.status}</option>)}
          </select>
        </label>
        <Button type="button" size="sm" variant="outline" disabled={busy||disabled||!active}
          onClick={()=>void perform(()=>loadDetails())}>Load stored plan</Button>
      </div>
      {details&&<div className="space-y-3 text-xs text-muted-foreground">
        <p>Incident status: <strong>{details.incidentStatus}</strong> · case revision
          {" "}{details.incidentRevision} · captured evidence snapshots:
          {" "}{details.evidenceCount}. Plan creation requires investigation and evidence.</p>
        {!details.plan&&<div className="space-y-3">
          <p className="font-medium text-foreground">Choose 1–6 manual review steps</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {catalog.map(step=><label key={step.id}
              className="flex items-center gap-2 rounded border border-border/70 p-2">
              <Checkbox checked={selectedSteps.includes(step.id)}
                disabled={busy||disabled||(!selectedSteps.includes(step.id)&&selectedSteps.length>=6)}
                onCheckedChange={v=>setSelectedSteps(old=>v===true
                  ?old.includes(step.id)?old:[...old,step.id]
                  :old.filter(x=>x!==step.id))}/>
              <span>{step.label}</span>
            </label>)}
          </div>
          <Button type="button" size="sm" disabled={busy||disabled||
            details.incidentStatus!=="investigating"||details.evidenceCount<1||
            selectedSteps.length<1} onClick={()=>void perform(createPlan)}>
            Create evidence-gated review plan
          </Button>
        </div>}
        {details.plan&&<div className="space-y-3">
          <p className="font-semibold text-foreground">Stored plan · {details.plan.stage} ·
            version {details.plan.revision} · {details.plan.acknowledged}/
            {details.plan.steps.length} human acknowledgments</p>
          <ul className="space-y-2">
            {details.plan.steps.map(step=><li key={step}
              className="flex gap-2 rounded border border-border/60 p-2">
              <span>{acknowledged.has(step)?"✓":"○"}</span>
              <span>{catalog.find(x=>x.id===step)?.label??step}</span>
            </li>)}
          </ul>
          {details.plan.stage==="draft"&&<>
            <label className="block">Unacknowledged step
              <select className="ml-2 rounded border border-input bg-background p-2"
                disabled={busy||disabled} value={remaining.includes(stepToAck)?stepToAck:(remaining[0]??"")}
                onChange={e=>setStepToAck(e.target.value as Step)}>
                {remaining.map(step=><option key={step} value={step}>
                  {catalog.find(x=>x.id===step)?.label??step}</option>)}
              </select>
            </label>
            <label className="block">What you personally reviewed (12–500 characters)
              <Textarea className="mt-1" rows={3} maxLength={500} value={ackNote}
                disabled={busy||disabled} onChange={e=>setAckNote(e.target.value)}/>
            </label>
            <Button type="button" size="sm" variant="outline"
              disabled={busy||disabled||remaining.length===0||ackNote.trim().length<12||
                details.incidentStatus!=="investigating"}
              onClick={()=>void perform(acknowledgeStep)}>
              <ClipboardCheck className="mr-2 size-4"/> Record human review acknowledgment
            </Button>
          </>}
          {(details.plan.stage==="draft"||details.plan.stage==="reviewed")&&<>
            <label className="block">Sign-off rationale (12–500 characters)
              <Textarea className="mt-1" rows={3} maxLength={500}
                disabled={busy||disabled} value={stageNote}
                onChange={e=>setStageNote(e.target.value)}/>
            </label>
            <div className="flex flex-wrap gap-2">
              {details.plan.stage==="draft"&&<Button type="button" size="sm"
                disabled={busy||disabled||details.plan.acknowledged!==details.plan.steps.length||
                  stageNote.trim().length<12||details.incidentStatus!=="investigating"}
                onClick={()=>void perform(()=>transition("reviewed"))}>
                <ShieldCheck className="mr-2 size-4"/> Sign off reviewed
              </Button>}
              {details.plan.stage==="reviewed"&&<Button type="button" size="sm"
                variant="outline" disabled={busy||disabled||
                  stageNote.trim().length<12||details.incidentStatus!=="resolved"}
                onClick={()=>void perform(()=>transition("closed"))}>
                Close plan after separate case resolution
              </Button>}
            </div>
          </>}
          <p className="font-medium">Recorded attestations and stage events</p>
          <ol className="space-y-2">
            {details.events.map(event=><li key={event.id}
              className="rounded border border-border/60 p-2">
              <span className="font-medium">{event.kind.replaceAll("_"," ")}
                {event.step_kind?" · "+event.step_kind.replaceAll("_"," "):""}
                {" "}· {fmt(event.created_at)}</span>
              <p className="whitespace-pre-wrap">{event.note}</p>
            </li>)}
          </ol>
          <p>Plan stage means documented human review only; no automatic
            root-cause determination, credential rotation, or recovery execution.</p>
        </div>}
      </div>}
    </div>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Actual UTC daily case activity</p>
      <p className="text-xs text-muted-foreground">
        Per-day counts of manually opened incidents and recorded resolution
        transitions. Not failed job volume, system uptime, or automatic detection.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs">Days
          <select className="ml-2 rounded border border-input bg-background p-2"
            value={days} disabled={busy||disabled}
            onChange={e=>setDays(Number(e.target.value) as 7|30)}>
            <option value={7}>Last 7 UTC days</option>
            <option value={30}>Last 30 UTC days</option>
          </select>
        </label>
        <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
          onClick={()=>void perform(loadTrend)}>Load measured daily trend</Button>
        {trend&&<Button type="button" size="sm" variant="outline"
          disabled={busy||disabled}
          onClick={()=>downloadCSV(incidentTrendCsv(trend))}>
          <Download className="mr-2 size-4"/> Safe CSV
        </Button>}
      </div>
      {trend&&<>
        <p className="text-xs text-muted-foreground">
          {trend.casesOpened} actual case openings and {trend.resolutionEvents}
          {" "}recorded resolution events across {trend.rangeDays} UTC dates.
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {trend.days.map(day=><div key={day.date}
            className="grid grid-cols-[6rem_1fr_4rem] gap-2 items-center text-xs text-muted-foreground">
            <span className="font-mono">{day.date}</span>
            <div className="space-y-1" aria-hidden="true">
              <div className="h-2 rounded bg-primary/70"
                style={{width:(day.casesOpened/maxTrend*100)+"%"}}/>
              <div className="h-1.5 rounded bg-muted-foreground/60"
                style={{width:(day.resolutionEvents/maxTrend*100)+"%"}}/>
            </div>
            <span>{day.casesOpened} / {day.resolutionEvents}</span>
          </div>)}
        </div>
        <p className="text-xs text-muted-foreground">
          Each row: cases opened / resolution events. Chart bars are proportional
          within the selected period; zero bars reflect no recorded case activity.
        </p>
      </>}
    </div>
    <p className="text-xs text-muted-foreground">
      Notes record owner attestations; avoid passwords, customer data and API tokens.
      Existing policies, schedule authorization and real operations remain separate.
    </p>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
