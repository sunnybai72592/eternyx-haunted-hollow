import {useEffect,useState} from "react";
import DockerReleaseReviewerPanel,{type DockerReleaseReviewerAssignment} from "./DockerReleaseReviewerPanel";
import {verifyDockerReleaseHistory} from "@/lib/dockerReleaseHistoryIntegrity.mjs";
import {verifyDockerReleaseAuditExport} from "@/lib/dockerReleaseAuditExport.mjs";
import {FileCheck2,RefreshCw} from "lucide-react";

export type DockerReleaseReview={
 id:string;request_key:string;commit_sha:string;candidate_sha256:string;
 source_snapshot_sha256:string;manifest_sha256:string;staging_ref:string;
 state:"submitted"|"in_review"|"reviewed"|"blocked";
 created_at:string;updated_at:string;reviewed_at:string|null;
};
export type DockerReleaseReviewEvent={
 id:number;review_id:string;owner_id:string;actor_id:string;event_kind:string;note:string;occurred_at:string;previous_sha256:string;entry_sha256:string;
};
type Props={
 reviews:DockerReleaseReview[];events:DockerReleaseReviewEvent[];
 assignments:DockerReleaseReviewerAssignment[];currentUserId:string|null;
 loaded:boolean;onAction:(action:string,fields:Record<string,unknown>)=>Promise<Record<string,unknown>>;
 refresh:()=>Promise<void>;
};
const HEX40=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/,REF=/^[a-z0-9]{20}$/;
const noteOK=(s:string)=>s.trim().length>=12&&s.trim().length<=500&&!/[\u0000-\u001f\u007f]/.test(s);
const blank=()=>({commitSha:"",candidateSha256:"",sourceSnapshotSha256:"",
 manifestSha256:"",stagingRef:"",note:""});
