// Owner-scoped, read-only classification of server-stored signed Docker lab
// claims. Receipt statuses are agent assertions, NOT independent Docker proof.
const terminal = new Set(["reported_completed","reported_failed","reported_guard_denied"]);
export function reconcileDockerClaim(claim, now=Date.now()) {
  if(!claim) return {status:"not_dispatched",attentionRequired:false,receiptPresent:false,ageSeconds:null};
  const age=now-Date.parse(claim.claimed_at);
  if(!Number.isFinite(age)||age< -60_000) return {status:"invalid_timestamp",attentionRequired:true,receiptPresent:false,ageSeconds:null};
  const ageSeconds=Math.max(0,Math.floor(age/1000));
  if(terminal.has(claim.state)) {
    const reported=typeof claim.reported_at==="string"&&Number.isFinite(Date.parse(claim.reported_at));
    if(!reported)return {status:"invalid_receipt",attentionRequired:true,receiptPresent:false,ageSeconds};
    return {status:"agent_"+claim.state,attentionRequired:claim.state!=="reported_completed",receiptPresent:true,ageSeconds};
  }
  if(claim.state!=="claimed")return {status:"unknown_claim_state",attentionRequired:true,receiptPresent:false,ageSeconds};
  if(age>5*60_000)return {status:"reconciliation_required",attentionRequired:true,receiptPresent:false,ageSeconds};
  if(age>45_000)return {status:"receipt_pending",attentionRequired:true,receiptPresent:false,ageSeconds};
  return {status:claim.authorized_at?"permit_issued_no_receipt":"claim_pending_permit",
    attentionRequired:false,receiptPresent:false,ageSeconds};
}
export function dockerDispatchOverview(items) {
  if(!Array.isArray(items)||items.length>30)throw new Error("Invalid owner-scoped recent dispatch list.");
  const summary={window:"most_recent_30_claims",total:items.length,receiptPending:0,
    requiresReconciliation:0,agentReportedComplete:0,agentReportedIssue:0,notDispatched:0};
  for(const item of items) {
    const state=item?.reconciliation?.status;
    if(state==="not_dispatched"){summary.notDispatched++;continue;}
    if(state==="receipt_pending"||state==="claim_pending_permit"||state==="permit_issued_no_receipt")summary.receiptPending++;
    if(state==="reconciliation_required"||state==="invalid_timestamp"||state==="invalid_receipt"||state==="unknown_claim_state")summary.requiresReconciliation++;
    if(state==="agent_reported_completed")summary.agentReportedComplete++;
    if(state==="agent_reported_failed"||state==="agent_reported_guard_denied")summary.agentReportedIssue++;
  }
  return summary;
}
