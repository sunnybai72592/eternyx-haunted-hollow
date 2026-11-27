/** Dormant, server-side rehearsal adapter. No listener, credentials or deployment.
 * Trust is external: caller supplies a separately reviewed key and session binding.
 * This is not a host attestation and must not sign synthetic fixtures in production.
 */
import {createHash,createPublicKey,sign,verify} from "node:crypto";
const DOMAIN="eternyx-http-observation-v1";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX=/^[0-9a-f]{64}$/;
const REF=/^[A-Za-z0-9._:-]{1,128}$/;
const FIELDS=["userId","sessionId","instanceRef","bundleSha","nonce","observedAt","expiresAt","transcriptSha"];
const BINDING=["userId","sessionId","instanceRef","bundleSha","nonce"];
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
function require(ok){if(!ok)throw Error("Assessment evidence rejected");}
function exact(o,keys){return !!o&&typeof o==="object"&&!Array.isArray(o)&&
  Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));}
function matches(pattern,v){return typeof v==="string"&&pattern.test(v);}
function binding(o){
  require(exact(o,BINDING)&&matches(UUID,o.userId)&&matches(UUID,o.sessionId)&&
    matches(REF,o.instanceRef)&&matches(HEX,o.bundleSha)&&matches(HEX,o.nonce));
  return BINDING.map(k=>o[k]);
}
const FACTS=Object.freeze({"authorization-denial":403,"unknown-resource":404,
  "method-restriction":405,"allowed-method":"GET","cache-policy":"no-store","content-sniffing":"nosniff"});
const ROWS=[
  ["200 OK",'{"status":"ready"}'],["200 OK",'{"role":"learner","data":"synthetic"}'],
  ["403 Forbidden",'{"error":"forbidden"}'],["404 Not Found",'{"error":"not_found"}'],
  ["405 Method Not Allowed",'{"error":"method_not_allowed"}']
];
function expectedResponse(i){
  const [status,body]=ROWS[i];
  const allow=i===4?"Allow: GET\r\n":"";
  return Buffer.from("HTTP/1.1 "+status+"\r\nContent-Type: application/json\r\n"+
    "Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n"+
    allow+"Content-Length: "+Buffer.byteLength(body)+"\r\n\r\n"+body);
}
export function transcriptDigest(expected,responses){
  const identity=binding(expected);
  require(Array.isArray(responses)&&responses.length===ROWS.length);
  for(let i=0;i<ROWS.length;i++){
    require(Buffer.isBuffer(responses[i])&&responses[i].length<=1024&&
      responses[i].equals(expectedResponse(i)));
  }
  // Static HTTP bytes are identical across sessions; bind digest to a unique
  // externally supplied challenge and all workload identity fields.
  return sha(JSON.stringify([DOMAIN,...identity,...responses.map(x=>x.toString("base64"))]));
}
function payloadBytes(p){
  require(exact(p,FIELDS));
  binding(Object.fromEntries(BINDING.map(k=>[k,p[k]])));
  require(matches(HEX,p.transcriptSha)&&Number.isSafeInteger(p.observedAt)&&
    Number.isSafeInteger(p.expiresAt)&&p.observedAt>=0&&
    p.expiresAt-p.observedAt===30_000);
  return Buffer.from(JSON.stringify([DOMAIN,...FIELDS.map(k=>p[k])]));
}
function keyFingerprint(key){
  require(key?.type==="public"&&key.asymmetricKeyType==="ed25519");
  return sha(key.export({type:"spki",format:"der"}));
}
export function createEvidence({expected,responses,privateKey,now}){
  require(privateKey?.type==="private"&&privateKey.asymmetricKeyType==="ed25519"&&Number.isSafeInteger(now));
  const payload={...expected,observedAt:now,expiresAt:now+30_000,
    transcriptSha:transcriptDigest(expected,responses)};
  return {payload,signature:sign(null,payloadBytes(payload),privateKey).toString("hex")};
}
export function verifyEvidence({envelope,expected,responses,publicKey,trustedFingerprint,now}){
  require(exact(envelope,["payload","signature"])&&matches(/^[a-f0-9]{128}$/,envelope.signature)&&
    matches(HEX,trustedFingerprint)&&keyFingerprint(publicKey)===trustedFingerprint&&Number.isSafeInteger(now));
  const p=envelope.payload, bytes=payloadBytes(p);
  binding(expected);
  require(BINDING.every(k=>p[k]===expected[k])&&p.observedAt<=now&&now<p.expiresAt&&
    p.transcriptSha===transcriptDigest(expected,responses));
  require(verify(null,bytes,publicKey,Buffer.from(envelope.signature,"hex")));
  return Object.freeze({p_user:p.userId,p_session:p.sessionId,p_bundle:p.bundleSha,
    p_transcript:p.transcriptSha,p_facts:FACTS,p_instance:p.instanceRef,p_nonce:p.nonce});
}
export async function admitEvidence({rpc,...input}){
  require(typeof rpc==="function");
  const args=verifyEvidence(input);
  const reply=await rpc("ctf_http_record_observation",args);
  require(reply?.error==null&&reply?.data===true);
  return {recorded:true,sessionId:args.p_session};
}
export function publicKeyFingerprint(privateKey){return keyFingerprint(createPublicKey(privateKey));}

// Candidate learner adapter: identity comes only from a caller-provided
// verified Auth result; no public endpoint is installed by this module.
const OPTIONS={"authorization-denial":[200,403,404,405],"unknown-resource":[200,403,404,405],
  "method-restriction":[200,403,404,405],"allowed-method":["GET","POST","PUT"],
  "cache-policy":["no-store","public","max-age=60"],"content-sniffing":["nosniff","sniff","none"]};
export async function submitLearnerAssessment({user,body,rpc}){
  require(user&&user.is_anonymous===false&&matches(UUID,user.id)&&typeof rpc==="function");
  require(exact(body,["sessionId","accessToken","answers"])&&matches(UUID,body.sessionId)&&
    matches(/^rx_[a-f0-9]{64}$/,body.accessToken)&&exact(body.answers,Object.keys(OPTIONS))&&
    Object.keys(OPTIONS).every(k=>OPTIONS[k].includes(body.answers[k])));
  const reply=await rpc("ctf_http_submit_assessment",{p_user:user.id,p_session:body.sessionId,
    p_grant_hash:sha(body.accessToken),p_answers:Object.fromEntries(Object.keys(OPTIONS).map(k=>[k,body.answers[k]]))});
  const data=reply?.data;
  require(reply?.error==null&&exact(data,["ok","sessionId","correct","total","submittedAt"])&&
    data.ok===true&&data.sessionId===body.sessionId&&Number.isInteger(data.correct)&&
    data.correct>=0&&data.correct<=6&&data.total===6&&typeof data.submittedAt==="string"&&
    Number.isFinite(Date.parse(data.submittedAt)));
  return Object.freeze({sessionId:data.sessionId,correct:data.correct,total:6,submittedAt:data.submittedAt});
}
