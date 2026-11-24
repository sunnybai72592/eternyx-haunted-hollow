#!/usr/bin/env node
// Explicitly approved sign-in creates two ordinary staging Auth sessions.
// Never logs passwords, bearer tokens, refresh tokens, or account identifiers.
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LABS_STAGING_REF,LABS_STAGING_APPROVAL,isLabsPublicKey,validateLabsStagingConfig,runLabsStagingReadOnly} from "../src/lib/eternyxLabsStagingReadiness.mjs";
import {ETERNYX_PRODUCTION_REF} from "./automation-staging-db-readonly.mjs";
export const AUTH_APPROVAL="I_APPROVE_LABS_STAGING_TEST_SIGNIN";
const origin="https://"+LABS_STAGING_REF+".supabase.co";
const deny=code=>{throw Error("labs_auth_"+code);};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern=/^[^\s@]{1,128}@[^\s@]{1,128}$/;
const boundedPassword=x=>typeof x==="string"&&x.length>=12&&x.length<=256;
export function validateAuthInputs(env){
  if(env.ETERNYX_LABS_AUTH_CONSENT!==AUTH_APPROVAL)deny("approval_required");
  if(env.ETERNYX_LABS_STAGING_REF!==LABS_STAGING_REF||env.ETERNYX_LABS_PRODUCTION_REF!==ETERNYX_PRODUCTION_REF)deny("target_mismatch");
  const key=env.ETERNYX_LABS_STAGING_PUBLIC_KEY;
  if(!isLabsPublicKey(key))deny("public_key_required");
  const a={email:env.ETERNYX_LABS_TEST_EMAIL_A,password:env.ETERNYX_LABS_TEST_PASSWORD_A};
  const b={email:env.ETERNYX_LABS_TEST_EMAIL_B,password:env.ETERNYX_LABS_TEST_PASSWORD_B};
  if(![a,b].every(x=>typeof x.email==="string"&&emailPattern.test(x.email)&&boundedPassword(x.password))||
    a.email.toLowerCase()===b.email.toLowerCase()||a.password===b.password)deny("distinct_dedicated_accounts_required");
  return {key,a,b};
}
async function boundedJson(res){
  if(!res||res.redirected||res.headers.get("location")!==null||res.status!==200)deny("signin_denied");
  if(!/application\/json/i.test(res.headers.get("content-type")??""))deny("invalid_signin_response");
  const reader=res.body?.getReader?.();if(!reader)deny("invalid_signin_response");
  let total=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;
    total+=value.byteLength;if(total>32768)deny("oversized_signin_response");chunks.push(value);
  }}finally{await reader.cancel().catch(()=>{});}
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{deny("invalid_signin_response");}
}
async function signin(key,account,fetcher,now){
  let res;try{res=await fetcher(origin+"/auth/v1/token?grant_type=password",{
    method:"POST",redirect:"error",cache:"no-store",credentials:"omit",
    headers:{apikey:key,"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify(account),signal:AbortSignal.timeout(10000),
  });}catch{deny("signin_transport_failed");}
  const data=await boundedJson(res);
  const id=data?.user?.id,token=data?.access_token;
  if(!UUID.test(id??"")||data.user.is_anonymous!==false||
    data.user.email?.toLowerCase()!==account.email.toLowerCase()||
    typeof token!=="string"||token.length>8192)deny("invalid_signin_identity");
  let claims;try{const parts=token.split(".");if(parts.length!==3||parts.some(x=>!/^[A-Za-z0-9_-]+$/.test(x)))deny("invalid_token");
    claims=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
  }catch{deny("invalid_token");}
  if(claims.iss!==origin+"/auth/v1"||claims.sub!==id||claims.role!=="authenticated"||
    claims.is_anonymous===true||!Number.isInteger(claims.exp)||claims.exp<now()+180)
    deny("invalid_token_scope");
  return {id,token};
}
export async function runFreshLabsAcceptance(env,fetcher=globalThis.fetch,now=()=>Math.floor(Date.now()/1000)){
  const {key,a,b}=validateAuthInputs(env);
  const first=await signin(key,a,fetcher,now),second=await signin(key,b,fetcher,now);
  if(first.id===second.id||first.token===second.token)deny("same_account");
  const config=validateLabsStagingConfig({
    ETERNYX_LABS_STAGING_REF:LABS_STAGING_REF,ETERNYX_LABS_PRODUCTION_REF:ETERNYX_PRODUCTION_REF,
    ETERNYX_LABS_STAGING_CONSENT:LABS_STAGING_APPROVAL,ETERNYX_LABS_STAGING_PUBLIC_KEY:key,
    ETERNYX_LABS_STAGING_JWT_A:first.token,ETERNYX_LABS_STAGING_JWT_B:second.token,
  });
  const result=await runLabsStagingReadOnly(config,fetcher);
  return {schema:"eternyx.labs.fresh-auth-acceptance.v1",authSessionsCreated:2,
    credentialsPersistedByRunner:false,acceptance:result};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3)deny("invalid_arguments");
    if(process.argv[2]==="--check-config"){validateAuthInputs(process.env);console.log("LABS staging auth configuration accepted; no network requests.");}
    else if(process.argv[2]==="--run")console.log(JSON.stringify(await runFreshLabsAcceptance(process.env),null,2));
    else deny("invalid_arguments");
  }catch(e){console.error(/^labs_(auth|staging)_[a-z_]+$/.test(e?.message??"")?e.message:"labs_auth_failed");process.exitCode=1;}
}
