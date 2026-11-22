// Signed, agent-initiated Docker observation reports. Nothing in this protocol
// provides remote execution, Docker API access or physical host attestation.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const B64_32 = /^[A-Za-z0-9_-]{43}$/;
const B64_64 = /^[A-Za-z0-9_-]{86}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;
function canonicalTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const millis=Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString()===value;
}
export function parseDockerHeartbeat(raw) {
  if (!raw || typeof raw!=="object" || Array.isArray(raw)) return null;
  const keys=["agentId","signedAt","nonce","engineAvailable","engineVersion","containerCount","signature"];
  if (Object.keys(raw).some(k=>!keys.includes(k)) || Object.keys(raw).length!==keys.length) return null;
  if (!UUID.test(raw.agentId||"") || !canonicalTime(raw.signedAt) || !B64_32.test(raw.nonce||"") ||
      typeof raw.engineAvailable!=="boolean" || typeof raw.engineVersion!=="string" ||
      !(raw.containerCount===null || Number.isInteger(raw.containerCount) && raw.containerCount>=0 && raw.containerCount<=5000) ||
      !B64_64.test(raw.signature||"")) return null;
  if (!raw.engineAvailable && (raw.engineVersion!=="" || raw.containerCount!==null)) return null;
  if (raw.engineAvailable && !VERSION.test(raw.engineVersion)) return null;
  return {
    agentId:raw.agentId.toLowerCase(), signedAt:raw.signedAt, nonce:raw.nonce,
    engineAvailable:raw.engineAvailable, engineVersion:raw.engineVersion,
    containerCount:raw.containerCount, signature:raw.signature,
  };
}
export function dockerHeartbeatMessage(input) {
  const data=parseDockerHeartbeat(input);
  if (!data) throw new Error("Invalid signed Docker report.");
  return ["ETERNYX_DOCKER_HEARTBEAT_V1",data.agentId,data.signedAt,data.nonce,
    data.engineAvailable ? "1" : "0",data.engineVersion,
    data.containerCount===null ? "unknown" : String(data.containerCount)].join("\n");
}
export function canonicalBase64url(value,length) {
  if (typeof value!=="string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid cryptographic encoding.");
  const decoded=Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")),x=>x.charCodeAt(0));
  const canon=btoa(String.fromCharCode(...decoded)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  if (decoded.length!==length || canon!==value) throw new Error("Noncanonical cryptographic bytes.");
  return decoded;
}
