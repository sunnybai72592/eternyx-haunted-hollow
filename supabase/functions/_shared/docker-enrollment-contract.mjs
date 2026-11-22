// ETERNYX Docker enrollment v1: shared browser/Edge/Node protocol.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicKey = /^[A-Za-z0-9_-]{43}$/;
const signature = /^[A-Za-z0-9_-]{86}$/;
const noncePattern = /^[A-Za-z0-9_-]{43}$/;
const name = value => typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 64;
const noExtra = (value, allowed) => Object.keys(value).every(k => allowed.includes(k));
export function parseDockerEnrollmentRequest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof raw.action !== "string") return null;
  if (raw.action === "list" && noExtra(raw,["action"])) return {action:"list"};
  if (raw.action === "create_workspace" && name(raw.name) && noExtra(raw,["action","name"]))
    return {action:"create_workspace",name:raw.name.trim()};
  if (raw.action === "begin" && uuid.test(raw.workspaceId || "") && name(raw.name) &&
      publicKey.test(raw.publicKey || "") && noExtra(raw,["action","workspaceId","name","publicKey"]))
    return {action:"begin",workspaceId:raw.workspaceId,name:raw.name.trim(),publicKey:raw.publicKey};
  if (raw.action === "verify" && uuid.test(raw.agentId || "") && noncePattern.test(raw.nonce || "") &&
      signature.test(raw.signature || "") && noExtra(raw,["action","agentId","nonce","signature"]))
    return {action:"verify",agentId:raw.agentId,nonce:raw.nonce,signature:raw.signature};
  if (raw.action === "revoke" && uuid.test(raw.agentId || "") && noExtra(raw,["action","agentId"]))
    return {action:"revoke",agentId:raw.agentId};
  return null;
}
export function makeEnrollmentMessage({userId,workspaceId,agentId,nonce,expiresAt}) {
  if (![userId,workspaceId,agentId].every(x=>uuid.test(x||"")) ||
    !noncePattern.test(nonce || "") ||
    typeof expiresAt!=="string" || !Number.isFinite(Date.parse(expiresAt))) {
    throw new Error("Invalid signed Docker enrollment challenge.");
  }
  return ["ETERNYX_DOCKER_ENROLLMENT_V1",userId,workspaceId,agentId,nonce,new Date(expiresAt).toISOString()].join("\n");
}
export function decodeBase64url(value,expectedLength) {
  if (typeof value!=="string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url value.");
  const bytes=Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
  if (bytes.length!==expectedLength) throw new Error("Invalid cryptographic key/signature size.");
  const canonical = btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  if (canonical!==value) throw new Error("Noncanonical cryptographic input.");
  return bytes;
}
