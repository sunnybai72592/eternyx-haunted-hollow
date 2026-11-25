/** Display-only session lifecycle. Server status, quotas and cleanup remain authoritative. */
import {RANGE_ACTIVE_STATES,RANGE_SESSION_STATES,canRequestRangeSession} from "./eternyxRangeSessionClient.mjs";

const terminal=new Set(["stopped","expired","failed"]);
function isSession(session){
  return session && RANGE_SESSION_STATES.includes(session.status) &&
    typeof session.expires_at==="string" && Number.isFinite(Date.parse(session.expires_at));
}
export function rangeLifecycle(session,now){
  if(!isSession(session)||!Number.isFinite(now))throw Error("Invalid range lifecycle input");
  const active=RANGE_ACTIVE_STATES.includes(session.status);
  const seconds=Math.max(0,Math.ceil((Date.parse(session.expires_at)-now)/1000));
  if(!active)return Object.freeze({remainingSeconds:0,awaitingCleanup:false,
    canOfferRestart:terminal.has(session.status),label:"Server reports session closed. New requests require fresh capacity authorization."});
  if(session.status==="stopping"||seconds===0)return Object.freeze({remainingSeconds:seconds,
    awaitingCleanup:true,canOfferRestart:false,label:session.status==="stopping"
      ?"Cleanup pending — capacity remains reserved."
      :"Reservation deadline reached — awaiting server expiry and cleanup confirmation."});
  const minutes=Math.floor(seconds/60);
  return Object.freeze({remainingSeconds:seconds,awaitingCleanup:false,canOfferRestart:false,
    label:"Reservation time remaining (device clock): "+minutes+":"+String(seconds%60).padStart(2,"0")});
}
export function mayRefreshRange({visible,owner,currentOwner,busy,mounted}={}){
  return visible===true&&mounted===true&&busy===false&&typeof owner==="string"&&owner.length>0&&owner===currentOwner;
}
export function restartEligibility(session,provider,sessions,ready){
  if(!isSession(session)||!terminal.has(session.status))
    return {allowed:false,reason:"Wait for server-confirmed session closure."};
  if(!Array.isArray(sessions)||!sessions.some(s=>s.id===session.id&&s.status===session.status))
    return {allowed:false,reason:"Refresh the authenticated session list."};
  if(sessions.some(s=>RANGE_ACTIVE_STATES.includes(s.status)))
    return {allowed:false,reason:"An active reservation or pending cleanup blocks another session."};
  if(!canRequestRangeSession(provider,sessions,ready))
    return {allowed:false,reason:"Hosted access or capacity authorization is unavailable."};
  return {allowed:true,reason:"Starts a new reservation subject to all server quotas; does not restore the old workload."};
}
