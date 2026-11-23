/**
 * Manual, two-account, read-only acceptance for ETERNYX LABS.
 * No function deployment, session reservation, CTF flag submission, SQL,
 * storage mutation, workflow writes or production access.
 * The only POSTs invoke fixed read-only Edge Function actions.
 */
import {ETERNYX_PRODUCTION_REF} from "../../scripts/automation-staging-db-readonly.mjs";
import {parseRangeProviderStatus,parseRangeSessionsResponse} from "./eternyxRangeSessionClient.mjs";
import {VERIFIED_CTF_MISSIONS,tallyVerifiedCtfSolves} from "./eternyxVerifiedCtf.mjs";

export const LABS_STAGING_SCHEMA="eternyx.labs.staging-readonly.v1";
export const LABS_STAGING_APPROVAL="I_APPROVE_LABS_READONLY_STAGING";
export const LABS_STAGING_REQUIRED_CHECKS=Object.freeze([
  "staging-target-pinned","two-distinct-authenticated-owners",
  "ctf-catalog-a","ctf-progress-a","range-provider-a","range-sessions-a",
  "ctf-catalog-b","ctf-progress-b","range-provider-b","range-sessions-b",
  "ctf-unauthenticated-denied","range-unauthenticated-denied",
]);
const REF=/^[a-z]{20}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]{12,2048}\.[A-Za-z0-9_-]{12,4096}\.[A-Za-z0-9_-]{12,2048}$/;
const LIMIT=32768;
const TIMEOUT=10000;
const MISSION_IDS=VERIFIED_CTF_MISSIONS.map(x=>x.id);
const MISSION_SET=new Set(MISSION_IDS);
const own=val=>!!val&&typeof val==="object"&&!Array.isArray(val);
function deny(code){throw Error("labs_staging_"+code);}
const validIso=x=>typeof x==="string"&&x.length<=40&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(x)&&
  Number.isFinite(Date.parse(x));
