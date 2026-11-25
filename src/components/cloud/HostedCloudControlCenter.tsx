import {useCallback,useEffect,useRef,useState} from "react";
import {Link} from "react-router-dom";
import {AlertTriangle,Cloud,Container,RefreshCw,ShieldAlert,ShieldCheck,Server,Activity,Clock3} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import {useAuthStore} from "@/store/authStore";
import {buildCloudHostedOwnerSummary} from "@/lib/cloudHostedOwnerSummary.mjs";

type HostedSummary=ReturnType<typeof buildCloudHostedOwnerSummary>;
type State={ownerId:string|null;loading:boolean;error:string;summary:HostedSummary|null};
const unavailable:State={ownerId:null,loading:false,error:"",summary:null};

function readableTime(s:string|null|undefined){
 if(!s)return "Not received";
 const d=new Date(s);
 return Number.isFinite(d.valueOf())?d.toLocaleString():"Unavailable";
}
function errorMessage(reason:unknown):string{
 // Never echo raw Edge Function JSON, credentials, host URLs or supplied
 // arbitrary exception strings to the account dashboard.
 const msg=reason instanceof Error?reason.message:"";
 if(msg.includes("stale"))return "Your hosted observation expired. Refresh to request a new account snapshot.";
 if(msg.includes("Hosted execution posture"))return "The backend security posture changed. Infrastructure controls are locked pending review.";
 if(msg.includes("not match")||msg.includes("Invalid")||msg.includes("Malformed")||
    msg.includes("unavailable")||msg.includes("missing")||msg.includes("Duplicate"))
  return "The account control response failed validation. No cloud state was accepted.";
 return "Hosted account status could not be loaded. Check your sign-in and staging deployment.";
}

/** The main Cloud page is public; this embedded server panel fetches nothing
 * without an authenticated identity and never retains A's records for B. */
