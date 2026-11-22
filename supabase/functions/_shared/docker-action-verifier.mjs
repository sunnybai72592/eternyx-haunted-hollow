// Shared Deno/Node WebCrypto verifier for the *actual* Docker dispatch Edge.
 // A verified signature proves registered key possession, never host ownership.
import {parseAgentAction,agentActionMessage,bytesFromBase64url} from "./docker-command-contract.mjs";

export async function verifySignedDockerAgentAction(raw,agent,now=Date.now(),crypt=globalThis.crypto) {
  const input=parseAgentAction(raw);
  if(!input)return {ok:false,reason:"malformed_action"};
  if(!agent||agent.id?.toLowerCase()!==input.agentId||
     agent.status!=="key_verified"||agent.revoked_at!==null)
    return {ok:false,reason:"identity_unavailable"};
  if(!Number.isFinite(now)||Date.parse(input.signedAt)<now-45_000||
     Date.parse(input.signedAt)>now+30_000)
    return {ok:false,reason:"action_expired"};
  try{
    const nonce=bytesFromBase64url(input.nonce,32);
    const sig=bytesFromBase64url(input.signature,64);
    const pub=bytesFromBase64url(agent.public_key,32);
    if(nonce.byteLength!==32||!crypt?.subtle)return {ok:false,reason:"invalid_signature"};
    const key=await crypt.subtle.importKey("raw",pub,{name:"Ed25519"},false,["verify"]);
    const valid=await crypt.subtle.verify({name:"Ed25519"},key,sig,
      new TextEncoder().encode(agentActionMessage(input)));
    if(!valid)return {ok:false,reason:"invalid_signature"};
    return {ok:true,action:input};
  }catch{return {ok:false,reason:"invalid_signature"};}
}
