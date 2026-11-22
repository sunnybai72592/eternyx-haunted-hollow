import {useEffect,useRef,useState} from "react";
import {Activity,Download,ShieldAlert,RefreshCcw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {supabase} from "@/integrations/supabase/client";
import {automationAuditCsv,checkedAutomationAuditSnapshot} from "@/lib/automationAuditExport.mjs";

type Workflow={id:string;name:string;revision:number;active:boolean};
type Measured={
  source:"measured_database_metadata";
  runs24h:number;runs7d:number;manual24h:number;webhook24h:number;
  scheduled24h:number;lastCompletedAt:string|null;
  enabledWebhooks:number;disabledWebhooks:number;
  enabledSchedules:number;failedScheduleStates:number;
  expiredScheduleLeases:number;activeScheduleLeases:number;
  pendingApprovals:number;pastDuePendingApprovals:number;
  rejectedApprovalStates:number;pausedWorkflows:number;
  auditExports24h:number;auditExportLimit24h:5;
  quarantines24h:number;quarantineLimit24h:5;
  successfulExecutionsOnly:true;allAttemptFailuresMeasured:false;
  liveWorkerVerified:false;externalDeliveryVerified:false;
};
type ScheduleInfo={
  id:string;enabled:boolean;revision:number;attemptCount:number;
  leaseActive:boolean;expiredLease:boolean;
  nextRunAt:string;lastRunAt:string|null;lastStatus:string;
  storedInputDecryptable:boolean;eligible:boolean;
};
type Diagnostic={workflowId:string;
  diagnosticType:"local_cryptographic_configuration_check";
  noNetworkRequest:true;executed:false;externalActionTriggered:false;
  realDeliveryVerified:false;workerLivenessVerified:false;
  schedule:ScheduleInfo|null;
};
type ExportSnapshot=ReturnType<typeof checkedAutomationAuditSnapshot>;
const reasons={
  stale_lease:"Expired lease investigation",
  unexpected_behavior:"Unexpected behavior",
  manual_safety_hold:"Manual safety hold",
} as const;
type Reason=keyof typeof reasons;
function date(s:string|null|undefined){
  if(!s)return "Never";
  const d=new Date(s);
  return Number.isNaN(d.getTime())?"Unknown":d.toLocaleString();
}
async function call(action:string,params:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("automation-control",{
    body:{action,...params},
  });
  if(error){
    let message="Automation audit/recovery service is unavailable.";
    try{
      const ctx=error.context as Response;
      if(ctx&&typeof ctx.json==="function"){
        const details=await ctx.json();
        if(typeof details?.code==="string"&&details.code.length<72){
          message+=" ("+details.code+")";
        }
      }
    }catch{/* retain generic message */}
    throw Error(message);
  }
  if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Unverified server response.");
  return data as Record<string,unknown>;
}
function readMeasured(raw:Record<string,unknown>):Measured{
  const keys=[
    "runs24h","runs7d","manual24h","webhook24h","scheduled24h",
    "enabledWebhooks","disabledWebhooks","enabledSchedules",
    "failedScheduleStates","expiredScheduleLeases","activeScheduleLeases",
    "pendingApprovals","pastDuePendingApprovals","rejectedApprovalStates",
    "pausedWorkflows","auditExports24h","quarantines24h",
  ];
  if(raw.ok!==true||raw.source!=="authenticated_server"||
    raw.automaticRecoveryEnabled!==false||
    keys.some(k=>!Number.isInteger(raw[k])||Number(raw[k])<0)||
    raw.auditExportLimit24h!==5||raw.quarantineLimit24h!==5||
    raw.successfulExecutionsOnly!==true||
    raw.allAttemptFailuresMeasured!==false||
    raw.liveWorkerVerified!==false||raw.externalDeliveryVerified!==false||
    (raw.lastCompletedAt!==null&&typeof raw.lastCompletedAt!=="string")){
    throw Error("Observability snapshot is not verified database metadata.");
  }
  return raw as unknown as Measured;
}
function downloadAudit(filename:string,bytes:string,mime:string){
  const blob=new Blob([bytes],{type:mime});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download=filename;
  document.body.appendChild(link);
  link.click();link.remove();
  // Revoke after download dispatch rather than before browser navigation.
  window.setTimeout(()=>URL.revokeObjectURL(url),0);
}
export default function AutomationAuditRecoveryPanel({
  workflows,disabled,
}:{workflows:Workflow[];disabled:boolean;}){
  const [status,setStatus]=useState<Measured|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [auditFilter,setAuditFilter]=useState("all");
  const [auditChannel,setAuditChannel]=useState<"all"|"manual"|"webhook"|"scheduled">("all");
  const [snapshot,setSnapshot]=useState<ExportSnapshot|null>(null);
  const [receiptId,setReceiptId]=useState<string|null>(null);
  const [workflow,setWorkflow]=useState("");
  const [diagnostic,setDiagnostic]=useState<Diagnostic|null>(null);
  const [reason,setReason]=useState<Reason>("manual_safety_hold");
  const pendingExport=useRef<{signature:string;key:string}|null>(null);
  const pendingQuarantine=useRef<{signature:string;key:string}|null>(null);
  useEffect(()=>{
    if(workflow&&!workflows.some(w=>w.id===workflow)){
      setWorkflow("");setDiagnostic(null);
    }
    if(auditFilter!=="all"&&!workflows.some(w=>w.id===auditFilter)){
      setAuditFilter("all");setSnapshot(null);
    }
  },[workflows,workflow,auditFilter]);
  useEffect(()=>{setSnapshot(null);setReceiptId(null);},[auditFilter,auditChannel]);
  async function perform(task:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await task();}catch(e){setError(e instanceof Error?e.message:"Action could not be completed.");}
    finally{setBusy(false);}
  }
  async function loadStatus(){
    const response=await call("observability");
    setStatus(readMeasured(response));
    setNotice("Loaded real database counters, not simulated uptime or failures.");
  }
  async function prepareExport(){
    const signature=JSON.stringify([auditFilter,auditChannel]);
    const requestKey=pendingExport.current?.signature===signature
      ?pendingExport.current.key:crypto.randomUUID();
    pendingExport.current={signature,key:requestKey};
    const response=await call("exportAudit",{
      requestKey,
      ...(auditFilter==="all"?{}:{workflowId:auditFilter}),
      ...(auditChannel==="all"?{}:{channel:auditChannel}),
    });
    if(response.ok!==true||response.source!=="authenticated_server"||
      response.rawCredentialsExported!==false||
      response.externalActionTriggered!==false||
      typeof response.receiptId!=="string")throw Error("Audit receipt was not verified.");
    const checked=checkedAutomationAuditSnapshot(response.snapshot);
    if(checked.workflowId!==(auditFilter==="all"?null:auditFilter)||
      checked.channel!==(auditChannel==="all"?null:auditChannel)){
      throw Error("Audit snapshot did not match selected filters.");
    }
    setSnapshot(checked);setReceiptId(String(response.receiptId));
    pendingExport.current=null;
    setNotice("Created an immutable seven-day snapshot of real completed-run metadata. Download locally as JSON or CSV.");
    const updated=await call("observability");setStatus(readMeasured(updated));
  }
  async function inspectSchedule(){
    if(!workflow)throw Error("Choose a saved workflow.");
    const response=await call("triggerDiagnostics",{workflowId:workflow});
    if(response.source!=="authenticated_server"||response.workflowId!==workflow||
      response.diagnosticType!=="local_cryptographic_configuration_check"||
      response.noNetworkRequest!==true||response.executed!==false||
      response.externalActionTriggered!==false||
      response.realDeliveryVerified!==false||
      response.workerLivenessVerified!==false)throw Error("Unverified schedule diagnostic.");
    const item=response.schedule as ScheduleInfo|null;
    if(item&&(typeof item.id!=="string"||!Number.isInteger(item.revision)||
      item.revision<1||typeof item.enabled!=="boolean"||
      typeof item.leaseActive!=="boolean"||
      typeof item.expiredLease!=="boolean"||
      typeof item.attemptCount!=="number")){
      throw Error("Unverified schedule lease and revision.");
    }
    setDiagnostic({workflowId:workflow,
      diagnosticType:"local_cryptographic_configuration_check",
      noNetworkRequest:true,executed:false,externalActionTriggered:false,
      realDeliveryVerified:false,workerLivenessVerified:false,
      schedule:item??null});
    setNotice("Inspected schedule configuration and lease status without executing anything.");
  }
  async function quarantine(){
    const target=diagnostic?.schedule;
    if(!target||!workflow||diagnostic?.workflowId!==workflow||
      target.leaseActive||(!target.enabled&&!target.expiredLease)){
      throw Error("Select a suitable schedule without an active lease.");
    }
    if(!window.confirm("QUARANTINE this schedule? This disables future scheduling, invalidates any expired lease and DOES NOT retry or resume the workflow. The action requires manual review to re-enable."))return;
    const signature=JSON.stringify([target.id,target.revision,reason]);
    const requestKey=pendingQuarantine.current?.signature===signature
      ?pendingQuarantine.current.key:crypto.randomUUID();
    pendingQuarantine.current={signature,key:requestKey};
    const response=await call("quarantineSchedule",{
      scheduleId:target.id,expectedRevision:target.revision,
      reason,requestKey,
    });
    if(response.ok!==true||response.source!=="authenticated_server"||
       response.scheduleId!==target.id||response.enabled!==false||
       response.automaticRetryQueued!==false||
       response.externalActionTriggered!==false){
      throw Error("Schedule quarantine was not confirmed.");
    }
    pendingQuarantine.current=null;setDiagnostic(null);
    const updated=await call("observability");setStatus(readMeasured(updated));
    setNotice("Schedule quarantined. No retry or external execution was started. Inspect and explicitly re-enable through Schedule Controls after resolving the problem.");
  }
  return <section aria-labelledby="automation-audit-recovery-title"
    className="space-y-4 rounded-xl border border-primary/20 p-4">
    <h4 id="automation-audit-recovery-title" className="flex items-center gap-2 font-semibold">
      <Activity className="size-4 text-primary"/> Audit, observability & guarded recovery
    </h4>
    <p className="text-xs leading-5 text-muted-foreground">
      Database-measured completed-run counters, private audit export and opt-in
      schedule quarantine. No invented health scores, live delivery claims or automatic retries.
    </p>
    <div className="space-y-2 rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Measured automation activity</p>
        <Button type="button" size="sm" variant="outline" disabled={disabled||busy}
          onClick={()=>void perform(loadStatus)}><RefreshCcw className="mr-2 size-4"/> Refresh real counters</Button>
      </div>
      {status&&<div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
        <p>Completed 24h: <strong>{status.runs24h}</strong> (manual {status.manual24h},
          webhook {status.webhook24h}, scheduled {status.scheduled24h}).</p>
        <p>Completed last 7 days: <strong>{status.runs7d}</strong>. Last: {date(status.lastCompletedAt)}.</p>
        <p>Webhooks: {status.enabledWebhooks} enabled / {status.disabledWebhooks} disabled.
          Workflow holds: {status.pausedWorkflows}.</p>
        <p>Schedules: {status.enabledSchedules} enabled;
          {status.activeScheduleLeases} active leases;
          {status.expiredScheduleLeases} expired leases;
          {status.failedScheduleStates} with failed last status.</p>
        <p>Approval requests: {status.pendingApprovals} currently pending,
          {status.pastDuePendingApprovals} past expiry,
          {status.rejectedApprovalStates} rejected records.</p>
        <p>Exports: {status.auditExports24h}/{status.auditExportLimit24h}
          ; schedule quarantines: {status.quarantines24h}/{status.quarantineLimit24h}
          (rolling 24h).</p>
      </div>}
      <p className="text-xs text-muted-foreground">
        These counts are from stored records; failed attempts that were never
        recorded are not measured. Worker liveness and external delivery have not been verified.
      </p>
    </div>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Download className="size-4 text-primary"/> Export real audit metadata
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        Authenticated server snapshots cover seven days and at most 100 completed
        run records, with a precise total and truncation notice. No inputs,
        outputs, access tokens or credentials. Up to five snapshots per rolling 24h;
        your JSON/CSV download is assembled locally.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label htmlFor="eternyx-audit-workflow">Workflow
          <select id="eternyx-audit-workflow" value={auditFilter}
            disabled={busy||disabled} onChange={e=>setAuditFilter(e.target.value)}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1">
            <option value="all">All workflows</option>
            {workflows.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label htmlFor="eternyx-audit-channel">Channel
          <select id="eternyx-audit-channel" value={auditChannel}
            disabled={busy||disabled}
            onChange={e=>setAuditChannel(e.target.value as typeof auditChannel)}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1">
            <option value="all">All</option>
            <option value="manual">Manual</option>
            <option value="webhook">Signed webhook</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </label>
        <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
          onClick={()=>void perform(prepareExport)}>Prepare verified audit snapshot</Button>
      </div>
      {snapshot&&<div className="space-y-2 text-xs text-muted-foreground">
        <p>Receipt {receiptId?.slice(0,8)} · {snapshot.included} included of
          {snapshot.totalMatching} matching recorded runs.
          {snapshot.truncated?" Truncated: narrow your filters for completeness.":" Complete for this seven-day filter."}
          {" "}Captured {date(snapshot.generatedAt)}.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
            onClick={()=>downloadAudit("eternyx-automation-audit.json",
              JSON.stringify(snapshot,null,2),"application/json;charset=utf-8")}>
            Download JSON
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
            onClick={()=>downloadAudit("eternyx-automation-audit.csv",
              automationAuditCsv(snapshot),"text/csv;charset=utf-8")}>
            Download safe CSV
          </Button>
        </div>
      </div>}
    </div>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ShieldAlert className="size-4 text-primary"/> Schedule quarantine (manual recovery gate)
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        Inspect a real schedule, then explicitly disable it if its state
        needs investigation. An active, unexpired worker lease blocks quarantine.
        This action does not rerun failed work or automatically restore the schedule.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label htmlFor="eternyx-quarantine-workflow">Workflow
          <select id="eternyx-quarantine-workflow" value={workflow}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1"
            disabled={busy||disabled}
            onChange={e=>{setWorkflow(e.target.value);setDiagnostic(null);}}>
            <option value="">Select workflow</option>
            {workflows.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <Button type="button" size="sm" variant="outline"
          disabled={busy||disabled||!workflow}
          onClick={()=>void perform(inspectSchedule)}>
          Inspect actual schedule
        </Button>
      </div>
      {diagnostic&&<div className="space-y-2 text-xs text-muted-foreground">
        {diagnostic.schedule?
          <>
            <p>Schedule revision {diagnostic.schedule.revision} ·
              {diagnostic.schedule.enabled?" Enabled":" Disabled"} ·
              attempt count {diagnostic.schedule.attemptCount} ·
              last status {diagnostic.schedule.lastStatus}.</p>
            <p>Active lease: {diagnostic.schedule.leaseActive?"Yes":"No"} ·
              expired lease: {diagnostic.schedule.expiredLease?"Yes":"No"} ·
              encrypted input decryptable: {diagnostic.schedule.storedInputDecryptable?"Yes":"No"}.
              No worker or external execution has been tested.</p>
            <label htmlFor="eternyx-quarantine-reason" className="block">Reason
              <select id="eternyx-quarantine-reason" value={reason}
                disabled={busy||disabled} onChange={e=>setReason(e.target.value as Reason)}
                className="ml-2 rounded-md border border-input bg-background px-2 py-1">
                {Object.entries(reasons).map(([key,value])=>
                  <option key={key} value={key}>{value}</option>)}
              </select>
            </label>
            <Button type="button" size="sm" variant="destructive"
              disabled={busy||disabled||diagnostic.schedule.leaseActive||
                (!diagnostic.schedule.enabled&&!diagnostic.schedule.expiredLease)}
              onClick={()=>void perform(quarantine)}>
              Quarantine schedule; do not retry
            </Button>
          </>:
          <p>No saved schedule exists for this workflow.</p>}
      </div>}
    </div>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
