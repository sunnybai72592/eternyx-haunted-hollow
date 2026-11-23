import {useState} from "react";
import type {DockerReleaseReview} from "./DockerReleaseReviewWorkspace";

export type DockerReleaseReviewerAssignment={
 review_id:string;owner_id:string;reviewer_id:string;
 commit_sha:string;candidate_sha256:string;
 state:"invited"|"accepted"|"declined";
 invited_at:string;responded_at:string|null;reviewer_note:string|null;
};
type Props={
 reviews:DockerReleaseReview[];
 assignments:DockerReleaseReviewerAssignment[];
 currentUserId:string|null;
 busy:boolean;
 onAction:(action:string,fields:Record<string,unknown>)=>Promise<Record<string,unknown>>;
 refresh:()=>Promise<void>;
};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const noteOK=(note:string)=>note.trim().length>=12&&note.trim().length<=500&&
 !/[\u0000-\u001f\u007f]/.test(note);
export default function DockerReleaseReviewerPanel({
 reviews,assignments,currentUserId,busy,onAction,refresh
}:Props){
 const [reviewerIds,setReviewerIds]=useState<Record<string,string>>({});
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [confirm,setConfirm]=useState<Record<string,string>>({});
 const [working,setWorking]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const run=async(fn:()=>Promise<void>)=>{
  setWorking(true);setError("");setNotice("");
  try{await fn();}catch(e){setError(e instanceof Error?e.message:"Reviewer response unavailable.");}
  finally{setWorking(false);}
 };
 const invite=(review:DockerReleaseReview)=>void run(async()=>{
  const reviewerId=(reviewerIds[review.id]??"").trim();
  const note=notes[review.id]??"";
  if(!UUID.test(reviewerId)||reviewerId===currentUserId||!noteOK(note))
   throw Error("Choose a different authenticated reviewer UUID and a meaningful 12–500 character note.");
  const result=await onAction("release_invite_reviewer",{reviewId:review.id,reviewerId,note});
  if(result.ok!==true)throw Error("The release reviewer invitation was not recorded.");
  await refresh();
  setNotes(s=>({...s,[review.id]:""}));
  setNotice("Invitation saved. No approval or deployment was granted.");
 });
 const respond=(assignment:DockerReleaseReviewerAssignment,decision:"accept"|"decline")=>
 void run(async()=>{
  const note=notes[assignment.review_id]??"";
  if(!noteOK(note))throw Error("Enter an account-specific reviewer note of 12–500 characters.");
  if(decision==="accept"&&confirm[assignment.review_id]!==assignment.candidate_sha256)
   throw Error("Enter the exact full candidate SHA-256 before accepting an independent review.");
  const result=await onAction("release_reviewer_respond",{
   reviewId:assignment.review_id,candidateSha256:assignment.candidate_sha256,
   decision,note
  });
  if(result.ok!==true)throw Error("Reviewer response was not recorded.");
  setNotes(s=>({...s,[assignment.review_id]:""}));
  setConfirm(s=>({...s,[assignment.review_id]:""}));
  await refresh();
  setNotice("Reviewer decision saved. This authenticates the account response only, not deployed code or Docker safety.");
 });
 const incoming=assignments.filter(x=>x.reviewer_id===currentUserId&&x.owner_id!==currentUserId);
 return <div className="space-y-5 rounded-2xl border border-border bg-muted/20 p-4" aria-label="Independent Docker release reviewer workflow">
  <div>
   <h3 className="text-lg font-semibold">Independent account reviewer</h3>
   <p className="mt-2 text-xs leading-6 text-muted-foreground">
    A different signed-in account must explicitly accept the exact candidate SHA-256
    before the owner can mark this release reviewed. An account acceptance is not
    cryptographic validation of the offline evidence and does not authorize deployment.
   </p>
  </div>
  {error&&<p role="alert" className="rounded-lg border border-red-500/30 p-3 text-xs text-red-400">{error}</p>}
  {notice&&<p role="status" className="rounded-lg border border-cyan-500/30 p-3 text-xs">{notice}</p>}
  {reviews.filter(r=>r.state==="in_review").map(review=>{
   const assigned=assignments.find(a=>a.review_id===review.id);
   const id=review.id;
   return <div key={id} className="space-y-2 rounded-xl border border-border bg-card p-4">
    <p className="text-sm font-medium">Release {review.commit_sha.slice(0,12)}</p>
    <p className="break-all font-mono text-xs text-muted-foreground">Candidate: {review.candidate_sha256}</p>
    {assigned?<p role="status" className="text-xs">
      Reviewer {assigned.reviewer_id.slice(0,8)} · {assigned.state}. Invitations cannot be reassigned under the same review record.
     </p>:<>
     <label className="block text-xs">Different authenticated reviewer user UUID
      <input aria-label={"Reviewer UUID "+id.slice(0,8)} value={reviewerIds[id]??""}
       onChange={e=>setReviewerIds(s=>({...s,[id]:e.target.value.trim()}))}
       autoComplete="off" spellCheck={false} maxLength={36}
       className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs"/>
     </label>
     <label className="block text-xs">Invitation reason (no credentials, customer data or keys)
      <textarea aria-label={"Reviewer invitation note "+id.slice(0,8)}
       value={notes[id]??""} rows={2} maxLength={500}
       onChange={e=>setNotes(s=>({...s,[id]:e.target.value}))}
       className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-xs"/>
     </label>
     <button type="button" disabled={working||busy||!UUID.test(reviewerIds[id]??"")||
      reviewerIds[id]===currentUserId||!noteOK(notes[id]??"")}
      onClick={()=>invite(review)}
      className="min-h-11 rounded-lg border border-cyan-500/40 px-4 text-xs disabled:opacity-50">
      Invite independent reviewer (not approval)
     </button>
    </>}
   </div>;
  })}
  <div className="space-y-3">
   <h4 className="text-sm font-semibold">Your incoming review invitations</h4>
   {incoming.length===0&&<p className="text-xs text-muted-foreground">No incoming release invitations for this account.</p>}
   {incoming.map(a=><article key={a.review_id} className="space-y-2 rounded-xl border border-border bg-card p-4">
    <p className="text-sm font-semibold">From owner {a.owner_id.slice(0,8)} · {a.state}</p>
    <p className="break-all text-xs text-muted-foreground">Release commit {a.commit_sha}</p>
    <p className="break-all font-mono text-xs">Candidate: {a.candidate_sha256}</p>
    {a.state==="invited"&&<>
     <p className="text-xs text-muted-foreground">Independently inspect the original signed evidence before accepting. This page cannot prove the signature or the actual staging deployment.</p>
     <label className="block text-xs">Your reviewer note
      <textarea aria-label={"Reviewer response note "+a.review_id.slice(0,8)}
       value={notes[a.review_id]??""} rows={2} maxLength={500}
       onChange={e=>setNotes(s=>({...s,[a.review_id]:e.target.value}))}
       className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-xs"/>
     </label>
     <label className="block text-xs">For acceptance, type the full candidate SHA-256 above
      <input aria-label={"Confirm candidate SHA-256 "+a.review_id.slice(0,8)}
       value={confirm[a.review_id]??""} maxLength={64} autoComplete="off" spellCheck={false}
       onChange={e=>setConfirm(s=>({...s,[a.review_id]:e.target.value.trim()}))}
       className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs"/>
     </label>
     <div className="flex flex-wrap gap-2">
      <button type="button" disabled={working||busy||!noteOK(notes[a.review_id]??"")||
       confirm[a.review_id]!==a.candidate_sha256}
       onClick={()=>respond(a,"accept")}
       className="min-h-11 rounded-lg border border-cyan-500/50 px-4 text-xs disabled:opacity-50">
       Accept candidate review (not deployment)
      </button>
      <button type="button" disabled={working||busy||!noteOK(notes[a.review_id]??"")}
       onClick={()=>respond(a,"decline")}
       className="min-h-11 rounded-lg border border-amber-500/50 px-4 text-xs disabled:opacity-50">
       Decline
      </button>
     </div>
    </>}
    {a.state!=="invited"&&<p className="text-xs text-muted-foreground">Reviewer response is terminal. No production or Docker permission was granted.</p>}
   </article>)}
  </div>
 </div>;
}
