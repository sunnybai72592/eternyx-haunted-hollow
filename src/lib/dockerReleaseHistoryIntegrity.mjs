// Portable WebCrypto verification of *server-reported* Docker release event hashes.
// Detects broken chains in a complete exported window, but cannot attest
// privileged database integrity or signer/reviewer identity.
const HEX64=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const encodeHex=value=>Array.from(new TextEncoder().encode(value),
 b=>b.toString(16).padStart(2,"0")).join("");
export function dockerReleaseEventMessage(e,previous){
 if(!e||!Number.isSafeInteger(e.id)||e.id<1||
  !UUID.test(e.review_id||"")||!UUID.test(e.owner_id||"")||
  !UUID.test(e.actor_id||"")||typeof e.event_kind!=="string"||
  !["submitted","in_review","reviewed","blocked","reviewer_invited",
    "reviewer_accepted","reviewer_declined"].includes(e.event_kind)||
  typeof e.note!=="string"||e.note.trim().length<12||
  e.note.length>500||/[\u0000-\u001f\u007f]/.test(e.note)||
  !HEX64.test(previous||""))
  throw Error("Invalid Docker release history event.");
 const t=Date.parse(e.occurred_at);
 if(!Number.isFinite(t))throw Error("Invalid event timestamp.");
 return "ETERNYX_DOCKER_RELEASE_EVENT_V1|"+[
   String(e.id),e.review_id,e.owner_id,e.actor_id,e.event_kind,
   new Date(t).toISOString(),encodeHex(e.note),previous
 ].join("|");
}
export async function verifyDockerReleaseHistory(events,reviewId,ownerId,crypt=globalThis.crypto){
 const base={scope:"server_reported_owner_history_only",authenticatedAudit:false,
  independentDatabaseAttestation:false};
 if(!UUID.test(reviewId||"")||!UUID.test(ownerId||"")||
  !Array.isArray(events)||events.length>200||!crypt?.subtle)
  return {...base,status:"unverified",reason:"invalid_history_inputs",verifiedCount:0};
 const series=events.filter(e=>e?.review_id===reviewId).sort((a,b)=>a.id-b.id);
 if(series.length===0)return {...base,status:"incomplete",reason:"no_events",verifiedCount:0};
 if(series[0]?.event_kind!=="submitted"||
    series[0]?.previous_sha256!=="0".repeat(64))
  return {...base,status:"incomplete",reason:"genesis_not_in_window",verifiedCount:0};
 let previous="0".repeat(64),lastId=0;
 for(const e of series){
  if(!Number.isSafeInteger(e.id)||e.id<=lastId||e.owner_id!==ownerId||
     e.previous_sha256!==previous||!HEX64.test(e.entry_sha256||""))
   return {...base,status:"broken",reason:"event_chain_mismatch",verifiedCount:series.indexOf(e)};
  let message;
  try{message=dockerReleaseEventMessage(e,previous);}
  catch{return {...base,status:"broken",reason:"malformed_event",verifiedCount:series.indexOf(e)};}
  const digest=await crypt.subtle.digest("SHA-256",new TextEncoder().encode(message));
  const expected=Array.from(new Uint8Array(digest),
    x=>x.toString(16).padStart(2,"0")).join("");
  if(expected!==e.entry_sha256)
    return {...base,status:"broken",reason:"sha256_mismatch",verifiedCount:series.indexOf(e)};
  previous=expected;lastId=e.id;
 }
 return {...base,status:"hash_chain_consistent",reason:"fully_visible_window",
  verifiedCount:series.length,tailHash:previous};
}
