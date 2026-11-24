#!/usr/bin/env node
// Explicit opt-in: solve ONE fixed educational case per dedicated staging account.
// Never access a real target, reserve a range, print a flag, or write via REST.
import path from "node:path";
import {fileURLToPath} from "node:url";
import {acquireFreshLabsConfig} from "./labs-staging-fresh-auth.mjs";
import {LABS_STAGING_REF,runLabsStagingReadOnly} from "../src/lib/eternyxLabsStagingReadiness.mjs";
export const SOLVE_APPROVAL="I_APPROVE_TWO_STAGING_CTF_SOLVES";
const MISSION="encoded-access-log";
const origin="https://"+LABS_STAGING_REF+".supabase.co";
const deny=code=>{throw Error("labs_ctf_lifecycle_"+code);};
export function decodeCasefile(data){
  if(data?.missionId!==MISSION||typeof data.casefile!=="string"||data.casefile.length>4096)deny("invalid_artifact");
  const matches=[...data.casefile.matchAll(/\blab_trace=([A-Za-z0-9+/]{16,160}={0,2})(?=\s|$)/g)];
  if(matches.length!==1)deny("invalid_trace");
  const flag=Buffer.from(matches[0][1],"base64").toString("utf8");
  if(!/^ETERNYX\{encoded_access_log_[a-f0-9]{24}\}$/.test(flag))deny("invalid_casefile_flag");
  return flag;
}
async function invoke(config,token,action,fetcher,flag){
  if(!["artifact","progress","submit"].includes(action))deny("unapproved_action");
  const body=action==="progress"?{action}:action==="artifact"?{action,missionId:MISSION}:{action,missionId:MISSION,flag};
  let res;try{
    res=await fetcher(origin+"/functions/v1/ctf-verified",{method:"POST",redirect:"error",cache:"no-store",credentials:"omit",
      headers:{apikey:config.publicKey,Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  }catch{deny("transport_failed");}
  if(!res||res.redirected||res.headers.get("location")!==null||res.status!==200||
    !/application\/json/i.test(res.headers.get("content-type")??"")||!/\bno-store\b/i.test(res.headers.get("cache-control")??""))deny("endpoint_failed");
  const reader=res.body?.getReader?.();if(!reader)deny("invalid_response");
  let total=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>32768)deny("oversized_response");chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));}catch{deny("invalid_response");}
}
function hasSolve(data){
  if(data?.verifiedByServer!==true||!Array.isArray(data.solves)||data.solves.length>3)deny("invalid_progress");
  return data.solves.some(row=>row?.mission_id===MISSION&&typeof row.solved_at==="string"&&Number.isFinite(Date.parse(row.solved_at)));
}
export async function runCtfLifecycle(env,fetcher=globalThis.fetch){
  if(env.ETERNYX_LABS_CTF_SOLVE_CONSENT!==SOLVE_APPROVAL)deny("approval_required");
  const config=await acquireFreshLabsConfig(env,fetcher);
  // Fail before writes if authentication, secret, range disablement, REST
  // permissions or existing progress do not pass the standard acceptance.
  await runLabsStagingReadOnly(config,fetcher);
  const tokens=[config.tokenA,config.tokenB];
  const flags=await Promise.all(tokens.map(async token=>decodeCasefile(await invoke(config,token,"artifact",fetcher))));
  if(flags[0]===flags[1])deny("casefiles_not_account_specific");
  const before=await Promise.all(tokens.map(async token=>hasSolve(await invoke(config,token,"progress",fetcher))));
  let submitted=0;
  for(let i=0;i<2;i++){
    if(before[i])continue; // reruns never consume another rate slot for completed mission
    const receipt=await invoke(config,tokens[i],"submit",fetcher,flags[i]);
    if(receipt?.accepted!==true||receipt.verifiedByServer!==true||receipt.missionId!==MISSION)deny("solve_not_verified");
    submitted++;
  }
  for(const token of tokens)if(!hasSolve(await invoke(config,token,"progress",fetcher)))deny("solve_not_persisted");
  const acceptance=await runLabsStagingReadOnly(config,fetcher);
  if(acceptance.ownedSolveRestChecks!==2||acceptance.crossOwnerChecks!==2)deny("isolation_not_verified");
  return {schema:"eternyx.labs.ctf-lifecycle.v1",accountSpecificCasefiles:true,
    ctfSecretOperational:true,verifiedMission:MISSION,existingSolves:before.filter(Boolean).length,
    flagsSubmitted:submitted,verifiedProgressReads:2,ownedRestChecks:2,crossOwnerDenials:2,
    sessionReservationsMade:0,providerEnabled:false,productionReady:false,
    rangeSessionIsolation:acceptance.rangeRestIsolation};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==2)deny("invalid_arguments");
    console.log(JSON.stringify(await runCtfLifecycle(process.env),null,2));
  }catch(e){console.error(/^labs_(ctf_lifecycle|auth|staging)_[a-z_]+$/.test(e?.message??"")?e.message:"labs_ctf_lifecycle_failed");process.exitCode=1;}
}
