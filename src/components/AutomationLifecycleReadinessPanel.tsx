import {useState} from "react";
import {Activity,ShieldCheck,ShieldAlert,RefreshCcw,Download,FileSearch} from "lucide-react";
import {Button} from "@/components/ui/button";
import {supabase} from "@/integrations/supabase/client";
import {verifiedCaseIntegrity,verifiedCaseReadiness,readinessCsv}
  from "@/lib/automationCaseReadiness.mjs";

type Readiness=ReturnType<typeof verifiedCaseReadiness>;
type Integrity=ReturnType<typeof verifiedCaseIntegrity>;
async function call(action:string,params:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("automation-control",{
    body:{action,...params},
  });
  if(error){
    let message="Lifecycle consistency service unavailable; verify database and Edge deployment.";
    try{
      const response=error.context as Response;
      if(response&&typeof response.json==="function"){
        const body=await response.json();
        if(typeof body?.code==="string"&&body.code.length<70)message+=" ("+body.code+")";
      }
    }catch{/* retain safe error */}
    throw Error(message);
  }
  if(!data||typeof data!=="object"||Array.isArray(data)){
    throw Error("Unexpected consistency-check response.");
  }
  return data as Record<string,unknown>;
}
function download(name:string,contents:string,mime:string){
  const url=URL.createObjectURL(new Blob([contents],{type:mime}));
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download=name;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),0);
}
function label(code:string){
  const names:Record<string,string>={
    incident_event_chain_inconsistent:"Case event chain mismatch",
    incident_status_mismatch:"Saved status differs from last case event",
    incident_revision_mismatch:"Saved case revision differs from event count",
    plan_revision_mismatch:"Plan revision differs from review-event count",
    plan_evidence_missing:"Referenced investigation plan has no captured evidence",
    plan_step_attestation_mismatch:"Manual step acknowledgments do not match the plan",
    plan_stage_event_mismatch:"Plan stage conflicts with recorded review events",
    late_review_attestation:"A manual step was acknowledged after plan sign-off",
    orphaned_governance_decisions:"Decision records are missing their expected plan",
    audit_projection_count_mismatch:"Unified audit projection count differs from ledgers",
  };
  return names[code]??"Unrecognized integrity finding";
}
export default function AutomationLifecycleReadinessPanel({disabled}:{disabled:boolean}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [report,setReport]=useState<Readiness|null>(null);
  const [selected,setSelected]=useState("");
  const [details,setDetails]=useState<Integrity|null>(null);
  async function perform(fn:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await fn();}
    catch(e){setError(e instanceof Error?e.message:"Failed to inspect operational readiness.");}
    finally{setBusy(false);}
  }
  async function loadReport(){
    const response=await call("incidentReadinessReport");
    if(response.ok!==true||response.source!=="authenticated_server"||
      response.externalExecutionTriggered!==false){
      throw Error("Readiness did not originate from authenticated stored case records.");
    }
    const checked=verifiedCaseReadiness(response);
    setReport(checked);
    setDetails(null);
    if(!checked.recentCases.some(x=>x.incidentId===selected))setSelected("");
    setNotice("Loaded measured owner case totals and clearly bounded recent-case integrity sample.");
  }
  async function loadCase(){
    if(!selected)throw Error("Choose one persisted owner case.");
    const response=await call("incidentLifecycleCheck",{incidentId:selected});
    if(response.ok!==true||response.source!=="authenticated_server"||
      response.externalExecutionTriggered!==false||response.incidentId!==selected){
      throw Error("Lifecycle check is not verified owner data.");
    }
    setDetails(verifiedCaseIntegrity(response));
    setNotice("Read-only case event, plan, review and audit-ledger consistency assessment completed.");
  }
  return <section aria-labelledby="eternyx-2r-heading"
    className="space-y-4 rounded-xl border border-primary/20 p-4">
    <h4 id="eternyx-2r-heading" className="flex items-center gap-2 font-semibold">
      <Activity className="size-4 text-primary"/> Lifecycle consistency & operational case readiness
    </h4>
    <p className="text-xs leading-5 text-muted-foreground">
      Check real owner incident records against their stored status-event,
      plan-review and audit-ledger counts. These are read-only database
      consistency checks—not cryptographic tamper detection, worker uptime,
      external verification, or automatic incident discovery.
    </p>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Button type="button" size="sm" variant="outline"
          disabled={disabled||busy} onClick={()=>void perform(loadReport)}>
          <RefreshCcw className="mr-2 size-4"/> Load owner readiness
        </Button>
        {report&&<>
          <Button type="button" size="sm" variant="outline"
            disabled={disabled||busy}
            onClick={()=>download("eternyx-case-readiness.json",
              JSON.stringify(report,null,2),"application/json;charset=utf-8")}>
            <Download className="mr-2 size-4"/> Private JSON
          </Button>
          <Button type="button" size="sm" variant="outline"
            disabled={disabled||busy}
            onClick={()=>download("eternyx-case-readiness.csv",
              readinessCsv(report),"text/csv;charset=utf-8")}>
            <Download className="mr-2 size-4"/> Safe CSV
          </Button>
        </>}
      </div>
      {report&&<div className="space-y-3">
        <p className="text-sm font-semibold">
          {report.totalOwnerCases} recorded owner cases
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Open",report.currentOpen],
            ["Investigating",report.currentInvestigating],
            ["Resolved",report.currentResolved],
            ["High unresolved",report.currentHighUnresolved],
            ["Unresolved older 24h",report.currentUnresolvedOlder24h],
            ["Unresolved with evidence",report.currentUnresolvedWithEvidence],
            ["Unresolved without evidence",report.currentUnresolvedWithoutEvidence],
            ["Draft plans",report.planDraft],
          ].map(([name,value])=><div key={name}
            className="rounded border border-border/70 p-2 text-xs">
            <p className="text-muted-foreground">{name}</p>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
          </div>)}
        </div>
        <p className="text-xs text-muted-foreground">
          Plans: {report.planDraft} draft,
          {" "}{report.planReviewed} manually reviewed,
          {" "}{report.planClosed} closed.
          All owner case and plan status counts above are aggregate database
          counts, not inferred success rates.
        </p>
        <div className="space-y-2 rounded border border-border/70 p-3">
          <p className="flex gap-2 items-center text-sm font-medium">
            <FileSearch className="size-4 text-primary"/> Recent case consistency sample
          </p>
          <p className="text-xs text-muted-foreground">
            Scanned <strong>{report.recentCasesScanned}</strong> most recently updated
            cases, up to 30. Found
            {" "}<strong>{report.inconsistentCasesInRecentSample}</strong> with a
            recorded-ledger mismatch and
            {" "}<strong>{report.historicallyClosedPlansInRecentSample}</strong> with
            historical closed plans after case reopening (informational, not
            a data-integrity failure).
          </p>
          {report.recentSampleTruncated&&<p className="flex gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="size-4 shrink-0"/>
            This is a partial sample, not a full-account integrity certification.
            Only the {report.recentCasesScanned} most recently updated
            cases were consistency-checked.
          </p>}
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {report.recentCases.map(c=><div key={c.incidentId}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/70 p-2 text-xs">
              <div className="space-y-1">
                <p className="font-mono">{c.incidentId.slice(0,13)}…</p>
                <p className="flex gap-2 items-center text-muted-foreground">
                  {c.consistent?
                    <ShieldCheck className="size-3.5"/>:
                    <ShieldAlert className="size-3.5"/>}
                  {c.consistent?"Stored records consistent":"Review recorded mismatch"}
                  {" · "}{c.status} · evidence {c.evidenceCount}
                </p>
                {c.findings.length>0&&<p className="text-muted-foreground">
                  {c.findings.map(label).join("; ")}
                </p>}
              </div>
              <Button type="button" size="sm" variant="outline"
                disabled={disabled||busy}
                onClick={()=>{setSelected(c.incidentId);setDetails(null);
                  void perform(async()=>{
                    const response=await call("incidentLifecycleCheck",
                      {incidentId:c.incidentId});
                    if(response.ok!==true||response.source!=="authenticated_server"||
                      response.incidentId!==c.incidentId)throw Error("Invalid owner case check.");
                    setDetails(verifiedCaseIntegrity(response));
                  });}}>
                Inspect case
              </Button>
            </div>)}
          </div>
        </div>
      </div>}
    </div>
    {report&&<div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Inspect one selected persisted case</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs">Owner case
          <select className="ml-2 max-w-56 rounded border border-input bg-background p-2"
            value={selected} disabled={disabled||busy}
            onChange={e=>{setSelected(e.target.value);setDetails(null);}}>
            <option value="">Select from recent sample</option>
            {report.recentCases.map(c=><option key={c.incidentId} value={c.incidentId}>
              {c.incidentId.slice(0,12)} · {c.status}
            </option>)}
          </select>
        </label>
        <Button type="button" size="sm" variant="outline"
          disabled={disabled||busy||!selected}
          onClick={()=>void perform(loadCase)}>Recheck exact case</Button>
      </div>
      {details&&<div className="space-y-2 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">
          {details.consistent?"Recorded event and ledger counts align.":
            "One or more stored ledger checks need investigation."}
        </p>
        <p>Saved incident: {details.incidentStatus} ·
          revision {details.incidentRevision} · latest event
          {" "}{details.latestIncidentEventStatus??"Missing"} ·
          {details.incidentEventCount} status events.</p>
        <p>Plan: {details.hasPlan?details.planStage:"None"} ·
          revision {details.planRevision??"N/A"} ·
          {details.acknowledgedSteps}/{details.plannedSteps} steps acknowledged;
          {" "}{details.capturedEvidenceCount} stored evidence snapshots.</p>
        <p>Closure decisions {details.closureDecisionCount} ·
          reopening decisions {details.reopenDecisionCount} ·
          database ledger rows {details.auditLedgerCount} ·
          audit projection rows {details.auditProjectionCount}.</p>
        <p>Current closure approval:
          {" "}{details.closureApprovalCurrent?"Yes":"No"} ·
          current reopening approval:
          {" "}{details.reopenApprovalCurrent?"Yes":"No"}.</p>
        {details.historicalClosedPlanAfterReopen&&<p>
          This case was reopened after its plan had already closed. Earlier
          acknowledgments are historical; the case may need new manual review.
        </p>}
        {details.findings.length>0&&<ul className="list-disc pl-5">
          {details.findings.map(f=><li key={f}>{label(f)}</li>)}
        </ul>}
      </div>}
    </div>}
    <p className="text-xs text-muted-foreground">
      No automatic fixes, detection claims, crypto signatures, worker probes,
      schedule changes, external dispatches or new run records. Investigate
      any mismatches manually using the existing private source histories.
      Notes and secrets are excluded from report downloads.
    </p>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
