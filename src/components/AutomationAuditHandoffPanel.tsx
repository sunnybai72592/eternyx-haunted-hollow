import {useEffect,useRef,useState} from "react";
import {ClipboardCheck,FileClock,Download,ShieldAlert,RefreshCcw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/checkbox";
import {supabase} from "@/integrations/supabase/client";
import {
  verifiedHandoffAssessment,verifiedHandoffHistory,
  handoffAssessmentCsv,handoffAssessmentJson,handoffHistoryExport,
  verifyHandoffPreflight,
} from "@/lib/automationAuditHandoff.mjs";
type Assessment=ReturnType<typeof verifiedHandoffAssessment>;
type History=ReturnType<typeof verifiedHandoffHistory>;
async function call(action:string,params:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("automation-control",{
    body:{action,...params},
  });
  if(error){
    let message="Owner audit handoff unavailable. Check the Phase 2U migration and Edge deployment.";
    try{
      const response=error.context as Response;
      if(response&&typeof response.json==="function"){
        const payload=await response.json();
        if(typeof payload?.code==="string"&&payload.code.length<70){
          message+=" ("+payload.code+")";
        }
      }
    }catch{/* avoid leaking raw API response */}
    throw Error(message);
  }
  if(!data||typeof data!=="object"||Array.isArray(data)){
    throw Error("Unexpected owner handoff response.");
  }
  return data as Record<string,unknown>;
}
function file(name:string,contents:string,mime:string){
  const uri=URL.createObjectURL(new Blob([contents],{type:mime}));
  const el=document.createElement("a");el.href=uri;el.download=name;
  document.body.appendChild(el);el.click();el.remove();
  window.setTimeout(()=>URL.revokeObjectURL(uri),0);
}
function time(value:string|null){
  if(!value)return "None";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"Unknown":date.toLocaleString();
}
const descriptions:Record<string,string>={
  evidence_missing:"Original captured evidence is no longer present",
  source_ledger_inconsistent:"Stored case/event/plan/audit records disagree",
  source_changed:"Incident, review plan or evidence record changed after capture",
  no_manual_review:"No human review has been recorded for this package",
  latest_review_needs_attention:"Latest human review requests further attention",
  review_limitations_missing:"Recorded human review did not accept all limitations",
  current_owner_review:"Latest owner review is current; independent release checks are still required",
};
export default function AutomationAuditHandoffPanel({
  incidentId,disabled,refreshKey,
}:{incidentId:string;disabled:boolean;refreshKey:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [assessment,setAssessment]=useState<Assessment|null>(null);
  const [raw,setRaw]=useState<Record<string,unknown>|null>(null);
  const [selected,setSelected]=useState("");
  const [history,setHistory]=useState<History|null>(null);
  const [historyRaw,setHistoryRaw]=useState<Record<string,unknown>|null>(null);
  const [note,setNote]=useState("");
  const [ackReview,setAckReview]=useState(false);
  const [ackCI,setAckCI]=useState(false);
  const [ackDeployment,setAckDeployment]=useState(false);
  const [ackWorker,setAckWorker]=useState(false);
  const request=useRef<{signature:string;key:string}|null>(null);
  // In-flight responses from a former case/refresh/selection must never
  // replace current private state or show the former case's receipt history.
  const scope=useRef({incidentId,refreshKey,version:0,packageId:""});
  if(scope.current.incidentId!==incidentId||scope.current.refreshKey!==refreshKey){
    scope.current={incidentId,refreshKey,version:scope.current.version+1,packageId:""};
  }
  const matches=(version:number,packageId?:string)=>
    scope.current.version===version&&scope.current.incidentId===incidentId&&
    scope.current.refreshKey===refreshKey&&
    (packageId===undefined||scope.current.packageId===packageId);
  useEffect(()=>{
    setAssessment(null);setRaw(null);setSelected("");
    setHistory(null);setHistoryRaw(null);setNote("");
    setAckReview(false);setAckCI(false);setAckDeployment(false);setAckWorker(false);
    request.current=null;setBusy(false);
  },[incidentId,refreshKey]);
  async function perform(fn:()=>Promise<void>){
    const version=scope.current.version;
    setBusy(true);setError("");setNotice("");
    try{await fn();}
    catch(e){if(matches(version))setError(e instanceof Error?e.message:"Manual handoff operation failed.");}
    finally{if(matches(version))setBusy(false);}
  }
  async function load(){
    const version=scope.current.version;
    const res=await call("incidentAuditHandoffAssessment",{incidentId});
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.incidentId!==incidentId||res.externalExecutionTriggered!==false){
      throw Error("Cannot verify current owner case handoff source.");
    }
    const checked=verifiedHandoffAssessment(res);
    if(!matches(version))return;
    setAssessment(checked);setRaw(res);setHistory(null);setHistoryRaw(null);
    const chosen=checked.packages.some(p=>p.packageId===scope.current.packageId)
      ?scope.current.packageId:(checked.packages[0]?.packageId??"");
    scope.current.packageId=chosen;
    setSelected(chosen);
    setNotice("Read current source snapshots, actual last decisions and stored handoff metadata.");
  }
  async function loadHistory(){
    const version=scope.current.version;
    const packageId=selected;
    if(!packageId||scope.current.packageId!==packageId)throw Error("Select a stored package.");
    const res=await call("incidentAuditHandoffHistory",{packageId});
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.packageId!==packageId||res.releaseVerified!==false||
       res.externalExecutionTriggered!==false){
      throw Error("Owner handoff receipt history not verified.");
    }
    const checked=verifiedHandoffHistory(res,packageId);
    if(checked.incidentId!==incidentId)throw Error("Handoff history relates to another case.");
    if(!matches(version,packageId))return;
    setHistory(checked);setHistoryRaw(res);
    setNotice("Loaded immutable owner handoff receipts. Private rationales are omitted from export.");
  }
  async function attest(){
    const version=scope.current.version;
    const packageId=selected;
    const p=assessment?.packages.find(p=>p.packageId===packageId);
    if(!p||!raw||!assessment?.caseConsistent||!p.eligibleForManualHandoff||
       p.manualHandoffCurrent||!p.latestReviewId||
       p.incidentRevision!==assessment.incidentRevision||
       !matches(version,packageId)){
      throw Error("A current, owner-reviewed evidence package is required.");
    }
    if(note.trim().length<12||note.trim().length>500){
      throw Error("Write a 12–500-character private rationale, without secrets.");
    }
    if(!ackReview||!ackCI||!ackDeployment||!ackWorker){
      throw Error("Accept all four manual handoff limitations.");
    }
    // Re-read the actual owner state before confirmation, not merely the
    // snapshot that may have been inspected minutes ago. SQL rechecks again
    // under its transaction lock before creating a receipt.
    const latest=await call("incidentAuditHandoffAssessment",{incidentId});
    if(!matches(version,packageId))return;
    if(latest.ok!==true||latest.source!=="authenticated_server"||
      latest.incidentId!==incidentId||latest.externalExecutionTriggered!==false){
      throw Error("Fresh owner handoff preflight is not authenticated.");
    }
    try{verifyHandoffPreflight(raw,latest,packageId);}
    catch(e){
      const checked=verifiedHandoffAssessment(latest);
      setAssessment(checked);setRaw(latest);setHistory(null);setHistoryRaw(null);
      setAckReview(false);setAckCI(false);setAckDeployment(false);setAckWorker(false);
      request.current=null;
      throw e;
    }
    if(!window.confirm("Fresh owner source and latest review were checked. Record a PRIVATE, NON-DEPLOYING receipt? No CI, deployment, external service or workflow action is verified or executed."))return;
    const content=note.trim();
    const signature=JSON.stringify([
      p.packageId,p.latestReviewId,assessment.incidentRevision,content,
      ackReview,ackCI,ackDeployment,ackWorker,
    ]);
    const key=request.current?.signature===signature
      ?request.current.key:crypto.randomUUID();
    request.current={signature,key};
    const res=await call("incidentAuditHandoffAttest",{
      packageId:p.packageId,reviewId:p.latestReviewId,
      incidentRevision:assessment.incidentRevision,
      note:content,ackOwnerReview:true,ackCiUnverified:true,
      ackDeploymentUnverified:true,ackWorkerUnverified:true,
      requestKey:key,
    });
    if(res.ok!==true||res.source!=="authenticated_server"||
       res.packageId!==p.packageId||res.reviewId!==p.latestReviewId||
       typeof res.handoffId!=="string"||
       res.ownerAttestationOnly!==true||res.automaticRelease!==false||
       res.externalExecutionTriggered!==false){
      throw Error("Handoff receipt was not verified. A retry preserves the same request UUID.");
    }
    if(!matches(version,packageId))return;
    request.current=null;setNote("");
    setAckReview(false);setAckCI(false);setAckDeployment(false);setAckWorker(false);
    await load();
    setNotice("Recorded a versioned owner attestation. No deployment, CI check or workflow action was performed.");
  }
  const active=assessment?.packages.find(p=>p.packageId===selected);
  return <section aria-labelledby="eternyx-2u-handoff-heading"
    className="space-y-3 rounded-xl border border-primary/20 p-4">
    <h5 id="eternyx-2u-handoff-heading"
      className="flex items-center gap-2 font-semibold">
      <FileClock className="size-4 text-primary"/> Current audit review & owner-only handoff
    </h5>
    <p className="text-xs leading-5 text-muted-foreground">
      A source-backed package can be passed to a separate manual release
      checklist only when its latest recorded owner review remains positive
      and its underlying case data still matches. This is an owner attestation,
      not a second reviewer, cryptographic verification, actual CI status,
      deployment approval or live worker evidence.
    </p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline"
        disabled={busy||disabled} onClick={()=>void perform(load)}>
        <RefreshCcw className="mr-2 size-4"/> Check current handoff readiness
      </Button>
      {raw&&assessment?.incidentId===incidentId&&<>
        <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
          onClick={()=>file("eternyx-audit-handoff-assessment.json",
            handoffAssessmentJson(raw),"application/json;charset=utf-8")}>
          <Download className="mr-2 size-4"/> Note-free JSON
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
          onClick={()=>file("eternyx-audit-handoff-assessment.csv",
            handoffAssessmentCsv(raw),"text/csv;charset=utf-8")}>
          <Download className="mr-2 size-4"/> Safe CSV
        </Button>
      </>}
    </div>
    {assessment&&<div className="space-y-2 text-xs text-muted-foreground">
      <p>{assessment.totalPackages} private stored packages;
        {" "}{assessment.eligibleForManualHandoffCount} with currently
        positive owner reviews and
        {" "}{assessment.currentManualHandoffCount} matching stored handoff
        receipts. <strong>No external release checks are verified.</strong>
      </p>
      <p>Last source assessment: {time(assessment.generatedAt)}. A new
        authenticated source check is required before every new receipt.</p>
      <label className="block">Package for manual review
        <select value={selected} disabled={busy||disabled}
          onChange={e=>{scope.current.version+=1;
            scope.current.packageId=e.target.value;
            setSelected(e.target.value);setHistory(null);setHistoryRaw(null);
            setNote("");setAckReview(false);setAckCI(false);
            setAckDeployment(false);setAckWorker(false);}}
          className="mt-1 w-full rounded border border-input bg-background p-2">
          {assessment.packages.length===0&&<option value="">No stored audit package</option>}
          {assessment.packages.map(p=><option key={p.packageId} value={p.packageId}>
            {p.packageId.slice(0,8)} · rev {p.incidentRevision} ·
            {" "}{p.eligibleForManualHandoff?"owner reviewed":"requires review"}
          </option>)}
        </select>
      </label>
      {active&&<div className="space-y-2 rounded border border-border/70 p-3">
        <p>Case revision {assessment.incidentRevision} ·
          package revision {active.incidentRevision} ·
          captured {time(active.capturedAt)}.</p>
        <p>Last human review: {active.latestReviewDecision?.replaceAll("_"," ")??"None"}
          {" · "}{time(active.latestReviewAt)}.</p>
        <p>Source snapshot matches current case:
          {" "}{active.sourceSnapshotCurrent?"Yes":"No"} ·
          owner review still current:
          {" "}{active.eligibleForManualHandoff?"Yes":"No"} ·
          matching handoff recorded:
          {" "}{active.manualHandoffCurrent?"Yes":"No"}.</p>
        <p className="flex gap-2 items-start">
          <ShieldAlert className="size-4 shrink-0"/>
          {descriptions[active.freshnessReason]??"Review factual stored case records manually"}.
        </p>
        {active.latestHandoffId&&<p>Latest stored handoff:
          {" "}{active.latestHandoffId.slice(0,8)} ·
          {" "}{time(active.latestHandoffAt)}. If a later negative review
          or case change occurred, the historical receipt remains but
          is no longer current.</p>}
      </div>}
      {active&&<div className="flex flex-wrap gap-2">
        <Button size="sm" type="button" variant="outline"
          disabled={busy||disabled}
          onClick={()=>void perform(loadHistory)}>
          View private handoff receipts
        </Button>
        {historyRaw&&history?.packageId===selected&&<Button size="sm" type="button" variant="outline"
          disabled={busy||disabled}
          onClick={()=>file("eternyx-audit-handoff-history.json",
            handoffHistoryExport(historyRaw,selected),"application/json;charset=utf-8")}>
          <Download className="mr-2 size-4"/> Export receipts without notes
        </Button>}
      </div>}
      {history&&history.packageId===selected&&<ol className="max-h-52 space-y-2 overflow-y-auto">
        {history.rows.length===0&&<li>No handoff receipt recorded for this package.</li>}
        {history.rows.map(item=><li key={item.id}
          className="rounded border border-border/70 p-2">
          <p className="font-medium">Owner receipt {item.id.slice(0,8)}
            {" · "}{time(item.createdAt)} ·
            review {item.reviewId.slice(0,8)}</p>
          <p>Attested case revision {item.incidentRevision}.
            Personal note (private to owner):</p>
          <p className="mt-1 whitespace-pre-wrap">{item.note}</p>
        </li>)}
      </ol>}
    </div>}
    {active?.eligibleForManualHandoff&&!active.manualHandoffCurrent&&<div className="space-y-3 rounded border border-border/70 p-3">
      <p className="text-sm font-semibold">
        Record a non-executing, version-bound human handoff
      </p>
      <label className="block text-xs">
        Private operator rationale (12–500 characters)
        <Textarea className="mt-1" rows={3} value={note} maxLength={500}
          disabled={busy||disabled} onChange={e=>setNote(e.target.value)}/>
      </label>
      {[
        {label:"I inspected the current owner case and latest human review",value:ackReview,set:setAckReview},
        {label:"No CI status has been checked or verified by this handoff",value:ackCI,set:setAckCI},
        {label:"No deployment or release has been performed or verified",value:ackDeployment,set:setAckDeployment},
        {label:"No worker uptime, delivery or external service has been verified",value:ackWorker,set:setAckWorker},
      ].map((item,i)=><label key={i}
        className="flex gap-2 items-center text-xs text-muted-foreground">
        <Checkbox checked={item.value} disabled={busy||disabled}
          onCheckedChange={v=>item.set(v===true)}/>
        <span>{item.label}</span>
      </label>)}
      <Button type="button" size="sm" variant="outline"
        disabled={busy||disabled||note.trim().length<12||
          !ackReview||!ackCI||!ackDeployment||!ackWorker}
        onClick={()=>void perform(attest)}>
        <ClipboardCheck className="mr-2 size-4"/> Record owner handoff receipt
      </Button>
      <p className="text-xs text-muted-foreground">
        The app will recheck this package before asking for confirmation.
        Limited to four handoff receipts per package and twenty new receipts
        per owner per rolling day. No actions are executed, and no release
        permit is created.
      </p>
    </div>}
    <p className="text-xs text-muted-foreground">
      Stored review and handoff notes are private and should contain no
      secrets or customer content. This workflow produces neither an
      independent release certificate nor actual deployment verification.
    </p>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
