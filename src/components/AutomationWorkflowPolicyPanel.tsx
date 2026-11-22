import {useEffect,useState} from "react";
import {ShieldCheck,RefreshCcw,Save,FlaskConical} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Checkbox} from "@/components/ui/checkbox";
import {supabase} from "@/integrations/supabase/client";
import {useAuthStore} from "@/store/authStore";

type Policy={
  workflowId:string;revision:number;active:boolean;
  maxInputCharacters:number;maxOutputCharacters:number;
  dailyRunLimit:number;runsLast24h:number;
  allowWebhook:boolean;allowSchedule:boolean;
  enabledWebhookTriggers:number;approvalRequiredWebhooks:number;
  enabledSchedules:number;schedulerConfigEnabled:boolean;
  manualReady:boolean;webhookPolicyReady:boolean;schedulePolicyReady:boolean;
  webhookSecretConfigured:boolean;scheduleSecretConfigured:boolean;
  approvalSecretConfigured:boolean;webhookSettingsReady:boolean;
  scheduleSettingsReady:boolean;liveDeliveryVerified:false;
};
type Settings={
  maxInputCharacters:number;maxOutputCharacters:number;dailyRunLimit:number;
  allowWebhook:boolean;allowSchedule:boolean;
};
type Preflight={allowed:boolean;reason:string|null;
  inputChecked:boolean;outputChecked:boolean;channel:string;
  runsLast24h:number;dailyRunLimit:number;executed:false;
  externalActionTriggered:false;policyIsSnapshot:true};
