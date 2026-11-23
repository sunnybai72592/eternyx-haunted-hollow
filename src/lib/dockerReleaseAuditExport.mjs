// Verify a complete *supplied* release review export with WebCrypto.
// Independent integrity requires a separately trusted tail-hash pin, which
// MUST NOT be sourced from this same report. Does not authenticate DB servers.
import {verifyDockerReleaseHistory} from "./dockerReleaseHistoryIntegrity.mjs";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX64=/^[a-f0-9]{64}$/;
const HEX40=/^[a-f0-9]{40}$/;
const exact=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).sort().join(",")===keys.slice().sort().join(",");
function checkRecord(r,opts){
 if(!r||typeof r!=="object"||Array.isArray(r)||
  !UUID.test(r.id||"")||!UUID.test(r.owner_id||"")||
  !HEX40.test(r.commit_sha||"")||!HEX64.test(r.candidate_sha256||"")||
  !HEX64.test(r.source_snapshot_sha256||"")||!HEX64.test(r.manifest_sha256||"")||
  !["submitted","in_review","reviewed","blocked"].includes(r.state)||
  r.id!==opts.reviewId||r.owner_id!==opts.ownerId||
  r.candidate_sha256!==opts.candidateSha256||
  (opts.commitSha!==undefined&&r.commit_sha!==opts.commitSha))return false;
 return true;
}
export async function verifyDockerReleaseAuditExport(bundle,opts,crypt=globalThis.crypto){
 const base={
  schema:"eternyx-docker-audit-local-verification-v1",
  reportAuthenticationIndependentlyEstablished:false,
  signedByDatabase:false,productionDeploymentAuthorized:false,
  dockerExecutionAuthorized:false,independentSecurityApprovalRequired:true
 };
 const fail=(reason)=>({...base,status:"rejected",reason,complete:false,tailPinMatched:false});
 if(!opts||!UUID.test(opts.reviewId||"")||!UUID.test(opts.ownerId||"")||
  !HEX64.test(opts.candidateSha256||"")||
  (opts.commitSha!==undefined&&!HEX40.test(opts.commitSha))||
  (opts.expectedTailSha256!==undefined&&!HEX64.test(opts.expectedTailSha256)))
  return fail("invalid_independent_pins");
 if(!exact(bundle,["ok","schema","review","assignment","events",
  "eventCount","fullDatabaseWindow","serverChainAuthenticated",
  "independentTailAnchorVerified","productionDeploymentAuthorized",
  "dockerExecutionAuthorized","independentSecurityApprovalRequired"])||
  bundle.ok!==true||bundle.schema!=="eternyx-docker-release-audit-export-v1"||
  bundle.fullDatabaseWindow!==true||bundle.serverChainAuthenticated!==false||
  bundle.independentTailAnchorVerified!==false||
  bundle.productionDeploymentAuthorized!==false||
  bundle.dockerExecutionAuthorized!==false||
  bundle.independentSecurityApprovalRequired!==true||
  !Number.isInteger(bundle.eventCount)||bundle.eventCount<1||
  bundle.eventCount>32||!Array.isArray(bundle.events)||
  bundle.events.length!==bundle.eventCount)
  return fail("invalid_or_partial_export");
 const review=bundle.review;
 if(!checkRecord(review,opts))return fail("review_not_pinned");
 const events=bundle.events;
 if(events.some(e=>e?.review_id!==review.id||e?.owner_id!==review.owner_id))
  return fail("cross_owner_or_cross_review_events");
 const assign=bundle.assignment;
 if(assign!==null&&(typeof assign!=="object"||Array.isArray(assign)||
   assign.review_id!==review.id||assign.owner_id!==review.owner_id||
   !UUID.test(assign.reviewer_id||"")||assign.reviewer_id===review.owner_id||
   assign.candidate_sha256!==review.candidate_sha256||
   assign.commit_sha!==review.commit_sha||
   !["invited","accepted","declined"].includes(assign.state)))
  return fail("invalid_reviewer_binding");
 const submitted=events.filter(e=>e.event_kind==="submitted");
 if(submitted.length!==1||events.length===0||
    events[0].event_kind!=="submitted")
  return fail("invalid_genesis");
 if(review.state==="reviewed"){
  if(!assign||assign.state!=="accepted"||
   !events.some(e=>e.event_kind==="reviewer_accepted"&&
      e.actor_id===assign.reviewer_id)||
   events.at(-1)?.event_kind!=="reviewed")
   return fail("missing_independent_review_acceptance");
 }
 if(review.state==="blocked"&&events.at(-1)?.event_kind!=="blocked")
  return fail("terminal_state_mismatch");
 if(review.state==="submitted"&&
   (events.length!==1||assign!==null))
  return fail("unreviewed_release_has_review_events");
 if(review.state==="in_review"&&
   !events.some(e=>e.event_kind==="in_review"))
  return fail("missing_review_start");
 const result=await verifyDockerReleaseHistory(events,review.id,review.owner_id,crypt);
 if(result.status!=="hash_chain_consistent"||
    result.verifiedCount!==bundle.eventCount)
  return fail("history_incomplete_or_broken");
 const tail=result.tailHash;
 if(opts.expectedTailSha256!==undefined&&opts.expectedTailSha256!==tail)
  return fail("trusted_tail_pin_mismatch");
 return {...base,status:opts.expectedTailSha256?
   "pinned_tail_consistent_server_report":"unanchored_server_report_only",
  reason:opts.expectedTailSha256?
   "matching_locally_supplied_tail_anchor":"no_independent_tail_pin",
  complete:true,tailPinMatched:opts.expectedTailSha256!==undefined,
  reviewId:review.id,candidateSha256:review.candidate_sha256,
  commitSha:review.commit_sha,verifiedEvents:result.verifiedCount,
  tailSha256:tail};
}
