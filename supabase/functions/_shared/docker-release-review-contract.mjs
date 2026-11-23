// Browser-to-Edge release REVIEW metadata only. Never upload original evidence,
// private keys, JWTs, Docker commands or arbitrary deployment authorization.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX40=/^[a-f0-9]{40}$/;
const HEX64=/^[a-f0-9]{64}$/;
const REF=/^[a-z0-9]{20}$/;
const exact=(v,keys)=>!!v&&typeof v==="object"&&!Array.isArray(v)&&
 Object.keys(v).sort().join(",")===keys.slice().sort().join(",");
const validNote=note=>typeof note==="string"&&note.trim().length>=12&&
 note.trim().length<=500&&!/[\u0000-\u001f\u007f]/.test(note);
export function parseDockerReleaseReviewAction(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 if(raw.action==="release_submit"){
  if(!exact(raw,["action","requestKey","commitSha","candidateSha256",
    "sourceSnapshotSha256","manifestSha256","stagingRef","note"])||
    !UUID.test(raw.requestKey||"")||!HEX40.test(raw.commitSha||"")||
    !HEX64.test(raw.candidateSha256||"")||
    !HEX64.test(raw.sourceSnapshotSha256||"")||
    !HEX64.test(raw.manifestSha256||"")||
    !REF.test(raw.stagingRef||"")||!validNote(raw.note))return null;
  return raw;
 }
 if(raw.action==="release_decide"){
  if(!exact(raw,["action","reviewId","state","note"])||
    !UUID.test(raw.reviewId||"")||
    !["in_review","reviewed","blocked"].includes(raw.state)||
    !validNote(raw.note))return null;
  return raw;
 }
 return null;
}