const initial:Settings={
  maxInputCharacters:12000,maxOutputCharacters:30000,
  dailyRunLimit:30,allowWebhook:true,allowSchedule:true,
};
async function action(name:string,params:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("automation-control",{
    body:{action:name,...params},
  });
  if(error){
    let message="Automation execution policy service is unavailable.";
    try{
      const resp=error.context as Response;
      if(resp&&typeof resp.json==="function"){
        const detail=await resp.json();
        if(typeof detail?.code==="string"&&detail.code.length<80){
          message+=" ("+detail.code+")";
        }
      }
    }catch{/* keep generic error */}
    throw Error(message);
  }
  if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Invalid server policy response.");
  return data as Record<string,unknown>;
}
function parsePolicy(data:Record<string,unknown>):Policy{
  if(data.ok!==true||data.source!=="authenticated_server"||
     typeof data.workflowId!=="string"||!Number.isInteger(data.revision)||
     typeof data.active!=="boolean"||
     !Number.isInteger(data.maxInputCharacters)||
     !Number.isInteger(data.maxOutputCharacters)||
     !Number.isInteger(data.dailyRunLimit)||
     !Number.isInteger(data.runsLast24h)||
     typeof data.allowWebhook!=="boolean"||
     typeof data.allowSchedule!=="boolean"||
     !Number.isInteger(data.enabledWebhookTriggers)||
     !Number.isInteger(data.approvalRequiredWebhooks)||
     !Number.isInteger(data.enabledSchedules)||
     typeof data.schedulerConfigEnabled!=="boolean"||
     typeof data.manualReady!=="boolean"||
     typeof data.webhookPolicyReady!=="boolean"||
     typeof data.schedulePolicyReady!=="boolean"||
     typeof data.webhookSecretConfigured!=="boolean"||
     typeof data.scheduleSecretConfigured!=="boolean"||
     typeof data.approvalSecretConfigured!=="boolean"||
     typeof data.webhookSettingsReady!=="boolean"||
     typeof data.scheduleSettingsReady!=="boolean"||
     data.liveDeliveryVerified!==false){
    throw Error("Unverified workflow policy response.");
  }
  return data as Policy;
}
export default function AutomationWorkflowPolicyPanel({
  workflowId,revision,input,
}:{
  workflowId:string;revision:number;input:string;
}){
  const userId=useAuthStore(s=>s.user?.id);
  const [policy,setPolicy]=useState<Policy|null>(null);
  const [form,setForm]=useState<Settings>(initial);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [check,setCheck]=useState<Preflight|null>(null);
  const [channel,setChannel]=useState<"manual"|"webhook"|"scheduled">("manual");
  useEffect(()=>{
    setPolicy(null);setForm(initial);setCheck(null);
    setError("");setNotice("");
  },[workflowId,userId,revision]);

  async function refresh(){
    const data=await action("workflowPolicy",{workflowId});
    const safe=parsePolicy(data);
    if(safe.workflowId!==workflowId||safe.revision!==revision){
      throw Error("Saved workflow revision changed. Reload the workflow first.");
    }
    setPolicy(safe);
    setForm({
      maxInputCharacters:safe.maxInputCharacters,
      maxOutputCharacters:safe.maxOutputCharacters,
      dailyRunLimit:safe.dailyRunLimit,
      allowWebhook:safe.allowWebhook,allowSchedule:safe.allowSchedule,
    });
    return safe;
  }
  async function run(task:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await task();}catch(e){setError(e instanceof Error?e.message:"Policy action failed.");}
    finally{setBusy(false);}
  }
  const numbersValid=Number.isInteger(form.maxInputCharacters)&&
    form.maxInputCharacters>=0&&form.maxInputCharacters<=12000&&
    Number.isInteger(form.maxOutputCharacters)&&
    form.maxOutputCharacters>=0&&form.maxOutputCharacters<=30000&&
    Number.isInteger(form.dailyRunLimit)&&
    form.dailyRunLimit>=1&&form.dailyRunLimit<=30;
  return <section className="space-y-3 rounded-xl border border-primary/20 bg-background/70 p-4"
    aria-labelledby="eternyx-workflow-policy-heading">
    <h4 id="eternyx-workflow-policy-heading" className="flex items-center gap-2 font-semibold">
      <ShieldCheck className="size-4 text-primary"/> Execution policy & real trigger readiness
    </h4>
    <p className="text-xs leading-5 text-muted-foreground">
      Set limits on this saved workflow across manual, signed webhook and scheduled
      executions. The shared database recording path enforces size/daily limits;
      disabling a trigger channel blocks its completed runs even when an older
      trigger or schedule is still enabled. These controls do not turn on triggers.
    </p>
    <Button type="button" size="sm" variant="outline" disabled={busy}
      onClick={()=>void run(async()=>{await refresh();setNotice("Loaded measured, owner-scoped policy state.");})}>
      <RefreshCcw className="mr-2 size-4"/> Load verified readiness and policy
    </Button>
    {policy&&<div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Saved revision {policy.revision} · {policy.active?"Active":"Paused"} ·
        Completed runs last 24h: {policy.runsLast24h}/{policy.dailyRunLimit} (this workflow).
        Global per-account run limits and upstream trigger budgets apply independently.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs" htmlFor="automation-policy-input">Input characters, max 12,000
          <Input id="automation-policy-input" type="number" min={0} max={12000}
            step={1} value={form.maxInputCharacters} disabled={busy}
            onChange={e=>{setCheck(null);setForm(v=>({...v,maxInputCharacters:Number(e.target.value)}));}}/>
        </label>
        <label className="text-xs" htmlFor="automation-policy-output">Output characters, max 30,000
          <Input id="automation-policy-output" type="number" min={0} max={30000}
            step={1} value={form.maxOutputCharacters} disabled={busy}
            onChange={e=>{setCheck(null);setForm(v=>({...v,maxOutputCharacters:Number(e.target.value)}));}}/>
        </label>
        <label className="text-xs" htmlFor="automation-policy-daily">Runs per rolling 24h, 1–30
          <Input id="automation-policy-daily" type="number" min={1} max={30}
            step={1} value={form.dailyRunLimit} disabled={busy}
            onChange={e=>{setCheck(null);setForm(v=>({...v,dailyRunLimit:Number(e.target.value)}));}}/>
        </label>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={form.allowWebhook} disabled={busy}
            onCheckedChange={v=>{setCheck(null);setForm(x=>({...x,allowWebhook:v===true}));}}/>
          Allow signed webhook runs
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={form.allowSchedule} disabled={busy}
            onCheckedChange={v=>{setCheck(null);setForm(x=>({...x,allowSchedule:v===true}));}}/>
          Allow scheduled runs
        </label>
      </div>
      <Button type="button" size="sm" disabled={busy||!numbersValid} onClick={()=>
        void run(async()=>{
          if((form.allowWebhook&&!policy.allowWebhook)||
            (form.allowSchedule&&!policy.allowSchedule)){
            if(!window.confirm("Allow this execution channel? Only already authorized, separately enabled triggers can use it."))return;
          }
          const result=await action("setWorkflowPolicy",{workflowId,...form});
          if(result.ok!==true||result.workflow_id!==workflowId)throw Error("Server did not accept policy change.");
          setCheck(null);await refresh();setNotice("Execution policy saved and enforced on the server.");
        })}>
        <Save className="mr-2 size-4"/> Save owner execution policy
      </Button>
      <div className="space-y-2 rounded-lg border border-border/70 p-3">
        <p className="text-sm font-medium">Observed trigger configuration (not a live-delivery guarantee)</p>
        <p className="text-xs text-muted-foreground">
          Webhooks: {policy.enabledWebhookTriggers} enabled,
          {" "}{policy.approvalRequiredWebhooks} requiring review.
          Webhook key configured: {policy.webhookSecretConfigured?"Yes":"No"};
          approval key configured: {policy.approvalSecretConfigured?"Yes":"No"}.
          Settings ready: {policy.webhookSettingsReady?"Yes":"No"}.
        </p>
        <p className="text-xs text-muted-foreground">
          Schedules: {policy.enabledSchedules} enabled;
          global scheduler switch: {policy.schedulerConfigEnabled?"On":"Off"};
          encryption key configured: {policy.scheduleSecretConfigured?"Yes":"No"}.
          Settings ready: {policy.scheduleSettingsReady?"Yes":"No"}.
        </p>
        <p className="text-xs text-muted-foreground">
          Manual policy: {policy.manualReady?"Eligible":"Not eligible"}.
          Actual webhook delivery and scheduler worker liveness are not verified
          here. Network ingress and global account budgets can still block execution.
        </p>
      </div>
      <div className="space-y-2 rounded-lg border border-border/70 p-3">
        <p className="text-sm font-medium">Run a non-executing policy preflight</p>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs" htmlFor="automation-policy-channel">Channel
            <select id="automation-policy-channel" value={channel}
              disabled={busy} onChange={e=>{setCheck(null);setChannel(e.target.value as typeof channel);}}
              className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm">
              <option value="manual">Manual</option>
              <option value="webhook">Signed webhook</option>
              <option value="scheduled">Schedule</option>
            </select>
          </label>
          <Button type="button" size="sm" variant="outline" disabled={busy||input.length>12000}
            onClick={()=>void run(async()=>{
              const result=await action("workflowPreflight",{
                workflowId,channel,inputCharacters:input.length,
              });
              if(result.ok!==true||result.source!=="authenticated_server"||
                 result.executed!==false||result.externalActionTriggered!==false||
                 result.policyIsSnapshot!==true||
                 typeof result.allowed!=="boolean"||
                 typeof result.inputChecked!=="boolean"||
                 typeof result.outputChecked!=="boolean"){
                throw Error("Server did not return a verified no-execution policy snapshot.");
              }
              setCheck(result as unknown as Preflight);
              setNotice("Checked input length and policy state only. No workflow or provider request was executed.");
            })}>
            <FlaskConical className="mr-2 size-4"/> Check without executing
          </Button>
        </div>
        {check&&<p role="status" className="text-xs text-muted-foreground">
          {check.channel}: {check.allowed?"Allowed by current policy":"Blocked by current policy"}
          {check.reason?" · "+check.reason:""}.
          Input size checked: {check.inputChecked?"Yes":"No"}.
          Actual output size checked: {check.outputChecked?"Yes":"No"}.
          This is a snapshot, not a run reservation or delivery guarantee.
        </p>}
      </div>
    </div>}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