export default function DockerReleaseReviewWorkspace({reviews,events,assignments,currentUserId,loaded,onAction,refresh}:Props){
 const [draft,setDraft]=useState(blank);
 const [key,setKey]=useState(()=>crypto.randomUUID());
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [confirm,setConfirm]=useState<Record<string,string>>({});
 const [working,setWorking]=useState(false);
 const [exportingId,setExportingId]=useState<string|null>(null);
 const [integrity,setIntegrity]=useState<Record<string,string>>({});
 useEffect(()=>{
  let active=true;
  void (async()=>{
   const next:Record<string,string>={};
   for(const review of reviews){
    const report=await verifyDockerReleaseHistory(events,review.id,currentUserId??"");
    next[review.id]=report.status;
   }
   if(active)setIntegrity(next);
  })();
  return ()=>{active=false;};
 },[reviews,events,currentUserId]);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const valid=HEX40.test(draft.commitSha)&&HEX64.test(draft.candidateSha256)&&
  HEX64.test(draft.sourceSnapshotSha256)&&HEX64.test(draft.manifestSha256)&&
  REF.test(draft.stagingRef)&&noteOK(draft.note);
 async function run(fn:()=>Promise<void>){
  setWorking(true);setError("");setNotice("");
  try{await fn();}catch(e){setError(e instanceof Error?e.message:"Release review unavailable.");}
  finally{setWorking(false);}
 }
 function submit(){void run(async()=>{
  if(!valid)throw Error("Enter the exact SHA values, staging ref and a 12–500 character note.");
  const result=await onAction("release_submit",{...draft,requestKey:key});
  if(result.ok!==true)throw Error("Release metadata submission was rejected.");
  setKey(crypto.randomUUID());setDraft(blank());await refresh();
  setNotice("Owner release metadata saved. No signature was checked and no deployment was approved.");
 });}
 function exportAudit(r:DockerReleaseReview){void run(async()=>{
  if(!currentUserId||exportingId)throw Error("Sign in to export your release history.");
  setExportingId(r.id);
  try{
   const report=await onAction("release_export_audit",{reviewId:r.id});
   if(report.ok!==true)throw Error("Owner release history export unavailable.");
   const checked=await verifyDockerReleaseAuditExport(report,{
    ownerId:currentUserId,reviewId:r.id,candidateSha256:r.candidate_sha256,
    commitSha:r.commit_sha
   });
   if(checked.status!=="unanchored_server_report_only")
    throw Error("Release history export is incomplete or failed local SHA-256 consistency checks.");
   const payload=JSON.stringify(report,null,2)+"\n";
   const file=new Blob([payload],{type:"application/json"});
   if(file.size>65536)throw Error("Export is too large to verify safely.");
   const url=URL.createObjectURL(file);
   try{
    const link=document.createElement("a");
    link.href=url;link.download="eternyx-docker-release-audit-"+r.id.slice(0,8)+".json";
    document.body.appendChild(link);link.click();link.remove();
   }finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
   setNotice("Complete server-reported audit downloaded and locally SHA-256 checked. It is UNANCHORED: verify with independently pinned candidate and tail hashes before trusting it.");
  }finally{setExportingId(null);}
 });}
 function decide(r:DockerReleaseReview,state:"in_review"|"reviewed"|"blocked"){void run(async()=>{
  const note=notes[r.id]??"";
  if(!noteOK(note))throw Error("A meaningful 12–500 character review note is required.");
  if(state==="reviewed"&&confirm[r.id]!=="REVIEW "+r.id.slice(0,8))
   throw Error("Enter the exact owner-review confirmation.");
  const result=await onAction("release_decide",{reviewId:r.id,state,note});
  if(result.ok!==true)throw Error("Release decision was rejected.");
  setNotes(s=>({...s,[r.id]:""}));setConfirm(s=>({...s,[r.id]:""}));
  await refresh();
  setNotice("Owner review decision recorded. This does NOT authorize production or Docker execution.");
 });}
 return <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label="Docker release review workspace">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h2 className="flex items-center gap-2 text-xl font-semibold"><FileCheck2 className="h-5 w-5 text-cyan-500"/> Release evidence review</h2>
   <button type="button" disabled={working||!loaded} onClick={()=>void run(async()=>{await refresh();setNotice("Owner release history refreshed.");})}
    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm disabled:opacity-50">
    <RefreshCw className="h-4 w-4"/> Refresh
   </button>
  </div>
  <p className="text-sm leading-6 text-muted-foreground">Record only metadata from an independently verified offline release handoff. This form does not verify signatures, upload evidence, collect keys, or authorize Docker. “Reviewed” records your own account review, not independent security approval.</p>
  {error&&<p role="alert" className="rounded-xl border border-red-500/40 p-3 text-sm text-red-400">{error}</p>}
  {notice&&<p role="status" className="rounded-xl border border-cyan-500/30 p-3 text-sm">{notice}</p>}
  <div className="grid gap-3 sm:grid-cols-2">
   {([
    ["commitSha","Full Git commit SHA",40],
    ["candidateSha256","Offline release candidate SHA-256",64],
    ["sourceSnapshotSha256","Pinned source snapshot SHA-256",64],
    ["manifestSha256","Pinned release manifest SHA-256",64],
    ["stagingRef","Staging Supabase project ref",20]
   ] as const).map(([field,label,length])=>
    <label key={field} className="block text-xs font-medium">{label}
     <input aria-label={label} autoComplete="off" spellCheck={false} maxLength={length}
      value={draft[field]} onChange={e=>setDraft(s=>({...s,[field]:e.target.value.trim()}))}
      placeholder={String(length)+" lowercase characters"}
      className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs"/>
    </label>)}
  </div>
  <label className="block text-xs">Submission note (no credentials, raw evidence, or private keys)
   <textarea aria-label="Release submission note" rows={2} maxLength={500} value={draft.note}
    onChange={e=>setDraft(s=>({...s,note:e.target.value}))}
    className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-sm"/>
  </label>
  <button type="button" disabled={!loaded||working||!valid} onClick={submit}
   className="min-h-11 rounded-lg bg-cyan-500 px-4 font-semibold text-slate-950 disabled:opacity-50">
   Save owner release metadata (no deployment)
  </button>
  <DockerReleaseReviewerPanel reviews={reviews} assignments={assignments} currentUserId={currentUserId}
   busy={working} onAction={onAction} refresh={refresh}/>
  <h3 className="text-lg font-semibold">Owned release reviews and server-recorded history</h3>
  {loaded&&reviews.length===0&&<p className="text-sm text-muted-foreground">No release records. Nothing is approved for deployment.</p>}
  {reviews.map(r=>{
   const history=events.filter(e=>e.review_id===r.id);
   const note=notes[r.id]??"";
   const phrase="REVIEW "+r.id.slice(0,8);
   const accepted=assignments.some(a=>a.review_id===r.id&&a.owner_id===currentUserId&&
     a.reviewer_id!==currentUserId&&a.state==="accepted"&&a.candidate_sha256===r.candidate_sha256);
   return <article key={r.id} className="space-y-3 rounded-xl border border-border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <p className="text-sm font-semibold">Git {r.commit_sha.slice(0,12)} · Staging {r.staging_ref}</p>
     <span className="rounded-full border border-border px-3 py-1 text-xs">{r.state.replaceAll("_"," ")}</span>
    </div>
    <p className="text-xs text-muted-foreground">Recorded {new Date(r.created_at).toLocaleString()} · Case {r.id.slice(0,8)}</p>
    <button type="button" disabled={working||!!exportingId||!loaded||!currentUserId}
     onClick={()=>exportAudit(r)}
     className="min-h-11 rounded-lg border border-cyan-500/40 px-4 text-xs disabled:opacity-50">
     {exportingId===r.id?"Verifying full audit…":"Export complete audit (unanchored JSON)"}
    </button>
    <div className="space-y-1 break-all font-mono text-xs text-muted-foreground">
     <p>Candidate: {r.candidate_sha256}</p>
     <p>Source: {r.source_snapshot_sha256}</p>
     <p>Manifest: {r.manifest_sha256}</p>
    </div>
    {r.state!=="reviewed"&&r.state!=="blocked"&&<>
     <label className="block text-xs">Decision note
      <textarea aria-label={"Release review note "+r.id.slice(0,8)} rows={2} maxLength={500}
       value={note} onChange={e=>setNotes(s=>({...s,[r.id]:e.target.value}))}
       className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-sm"/>
     </label>
     {r.state==="in_review"&&<p className="text-xs text-muted-foreground">
      Distinct authenticated reviewer: {accepted?"accepted matching candidate":"required before owner completion"}
     </p>}
     {r.state==="in_review"&&<label className="block text-xs">
      To finish your account review, type <strong>{phrase}</strong>
      <input aria-label={"Release review confirmation "+r.id.slice(0,8)} autoComplete="off"
       value={confirm[r.id]??""} onChange={e=>setConfirm(s=>({...s,[r.id]:e.target.value}))}
       className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs"/>
     </label>}
     <div className="flex flex-wrap gap-2">
      {r.state==="submitted"&&<button type="button" disabled={working||!noteOK(note)}
       onClick={()=>decide(r,"in_review")} className="min-h-11 rounded-lg border border-border px-4 text-sm disabled:opacity-50">Begin review</button>}
      {r.state==="in_review"&&<button type="button" disabled={working||!accepted||!noteOK(note)||confirm[r.id]!==phrase}
       onClick={()=>decide(r,"reviewed")} className="min-h-11 rounded-lg border border-cyan-500/50 px-4 text-sm disabled:opacity-50">Mark owner review complete (not approval)</button>}
      <button type="button" disabled={working||!noteOK(note)} onClick={()=>decide(r,"blocked")}
       className="min-h-11 rounded-lg border border-amber-500/50 px-4 text-sm disabled:opacity-50">Block release review</button>
     </div>
    </>}
    <div className="border-t border-border pt-3">
     <p className="text-xs font-semibold">Recent owner audit history</p>
     <p role="status" className="mt-2 text-xs text-muted-foreground">
      Server-reported SHA-256 history: {integrity[r.id]==="hash_chain_consistent"?
      "consistent across visible events (not independent database attestation)":
      integrity[r.id]==="broken"?"BROKEN — verify externally and do not rely on this review":
      "incomplete or unverified — missing history cannot count as a passing audit"}
     </p>
     <ol className="mt-2 space-y-2">
      {history.map(e=><li key={e.id} className="rounded-lg bg-muted/30 p-3 text-xs">
       {e.event_kind.replaceAll("_"," ")} · {new Date(e.occurred_at).toLocaleString()} · Actor {e.actor_id.slice(0,8)}
       <p className="mt-1 break-words text-muted-foreground">{e.note}</p>
      </li>)}
     </ol>
     {!history.length&&<p className="mt-2 text-xs text-muted-foreground">No events in the most recent 100-event window.</p>}
    </div>
    <p className="text-xs text-amber-500">Server owner record only · Independent release approval: not verified · Docker execution: disabled</p>
   </article>;
  })}
 </section>;
}
