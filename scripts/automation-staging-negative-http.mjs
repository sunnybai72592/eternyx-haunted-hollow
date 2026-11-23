#!/usr/bin/env node
/**
 * ETERNYX isolated-staging *negative-only* HTTP security acceptance.
 * No user tokens, apikeys, signature headers, scheduler keys, valid
 * webhook envelopes, workflow writes or schedule tick requests.
 *
 * Never tests or modifies the known ETERNYX production project.
 */
import {fileURLToPath} from "node:url";
import path from "node:path";
import {ETERNYX_PRODUCTION_REF} from "./automation-staging-db-readonly.mjs";

const REF=/^[a-z]{20}$/;
const APPROVAL="I_APPROVE_STAGING_NEGATIVE_HTTP";
const LIMIT=2048;
const TIMEOUT_MS=6000;
function deny(code){throw Error("automation_negative_http_"+code);}
export const NEGATIVE_CASES=Object.freeze([
  Object.freeze({
    id:"unauthenticated_control_list",slug:"automation-control",
    method:"POST",body:'{"action":"list"}',expected:[401,403],
  }),
  Object.freeze({
    id:"webhook_get_not_allowed",slug:"automation-webhook",
    method:"GET",body:null,expected:[405],
  }),
  Object.freeze({
    id:"unsigned_webhook_envelope",slug:"automation-webhook",
    method:"POST",body:"{}",expected:[400],
  }),
  Object.freeze({
    id:"scheduler_get_not_allowed",slug:"automation-scheduler-worker",
    method:"GET",body:null,expected:[405],
  }),
  Object.freeze({
    id:"scheduler_missing_key",slug:"automation-scheduler-worker",
    method:"POST",body:'{"action":"invalid_without_key"}',expected:[401],
  }),
]);
export function inspectNegativeTarget(env={}){
  const stage=env.ETERNYX_AUTOMATION_STAGING_REF;
  const prod=env.ETERNYX_AUTOMATION_PRODUCTION_REF;
  if(typeof stage!=="string"||!REF.test(stage)||
     prod!==ETERNYX_PRODUCTION_REF||stage===prod||
     env.ETERNYX_AUTOMATION_NEGATIVE_HTTP_CONSENT!==APPROVAL)
    deny("staging_approval_required");
  return {
    stagingRef:stage,baseUrl:"https://"+stage+".supabase.co/functions/v1/",
    productionExcluded:true,privateCredentialsUsed:false,
    consentValidated:true,
  };
}
async function readBoundedResponse(response){
  // The response payload must never reach logs or artifacts. Only enforce
  // a maximum response size; cancellation prevents long streamed bodies.
  const body=response?.body;
  if(!body)return;
  if(typeof body.getReader!=="function")deny("malformed_response");
  const reader=body.getReader();
  let total=0;
  try{
    for(;;){
      const item=await reader.read();
      if(item.done)break;
      if(!(item.value instanceof Uint8Array))deny("invalid_response_chunk");
      total+=item.value.byteLength;
      if(total>LIMIT)deny("response_too_large");
    }
  }finally{await reader.cancel().catch(()=>undefined);}
}
export async function runNegativeHttp(env={},fetcher=fetch){
  const target=inspectNegativeTarget(env);
  if(typeof fetcher!=="function")deny("invalid_transport");
  const cases=[];
  for(const check of NEGATIVE_CASES){
    const endpoint=target.baseUrl+check.slug;
    const headers={"Accept":"application/json"};
    if(check.body!==null)headers["Content-Type"]="application/json";
    let response;
    try{
      response=await fetcher(endpoint,{
        method:check.method,headers,body:check.body??undefined,
        redirect:"error",cache:"no-store",credentials:"omit",
        signal:AbortSignal.timeout(TIMEOUT_MS),
      });
    }catch{deny("connection_or_tls_failed");}
    if(!response||typeof response.status!=="number"||
       !Number.isInteger(response.status)||!response.headers||
       typeof response.headers.get!=="function"||
       response.headers.get("location")!==null)
      deny("untrusted_response");
    if(!check.expected.includes(response.status))
      deny("unexpected_status_"+check.id);
    await readBoundedResponse(response);
    cases.push({id:check.id,status:response.status,passed:true});
  }
  return {
    schema:"eternyx-automation-staging-negative-http-v1",
    stagingRef:target.stagingRef,
    target:"isolated_staging_only",
    checkedAt:new Date().toISOString(),
    checks:cases,
    allFiveSecurityDenialsPassed:true,
    credentiallessRequestsOnly:true,
    webhookSignedExecutionAttempted:false,
    schedulerTickAttempted:false,
    workflowWritesAttempted:false,
    liveAuthorizedWorkflowsVerified:false,
    secretsVerified:false,
    productionProjectChanged:false,
    productionReady:false,
    releaseAuthorized:false,
  };
}
export async function main(argv=process.argv.slice(2),env=process.env){
  if(argv.length!==1||argv[0]!=="--run-negative-only")deny("invalid_arguments");
  const report=await runNegativeHttp(env);
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked)main().catch(error=>{
  // No URLs, upstream bodies, names, tokens, or raw network messages.
  const safe=error instanceof Error&&/^automation_negative_http_[a-z_]+$/.test(error.message)?
    error.message:"automation_negative_http_check_failed";
  process.stderr.write(safe+"\n");
  process.exitCode=1;
});
