#!/usr/bin/env node
/**
 * ETERNYX staging-only two-owner acceptance with per-run password sign-ins.
 * Dedicated staging passwords are injected solely as GitHub Environment
 * secrets. Access tokens remain in process memory; neither credentials,
 * refresh tokens, user IDs nor response bodies are written to logs/files.
 */
import path from "node:path";
import {fileURLToPath} from "node:url";
import {validateTwoOwnerGate,checkTwoOwnerEvidence}
  from "./automation-staging-two-owner-gate.mjs";
import {validateConfiguration,runAcceptance}
  from "./automation-staging-acceptance.mjs";

const AUTH_RESPONSE_MAX=65536;
const MAX_PASSWORD_LENGTH=256;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(code){throw Error("automation_stage_fresh_auth_"+code);}
export function validateFreshCredentials(env={}){
  const gate=validateTwoOwnerGate(env);
  const key=env.ETERNYX_AUTOMATION_STAGING_PUBLISHABLE_KEY;
  if(typeof key!=="string"||!key.startsWith("sb_publishable_")||
     key.length>250||key.length<24)fail("publishable_key_invalid");
  const users=["A","B"].map(which=>{
    const email=env["ETERNYX_AUTOMATION_STAGING_OWNER_"+which+"_EMAIL"];
    const password=env["ETERNYX_AUTOMATION_STAGING_OWNER_"+which+"_PASSWORD"];
    if(typeof email!=="string"||email.length>254||
       !/^[^@\s]{1,64}@[^@\s]{2,187}$/.test(email)||
       typeof password!=="string"||password.length<12||
       password.length>MAX_PASSWORD_LENGTH||/\r|\n/.test(password))
      fail("test_account_configuration_invalid");
    return {email:email.toLowerCase(),password};
  });
  if(users[0].email===users[1].email)
    fail("test_accounts_must_be_distinct");
  return {gate,key,users};
}
async function boundedJson(response){
  if(!response||response.status!==200||
     !response.headers||typeof response.headers.get!=="function")
    fail("authentication_failed");
  const declared=response.headers.get("content-length");
  if(declared!==null&&(!/^\d+$/.test(declared)||
      !Number.isSafeInteger(Number(declared))||
      Number(declared)>AUTH_RESPONSE_MAX))fail("auth_response_invalid");
  if(!response.body||typeof response.body.getReader!=="function")
    fail("auth_response_invalid");
  const reader=response.body.getReader();
  let used=0;
  const chunks=[];
  try{
    for(;;){
      const next=await reader.read();
      if(next.done)break;
      if(!(next.value instanceof Uint8Array))fail("auth_response_invalid");
      used+=next.value.length;
      if(used>AUTH_RESPONSE_MAX)fail("auth_response_too_large");
      chunks.push(next.value);
    }
  }catch(error){
    if(error instanceof Error&&/^automation_stage_fresh_auth_[a-z_]+$/.test(error.message))
      throw error;
    fail("auth_response_invalid");
  }finally{await reader.cancel().catch(()=>undefined);}
  try{
    const bytes=new Uint8Array(used);
    let pos=0;
    for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
    const raw=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
      fail("auth_response_invalid");
    return parsed;
  }catch{fail("auth_response_invalid");}
}
export function checkFreshSession(session,stage,email,now=Math.floor(Date.now()/1000)){
  if(!session||typeof session!=="object"||
     session.token_type?.toLowerCase?.()!=="bearer"||
     typeof session.access_token!=="string"||!JWT.test(session.access_token)||
     !Number.isSafeInteger(session.expires_in)||session.expires_in<90||
     session.expires_in>86400||
     !session.user||typeof session.user!=="object"||
     session.user.email?.toLowerCase?.()!==email||
     session.user.is_anonymous===true||!UUID.test(session.user.id))
    fail("invalid_staging_session");
  let claims;
  try{
    const [,encoded]=session.access_token.split(".");
    claims=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8"));
  }catch{fail("invalid_jwt_claims");}
  const audience=claims?.aud;
  if(claims?.iss!=="https://"+stage+".supabase.co/auth/v1"||
     !(audience==="authenticated"||
       (Array.isArray(audience)&&audience.includes("authenticated")))||
     claims.role!=="authenticated"||
     claims.sub!==session.user.id||
     !Number.isSafeInteger(claims.exp)||
     claims.exp-now<90||claims.exp-now>86400||
     !Number.isSafeInteger(claims.iat)||
     claims.iat>now+120||claims.iat<now-300)
    fail("invalid_jwt_claims");
  return {jwt:session.access_token,uid:session.user.id};
}
export async function freshStageSignIn(env,fetcher=fetch,{now=Math.floor(Date.now()/1000)}={}){
  const credentials=validateFreshCredentials(env);
  if(typeof fetcher!=="function")fail("invalid_transport");
  const base="https://"+credentials.gate.stagingRef+".supabase.co";
  const authUrl=base+"/auth/v1/token?grant_type=password";
  const tokens=[];
  for(const account of credentials.users){
    let response;
    try{
      response=await fetcher(authUrl,{
        method:"POST",redirect:"error",cache:"no-store",
        credentials:"omit",signal:AbortSignal.timeout(8000),
        headers:{
          apikey:credentials.key,
          Accept:"application/json",
          "Content-Type":"application/json",
        },
        body:JSON.stringify({email:account.email,password:account.password}),
      });
    }catch{fail("auth_network_unavailable");}
    if(response?.headers?.get?.("location")!==null)
      fail("auth_redirect_forbidden");
    const result=checkFreshSession(
      await boundedJson(response),credentials.gate.stagingRef,account.email,now,
    );
    tokens.push(result);
  }
  if(tokens.length!==2||tokens[0].uid===tokens[1].uid||
     tokens[0].jwt===tokens[1].jwt)
    fail("duplicate_staging_identity");
  return {
    stagingRef:credentials.gate.stagingRef,
    mode:credentials.gate.mode,
    publicKey:credentials.key,
    jwtA:tokens[0].jwt,
    jwtB:tokens[1].jwt,
  };
}
export async function runFreshTwoOwnerAcceptance(env={},{
  fetcher=fetch,now=Math.floor(Date.now()/1000()),uuid,
}={}){
  const gate=validateTwoOwnerGate(env);
  const tokens=await freshStageSignIn(env,fetcher,{now});
  if(tokens.stagingRef!==gate.stagingRef||tokens.mode!==gate.mode)
    fail("project_boundary");
  const shared={
    ETERNYX_STAGING_PROJECT_REF:gate.stagingRef,
    ETERNYX_PRODUCTION_PROJECT_REF:env.ETERNYX_AUTOMATION_PRODUCTION_REF,
    ETERNYX_STAGING_ENVIRONMENT_CLASS:"isolated-test-project",
    ETERNYX_STAGING_PUBLISHABLE_KEY:tokens.publicKey,
    ETERNYX_STAGING_OWNER_A_JWT:tokens.jwtA,
    ETERNYX_STAGING_OWNER_B_JWT:tokens.jwtB,
  };
  const inspect=await runAcceptance(
    validateConfiguration(shared,"inspect",false),{fetcher},
  );
  checkTwoOwnerEvidence(inspect,"inspect");
  let result=inspect;
  if(gate.mode==="execute"){
    const executeEnv={
      ...shared,ETERNYX_STAGING_EXECUTION_CONSENT:
        "I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN",
    };
    result=await runAcceptance(
      validateConfiguration(executeEnv,"execute",true),{fetcher,uuid},
    );
  }
  const receipt=checkTwoOwnerEvidence(result,gate.mode);
  return {
    ...receipt,
    authMethod:"fresh_staging_password_signin",
    freshSessions:2,
    initialInspectionPassed:true,
    tokenValuesPersisted:false,
    refreshTokensPersisted:false,
    authSessionsCreated:true,
    productionReady:false,
    releaseAuthorized:false,
  };
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  (async()=>{
    if(process.argv.length!==3||
       !["--inspect","--execute"].includes(process.argv[2]))
      fail("invalid_arguments");
    const gate=validateTwoOwnerGate(process.env);
    if(gate.mode!==(process.argv[2]==="--inspect"?"inspect":"execute"))
      fail("mode_mismatch");
    const report=await runFreshTwoOwnerAcceptance(process.env);
    process.stdout.write(JSON.stringify(report,null,2)+"\n");
  })().catch(error=>{
    const value=error instanceof Error &&
      /^(automation_stage_fresh_auth_|automation_two_owner_gate_|staging_)[a-z0-9_]+$/.test(error.message)?
        error.message:"automation_stage_fresh_auth_unavailable";
    process.stderr.write(value+"\n");
    process.exitCode=1;
  });
}
