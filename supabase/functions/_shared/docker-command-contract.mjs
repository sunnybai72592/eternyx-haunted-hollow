// V1 signed Docker lab dispatch protocol. Only fixed start/stop/restart on
// pre-hardened local-workbench containers; no arbitrary Docker or shell commands.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FULL_ID=/^[a-f0-9]{64}$/;
const B32=/^[A-Za-z0-9_-]{43}$/;
const B64=/^[A-Za-z0-9_-]{86}$/;
const ACTIONS=new Set(["start","stop","restart"]);
const OUTCOMES=new Set(["completed","failed","guard_denied"]);
export function parseAgentAction(raw) {
  if(!raw || typeof raw!=="object" || Array.isArray(raw) ||
    !Object.keys(raw).every(k=>["kind","agentId","signedAt","nonce","claimId","outcome","signature"].includes(k))
    || Object.keys(raw).length!==7) return null;
  if(!["claim","authorize","receipt"].includes(raw.kind) ||
    !UUID.test(raw.agentId||"") || !B32.test(raw.nonce||"") ||
    !B64.test(raw.signature||"") ||
    typeof raw.signedAt!=="string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw.signedAt) ||
    !Number.isFinite(Date.parse(raw.signedAt)) ||
    new Date(raw.signedAt).toISOString()!==raw.signedAt) return null;
  if(raw.kind==="claim" && (raw.claimId!==null || raw.outcome!==null))return null;
  if(raw.kind==="authorize" && (!UUID.test(raw.claimId||"") || raw.outcome!==null))return null;
  if(raw.kind==="receipt" && (!UUID.test(raw.claimId||"") || !OUTCOMES.has(raw.outcome)))return null;
  return {...raw,agentId:raw.agentId.toLowerCase()};
}
export function agentActionMessage(raw) {
  const d=parseAgentAction(raw);
  if(!d)throw new Error("Invalid signed agent action.");
  return ["ETERNYX_DOCKER_AGENT_ACTION_V1",d.kind,d.agentId,d.signedAt,
    d.nonce,d.claimId||"none",d.outcome||"none"].join("\n");
}
export function parseLabPermit(raw) {
  if(!raw||typeof raw!=="object"||Array.isArray(raw) ||
    !Object.keys(raw).every(k=>["agentId","claimId","requestId","operation","containerId","issuedAt","expiresAt"].includes(k)) ||
    Object.keys(raw).length!==7 ||
    !UUID.test(raw.agentId||"")||!UUID.test(raw.claimId||"")||!UUID.test(raw.requestId||"")||
    !ACTIONS.has(raw.operation)||!FULL_ID.test(raw.containerId||"") ||
    typeof raw.issuedAt!=="string"||typeof raw.expiresAt!=="string"||
    !Number.isFinite(Date.parse(raw.issuedAt))||!Number.isFinite(Date.parse(raw.expiresAt)) ||
    Date.parse(raw.expiresAt)<=Date.parse(raw.issuedAt) ||
    Date.parse(raw.expiresAt)-Date.parse(raw.issuedAt)>16000) return null;
  return {...raw,agentId:raw.agentId.toLowerCase()};
}
export function labPermitMessage(raw) {
  const p=parseLabPermit(raw);
  if(!p)throw new Error("Invalid lab permit.");
  return ["ETERNYX_DOCKER_LAB_PERMIT_V1",p.agentId,p.claimId,p.requestId,p.operation,
    p.containerId,p.issuedAt,p.expiresAt].join("\n");
}
export function bytesFromBase64url(v,n) {
  if(typeof v!=="string"||!/^[A-Za-z0-9_-]+$/.test(v))throw new Error("Invalid signature encoding.");
  const bytes=Uint8Array.from(atob(v.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
  const canon=btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  if(bytes.length!==n || canon!==v)throw new Error("Noncanonical key or signature.");
  return bytes;
}