export default function HostedCloudControlCenter(){
 const userId=useAuthStore(s=>s.user?.id??null);
 const isAuthenticated=useAuthStore(s=>s.isAuthenticated);
 const owner=isAuthenticated?userId:null;
 const serial=useRef(0);
 const [state,setState]=useState<State>(unavailable);

 const load=useCallback(async()=>{
  const token=++serial.current;
  if(!owner){setState(unavailable);return;}
  setState({ownerId:owner,loading:true,error:"",summary:null});
  try{
   const before=await supabase.auth.getUser();
   if(before.error||before.data.user?.id!==owner||before.data.user.is_anonymous)
    throw new Error("Account identity unavailable.");
   // These are the existing owner-scoped protected endpoints; no new
   // connector credentials, arbitrary URLs, mutation actions or Docker socket.
   const [enrollment,control]=await Promise.all([
    supabase.functions.invoke("docker-enrollment",{body:{action:"list"}}),
    supabase.functions.invoke("docker-control",{body:{action:"list"}})
   ]);
   if(enrollment.error||control.error)
    throw new Error("Hosted account endpoint unavailable.");
   const after=await supabase.auth.getSession();
   if(after.error||after.data.session?.user.id!==owner)
    throw new Error("Account identity changed during refresh.");
   const summary=buildCloudHostedOwnerSummary(enrollment.data,control.data);
   if(serial.current!==token)return;
   setState({ownerId:owner,loading:false,error:"",summary});
  }catch(error){
   if(serial.current!==token)return;
   setState({ownerId:owner,loading:false,error:errorMessage(error),summary:null});
  }
 },[owner]);

 useEffect(()=>{
  void load();
  return ()=>{serial.current++;};
 },[load]);

 // Return-to-tab revalidation is bounded and opt-in to visibility, not an
 // unattended poll or costly cloud worker. Never retain a stale server sample.
 useEffect(()=>{
  const onVisible=()=>{
   if(!owner||document.visibilityState!=="visible")return;
   const current=state.ownerId===owner?state.summary:null;
   if(current&&Date.now()-Date.parse(current.observedAt)>120000)void load();
  };
  document.addEventListener("visibilitychange",onVisible);
  return ()=>document.removeEventListener("visibilitychange",onVisible);
 },[owner,state.ownerId,state.summary,load]);

 const own=state.ownerId===owner;
 const summary=own?state.summary:null;
 const loading=owner&&own&&state.loading;
 const error=owner&&own?state.error:"";
 return <section className="rounded-2xl border border-cyan-500/25 bg-card p-5 sm:p-7" aria-labelledby="cloud-hosted-title">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div>
    <h2 id="cloud-hosted-title" className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
     <Cloud className="h-6 w-6 text-cyan-500"/> Hosted account control center
    </h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
     Authenticated ETERNYX server records for your own Docker enrollment, signed-agent reports, operation reviews and incidents.
     These are <strong>not</strong> a live Docker Engine or Kubernetes cluster connection.
    </p>
   </div>
   {owner&&<button type="button" disabled={Boolean(loading)} onClick={()=>void load()}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-cyan-500/40 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-50"
      aria-label="Refresh my hosted cloud control records">
      <RefreshCw className={"h-4 w-4"+(loading?" animate-spin":"")}/>
      {loading?"Refreshing…":"Refresh"}
    </button>}
  </div>
  {!owner?<div className="mt-5 rounded-xl border border-border bg-muted/20 p-5">
   <p className="font-medium">Sign in to load your protected infrastructure records</p>
   <p className="mt-2 text-sm text-muted-foreground">No account data or remote connection request is loaded for visitors.</p>
   <Link to="/auth" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-cyan-500/40 px-4 text-sm font-medium">Sign in</Link>
  </div>:loading?<p role="status" className="mt-5 text-sm text-muted-foreground">
   Checking your identity and loading fresh, owner-scoped server records…
  </p>:error?<div role="alert" className="mt-5 rounded-xl border border-amber-500/30 p-4 text-sm">
    <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5 text-amber-500"/> Account control status unavailable</p>
    <p className="mt-2 text-muted-foreground">{error}</p>
    <p className="mt-2 text-xs text-muted-foreground">No previous owner's data or cached green status is displayed.</p>
  </div>:summary?<div className="mt-5 space-y-5">
   <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
    <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-500"/> Authenticated account API responded</span>
    <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4"/> Sampled {readableTime(summary.observedAt)}</span>
    <span>Refresh or revisit for updates · no background polling</span>
   </div>
   <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {[
     ["Account workspaces",summary.workspaces.length,"Maximum 3 enrolled workspaces"],
     ["Verified identities",summary.enrolledVerifiedCount,"Key possession, not physical host proof"],
     ["Recent signed reports",summary.recentSignedEngineReports,"Received in the past three minutes"],
     ["Manual reconciliations",summary.reconciliationRequired,"Among the recent request window"]
    ].map(([label,value,detail])=><div key={label} className="rounded-xl border border-border bg-muted/20 p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-2 text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
     </div>)}
   </div>
   <div className="grid gap-4 lg:grid-cols-2">
    <article className="rounded-xl border border-border p-4">
     <h3 className="flex items-center gap-2 font-semibold"><Server className="h-5 w-5 text-cyan-500"/> Your enrolled Docker identities</h3>
     {summary.workspaces.length===0?<p className="mt-3 text-sm text-muted-foreground">No workspaces enrolled yet.</p>:
      <div className="mt-3 space-y-2">{summary.workspaces.map(w=><p key={w.id} className="rounded-lg bg-muted/30 p-3 text-sm font-medium break-words">{w.name}</p>)}</div>}
     <p className="mt-3 text-xs text-muted-foreground">
      {summary.enrollmentCount} total agents in this account · {summary.dailyReviewPlanLimit} maximum owner review requests per day (not a compute or billing quota).
     </p>
     {summary.reports.length===0?<p className="mt-3 text-sm text-muted-foreground">No signed agent reports received for this account.</p>:
      <div className="mt-3 space-y-2">{summary.reports.slice(0,5).map(r=><div key={r.agentId} className="rounded-lg border border-border p-3 text-sm">
       <p className="font-medium break-words">{r.label}</p>
       <p className="mt-1 text-xs text-muted-foreground">{r.recent?"Recent agent-reported engine available":"No current verified engine status"} · Last report: {readableTime(r.receivedAt)}</p>
       <p className="mt-1 text-xs text-muted-foreground">Reported containers: {r.containerCount??"Unavailable"} (agent assertion only)</p>
      </div>)}</div>}
    </article>
    <article className="rounded-xl border border-border p-4">
     <h3 className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-5 w-5 text-cyan-500"/> Control, incidents and recovery</h3>
     <p role="status" className="mt-3 rounded-lg bg-muted/30 p-3 text-sm">
      {summary.incidentHoldActive?"Emergency incident hold is recorded.":summary.reviewPolicyEnabled?
       "Operation-review policy enabled. Remote execution is still disabled.":"Operation-review policy disabled."}
     </p>
     <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
      <div><dt className="text-muted-foreground">Incidents in window</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{summary.incidentCount}</dd></div>
      <div><dt className="text-muted-foreground">Escalated incidents</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{summary.escalatedIncidentCount}</dd></div>
      <div><dt className="text-muted-foreground">Pending receipts</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{summary.receiptPending}</dd></div>
      <div><dt className="text-muted-foreground">Recent review plans</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{summary.requestCount}</dd></div>
     </dl>
     <p className="mt-3 text-xs leading-5 text-muted-foreground">Counts are bounded server records. A signed agent report does not prove an executed command, server receipt, or independent host safety.</p>
     <Link to="/integrations/docker-control" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-cyan-500/40 px-4 text-sm font-medium hover:bg-cyan-500/10">Open incident and operation review</Link>
    </article>
   </div>
   <article className="rounded-xl border border-border p-4">
    <h3 className="flex items-center gap-2 font-semibold"><Activity className="h-5 w-5 text-cyan-500"/> Recent account operation records</h3>
    {summary.recentRequests.length===0?<p className="mt-3 text-sm text-muted-foreground">No owner operation plans found. Nothing is treated as executed.</p>:
     <div className="mt-3 grid gap-2 md:grid-cols-2">{summary.recentRequests.map(r=><div key={r.id} className="rounded-lg bg-muted/30 p-3 text-sm">
      <p className="font-medium">{r.operation.toUpperCase()} · Container {r.containerPrefix}…</p>
      <p className="mt-1 text-xs text-muted-foreground">Review: {r.effectiveState.replaceAll("_"," ")} · Agent: {r.executionStatus.replaceAll("_"," ")}</p>
      <p className="mt-1 text-xs text-muted-foreground">Requested {readableTime(r.requestedAt)}</p>
      {r.requiresAttention&&<p className="mt-2 text-xs font-semibold text-amber-500">Needs human reconciliation — no automatic retry</p>}
     </div>)}</div>}
   </article>
   <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 p-4">
    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"/>
    <div className="text-sm leading-6">
     <p className="font-semibold">Infrastructure execution is not connected or approved</p>
     <p className="text-muted-foreground">
      Docker host access, Kubernetes provisioning, cross-tenant resource quotas, provider billing,
      container lifecycle operations and emergency remote teardown require independently approved infrastructure.
      This dashboard shows authenticated account metadata only, not a live cluster or host connection.
     </p>
    </div>
   </div>
  </div>:<p role="status" className="mt-5 text-sm text-muted-foreground">No hosted account observation has been loaded.</p>}
 </section>;
}