export function validateLabsStagingConfig(env={}){
  const ref=env.ETERNYX_LABS_STAGING_REF,prod=env.ETERNYX_LABS_PRODUCTION_REF;
  const publicKey=env.ETERNYX_LABS_STAGING_PUBLIC_KEY;
  const tokenA=env.ETERNYX_LABS_STAGING_JWT_A,tokenB=env.ETERNYX_LABS_STAGING_JWT_B;
  if(env.ETERNYX_LABS_STAGING_CONSENT!==LABS_STAGING_APPROVAL)deny("approval_required");
  if(typeof ref!=="string"||!REF.test(ref)||ref===ETERNYX_PRODUCTION_REF||
    prod!==ETERNYX_PRODUCTION_REF||ref===prod)deny("target_not_isolated");
  if(typeof publicKey!=="string"||publicKey.length<20||publicKey.length>4096||
    /\s/.test(publicKey)||!JWT.test(tokenA??"")||!JWT.test(tokenB??"")||
    tokenA===tokenB||tokenA===publicKey||tokenB===publicKey)
    deny("two_real_auth_sessions_required");
  return Object.freeze({
    ref,origin:"https://"+ref+".supabase.co",
    publicKey,tokenA,tokenB,stagingOnly:true,productionExcluded:true,
  });
}
async function readBounded(response,decodeJson){
  if(!response||!Number.isInteger(response.status)||response.status<100||response.status>599||
    !response.headers||typeof response.headers.get!=="function"||
    response.headers.get("location")!==null||response.redirected===true)deny("untrusted_response");
  const advertised=response.headers.get("content-length");
  if(advertised!==null&&(/^\d+$/.test(advertised)===false||Number(advertised)>LIMIT))
    deny("unbounded_response");
  let bytes=0,chunks=[];
  const reader=response.body?.getReader?.();
  if(reader){
    try{
      while(true){
        const part=await reader.read();
        if(part.done)break;
        if(!(part.value instanceof Uint8Array))deny("invalid_response_chunk");
        bytes+=part.value.byteLength;
        if(bytes>LIMIT)deny("unbounded_response");
        if(decodeJson)chunks.push(part.value);
      }
    }finally{await reader.cancel().catch(()=>{});}
  }
  if(!decodeJson)return null;
  if(!/application\/json/i.test(response.headers.get("content-type")??""))deny("non_json_response");
  const merged=new Uint8Array(bytes);let offset=0;
  for(const part of chunks){merged.set(part,offset);offset+=part.length;}
  let payload;
  try{payload=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(merged));}
  catch{deny("malformed_json");}
  if(!own(payload))deny("invalid_response_body");
  return payload;
}
async function request(config,fetcher,segment,token,action=null,readError=false){
  if(!["/auth/v1/user","/functions/v1/ctf-verified","/functions/v1/ctf-range-control"].includes(segment))
    deny("unapproved_endpoint");
  const url=config.origin+segment;
  const headers={apikey:config.publicKey,Accept:"application/json"};
  if(token!==null)headers.Authorization="Bearer "+token;
  let body;
  if(action!==null){
    if(!["catalog","progress","status","sessions"].includes(action))deny("write_action_forbidden");
    headers["Content-Type"]="application/json";
    body=JSON.stringify({action});
  }
  let response;
  try{
    response=await fetcher(url,{method:action===null?"GET":"POST",
      headers,body,redirect:"error",cache:"no-store",credentials:"omit",
      signal:AbortSignal.timeout(TIMEOUT)});
  }catch{deny("request_or_tls_failed");}
  if(readError){
    await readBounded(response,false);
    if(![401,403].includes(response.status))deny("unauthorized_access_not_denied");
    return {status:response.status};
  }
  if(response.status!==200){
    await readBounded(response,false);
    deny("authenticated_endpoint_unavailable");
  }
  const data=await readBounded(response,true);
  if(segment.startsWith("/functions/")&&
    !/\bno-store\b/i.test(response.headers.get("cache-control")??""))
    deny("missing_no_store");
  return data;
}
function validateCatalog(response){
  if(response.verifiedByServer!==true||!Array.isArray(response.missions)||
    response.missions.length!==MISSION_IDS.length||
    response.missions.some((m,i)=>!own(m)||m.id!==MISSION_IDS[i]||
      typeof m.points!=="number"||m.points!==VERIFIED_CTF_MISSIONS[i].points))
    deny("ctf_catalog_mismatch");
  return true;
}
function validateProgress(response){
  if(response.verifiedByServer!==true||!Array.isArray(response.solves)||
    response.solves.length>MISSION_IDS.length||!own(response.summary))
    deny("ctf_progress_invalid");
  const seen=new Set();
  for(const row of response.solves){
    if(!own(row)||!MISSION_SET.has(row.mission_id)||seen.has(row.mission_id)||
      !validIso(row.solved_at))deny("ctf_progress_invalid");
    seen.add(row.mission_id);
  }
  const expected=tallyVerifiedCtfSolves([...seen]);
  if(Object.keys(expected).some(k=>response.summary[k]!==expected[k]))
    deny("ctf_summary_mismatch");
  return Object.freeze({count:seen.size,solvedIds:[...seen]});
}
function validateIdentity(response){
  if(!UUID.test(response.id??"")||response.is_anonymous===true)deny("authentication_failed");
  return response.id;
}
async function probeCrossOwner(config,fetcher,owner,foreignToken,missionId){
  if(!MISSION_SET.has(missionId)||!UUID.test(owner))deny("fixture_invalid");
  const url=new URL("/rest/v1/ctf_verified_solves",config.origin);
  url.searchParams.set("select","mission_id,solved_at");
  url.searchParams.set("user_id","eq."+owner);
  url.searchParams.set("mission_id","eq."+missionId);
  url.searchParams.set("limit","1");
  let response;
  try{
    response=await fetcher(url.toString(),{
      method:"GET",headers:{apikey:config.publicKey,Authorization:"Bearer "+foreignToken,
        Accept:"application/json"},
      credentials:"omit",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(TIMEOUT),
    });
  }catch{deny("cross_owner_request_failed");}
  if(response.status!==200){await readBounded(response,false);deny("cross_owner_denial_unverified");}
  // PostgREST returns JSON arrays rather than objects. Read via a bounded parser.
  if(!response.headers||!/application\/json/i.test(response.headers.get("content-type")??""))
    deny("cross_owner_denial_unverified");
  const content=await readArrayBounded(response);
  if(content.length!==0)deny("cross_owner_row_disclosed");
  return true;
}
async function readArrayBounded(response){
  if(!response||response.redirected===true||response.headers.get("location")!==null)
    deny("untrusted_response");
  const reader=response.body?.getReader?.();if(!reader)deny("untrusted_response");
  const chunks=[];let total=0;
  try{for(;;){
    const x=await reader.read();if(x.done)break;
    if(!(x.value instanceof Uint8Array))deny("invalid_response_chunk");
    total+=x.value.length;if(total>LIMIT)deny("unbounded_response");
    chunks.push(x.value);
  }}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(total);let index=0;
  for(const chunk of chunks){bytes.set(chunk,index);index+=chunk.length;}
  try{const json=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
    if(!Array.isArray(json))deny("cross_owner_denial_unverified");
    return json;
  }catch{deny("cross_owner_denial_unverified");}
}
export async function runLabsStagingReadOnly(config,fetcher=globalThis.fetch){
  if(!config?.stagingOnly||!config.productionExcluded||!REF.test(config.ref)||
    config.ref===ETERNYX_PRODUCTION_REF||
    config.origin!=="https://"+config.ref+".supabase.co"||
    typeof fetcher!=="function")deny("unverified_configuration");
  const checks=[{id:"staging-target-pinned",passed:true}];
  const one=(id)=>checks.push({id,passed:true});
  const [userA,userB]=await Promise.all([
    request(config,fetcher,"/auth/v1/user",config.tokenA),
    request(config,fetcher,"/auth/v1/user",config.tokenB),
  ]);
  const idA=validateIdentity(userA),idB=validateIdentity(userB);
  if(idA===idB)deny("same_account_supplied");
  one("two-distinct-authenticated-owners");
  const accounts=[{key:"a",token:config.tokenA,id:idA},{key:"b",token:config.tokenB,id:idB}];
  const progress={};
  for(const account of accounts){
    const suffix=account.key;
    const catalog=await request(config,fetcher,"/functions/v1/ctf-verified",account.token,"catalog");
    validateCatalog(catalog);one("ctf-catalog-"+suffix);
    const current=await request(config,fetcher,"/functions/v1/ctf-verified",account.token,"progress");
    progress[suffix]=validateProgress(current);one("ctf-progress-"+suffix);
    const provider=await request(config,fetcher,"/functions/v1/ctf-range-control",account.token,"status");
    try{parseRangeProviderStatus(provider);}catch{deny("provider_status_invalid");}
    one("range-provider-"+suffix);
    const sessions=await request(config,fetcher,"/functions/v1/ctf-range-control",account.token,"sessions");
    try{parseRangeSessionsResponse(sessions);}catch{deny("session_response_invalid");}
    one("range-sessions-"+suffix);
  }
  await request(config,fetcher,"/functions/v1/ctf-verified",null,"progress",true);
  one("ctf-unauthenticated-denied");
  await request(config,fetcher,"/functions/v1/ctf-range-control",null,"sessions",true);
  one("range-unauthenticated-denied");
  // Real isolation evidence requires an existing solved fixture owned by a test account.
  let crossOwnerStatus="not_tested_no_owned_solve_fixture",crossOwnerChecks=0;
  if(progress.a.solvedIds.length&&progress.b.solvedIds.length){
    await probeCrossOwner(config,fetcher,idA,config.tokenB,progress.a.solvedIds[0]);
    await probeCrossOwner(config,fetcher,idB,config.tokenA,progress.b.solvedIds[0]);
    crossOwnerChecks=2;
    crossOwnerStatus="two_cross_owner_rows_denied";
  }
  if(checks.length!==LABS_STAGING_REQUIRED_CHECKS.length||
    checks.some((check,i)=>check.id!==LABS_STAGING_REQUIRED_CHECKS[i]||!check.passed))
    deny("incomplete_checks");
  return Object.freeze({
    schema:LABS_STAGING_SCHEMA,environment:"isolated_staging",stagingRef:config.ref,
    observedAt:new Date().toISOString(),checks,authenticatedOwnerCount:2,
    verifiedCtfCatalogChecked:true,verifiedCtfProgressReads:2,
    rangeProviderReads:2,rangeSessionReads:2,unauthenticatedDenials:2,
    crossOwnerStatus,crossOwnerChecks,
    anyMutatingActionsAttempted:false,sessionReservationsMade:0,flagsSubmitted:0,
    cloudProviderDeployedVerified:false,hostedIngressVerified:false,
    productionProjectChanged:false,productionReady:false,releaseAuthorized:false,
  });
}
