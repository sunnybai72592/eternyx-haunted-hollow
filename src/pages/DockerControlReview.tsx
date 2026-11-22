import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Container, ShieldCheck, ShieldAlert, ClipboardCheck, Clock3, Copy, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
type Policy={enabled:boolean;daily_limit:number};
type Agent={id:string;display_name:string;status:string};
type Request={id:string;agent_id:string;operation:"start"|"stop"|"restart";container_id:string;state:string;effective_state:string;requested_at:string;expires_at:string;execution_status:string;dispatch_claimed_at?:string|null;}
type Event={request_id:string;event_kind:string;occurred_at:string};
const containerIdPattern=/^[0-9a-f]{64}$/;
async function control(action:string,fields:Record<string,unknown>={}):Promise<Record<string,unknown>>{
  const {data,error}=await supabase.functions.invoke("docker-control",{body:{action,...fields}});
  if(error){
    let msg=error.message||"Docker operation review unavailable.";
    try{const context=error.context;if(context&&typeof context.json==="function"){const item=await context.json();if(typeof item?.error==="string")msg=item.error;}}catch{}
    throw new Error(msg);
  }
  if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("Invalid operation review response.");
  return data as Record<string,unknown>;
}
export default function DockerControlReview(){
  const user=useAuthStore(s=>s.user);
  const [policy,setPolicy]=useState<Policy>({enabled:false,daily_limit:5});
  const [agents,setAgents]=useState<Agent[]>([]);
  const [requests,setRequests]=useState<Request[]>([]);
  const [events,setEvents]=useState<Event[]>([]);
  const [agentId,setAgentId]=useState("");
  const [operation,setOperation]=useState<"start"|"stop"|"restart">("stop");
  const [containerId,setContainerId]=useState("");
  const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
  const [confirmation,setConfirmation]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [loaded,setLoaded]=useState(false);
  const load=useCallback(async()=>{
    const data=await control("list");
    const next=Array.isArray(data.agents)?data.agents as Agent[]:[];
    const nextPolicy=data.policy as Policy|undefined;
    setPolicy(nextPolicy&&typeof nextPolicy.enabled==="boolean"&&Number.isInteger(nextPolicy.daily_limit)?nextPolicy:{enabled:false,daily_limit:5});
    setAgents(next);
    setAgentId(id=>next.some(a=>a.id===id)?id:next[0]?.id||"");
    setRequests(Array.isArray(data.requests)?data.requests as Request[]:[]);
    setEvents(Array.isArray(data.events)?data.events as Event[]:[]);
    setLoaded(true);
  },[]);
  useEffect(()=>{if(user?.id)load().catch(e=>setError(e instanceof Error?e.message:"Docker control unavailable"));},[user?.id,load]);
  const act=async(fn:()=>Promise<void>)=>{
    setBusy(true);setError("");setNotice("");
    try{await fn();}catch(e){setError(e instanceof Error?e.message:"Operation review failed");}finally{setBusy(false);}
  };
  const changePolicy=(enabled:boolean)=>act(async()=>{
    await control("policy",{enabled,dailyLimit:policy.daily_limit});
    await load();
    setNotice(enabled?"Owner review policy enabled. Docker execution remains disabled.":"Policy disabled; outstanding approvals cancelled.");
  });
  const create=()=>act(async()=>{
    if(!agentId||!containerIdPattern.test(containerId))throw new Error("Enter a full 64-character lowercase Docker container ID.");
    const created=await control("request",{agentId,operation,containerId,requestKey});
    if(typeof created.request_id!=="string")throw new Error("No confirmed request ID returned.");
    setRequestKey(crypto.randomUUID());setContainerId("");await load();
    setNotice("Owner operation review request saved. Nothing was executed.");
  });
  const decide=(row:Request,decision:"approve"|"reject"|"cancel")=>act(async()=>{
    if(decision==="approve"&&confirmation[row.id]!=="APPROVE "+row.id.slice(0,8))
      throw new Error("Type the exact approval phrase shown beside the request.");
    await control("decide",{requestId:row.id,decision,
      ...(decision==="approve"?{confirmation:confirmation[row.id]}:{})});
    setConfirmation(old=>({...old,[row.id]:""}));await load();
    setNotice(decision==="approve"?"Request approved on ETERNYX. No container operation was executed.":"Request decision recorded.");
  });
  const canCreate=policy.enabled && !!agentId && containerIdPattern.test(containerId);
  const approved=requests.filter(x=>x.effective_state==="approved");
  const reviewed=useMemo(()=>requests.filter(r=>r.effective_state!=="unavailable"),[requests]);
  return <div className="mx-auto max-w-6xl space-y-6 px-4 pb-20 pt-4 text-foreground sm:px-6">
    <Link to="/integrations/docker-enrollment" className="text-sm text-cyan-400 hover:underline">Docker agent enrollment</Link>
    <section className="rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-slate-950 via-slate-950 to-indigo-950 p-7 text-white sm:p-9">
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-cyan-300"><Container className="h-5 w-5"/> Docker governance</div>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Operation Review &amp; Approval</h1>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">Create, approve and cancel account-owned operation plans for enrolled agents. Every plan expires after 10 minutes. These are durable review records—not remote Docker execution requests.</p>
      <p className="mt-3 text-xs text-cyan-200">Hosted execution: disabled · Credentials and Docker socket: not collected</p>
    </section>
    {error&&<p role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/30 p-4 text-sm text-red-400"><ShieldAlert className="h-5 w-5"/>{error}</p>}
    {notice&&<p role="status" className="rounded-xl border border-border p-4 text-sm">{notice}</p>}
    {!loaded&&<p role="status" className="text-sm text-muted-foreground">Loading your Docker operation settings…</p>}
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-cyan-500"/> 1. Explicit owner opt-in</h2>
      <p className="mt-2 text-sm text-muted-foreground">Disabled by default. Turning it on permits creation of review plans only, not remote operation execution. Turning it off cancels outstanding plans.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">{policy.enabled?"Review enabled":"Review disabled"}</span>
        <button disabled={busy||!loaded} onClick={()=>changePolicy(!policy.enabled)} className="min-h-11 rounded-lg border border-cyan-500/40 px-4 text-sm font-semibold disabled:opacity-50">{policy.enabled?"Disable and cancel open plans":"Enable operation review"}</button>
      </div>
    </section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-xl font-semibold">2. Create an operation plan</h2>
      <p className="mt-2 text-sm text-muted-foreground">Requires a verified agent identity with a signed Docker report received within the last three minutes. The host must still be independently verified by its operator.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Enrolled agent
          <select value={agentId} onChange={e=>setAgentId(e.target.value)} aria-label="Target enrolled Docker agent" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3">
            <option value="">Choose an agent</option>{agents.map(a=><option key={a.id} value={a.id}>{a.display_name}</option>)}
          </select>
        </label>
        <label className="text-sm">Allowlisted action
          <select value={operation} onChange={e=>setOperation(e.target.value as typeof operation)} aria-label="Docker action" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3">
            <option value="start">Start</option><option value="stop">Stop</option><option value="restart">Restart</option>
          </select>
        </label>
      </div>
      <label className="mt-4 block text-sm">Complete 64-character lowercase container ID
        <input value={containerId} onChange={e=>setContainerId(e.target.value.trim())} maxLength={64} autoComplete="off" spellCheck={false} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs" placeholder="64 hexadecimal characters"/>
      </label>
      <button disabled={busy||!loaded||!canCreate} onClick={create} className="mt-4 min-h-11 rounded-lg bg-cyan-500 px-5 font-semibold text-slate-950 disabled:opacity-50">Request review (no execution)</button>
    </section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">3. Your operation requests</h2>
        <button disabled={busy} onClick={()=>act(async()=>{await load();setNotice("Request and audit records refreshed.");})} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm"><RefreshCw className="h-4 w-4"/> Refresh</button>
      </div>
      <div className="mt-4 space-y-3">
        {reviewed.map(row=><article key={row.id} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="font-semibold">{row.operation.toUpperCase()} · {row.container_id.slice(0,12)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Agent: {agents.find(a=>a.id===row.agent_id)?.display_name??"Unavailable"}
                {" · "}Requested {new Date(row.requested_at).toLocaleString()}</p>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{row.effective_state}</span>
          </div>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4"/> Expires {new Date(row.expires_at).toLocaleString()} · Agent dispatch: {row.execution_status==="not_dispatched"?"not dispatched":row.execution_status==="claimed"?"claimed / outcome unknown":row.execution_status.replaceAll("_"," ")} (agent-reported)</p>
          {row.execution_status==="claimed"&&<p role="status" className="mt-3 rounded-lg border border-amber-500/40 p-3 text-xs leading-6">
            <ShieldAlert className="mr-2 inline h-4 w-4 text-amber-500"/>
            {row.dispatch_claimed_at&&Date.now()-Date.parse(row.dispatch_claimed_at)>60000
              ?"Claim older than the dispatch window: outcome unknown. Inspect the local operator journal. Never auto-retry."
              :"Claimed by an agent; no signed final receipt yet. Execution outcome is not independently verified."}
          </p>}
          {row.effective_state==="pending"&&<div className="mt-3 space-y-3">
            <label className="block text-xs text-muted-foreground">To approve, type: <strong className="font-mono">APPROVE {row.id.slice(0,8)}</strong>
              <input aria-label={"Approval confirmation "+row.id.slice(0,8)} value={confirmation[row.id]??""} onChange={e=>setConfirmation(s=>({...s,[row.id]:e.target.value}))} className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs"/>
            </label>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy||confirmation[row.id]!=="APPROVE "+row.id.slice(0,8)} onClick={()=>decide(row,"approve")} className="min-h-11 rounded-lg border border-cyan-500/50 px-4 text-sm font-semibold disabled:opacity-50">Approve plan</button>
              <button disabled={busy} onClick={()=>decide(row,"reject")} className="min-h-11 rounded-lg border border-border px-4 text-sm">Reject</button>
              <button disabled={busy} onClick={()=>decide(row,"cancel")} className="min-h-11 rounded-lg border border-border px-4 text-sm">Cancel</button>
            </div>
          </div>}
          {row.effective_state==="approved"&&<div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm font-semibold">Trusted operator preview only</p>
            <code className="block break-all text-xs">node scripts/docker-operator.mjs {row.operation} {row.container_id}</code>
            <button onClick={()=>navigator.clipboard.writeText("node scripts/docker-operator.mjs "+row.operation+" "+row.container_id).then(()=>setNotice("Local preview command copied.")).catch(()=>setError("Clipboard is unavailable."))} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm"><Copy className="h-4 w-4"/> Copy preview</button>
            <p className="text-xs text-muted-foreground">The preview executes nothing. A separately configured, manually invoked and signed lab agent may act only after a short-lived server permit; no shared production Docker hosts are supported.</p>
            <button disabled={busy} onClick={()=>decide(row,"cancel")} className="min-h-11 rounded-lg border border-border px-4 text-sm">Cancel approval</button>
          </div>}
        </article>)}
        {reviewed.length===0&&<p className="py-5 text-sm text-muted-foreground">No operation requests recorded. Nothing has been executed.</p>}
      </div>
    </section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><ClipboardCheck className="h-5 w-5 text-cyan-500"/> Recent audit events</h2>
      <div className="mt-3 space-y-2">{events.map((item,index)=><p key={item.request_id+item.occurred_at+index} className="rounded-lg border border-border px-3 py-2 text-sm">{item.event_kind} · {item.request_id.slice(0,8)} <span className="text-xs text-muted-foreground">· {new Date(item.occurred_at).toLocaleString()}</span></p>)}</div>
      {events.length===0&&<p className="mt-4 text-sm text-muted-foreground">No audit events found.</p>}
      <p className="mt-4 text-xs text-muted-foreground">Owner events document decisions. A signed lab-agent receipt is displayed separately as an agent-reported outcome; it is not independent proof of Docker success.</p>
    </section>
    <p className="text-xs text-muted-foreground">This interface does not expose Docker credentials, host addresses, tokens, sockets or shell access.</p>
  </div>;
}
