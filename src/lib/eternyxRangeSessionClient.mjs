/**
 * Browser control-plane contract for real, authenticated LABS sessions.
 * Pure validation only. Session state is untrusted unless returned by
 * ctf-range-control; it never proves hosted workloads are running.
 */
export const RANGE_SESSION_PACK = "http-basics-v1";
export const RANGE_SESSION_LIMIT = 12;
export const RANGE_SESSION_STATES = Object.freeze(["queued","provisioning","running","stopping","stopped","expired","failed"]);
export const RANGE_ACTIVE_STATES = Object.freeze(["queued","provisioning","running","stopping"]);
const SESSION_KEYS = Object.freeze(["id","challenge_pack","status","requested_at","updated_at","expires_at","started_at","finished_at"]);
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isObject=value=>!!value && typeof value==="object" && !Array.isArray(value);
const isId=value=>typeof value==="string"&&idPattern.test(value);
const isoTime=value=>typeof value==="string"&&value.length<=35&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
const validOptionalTime=value=>value===null||isoTime(value);
function fail(){throw Error("Invalid authenticated range controller response.");}

export function parseRangeProviderStatus(raw){
  if(!isObject(raw)||typeof raw.providerOnline!=="boolean"||
    typeof raw.hostedAccessAvailable!=="boolean"||
    typeof raw.dailyLaunchBudgetConfigured!=="boolean"||
    !Number.isInteger(raw.maxConcurrentSessions)||raw.maxConcurrentSessions<0||raw.maxConcurrentSessions>3||
    raw.sessionDurationMinutes!==15||
    typeof raw.message!=="string"||raw.message.length>240||
    (raw.hostedAccessAvailable&&!raw.providerOnline)||
    (raw.providerOnline&&!raw.dailyLaunchBudgetConfigured)) fail();
  return Object.freeze({
    providerOnline:raw.providerOnline,
    hostedAccessAvailable:raw.hostedAccessAvailable,
    maxConcurrentSessions:raw.maxConcurrentSessions,
    sessionDurationMinutes:raw.sessionDurationMinutes,
    message:raw.message,
  });
}
export function parseRangeSessionsResponse(raw){
  if(!isObject(raw)||raw.source!=="authenticated_server"||
    raw.hostedAccessAvailable!==false||!Array.isArray(raw.sessions)||
    raw.sessions.length>RANGE_SESSION_LIMIT)fail();
  const seen=new Set();
  const sessions=raw.sessions.map(record=>{
    if(!isObject(record)||
      !isId(record.id)||seen.has(record.id)||
      record.challenge_pack!==RANGE_SESSION_PACK||
      !RANGE_SESSION_STATES.includes(record.status)||
      !isoTime(record.requested_at)||!isoTime(record.updated_at)||!isoTime(record.expires_at)||
      !validOptionalTime(record.started_at)||!validOptionalTime(record.finished_at)||
      (record.started_at!==null&&Date.parse(record.started_at)<Date.parse(record.requested_at)))fail();
    seen.add(record.id);
    // Explicit allowlist: never render user_id, token, ingress URL, provider refs.
    return Object.freeze(Object.fromEntries(SESSION_KEYS.map(key=>[key,record[key]])));
  });
  return Object.freeze(sessions);
}
export function parseRangeReservationReply(raw){
  if(!isObject(raw)||raw.accepted!==true||!isId(raw.sessionId)||
    !["queued","provisioning","running"].includes(raw.status)||
    !isoTime(raw.expiresAt)||typeof raw.reused!=="boolean"||
    raw.hostedAccessAvailable!==false)fail();
  return Object.freeze({sessionId:raw.sessionId,status:raw.status});
}
export function parseRangeStopReply(raw,sessionId){
  if(!isObject(raw)||!isId(sessionId)||raw.sessionId!==sessionId||
    !["stopping","stopped"].includes(raw.status)||
    typeof raw.stopped!=="boolean"||
    raw.stopped!==(raw.status==="stopped"))fail();
  return Object.freeze({status:raw.status});
}
export function canRequestRangeSession(provider,sessions,ready){
  return ready===true && provider?.providerOnline===true &&
    provider.hostedAccessAvailable===true &&
    provider.maxConcurrentSessions>0 && Array.isArray(sessions) &&
    !sessions.some(s=>RANGE_ACTIVE_STATES.includes(s.status));
}
/**
 * Ordered, owner-bound async response gate. Invalidating on signout, tab
 * unmount, or account switch rejects all older responses, even after a
 * second account has authenticated.
 */
export function createRangeOwnerFence(){
  let owner=null,revision=0;
  return Object.freeze({
    start(id){
      if(!isId(id))throw Error("An authenticated account is required.");
      owner=id;
      return Object.freeze({owner:id,revision:++revision});
    },
    accepts(ticket,currentOwner){
      return isObject(ticket)&&ticket.owner===owner &&
        ticket.owner===currentOwner&&ticket.revision===revision;
    },
    invalidate(){owner=null;revision++;},
  });
}
