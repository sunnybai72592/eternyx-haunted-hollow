import {useEffect,useRef,useState} from "react";
import {Activity,Archive,ShieldCheck,PauseCircle,Play,RefreshCcw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/checkbox";
import {supabase} from "@/integrations/supabase/client";

type Workflow={id:string;name:string;revision:number;active:boolean};
type Run={
  id:string;workflow_id:string|null;workflow_revision:number;
  trigger_type:"manual"|"webhook"|"scheduled";status:"completed";
  input_lines:number;output_lines:number;
  input_characters:number;output_characters:number;
  created_at:string;trace:Array<{id:string;kind:string;changed:boolean}>;
};
type Diagnostics={
  workflowId:string;diagnosticType:"local_cryptographic_configuration_check";
  noNetworkRequest:true;executed:false;externalActionTriggered:false;
  policyActive:boolean;allowWebhook:boolean;allowSchedule:boolean;
  schedulerConfigEnabled:boolean;pendingApprovals:number;
  realDeliveryVerified:false;workerLivenessVerified:false;
  webhook:null|{
    id:string;enabled:boolean;approvalRequired:boolean;
    lastUsedAt:string|null;credentialChallengePassed:boolean;eligible:boolean;
  };
  schedule:null|{
    id:string;enabled:boolean;intervalMinutes:number;
    nextRunAt:string;lastRunAt:string|null;lastStatus:string;
    storedInputDecryptable:boolean;eligible:boolean;
  };
};
async function invoke(action:string,extra:Record<string,unknown>={}):Promise<Record<string,unknown>>{
  const {data,error}=await supabase.functions.invoke("automation-control",{body:{action,...extra}});
  if(error){
    let msg="Automation operations backend unavailable. Verify migrations and deployment.";
    try{
      const res=error.context as Response;
      if(res&&typeof res.json==="function"){
        const detail=await res.json();
        if(typeof detail?.code==="string"&&detail.code.length<75)msg+=" ("+detail.code+")";
      }
    }catch{/* Generic error remains */}
    throw Error(msg);
  }
  if(!data||typeof data!=="object"||Array.isArray(data)){
    throw Error("Unverified Automation operations response.");
  }
  return data as Record<string,unknown>;
}
function fmt(value:string|null|undefined){
  if(!value)return "Never";
  const d=new Date(value);
  return Number.isNaN(d.getTime())?"Unknown":d.toLocaleString();
}
export default function AutomationOperationsPanel({
  workflows,refresh,disabled,
}:{
  workflows:Workflow[];refresh:()=>Promise<Workflow[]>;disabled:boolean;
}){
  const [selected,setSelected]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [usage,setUsage]=useState<{used:number;limit:number}|null>(null);
  const [workflowId,setWorkflowId]=useState("");
  const [diagnostics,setDiagnostics]=useState<Diagnostics|null>(null);
  const [channel,setChannel]=useState<"all"|"manual"|"webhook"|"scheduled">("all");
  const [historyWorkflow,setHistoryWorkflow]=useState("all");
  const [runs,setRuns]=useState<Run[]>([]);
  const [total,setTotal]=useState<number|null>(null);
  const [hasMore,setHasMore]=useState(false);
  const [cursor,setCursor]=useState<{beforeTime:string;beforeId:string}|null>(null);
  const [historyLoaded,setHistoryLoaded]=useState(false);
  const pending=useRef<{signature:string;key:string}|null>(null);
  useEffect(()=>{
    setSelected(items=>items.filter(id=>workflows.some(w=>w.id===id)));
    if(!workflows.some(w=>w.id===workflowId))setWorkflowId(workflows[0]?.id??"");
    if(historyWorkflow!=="all"&&!workflows.some(w=>w.id===historyWorkflow)){
      setHistoryWorkflow("all");
    }
  },[workflows,workflowId,historyWorkflow]);
  useEffect(()=>{
    setRuns([]);setCursor(null);setHistoryLoaded(false);setHasMore(false);
  },[channel,historyWorkflow]);
  async function doIt(task:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await task();}catch(e){setError(e instanceof Error?e.message:"Operation failed.");}
    finally{setBusy(false);}
  }
  async function refreshUsage(){
    const data=await invoke("bulkUsage");
    if(data.ok!==true||data.source!=="authenticated_server"||
       !Number.isInteger(data.used)||data.limit!==10){
      throw Error("Bulk operation quota was not verified.");
    }
    setUsage({used:Number(data.used),limit:10});
  }
  async function bulkToggle(active:boolean){
    const targets=workflows.filter(w=>selected.includes(w.id)&&w.active!==active);
    if(targets.length===0||targets.length>5)throw Error("Select one to five workflows needing this action.");
    if(!window.confirm((active?"RESUME":"PAUSE")+" "+targets.length+
      " saved workflow(s)? "+
      (active?"Any independently enabled webhook or schedule may become eligible to execute again.":"Existing completed runs will remain in history.")))return;
    const items=targets.map(w=>({id:w.id,revision:w.revision,active:w.active}));
    const signature=JSON.stringify([items,active]);
    const key=pending.current?.signature===signature
      ?pending.current.key:crypto.randomUUID();
    pending.current={signature,key};
    const result=await invoke("bulkToggle",{items,active,requestKey:key});
    if(result.ok!==true||result.source!=="authenticated_server"||
       result.active!==active||result.count!==targets.length||
       result.triggersCreated!==false||result.credentialsChanged!==false){
      throw Error("Bulk update not confirmed. Retry uses the same request key.");
    }
    pending.current=null;
    setSelected([]);await refresh();await refreshUsage();
    setNotice((result.replayed===true?"Previously confirmed":"Confirmed")+
      " owner-only "+(active?"resume":"pause")+" for "+targets.length+" workflow(s).");
  }
  async function getHistory(next:boolean){
    const input={
      workflowId:historyWorkflow==="all"?undefined:historyWorkflow,
      channel:channel==="all"?undefined:channel,
      pageSize:15,
      ...(next&&cursor?{beforeTime:cursor.beforeTime,beforeId:cursor.beforeId}:{}),
    };
    const result=await invoke("runHistory",input);
    if(result.ok!==true||result.source!=="authenticated_server"||
       result.source!=="authenticated_server"||
       result.rawInputsStored!==false||result.rawOutputsStored!==false||
       !Array.isArray(result.rows)||result.rows.length>15||
       result.pageSize!==15||typeof result.hasMore!=="boolean"||
       !Number.isInteger(result.totalMatching))throw Error("Run history could not be verified.");
    const rows=result.rows as Run[];
    if(rows.some(r=>typeof r.id!=="string"||typeof r.created_at!=="string"||
      r.status!=="completed"||
      !["manual","webhook","scheduled"].includes(r.trigger_type)||
      !Number.isInteger(r.output_lines)||!Array.isArray(r.trace))){
      throw Error("Unverified run history record.");
    }
    if(result.hasMore===true &&
      (typeof result.nextBeforeTime!=="string"||
       typeof result.nextBeforeId!=="string"))throw Error("Invalid continuation cursor.");
    setRuns(old=>next?[...old,...rows]:rows);
    setCursor(result.hasMore?{
      beforeTime:String(result.nextBeforeTime),beforeId:String(result.nextBeforeId),
    }:null);
    setHasMore(result.hasMore);setTotal(Number(result.totalMatching));
    setHistoryLoaded(true);
  }
  async function verifyDiagnostics(){
    if(!workflowId)throw Error("Select a saved workflow.");
    const result=await invoke("triggerDiagnostics",{workflowId});
    if(result.source!=="authenticated_server"||
       result.workflowId!==workflowId||
       result.diagnosticType!=="local_cryptographic_configuration_check"||
       result.noNetworkRequest!==true||result.executed!==false||
       result.externalActionTriggered!==false||
       result.realDeliveryVerified!==false||
       result.workerLivenessVerified!==false||
       !Number.isInteger(result.pendingApprovals))throw Error("Unverified diagnostics.");
    setDiagnostics(result as Diagnostics);
    setNotice("Checked actual stored trigger and schedule credentials locally. No external event was sent.");
  }
  return <section aria-labelledby="automation-operations-title"
    className="space-y-4 rounded-xl border border-primary/20 p-4">
    <h4 id="automation-operations-title" className="text-base font-semibold">
      Automation operations · safety, diagnostics & real history
    </h4>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <PauseCircle className="size-4 text-primary"/> Atomic bulk pause / resume
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        Select at most 5 owner-saved workflows. All are checked for current revision
        and state in a single database transaction before any change is applied.
        Pausing prevents new completed runs; resuming can make separately
        enabled triggers eligible again. No triggers or credentials are created.
      </p>
      <div className="flex flex-wrap gap-2">
        {workflows.map(w=><label key={w.id}
          className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-xs">
          <Checkbox checked={selected.includes(w.id)} disabled={disabled||busy||
            (!selected.includes(w.id)&&selected.length>=5)}
            onCheckedChange={v=>setSelected(old=>v===true
              ?old.includes(w.id)?old:[...old,w.id]:old.filter(x=>x!==w.id))}/>
          <span>{w.name} ({w.active?"active":"paused"})</span>
        </label>)}
      </div>
      <p className="text-xs text-muted-foreground">
        Selected: {selected.length}/5. Operations: {usage?usage.used+"/10 in rolling 24h":"not loaded"}.
        All-or-nothing updates; never a bulk delete.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
          onClick={()=>void doIt(refreshUsage)}><RefreshCcw className="mr-2 size-4"/>
          Load real bulk quota</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy||disabled||
          !workflows.some(w=>selected.includes(w.id)&&w.active)}
          onClick={()=>void doIt(()=>bulkToggle(false))}>
          <PauseCircle className="mr-2 size-4"/> Pause selected
        </Button>
        <Button type="button" size="sm" disabled={busy||disabled||
          !workflows.some(w=>selected.includes(w.id)&&!w.active)}
          onClick={()=>void doIt(()=>bulkToggle(true))}>
          <Play className="mr-2 size-4"/> Resume selected
        </Button>
      </div>
    </div>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="size-4 text-primary"/> Non-executing trigger diagnostics
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        Validate the stored webhook's encryption and HMAC challenge locally,
        and check that scheduled input is decryptable. Show actual last use,
        next run and pending approvals—no mock health scores, no HTTP dispatch,
        no worker tick, and no consumed execution quota.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="automation-diagnostics-select" className="text-xs">Workflow</label>
        <select id="automation-diagnostics-select" value={workflowId}
          disabled={busy||disabled} className="rounded-md border border-input bg-background px-3 py-2 text-xs"
          onChange={e=>{setWorkflowId(e.target.value);setDiagnostics(null);}}>
          {workflows.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <Button type="button" size="sm" variant="outline"
          disabled={busy||disabled||!workflowId}
          onClick={()=>void doIt(verifyDiagnostics)}>
          <Activity className="mr-2 size-4"/> Verify locally
        </Button>
      </div>
      {diagnostics&&<div className="space-y-2 text-xs text-muted-foreground">
        <p>Pending owner approvals: {diagnostics.pendingApprovals}.
          Workflow: {diagnostics.policyActive?"Active":"Paused"}.</p>
        <p>Webhook: {diagnostics.webhook
          ?(diagnostics.webhook.enabled?"enabled":"disabled")+
            " · HMAC credential challenge "+(diagnostics.webhook.credentialChallengePassed?"passed":"failed")+
            " · policy eligible "+(diagnostics.webhook.eligible?"yes":"no")+
            " · last used "+fmt(diagnostics.webhook.lastUsedAt)
          :"not configured"}.</p>
        <p>Schedule: {diagnostics.schedule
          ?(diagnostics.schedule.enabled?"enabled":"disabled")+
            " · encrypted input "+(diagnostics.schedule.storedInputDecryptable?"decryptable":"unavailable")+
            " · policy eligible "+(diagnostics.schedule.eligible?"yes":"no")+
            " · next "+fmt(diagnostics.schedule.nextRunAt)+
            " · last "+fmt(diagnostics.schedule.lastRunAt)+
            " · last status "+diagnostics.schedule.lastStatus
          :"not configured"}.</p>
        <p>Global scheduler switch: {diagnostics.schedulerConfigEnabled?"On":"Off"}.
          Checks validate stored credentials and current configuration only; they
          do not prove external webhook connectivity or worker liveness.</p>
      </div>}
    </div>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Archive className="size-4 text-primary"/> Paginated, policy-aware execution history
      </p>
      <p className="text-xs text-muted-foreground">
        Query real completed database run receipts by workflow and execution channel.
        Backend keyset pagination prevents dropped results at identical timestamps.
        Input/output text is never included; retained trace metadata is shown.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label htmlFor="automation-history-workflow">Workflow
          <select id="automation-history-workflow" value={historyWorkflow}
            disabled={busy||disabled} onChange={e=>setHistoryWorkflow(e.target.value)}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1">
            <option value="all">All saved workflows</option>
            {workflows.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label htmlFor="automation-history-channel">Channel
          <select id="automation-history-channel" value={channel}
            disabled={busy||disabled} onChange={e=>setChannel(e.target.value as typeof channel)}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1">
            <option value="all">All</option>
            <option value="manual">Manual</option>
            <option value="webhook">Signed webhook</option>
            <option value="scheduled">Schedule</option>
          </select>
        </label>
        <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
          onClick={()=>void doIt(()=>getHistory(false))}>
          <RefreshCcw className="mr-2 size-4"/> Load actual history
        </Button>
      </div>
      {historyLoaded&&<p className="text-xs text-muted-foreground">
        {runs.length} of {total??0} matching stored completed runs shown.
      </p>}
      {historyLoaded&&runs.length===0&&<p className="text-xs text-muted-foreground">
        No recorded runs match this filter.
      </p>}
      {runs.length>0&&<ol className="space-y-2">
        {runs.map(r=><li key={r.id} className="rounded-lg border border-border/70 p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">{r.trigger_type} ·
            {r.input_lines} input lines → {r.output_lines} output lines</p>
          <p>{fmt(r.created_at)} · workflow revision {r.workflow_revision} ·
            {r.trace.length} recorded steps</p>
          <p className="break-all font-mono">Run {r.id}</p>
        </li>)}
      </ol>}
      {hasMore&&<Button type="button" size="sm" variant="outline"
        disabled={busy||disabled||!cursor}
        onClick={()=>void doIt(()=>getHistory(true))}>Load next 15 runs</Button>}
    </div>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
