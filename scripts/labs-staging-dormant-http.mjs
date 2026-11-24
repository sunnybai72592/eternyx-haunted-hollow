#!/usr/bin/env node
// Non-credentialed, non-mutating staging probes. No caller-selected destinations.
import path from "node:path";
import {fileURLToPath} from "node:url";
export const APPROVAL="I_APPROVE_LABS_DORMANT_HTTP_CHECK";
const origin="https://mhodwvypfbxafamkrgsk.supabase.co/functions/v1/";
const deny=code=>{throw Error("labs_dormant_http_"+code);};
const probes=Object.freeze([
 {slug:"ctf-range-worker",method:"GET",status:405,body:{error:"Method not allowed"}},
 {slug:"ctf-range-worker",method:"POST",status:503,body:{error:"Range worker endpoint is disabled"}},
 {slug:"ctf-range-access-check",method:"GET",status:405,body:{authorized:false}},
 {slug:"ctf-range-access-check",method:"POST",status:503,body:{authorized:false}},
 {slug:"ctf-range-access",method:"POST",gatewayDenial:true},
]);
export function validateConsent(env){
 if(env.ETERNYX_LABS_DORMANT_HTTP_CONSENT!==APPROVAL||
    env.ETERNYX_LABS_STAGING_REF!=="mhodwvypfbxafamkrgsk"||
    env.ETERNYX_LABS_PRODUCTION_REF!=="wcncuarekaofmfurbtbh")deny("approval_or_target");
}
async function readResponse(res){
 if(!res||res.redirected||res.headers.has("location"))deny("redirect");
 if(!/^application\/json(?:\s*;|$)/i.test(res.headers.get("content-type")??""))deny("non_json");
 const reader=res.body?.getReader();if(!reader)deny("missing_body");
 let total=0;const chunks=[];
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;
   if(total>2048)deny("response_limit");chunks.push(value);}
 }finally{await reader.cancel().catch(()=>{});}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));}
 catch{deny("invalid_json");}
}
export async function runDormantHttpAcceptance(env,fetcher=globalThis.fetch){
 validateConsent(env);
 const checks=[];
 for(const p of probes){
  let res;try{res=await fetcher(origin+p.slug,{method:p.method,
   redirect:"error",cache:"no-store",credentials:"omit",
   headers:{Accept:"application/json",...(p.method==="POST"?{"Content-Type":"application/json"}:{})},
   ...(p.method==="POST"?{body:"{}"}:{}),signal:AbortSignal.timeout(10000)});
  }catch{deny("transport");}
  const body=await readResponse(res);
  if(p.gatewayDenial){
   if(![401,403].includes(res.status)||!body||typeof body!=="object"||Array.isArray(body))deny("issuer_gateway_denial");
   checks.push({slug:p.slug,method:p.method,status:res.status,classification:"unauthenticated_denial_only"});
  }else{
   if(res.status!==p.status||!/\bno-store\b/i.test(res.headers.get("cache-control")??"")||
    !body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length!==Object.keys(p.body).length||
    !Object.entries(p.body).every(([k,v])=>body[k]===v))deny("unexpected_dormant_response");
   checks.push({slug:p.slug,method:p.method,status:res.status,classification:"exact_dormant_handler_response"});
  }
 }
 return {schema:"eternyx.labs.dormant-http-acceptance.v1",environment:"isolated_staging",checks,
  observedAt:new Date().toISOString(),credentialedRequests:0,validMutationPayloads:0,
  issuerAuthenticatedLockVerified:false,authenticatedAcceptanceVerified:false,
  physicalHardwareVerified:false,releaseAuthorized:false,productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==2)deny("arguments");console.log(JSON.stringify(await runDormantHttpAcceptance(process.env),null,2));}
 catch(e){console.error(/^labs_dormant_http_[a-z_]+$/.test(e?.message??"")?e.message:"labs_dormant_http_failed");process.exitCode=1;}
}
