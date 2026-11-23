// Docker dispatch HTTP logic shared by deployed Deno Edge and isolated Node CI.
// Database, server signing key, crypto and time are injected by the trusted host.
// This handler NEVER executes Docker, opens sockets, or trusts a browser owner ID.
import {parseAgentAction,parseLabPermit,labPermitMessage} from "./docker-command-contract.mjs";
import {verifySignedDockerAgentAction} from "./docker-action-verifier.mjs";
const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff"};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function boundedBody(request){
 const claimed=Number(request.headers.get("content-length")||"0");
 if(!Number.isFinite(claimed)||claimed<0||claimed>2048)
   return {error:"Request too large",status:413};
 if(!request.body)return {error:"Request required",status:400};
 const reader=request.body.getReader();
 const chunks=[];let total=0;
 while(true){
   const {done,value}=await reader.read();if(done)break;
   total+=value.byteLength;
   if(total>2048){await reader.cancel().catch(()=>{});return {error:"Request too large",status:413};}
   chunks.push(value);
 }
 const bytes=new Uint8Array(total);let at=0;
 for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 try{return {value:parseAgentAction(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)))};}
 catch{return {error:"Malformed request",status:400};}
}
export function createDockerDispatchHandler({
 isEnabled,makeContext,now=()=>Date.now(),crypt=globalThis.crypto
}={}){
 if(typeof isEnabled!=="function"||typeof makeContext!=="function"||
    typeof now!=="function"||!crypt?.subtle)
   throw Error("Trusted Docker dispatch dependencies are missing.");
 return async function handleDockerDispatch(request){
   if(request.method!=="POST")return reply({error:"Method not allowed"},405);
   if(request.headers.get("Origin"))return reply({error:"Browser requests disabled"},403);
   if(isEnabled()!==true)return reply({error:"Docker lab dispatch disabled"},503);
   let decoded;
   try{decoded=await boundedBody(request);}
   catch{return reply({error:"Malformed request"},400);}
   if(decoded.error)return reply({error:decoded.error},decoded.status);
   const input=decoded.value;
   if(!input)return reply({error:"Invalid signed request"},400);
   const timestamp=Date.parse(input.signedAt),clock=now();
   if(!Number.isFinite(clock)||timestamp<clock-45000||timestamp>clock+30000)
     return reply({error:"Signed action expired"},409);
   try{
     // Before reading agent rows or claiming a nonce, require a configured
     // server signing key and trusted database adapter. Fail closed on errors.
     const context=await makeContext();
     if(!context?.signer||typeof context.loadAgent!=="function"||
        typeof context.rpc!=="function")throw Error("Unavailable trusted dispatch context");
     const agent=await context.loadAgent(input.agentId);
     if(!agent||agent.status!=="key_verified"||agent.revoked_at!==null)
       return reply({error:"Agent identity unavailable"},403);
     const signed=await verifySignedDockerAgentAction(input,agent,clock,crypt);
     if(!signed.ok)return reply({error:"Agent signature or identity rejected"},403);
     const hash=await crypt.subtle.digest("SHA-256",new TextEncoder().encode(input.nonce));
     const nonceHash=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
     const consumed=await context.rpc("docker_command_consume_nonce",{
       p_agent_id:input.agentId,p_nonce_hash:nonceHash,p_signed_at:input.signedAt});
     if(consumed?.ok!==true)return reply({error:"Agent request rejected",code:consumed?.reason||"denied"},409);
     if(input.kind==="claim"){
       const data=await context.rpc("docker_command_claim",{p_agent_id:input.agentId});
       if(data?.ok!==true)return reply({error:"No command claim allowed",code:data?.reason||"denied"},409);
       return reply({job:data.job||null,remoteLabMode:"manual-poll-only"});
     }
     if(input.kind==="authorize"){
       const data=await context.rpc("docker_command_authorize",{
         p_agent_id:input.agentId,p_claim_id:input.claimId});
       if(data?.ok!==true)return reply({error:"Command authorization unavailable",code:data?.reason||"denied"},409);
       const permit=parseLabPermit({agentId:data.agentId,claimId:data.claimId,
         requestId:data.requestId,operation:data.operation,containerId:data.containerId,
         issuedAt:new Date(data.issuedAt).toISOString(),
         expiresAt:new Date(data.expiresAt).toISOString()});
       if(!permit)throw Error("Invalid permit response from database.");
       const signature=b64url(new Uint8Array(await crypt.subtle.sign({name:"Ed25519"},context.signer,
         new TextEncoder().encode(labPermitMessage(permit)))));
       return reply({permit,signature,remoteLabMode:"signed-short-lived-permit"});
     }
     const data=await context.rpc("docker_command_finish",{
       p_agent_id:input.agentId,p_claim_id:input.claimId,p_outcome:input.outcome});
     if(data?.ok!==true)return reply({error:"Receipt rejected",code:data?.reason||"denied"},409);
     return reply({accepted:true,claimId:input.claimId,status:data.state,
       alreadyRecorded:data.reused===true,verification:"agent_signature_only",
       independentExecutionAudit:false});
   }catch{
     return reply({error:"Docker dispatch unavailable"},503);
   }
 };
}
