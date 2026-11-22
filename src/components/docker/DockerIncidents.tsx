import {useState} from "react";
import {AlertTriangle,ClipboardCheck,FileWarning} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";

type ClaimView={id:string;operation:string;container_id:string;dispatch_claim_id?:string|null;reconciliation?:{status:string;attentionRequired:boolean}};
export type DockerIncident={id:string;claim_id:string;reason:string;status:"open"|"investigating"|"reviewed";created_at:string;updated_at:string};
export type DockerIncidentEvent={id:number;incident_id:string;action:string;note:string;occurred_at:string};
type Props={requests:ClaimView[];incidents:DockerIncident[];events:DockerIncidentEvent[];refresh:()=>Promise<void>};
const actionable=new Set(["receipt_pending","reconciliation_required","agent_reported_failed","agent_reported_guard_denied"]);
async function mutate(body:Record<string,string>){
 const {data,error}=await supabase.functions.invoke("docker-control",{body});
 if(error){
  let message=error.message||"Incident service unavailable.";
  try{if(error.context?.json){const v=await error.context.json();if(typeof v?.error==="string")message=v.error;}}catch{}
  throw Error(message);
 }
 if(data?.ok!==true)throw Error("Incident change was not accepted.");
 return data;
}
export default function DockerIncidents({requests,incidents,events,refresh}:Props){
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const act=async(body:Record<string,string>,noteKey:string)=>{
  setBusy(true);setError("");setMessage("");
  try{
   await mutate(body);await refresh();
   setNotes(v=>({...v,[noteKey]:""}));
   setMessage("Incident investigation record updated. Docker execution status is unchanged.");
  }catch(e){setError(e instanceof Error?e.message:"Incident action failed.");}
  finally{setBusy(false);}
 };
 const input=(key:string)=><textarea
   aria-label={"Investigation note for "+key.slice(0,8)} maxLength={500} rows={2}
   value={notes[key]??""} onChange={e=>setNotes(s=>({...s,[key]:e.target.value}))}
   placeholder="Record what you checked. Do not include credentials or secrets."
   className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm"/>;
 const canNote=(key:string)=>{const t=(notes[key]??"").trim();return t.length>=12&&t.length<=500&&!/[\u0000-\u001f\u007f]/.test(t);};
 const candidates=requests.filter(r=>r.dispatch_claim_id&&actionable.has(r.reconciliation?.status??"")&&!incidents.some(i=>i.claim_id===r.dispatch_claim_id));
 return <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="docker-incidents-title">
  <h2 id="docker-incidents-title" className="flex items-center gap-2 text-xl font-semibold"><FileWarning className="h-5 w-5 text-amber-500"/> Docker incident investigations</h2>
  <p className="mt-2 text-sm leading-6 text-muted-foreground">Cases are created only for a real failed or delayed signed agent report. Reviewing a case never certifies Docker success, clears the original claim, or retries a command. This is a manual workflow, not automatic monitoring.</p>
  {error&&<p role="alert" className="mt-3 rounded-lg border border-red-500/30 p-3 text-sm text-red-500">{error}</p>}
  {message&&<p role="status" className="mt-3 rounded-lg border border-border p-3 text-sm">{message}</p>}
  {candidates.length>0&&<div className="mt-5 space-y-4">
   <h3 className="font-semibold">Claims eligible for investigation</h3>
   {candidates.map(r=><div key={r.id} className="rounded-xl border border-amber-500/25 p-4">
    <p className="text-sm font-semibold"><AlertTriangle className="mr-2 inline h-4 w-4 text-amber-500"/>{r.operation.toUpperCase()} · {r.container_id.slice(0,12)} · {r.reconciliation?.status.replaceAll("_"," ")}</p>
    {input(r.id)}
    <button disabled={busy||!canNote(r.id)} onClick={()=>act({action:"incident_open",claimId:r.dispatch_claim_id!,note:(notes[r.id]??"").trim()},r.id)}
      className="mt-2 min-h-11 rounded-lg border border-amber-500/40 px-4 text-sm font-semibold disabled:opacity-50">Open investigation case</button>
   </div>)}
  </div>}
  <div className="mt-5 space-y-4">
   <h3 className="font-semibold">Recorded cases ({incidents.length})</h3>
   {incidents.length===0&&<p className="text-sm text-muted-foreground">No Docker investigation cases recorded.</p>}
   {incidents.map(c=><article key={c.id} className="rounded-xl border border-border p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div>
     <p className="font-semibold">Case {c.id.slice(0,8)} · {c.reason.replaceAll("_"," ")}</p>
     <p className="mt-1 text-xs text-muted-foreground">Claim {c.claim_id.slice(0,8)} · Created {new Date(c.created_at).toLocaleString()}</p>
    </div><span className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{c.status==="reviewed"?"Reviewed (not resolved)":c.status}</span></div>
    <div className="mt-3 space-y-2">{events.filter(e=>e.incident_id===c.id).map(e=><div key={e.id} className="rounded-lg bg-muted/30 p-3">
     <p className="text-xs font-semibold">{e.action} · {new Date(e.occurred_at).toLocaleString()}</p>
     <p className="mt-1 whitespace-pre-wrap break-words text-sm">{e.note}</p>
    </div>)}</div>
    {input(c.id)}
    <div className="mt-2 flex flex-wrap gap-2">
     {c.status!=="investigating"&&<button disabled={busy||!canNote(c.id)} onClick={()=>act({action:"incident_triage",incidentId:c.id,status:"investigating",note:(notes[c.id]??"").trim()},c.id)}
       className="min-h-11 rounded-lg border border-border px-4 text-sm disabled:opacity-50">Investigating</button>}
     {c.status!=="reviewed"&&<button disabled={busy||!canNote(c.id)} onClick={()=>act({action:"incident_triage",incidentId:c.id,status:"reviewed",note:(notes[c.id]??"").trim()},c.id)}
       className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm disabled:opacity-50"><ClipboardCheck className="h-4 w-4"/> Mark reviewed</button>}
    </div>
   </article>)}
  </div>
  <p className="mt-4 text-xs text-muted-foreground">Only your own cases are shown. Notes are stored on the server and may contain sensitive operational details; never paste keys, credentials, or unrestricted logs. Review status is administrative only.</p>
 </section>;
}
