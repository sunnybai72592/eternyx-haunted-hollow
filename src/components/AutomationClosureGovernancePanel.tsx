import {useEffect,useRef,useState} from "react";
import {ShieldCheck,ShieldAlert,RefreshCcw,ClipboardCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {supabase} from "@/integrations/supabase/client";

type Incident={id:string;title:string;revision:number;
  status:"open"|"investigating"|"resolved";severity:string};
type Decision="defer"|"approve";
type Latest={id:string;decision:Decision;createdAt:string;
  incidentRevision:number;planRevision:number};
type Preflight={
  incidentId:string;incidentStatus:Incident["status"];incidentRevision:number;
  hasPlan:boolean;governedClosureRequired:boolean;
  planId?:string;planStage:"draft"|"reviewed"|"closed"|null;
  planRevision:number|null;capturedEvidence:number;
  acknowledgedSteps:number;plannedSteps:number;decisionCount:number;
  latestDecision:Latest|null;approvalCurrent:boolean;
  eligibleForApproval:boolean;readyToResolve:boolean;
  legacyNoPlanPath:boolean;externalExecutionTriggered:false;
};
type History={
  id:string;decision:Decision;note:string;
  incident_revision:number;plan_revision:number;
  evidence_count:number;acknowledged_steps:number;created_at:string;
};
async function invoke(action:string,params:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("automation-control",{
    body:{action,...params},
  });
  if(error){
    let message="Closure service unavailable; verify that migration and Edge function have been deployed.";
    try{
      const response=error.context as Response;
      if(response&&typeof response.json==="function"){
        const body=await response.json();
        if(typeof body?.code==="string"&&body.code.length<70)message+=" ("+body.code+")";
      }
    }catch{/* keep safe error */}
    throw Error(message);
  }
  if(!data||typeof data!=="object"||Array.isArray(data)){
    throw Error("Unverified closure response.");
  }
  return data as Record<string,unknown>;
}
function niceDate(timestamp:string){
  const date=new Date(timestamp);
  return Number.isNaN(date.getTime())?"Unknown":date.toLocaleString();
}
export default function AutomationClosureGovernancePanel({disabled}:{disabled:boolean}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [cases,setCases]=useState<Incident[]>([]);
  const [selected,setSelected]=useState("");
  const [check,setCheck]=useState<Preflight|null>(null);
  const [history,setHistory]=useState<History[]>([]);
  const [decision,setDecision]=useState<Decision>("defer");
  const [reviewNote,setReviewNote]=useState("");
  const [resolveNote,setResolveNote]=useState("");
  const pendingDecision=useRef<{signature:string;key:string}|null>(null);
  const pendingResolve=useRef<{signature:string;key:string}|null>(null);
  const active=cases.find(c=>c.id===selected);
  useEffect(()=>{
    setCheck(null);setHistory([]);setReviewNote("");setResolveNote("");
    pendingDecision.current=null;pendingResolve.current=null;
  },[selected]);
  async function perform(fn:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await fn();}
    catch(err){setError(err instanceof Error?err.message:"Incident closure operation failed.");}
    finally{setBusy(false);}
  }
  async function loadCases(){
    const res=await invoke("incidentInbox",{limit:30});
    if(res.ok!==true||res.source!=="authenticated_server"||
      res.allFailuresMeasured!==false||!Array.isArray(res.rows)||
      res.rows.length>30){
      throw Error("Owner incident inbox is not verified.");
    }
    const rows=res.rows as Incident[];
    if(rows.some(v=>typeof v.id!=="string"||typeof v.title!=="string"||
      !["open","investigating","resolved"].includes(v.status)||
      !Number.isInteger(v.revision))){
      throw Error("Unexpected case metadata.");
    }
    setCases(rows);
    if(selected&&!rows.some(v=>v.id===selected))setSelected("");
    setNotice("Loaded actual owner incidents, not automated runtime alerts.");
  }
  async function loadPreflight(id=selected){
    if(!id)throw Error("Select a stored incident.");
    const res=await invoke("incidentClosurePreflight",{incidentId:id});
    if(res.ok!==true||res.source!=="authenticated_server"||
      res.incidentId!==id||res.externalExecutionTriggered!==false||
      res.automaticRestore!==false||
      typeof res.hasPlan!=="boolean"||
      typeof res.governedClosureRequired!=="boolean"||
      typeof res.approvalCurrent!=="boolean"||
      typeof res.readyToResolve!=="boolean"||
      typeof res.eligibleForApproval!=="boolean"||
      !Number.isInteger(res.incidentRevision)){
      throw Error("Closure preflight is not verified owner metadata.");
    }
    if(res.hasPlan&&(
      typeof res.planId!=="string"||
      !["draft","reviewed","closed"].includes(String(res.planStage))||
      !Number.isInteger(res.planRevision)||
      !Number.isInteger(res.capturedEvidence)||
      !Number.isInteger(res.plannedSteps)||
      !Number.isInteger(res.acknowledgedSteps)||
      !Number.isInteger(res.decisionCount))){
      throw Error("Invalid saved investigation plan preflight.");
    }
    if(res.readyToResolve===true&&
      (res.approvalCurrent!==true||res.eligibleForApproval!==true)){
      throw Error("Closure decision and readiness signals are inconsistent.");
    }
    const hist=await invoke("incidentClosureHistory",{incidentId:id});
    if(hist.ok!==true||hist.source!=="authenticated_server"||
      hist.incidentId!==id||hist.userAttestationOnly!==true||
      hist.externalExecutionTriggered!==false||!Array.isArray(hist.rows)||
      hist.rows.length>5||!Number.isInteger(hist.total)){
      throw Error("Closure decision history was not verified.");
    }
    const list=hist.rows as History[];
    if(list.some(x=>typeof x.id!=="string"||
       !["defer","approve"].includes(x.decision)||
       typeof x.note!=="string"||!Number.isInteger(x.incident_revision)||
       !Number.isInteger(x.plan_revision))){
      throw Error("Invalid decision timeline.");
    }
    setCheck(res as unknown as Preflight);setHistory(list);
    setNotice("Read actual case, plan, evidence and decision metadata. No workflow was executed.");
  }
  async function saveDecision(){
    if(!check||check.incidentId!==selected||!check.hasPlan||
       !check.eligibleForApproval||check.planRevision===null){
      throw Error("Evidence-backed reviewed plan and investigating case are required.");
    }
    const note=reviewNote.trim();
    if(note.length<12||note.length>500){
      throw Error("Write a 12–500 character owner review rationale.");
    }
    if(!window.confirm("Record your manual "+decision+
      " decision for this incident? This does NOT resolve it or start any job."))return;
    const signature=JSON.stringify([selected,check.incidentRevision,
      check.planRevision,decision,note]);
    const key=pendingDecision.current?.signature===signature
      ?pendingDecision.current.key:crypto.randomUUID();
    pendingDecision.current={signature,key};
    const res=await invoke("incidentClosureDecision",{
      incidentId:selected,incidentRevision:check.incidentRevision,
      planRevision:check.planRevision,decision,note,requestKey:key,
    });
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.decision!==decision||res.automaticallyResolved!==false||
       res.externalExecutionTriggered!==false||
       typeof res.decisionId!=="string"){
      throw Error("Manual closure decision not verified. A retry preserves the original request UUID.");
    }
    pendingDecision.current=null;setReviewNote("");
    await loadPreflight();
    setNotice("Immutable owner closure decision recorded. Incident and workflow states were not changed.");
  }
  async function resolveCase(){
    if(!check||!check.readyToResolve||!check.approvalCurrent||
       !active||active.id!==selected||check.incidentStatus!=="investigating"){
      throw Error("Load a currently approved closure preflight before requesting resolution.");
    }
    const note=resolveNote.trim();
    if(note.length<8||note.length>500)throw Error("Enter an 8–500 character incident resolution note.");
    if(!window.confirm("SEPARATELY RESOLVE this incident now? The server will recheck the latest closure approval and case revision. It will not retry, resume or execute any workflow."))return;
    const signature=JSON.stringify([selected,check.incidentRevision,note,"resolved"]);
    const key=pendingResolve.current?.signature===signature
      ?pendingResolve.current.key:crypto.randomUUID();
    pendingResolve.current={signature,key};
    const res=await invoke("incidentTransition",{
      incidentId:selected,expectedRevision:check.incidentRevision,
      nextStatus:"resolved",note,requestKey:key,
    });
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.externalExecutionTriggered!==false||res.status!=="resolved"||
       typeof res.revision!=="number"){
      throw Error("Separate incident resolution was not verified.");
    }
    pendingResolve.current=null;setResolveNote("");
    await loadCases();await loadPreflight();
    setNotice("Incident resolved after a separately reviewed closure decision. No job ran or schedule changed.");
  }
  const ready=check?.hasPlan&&check.eligibleForApproval;
  return <section aria-labelledby="eternyx-phase-2p-heading"
    className="space-y-4 rounded-xl border border-primary/20 p-4">
    <h4 id="eternyx-phase-2p-heading" className="flex items-center gap-2 font-semibold">
      <ShieldCheck className="size-4 text-primary"/> Governed incident closure & manual safety review
    </h4>
    <p className="text-xs leading-5 text-muted-foreground">
      A reviewed investigation plan and recorded evidence must receive an
      explicit, current manual approval before its incident can be resolved.
      A deferral blocks closure. This is one owner’s attestation—not
      independent two-person approval, automated proof, or system recovery.
    </p>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
          onClick={()=>void perform(loadCases)}>
          <RefreshCcw className="mr-2 size-4"/> Load owner incidents
        </Button>
        <label className="text-xs">Incident
          <select value={selected} disabled={busy||disabled}
            onChange={e=>setSelected(e.target.value)}
            className="ml-2 max-w-64 rounded border border-input bg-background p-2">
            <option value="">Select actual case</option>
            {cases.map(v=><option key={v.id} value={v.id}>
              {v.title.slice(0,58)} · {v.status}</option>)}
          </select>
        </label>
        <Button type="button" size="sm" variant="outline"
          disabled={busy||disabled||!selected}
          onClick={()=>void perform(()=>loadPreflight())}>Verify closure readiness</Button>
      </div>
      {check&&<div className="space-y-2 text-xs text-muted-foreground">
        <p>Case: <strong>{check.incidentStatus}</strong> · revision {check.incidentRevision}.
          {" "}{check.hasPlan?
            "A documented plan exists and governed closure is mandatory.":
            "No plan exists; legacy case resolution uses the separate existing incident controls."}
        </p>
        {check.hasPlan&&<>
          <p>Plan: {check.planStage} · revision {check.planRevision} ·
            captured evidence {check.capturedEvidence} ·
            acknowledged steps {check.acknowledgedSteps}/{check.plannedSteps}.
          </p>
          <p>Eligible for review decision:
            {" "}{check.eligibleForApproval?"Yes":"No"} ·
            current approval: {check.approvalCurrent?"Yes":"No"} ·
            latest decision: {check.latestDecision?.decision??"None"} ·
            recorded decisions: {check.decisionCount}.
          </p>
          {check.readyToResolve?
            <p className="font-semibold text-foreground">Manual approval is current.
              Resolution requires an additional explicit confirmation.</p>:
            <p className="flex gap-2 items-start"><ShieldAlert className="size-4 shrink-0"/>
              Closure is blocked until evidence, reviewed plan, current approval
              and matching revisions are all present.</p>}
        </>}
      </div>}
    </div>
    {ready&&<div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Record a versioned manual closure decision</p>
      <label className="block text-xs">Decision
        <select value={decision} disabled={busy||disabled}
          onChange={e=>setDecision(e.target.value as Decision)}
          className="ml-2 rounded border border-input bg-background p-2">
          <option value="defer">Defer resolution — remain investigating</option>
          <option value="approve">Approve a separate manual resolution</option>
        </select>
      </label>
      <label className="block text-xs">Review rationale (12–500 characters)
        <Textarea rows={3} className="mt-1" maxLength={500}
          disabled={busy||disabled} value={reviewNote}
          onChange={e=>setReviewNote(e.target.value)}/>
      </label>
      <Button type="button" size="sm" variant="outline"
        disabled={busy||disabled||reviewNote.trim().length<12}
        onClick={()=>void perform(saveDecision)}>
        <ClipboardCheck className="mr-2 size-4"/> Record manual decision
      </Button>
      <p className="text-xs text-muted-foreground">
        At most five decisions per incident, ten new decisions per account
        per rolling 24 hours. Same request UUID replays without duplicating.
        Latest defer or a changed plan/case revision blocks resolution.
      </p>
    </div>}
    {check?.readyToResolve&&<div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Separate incident resolution</p>
      <p className="text-xs text-muted-foreground">
        The database verifies the latest approved decision again during the
        incident status transaction. Resolving an incident only changes its
        case lifecycle and appends an incident event; no schedule is restored.
      </p>
      <label className="block text-xs">Incident resolution note (8–500 characters)
        <Textarea rows={3} className="mt-1" value={resolveNote}
          maxLength={500} disabled={busy||disabled}
          onChange={e=>setResolveNote(e.target.value)}/>
      </label>
      <Button type="button" size="sm" disabled={busy||disabled||
        resolveNote.trim().length<8}
        onClick={()=>void perform(resolveCase)}>Resolve case after governed approval</Button>
    </div>}
    {check&&<div className="space-y-2 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Immutable closure decision history</p>
      <p className="text-xs text-muted-foreground">
        These are recorded owner attestations, not independent audit certification.
      </p>
      {history.length===0&&<p className="text-xs text-muted-foreground">
        No closure decisions recorded for this incident.
      </p>}
      <ol className="space-y-2">
        {history.map(record=><li key={record.id}
          className="rounded border border-border/60 p-2 text-xs text-muted-foreground">
          <p className="font-medium">{record.decision.toUpperCase()} ·
            {" "}{niceDate(record.created_at)}</p>
          <p>Incident revision {record.incident_revision} · plan revision
            {" "}{record.plan_revision} · evidence snapshots
            {" "}{record.evidence_count} · manual steps
            {" "}{record.acknowledged_steps}</p>
          <p className="mt-1 whitespace-pre-wrap">{record.note}</p>
        </li>)}
      </ol>
    </div>}
    <p className="text-xs text-muted-foreground">
      Case approval never provides permission to run a job, resume a
      schedule or dispatch a webhook. Avoid secrets and customer content
      in notes. Existing no-plan incidents remain backward compatible.
    </p>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
