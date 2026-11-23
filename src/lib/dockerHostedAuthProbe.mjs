// Explicitly opt-in, read-only staging authentication probe for ETERNYX Docker.
// Never invokes mutation actions, never uses a secret/service-role key, and
// never places JWTs or response bodies in diagnostic output.
const HOST=/^[a-z0-9-]{6,63}\.supabase\.co$/;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ROUTES=Object.freeze(["docker-control","docker-enrollment"]);
function validHost(value){
 return typeof value==="string"&&HOST.test(value)&&value===value.toLowerCase();
}
export function validateDockerHostedProbeContext(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Missing staging probe settings.");
 const {stagingUrl,pinnedStagingHost,productionHost,publishableKey,
   ownerAWorkspaceId,ownerBWorkspaceId}=raw;
 if(typeof stagingUrl!=="string")throw Error("Staging URL is required.");
 let u;
 try{u=new URL(stagingUrl);}catch{throw Error("Invalid staging URL.");}
 if(u.protocol!=="https:"||u.port||u.username||u.password||
    u.pathname!=="/"||u.search||u.hash||!validHost(u.hostname))
   throw Error("Only a bare HTTPS Supabase staging project origin is accepted.");
 if(!validHost(pinnedStagingHost)||!validHost(productionHost)||
    u.hostname!==pinnedStagingHost||u.hostname===productionHost)
   throw Error("Staging host pin is missing or matches the production host.");
 if(typeof publishableKey!=="string"||
    !/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey))
   throw Error("A publishable (never secret/service_role) API key is required.");
 if(!UUID.test(ownerAWorkspaceId||"")||!UUID.test(ownerBWorkspaceId||"")||
    ownerAWorkspaceId===ownerBWorkspaceId)
   throw Error("Two distinct pre-seeded staging owner workspace UUIDs are required.");
 return {origin:u.origin,host:u.hostname,publishableKey,
   ownerAWorkspaceId,ownerBWorkspaceId};
}
export function validateDockerHostedProbeConfig(raw){
 const context=validateDockerHostedProbeContext(raw);
 const {ownerAJwt,ownerBJwt}=raw;
 if(typeof ownerAJwt!=="string"||typeof ownerBJwt!=="string"||
    ownerAJwt.length>8192||ownerBJwt.length>8192||
    !JWT.test(ownerAJwt)||!JWT.test(ownerBJwt)||ownerAJwt===ownerBJwt)
  throw Error("Two distinct staging user access JWTs are required.");
 return {...context,ownerAJwt,ownerBJwt};
}
async function jsonBounded(response){
 if(response.headers.get("content-type")?.toLowerCase().includes("application/json")!==true)
   throw Error("Non-JSON hosted response");
 if(!response.body)throw Error("Empty hosted response");
 const reader=response.body.getReader();
 const parts=[];let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>262144)throw Error("Oversized hosted response");
   parts.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;
 for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 const result=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
 if(!result||typeof result!=="object"||Array.isArray(result))
   throw Error("Invalid hosted response object");
 return result;
}
const recordIds=(rows,key)=>rows.map(x=>x&&typeof x==="object"?x[key]:null);
const uniqueIds=(a,b,key)=>{
 const idsA=recordIds(a,key),idsB=recordIds(b,key);
 return idsA.every(x=>typeof x==="string")&&idsB.every(x=>typeof x==="string")&&
  new Set(idsA).size===idsA.length&&new Set(idsB).size===idsB.length&&
  !idsA.some(x=>idsB.includes(x));
};
function boundedArrays(body,route){
 const limits=route==="docker-control"?
   {requests:30,events:40,agents:10,incidents:50,incidentEvents:40}:
   {workspaces:3,agents:25,reports:25};
 return Object.entries(limits).every(([name,limit])=>
   Array.isArray(body[name])&&body[name].length<=limit&&
   body[name].every(x=>x!==null&&typeof x==="object"&&!Array.isArray(x)));
}
function ownerIsolation(left,right,route,aId,bId){
 if(!boundedArrays(left,route)||!boundedArrays(right,route))return false;
 if(route==="docker-enrollment"){
  if(left.remoteConnectivityEnabled!==false||right.remoteConnectivityEnabled!==false)
   return false;
  const a=recordIds(left.workspaces,"id"),b=recordIds(right.workspaces,"id");
  if(!a.includes(aId)||a.includes(bId)||!b.includes(bId)||b.includes(aId))
   return false;
  return uniqueIds(left.workspaces,right.workspaces,"id")&&
    uniqueIds(left.agents,right.agents,"id")&&
    uniqueIds(left.reports,right.reports,"agent_id");
 }
 if(left.source!=="authenticated_server"||right.source!=="authenticated_server"||
   left.remoteExecutionEnabled!==false||right.remoteExecutionEnabled!==false)
   return false;
 return uniqueIds(left.requests,right.requests,"id")&&
   uniqueIds(left.agents,right.agents,"id")&&
   uniqueIds(left.incidents,right.incidents,"id")&&
   uniqueIds(left.incidentEvents,right.incidentEvents,"id");
}
export async function runDockerHostedAuthProbe(raw,{
 fetcher=globalThis.fetch,timeoutMs=8000,now=()=>new Date().toISOString()
}={}){
 const config=validateDockerHostedProbeConfig(raw);
 if(typeof fetcher!=="function"||!Number.isInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>15000)throw Error("Invalid staging request transport.");
 const checks=[];const responses=new Map();
 const check=(id,passed,detail)=>checks.push({id,passed:passed===true,detail});
 async function perform(route,mode,token){
  // Fixed action is immutable: cannot create, approve, authorize, or execute.
  const request={method:"POST",headers:{
    "content-type":"application/json","apikey":config.publishableKey,
    ...(token?{Authorization:"Bearer "+token}:{})
   },body:'{"action":"list"}',redirect:"error",cache:"no-store",
   signal:AbortSignal.timeout(timeoutMs)};
  const response=await fetcher(config.origin+"/functions/v1/"+route,request);
  if(!response||typeof response.status!=="number"||response.redirected===true)
   throw Error("Invalid hosted response/redirect");
  if(typeof response.url==="string"&&response.url){
   const observed=new URL(response.url);
   if(observed.origin!==config.origin||observed.pathname!=="/functions/v1/"+route)
    throw Error("Response origin/route mismatch");
  }
  if(mode==="anonymous"||mode==="invalid"){
   if(![401,403].includes(response.status))throw Error("Unauthenticated access was not rejected.");
   return;
  }
  if(response.status!==200)throw Error("Authenticated staging list was not accepted.");
  if(!response.headers.get("cache-control")?.includes("no-store"))
   throw Error("Owner response must be non-cacheable.");
  const body=await jsonBounded(response);
  if(!boundedArrays(body,route))throw Error("Owner response schema or limits invalid.");
  responses.set(route+":"+mode,body);
 }
 let stopped=false;
 for(const route of ROUTES){
  for(const [mode,token] of [["anonymous",null],["invalid","invalid.jwt.token"],
   ["ownerA",config.ownerAJwt],["ownerB",config.ownerBJwt]]){
   try{
    await perform(route,mode,token);
    check(route+"_"+mode,true,mode==="anonymous"||mode==="invalid"?
     "Gateway/handler rejected unauthenticated list":"Read-only owner list returned bounded, uncached data");
   }catch{
    check(route+"_"+mode,false,"Staging auth, transport or response validation failed.");
    stopped=true;break;
   }
  }
  if(stopped)break;
 }
 if(!stopped){
  for(const route of ROUTES){
   const valid=ownerIsolation(responses.get(route+":ownerA"),
      responses.get(route+":ownerB"),route,
      config.ownerAWorkspaceId,config.ownerBWorkspaceId);
   check(route+"_two_owner_isolation",valid,valid?
      "No overlapping account-owned IDs (enrollment also verified pre-seeded workspaces)":
      "Missing staging owner fixtures or cross-owner data exposure; manual investigation required");
  }
 }
 const passed=checks.length===10&&checks.every(c=>c.passed);
 return {schema:"eternyx-docker-staging-auth-probe-v1",
   scope:"read_only_hosted_staging",observedAt:now(),targetHost:config.host,
   checks,passed,completedChecks:checks.length,stagingAuthChecksPassed:passed,
   userJwtVerifiedByLiveGateway:passed,
   completeRlsAuditPerformed:false,productionDeploymentAuthorized:false,
   dockerExecutionAuthorized:false,productionEndpointCalled:false,
   mutationRequestsSent:false,independentHostAttestation:false,
   manualSecurityApprovalRequired:true,
   note:"Two-owner staging observations, not independent proof of all RLS policies or Docker host safety."};
}
