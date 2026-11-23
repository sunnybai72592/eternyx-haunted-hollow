import {useEffect,useRef,useState} from "react";
import {RotateCcw,ShieldCheck,Download,RefreshCcw,History,ShieldAlert} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {supabase} from "@/integrations/supabase/client";
import {verifiedIncidentAuditTrace,incidentAuditCsv} from "@/lib/automationIncidentAuditTrace.mjs";

type Incident={id:string;title:string;revision:number;
  status:"open"|"investigating"|"resolved";severity:string};
type ReopenDecision="hold"|"approve";
type ReopenReason="new_evidence"|"recurrence"|"incomplete_review"|"other";
type ReopenPreflight={
  incidentId:string;incidentStatus:Incident["status"];incidentRevision:number;
  hasPlan:boolean;governedReopenRequired:boolean;planId?:string;
  planRevision:number|null;planStage:"draft"|"reviewed"|"closed"|null;
  evidenceCount:number;decisionCount:number;latestDecision:{
    id:string;decision:ReopenDecision;reason:ReopenReason;evidenceId:string;
    incidentRevision:number;planRevision:number;createdAt:string;
  }|null;eligibleForReview:boolean;approvalCurrent:boolean;
  readyToReopen:boolean;legacyNoPlanPath:boolean;externalExecutionTriggered:false;
};
type Evidence={id:string;evidence_kind:string;source_id:string;captured_at:string};
type ReopenHistory={
  id:string;decision_sequence:number;decision:ReopenDecision;
  reason:ReopenReason;note:string;evidence_id:string;
  incident_revision:number;plan_revision:number;created_at:string;
};
type Audit=ReturnType<typeof verifiedIncidentAuditTrace>;
const reasons=[
  {id:"new_evidence",label:"New evidence requires further review"},
  {id:"recurrence",label:"Previously reported problem recurred"},
  {id:"incomplete_review",label:"Original manual investigation was incomplete"},
  {id:"other",label:"Another documented reason"},
] as const;
async function call(action:string,params:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("automation-control",{
    body:{action,...params},
  });
  if(error){
    let message="Reopening service unavailable; check the database migration and Edge deployment.";
    try{
      const res=error.context as Response;
      if(res&&typeof res.json==="function"){
        const body=await res.json();
        if(typeof body?.code==="string"&&body.code.length<70)message+=" ("+body.code+")";
      }
    }catch{/* retain safe message */}
    throw Error(message);
  }
  if(!data||typeof data!=="object"||Array.isArray(data)){
    throw Error("Unexpected incident governance response.");
  }
  return data as Record<string,unknown>;
}
function dateText(value:string){
  const d=new Date(value);
  return Number.isNaN(d.getTime())?"Unknown":d.toLocaleString();
}
function download(filename:string,contents:string,type:string){
  const url=URL.createObjectURL(new Blob([contents],{type}));
  const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),0);
}
export default function AutomationReopenGovernancePanel({disabled}:{disabled:boolean}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [cases,setCases]=useState<Incident[]>([]);
  const [selected,setSelected]=useState("");
  const [preflight,setPreflight]=useState<ReopenPreflight|null>(null);
  const [evidence,setEvidence]=useState<Evidence[]>([]);
  const [evidenceId,setEvidenceId]=useState("");
  const [decision,setDecision]=useState<ReopenDecision>("hold");
  const [reason,setReason]=useState<ReopenReason>("recurrence");
  const [decisionNote,setDecisionNote]=useState("");
  const [reopenNote,setReopenNote]=useState("");
  const [history,setHistory]=useState<ReopenHistory[]>([]);
  const [audit,setAudit]=useState<Audit|null>(null);
  const pendingDecision=useRef<{signature:string;key:string}|null>(null);
  const pendingTransition=useRef<{signature:string;key:string}|null>(null);
  const selectedCase=cases.find(c=>c.id===selected);
  useEffect(()=>{
    setPreflight(null);setEvidence([]);setEvidenceId("");setHistory([]);
    setAudit(null);setDecisionNote("");setReopenNote("");
    pendingDecision.current=null;pendingTransition.current=null;
  },[selected]);
  async function perform(fn:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await fn();}
    catch(e){setError(e instanceof Error?e.message:"Reopening operation failed.");}
    finally{setBusy(false);}
  }
  async function loadCases(){
    const result=await call("incidentInbox",{limit:30});
    if(result.ok!==true||result.source!=="authenticated_server"||
       result.allFailuresMeasured!==false||!Array.isArray(result.rows)||
       result.rows.length>30){
      throw Error("Incident case list is not owner-verified.");
    }
    const list=result.rows as Incident[];
    if(list.some(x=>typeof x.id!=="string"||typeof x.title!=="string"||
      !Number.isInteger(x.revision)||
      !["open","investigating","resolved"].includes(x.status))){
      throw Error("Invalid persisted case record.");
    }
    setCases(list);
    if(selected&&!list.some(x=>x.id===selected))setSelected("");
    setNotice("Loaded genuine owner cases. These are manually recorded incidents.");
  }
  async function loadReopen(id=selected){
    if(!id)throw Error("Choose an incident.");
    const [res,hist,proof]=await Promise.all([
      call("incidentReopenPreflight",{incidentId:id}),
      call("incidentReopenHistory",{incidentId:id}),
      call("incidentEvidence",{incidentId:id}),
    ]);
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.incidentId!==id||res.externalExecutionTriggered!==false||
       res.automaticReopen!==false||
       !Number.isInteger(res.incidentRevision)||
       typeof res.hasPlan!=="boolean"||
       typeof res.approvalCurrent!=="boolean"||
       typeof res.eligibleForReview!=="boolean"||
       typeof res.readyToReopen!=="boolean"){
      throw Error("Unverified reopening preflight.");
    }
    if(res.hasPlan&&(
      !Number.isInteger(res.planRevision)||
      !Number.isInteger(res.evidenceCount)||
      !Number.isInteger(res.decisionCount)||
      !["reviewed","closed","draft"].includes(String(res.planStage)))){
      throw Error("Invalid reopening plan metadata.");
    }
    if(res.readyToReopen===true&&
      (res.approvalCurrent!==true||res.eligibleForReview!==true)){
      throw Error("Inconsistent reopening approval state.");
    }
    if(hist.ok!==true||hist.source!=="authenticated_server"||
       hist.incidentId!==id||hist.userAttestationOnly!==true||
       hist.externalExecutionTriggered!==false||!Array.isArray(hist.rows)||
       hist.rows.length>5||!Number.isInteger(hist.total)){
      throw Error("Unverified owner reopening history.");
    }
    const h=hist.rows as ReopenHistory[];
    if(h.some(x=>typeof x.id!=="string"||
      !["hold","approve"].includes(x.decision)||
      !reasons.some(r=>r.id===x.reason)||
      typeof x.note!=="string"||typeof x.created_at!=="string"||
      typeof x.evidence_id!=="string")){
      throw Error("Unexpected reopening audit entry.");
    }
    if(proof.ok!==true||proof.source!=="authenticated_server"||
       proof.incidentId!==id||proof.rawInputsIncluded!==false||
       proof.rawOutputsIncluded!==false||!Array.isArray(proof.rows)||
       proof.rows.length>8){
      throw Error("Owner evidence list was not verified.");
    }
    const e=proof.rows as Evidence[];
    if(e.some(x=>typeof x.id!=="string"||
      typeof x.evidence_kind!=="string"||typeof x.captured_at!=="string")){
      throw Error("Invalid stored evidence receipt.");
    }
    setPreflight(res as unknown as ReopenPreflight);
    setHistory(h);setEvidence(e);
    setEvidenceId(old=>e.some(x=>x.id===old)?old:(e[0]?.id??""));
    setAudit(null);
    setNotice("Verified current case/plan revision, related stored evidence, and manual decision history.");
  }
  async function saveDecision(){
    const p=preflight;
    if(!p||p.incidentId!==selected||!p.hasPlan||
       !p.eligibleForReview||p.planRevision===null||
       !evidence.some(x=>x.id===evidenceId)){
      throw Error("A resolved, reviewed case and an actual owned evidence receipt are required.");
    }
    const note=decisionNote.trim();
    if(note.length<12||note.length>500){
      throw Error("Write a 12–500-character nonsecret justification.");
    }
    if(!window.confirm("Record your manual "+decision+" decision for this exact case and evidence revision? This does not reopen the case or run an automation."))return;
    const signature=JSON.stringify([selected,p.incidentRevision,p.planRevision,
      evidenceId,decision,reason,note]);
    const key=pendingDecision.current?.signature===signature
      ?pendingDecision.current.key:crypto.randomUUID();
    pendingDecision.current={signature,key};
    const result=await call("incidentReopenDecision",{
      incidentId:selected,incidentRevision:p.incidentRevision,
      planRevision:p.planRevision,evidenceId,decision,reason,note,requestKey:key,
    });
    if(result.ok!==true||result.source!=="authenticated_server"||
       result.decision!==decision||result.evidenceId!==evidenceId||
       result.automaticReopen!==false||
       result.externalExecutionTriggered!==false||
       typeof result.decisionId!=="string"){
      throw Error("Decision was not confirmed. Retry uses the original request key.");
    }
    pendingDecision.current=null;setDecisionNote("");
    await loadReopen(selected);
    setNotice("Immutable reopening decision stored. Case and workflow state were not changed.");
  }
  async function reopen(){
    const p=preflight;
    if(!p||p.incidentId!==selected||!p.hasPlan||
       !p.approvalCurrent||!p.readyToReopen||
       p.incidentStatus!=="resolved"){
      throw Error("Refresh a currently approved reopening preflight.");
    }
    const note=reopenNote.trim();
    if(note.length<8||note.length>500){
      throw Error("Incident reopening rationale must be 8–500 characters.");
    }
    if(!window.confirm("SEPARATELY reopen this resolved incident for investigation? Database approval and case revision will be checked again. No job is retried, scheduled or executed."))return;
    const signature=JSON.stringify(["reopen",selected,p.incidentRevision,note]);
    const key=pendingTransition.current?.signature===signature
      ?pendingTransition.current.key:crypto.randomUUID();
    pendingTransition.current={signature,key};
    const result=await call("incidentTransition",{
      incidentId:selected,expectedRevision:p.incidentRevision,
      nextStatus:"investigating",note,requestKey:key,
    });
    if(result.ok!==true||result.source!=="authenticated_server"||
       result.status!=="investigating"||
       result.externalExecutionTriggered!==false||
       typeof result.revision!=="number"){
      throw Error("Governed reopening was not confirmed.");
    }
    pendingTransition.current=null;setReopenNote("");
    await loadCases();await loadReopen(selected);
    setNotice("Incident reopened for manual investigation. Prior closure approval is not permission to resolve again; no workflow ran.");
  }
  async function loadAudit(){
    if(!selected)throw Error("Choose a case.");
    const result=await call("incidentAuditTrace",{incidentId:selected});
    if(result.ok!==true||result.source!=="authenticated_server"||
       result.incidentId!==selected){
      throw Error("Private audit history was not verified.");
    }
    setAudit(verifiedIncidentAuditTrace(result));
    setNotice("Loaded real audit events across five private ledgers; notes and secrets are excluded.");
  }
  return <section aria-labelledby="eternyx-phase-2q-heading"
    className="space-y-4 rounded-xl border border-primary/20 p-4">
    <h4 id="eternyx-phase-2q-heading" className="flex items-center gap-2 font-semibold">
      <RotateCcw className="size-4 text-primary"/> Governed reopening & unified private audit trace
    </h4>
    <p className="text-xs leading-5 text-muted-foreground">
      Incidents with investigation plans need an explicit evidence-linked
      owner approval before reopening. A hold blocks reopening. This does
      not imply fresh verified evidence, external testing, worker health,
      automatic remediation, or two-person approval.
    </p>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline"
          disabled={busy||disabled} onClick={()=>void perform(loadCases)}>
          <RefreshCcw className="mr-2 size-4"/> Load owner cases
        </Button>
        <label className="text-xs">Incident
          <select className="ml-2 max-w-60 rounded border border-input bg-background p-2"
            value={selected} disabled={busy||disabled}
            onChange={e=>setSelected(e.target.value)}>
            <option value="">Select a real case</option>
            {cases.map(c=><option key={c.id} value={c.id}>
              {c.title.slice(0,55)} · {c.status}</option>)}
          </select>
        </label>
        <Button type="button" size="sm" variant="outline"
          disabled={busy||disabled||!selected}
          onClick={()=>void perform(()=>loadReopen())}>
          Verify case, evidence & decisions
        </Button>
      </div>
      {preflight&&<div className="space-y-2 text-xs text-muted-foreground">
        <p>Case <strong>{preflight.incidentStatus}</strong> · revision
          {" "}{preflight.incidentRevision} ·
          {preflight.hasPlan?" governed plan exists":" no plan: existing legacy path applies"}.</p>
        {preflight.hasPlan&&<>
          <p>Plan stage {preflight.planStage} · revision {preflight.planRevision} ·
            actual stored evidence {preflight.evidenceCount} ·
            recorded reopening decisions {preflight.decisionCount}.</p>
          <p>Eligible for manual decision:
            {" "}{preflight.eligibleForReview?"Yes":"No"} ·
            current approval: {preflight.approvalCurrent?"Yes":"No"} ·
            latest decision: {preflight.latestDecision?.decision??"None"} ·
            ready to separately reopen: {preflight.readyToReopen?"Yes":"No"}.</p>
          {!preflight.readyToReopen&&<p className="flex items-center gap-2">
            <ShieldAlert className="size-4 shrink-0"/> A planned case remains
            blocked until a current evidence-linked approval exists.
          </p>}
        </>}
      </div>}
    </div>
    {preflight?.hasPlan&&preflight.eligibleForReview&&
      <div className="space-y-3 rounded-lg border border-border/70 p-3">
        <p className="text-sm font-semibold">Evidence-linked human reopening decision</p>
        <p className="text-xs text-muted-foreground">
          Select an actual stored evidence snapshot related to this incident.
          Existing evidence is not automatically fresh evidence. The owner
          must explain why reopening is necessary.
        </p>
        <label className="block text-xs">Stored source evidence
          <select value={evidenceId} disabled={busy||disabled}
            onChange={e=>setEvidenceId(e.target.value)}
            className="mt-1 w-full rounded border border-input bg-background p-2">
            {evidence.length===0&&<option value="">No stored evidence</option>}
            {evidence.map(v=><option key={v.id} value={v.id}>
              {v.evidence_kind.replaceAll("_"," ")} ·
              {" "}{dateText(v.captured_at)} · {v.id.slice(0,8)}
            </option>)}
          </select>
        </label>
        <label className="block text-xs">Manual decision
          <select value={decision} disabled={busy||disabled}
            onChange={e=>setDecision(e.target.value as ReopenDecision)}
            className="ml-2 rounded border border-input bg-background p-2">
            <option value="hold">Hold — do not reopen</option>
            <option value="approve">Approve separate manual reopening</option>
          </select>
        </label>
        <label className="block text-xs">Reason
          <select value={reason} disabled={busy||disabled}
            onChange={e=>setReason(e.target.value as ReopenReason)}
            className="ml-2 rounded border border-input bg-background p-2">
            {reasons.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label className="block text-xs">Owner rationale (12–500 characters)
          <Textarea className="mt-1" rows={3} maxLength={500}
            value={decisionNote} disabled={busy||disabled}
            onChange={e=>setDecisionNote(e.target.value)}/>
        </label>
        <Button type="button" size="sm" variant="outline"
          disabled={busy||disabled||!evidenceId||decisionNote.trim().length<12}
          onClick={()=>void perform(saveDecision)}>
          <ShieldCheck className="mr-2 size-4"/> Record versioned manual decision
        </Button>
        <p className="text-xs text-muted-foreground">
          Maximum five decisions per case and ten new decisions per owner per
          rolling day. Exact UUID replay is idempotent; changed intent fails.
        </p>
      </div>}
    {preflight?.readyToReopen&&<div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Separate reopening confirmation</p>
      <p className="text-xs text-muted-foreground">
        The database independently checks the latest approval, referenced
        evidence and exact incident/plan revisions. This changes only the
        incident case status, not any schedule or execution policy.
      </p>
      <label className="block text-xs">Incident reopening note (8–500 characters)
        <Textarea rows={3} className="mt-1" maxLength={500}
          value={reopenNote} disabled={busy||disabled}
          onChange={e=>setReopenNote(e.target.value)}/>
      </label>
      <Button type="button" size="sm"
        disabled={busy||disabled||reopenNote.trim().length<8}
        onClick={()=>void perform(reopen)}>
        Reopen case for separate manual investigation
      </Button>
    </div>}
    {preflight&&<div className="space-y-2 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Immutable owner review history</p>
      {history.length===0&&<p className="text-xs text-muted-foreground">
        No reopening decisions recorded.
      </p>}
      <ol className="space-y-2">
        {history.map(v=><li key={v.id}
          className="rounded border border-border/60 p-2 text-xs text-muted-foreground">
          <p className="font-medium">{v.decision.toUpperCase()} ·
            {" "}{v.reason.replaceAll("_"," ")} · {dateText(v.created_at)}</p>
          <p>Case rev {v.incident_revision} · plan rev {v.plan_revision} ·
            evidence {v.evidence_id.slice(0,8)}</p>
          <p className="mt-1 whitespace-pre-wrap">{v.note}</p>
        </li>)}
      </ol>
    </div>}
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <History className="size-4 text-primary"/> Unified metadata-only audit trace
      </p>
      <p className="text-xs text-muted-foreground">
        A real time-ordered view of existing incident status events, captured
        evidence, investigation acknowledgments, closure decisions and
        reopening decisions. Excludes notes, raw inputs/outputs,
        credentials, request keys and synthetic health scores.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline"
          disabled={busy||disabled||!selected}
          onClick={()=>void perform(loadAudit)}>Load factual audit events</Button>
        {audit&&<>
          <Button type="button" size="sm" variant="outline"
            disabled={busy||disabled}
            onClick={()=>download("eternyx-incident-audit.json",
              JSON.stringify(audit,null,2),"application/json;charset=utf-8")}>
            <Download className="mr-2 size-4"/> Private JSON
          </Button>
          <Button type="button" size="sm" variant="outline"
            disabled={busy||disabled}
            onClick={()=>download("eternyx-incident-audit.csv",
              incidentAuditCsv(audit),"text/csv;charset=utf-8")}>
            <Download className="mr-2 size-4"/> Safe CSV
          </Button>
        </>}
      </div>
      {audit&&<>
        <p className="text-xs text-muted-foreground">
          {audit.total} existing metadata events; notes and credentials omitted.
          These records do not certify worker health or external delivery.
        </p>
        <ol className="max-h-80 space-y-2 overflow-y-auto">
          {audit.rows.map((e,i)=><li key={e.kind+":"+e.ref+":"+i}
            className="rounded border border-border/70 p-2 text-xs text-muted-foreground">
            <p className="font-medium">{e.kind.replaceAll("_"," ")} ·
              {" "}{dateText(e.recordedAt)}</p>
            <p className="mt-1">{Object.entries(e.metadata)
              .map(([k,v])=>k+": "+String(v)).join(" · ")}</p>
          </li>)}
        </ol>
      </>}
    </div>
    <p className="text-xs text-muted-foreground">
      Reopening an incident does not reset its investigation plan or
      automatically perform any previously recorded review steps. After
      reopening, a new closure approval matching the new case revision
      is required before resolving the incident again.
    </p>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
