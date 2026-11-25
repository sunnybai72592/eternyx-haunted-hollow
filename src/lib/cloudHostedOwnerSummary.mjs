// Cloud & Integrations — defensively normalize REAL authenticated owner records.
// Both sources are the existing owner-guarded Docker enrollment/control Edge
// Functions. They are not live Engine telemetry or remote provisioning.
// This module has no network, credentials, side effects or synthetic fallback.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX=/^[a-f0-9]{64}$/;
const OPS=new Set(["start","stop","restart"]);
const STATUS=new Set(["pending","key_verified","revoked"]);
const MAX_RESPONSE=524288;
const MAX_AGE=15*60*1000;
const SIGNED_REPORT_AGE=3*60*1000;
const safeObject=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const safeText=(v,max=100)=>typeof v==="string"&&v.length<=max&&
 !/[\u0000-\u001f\u007f]/.test(v);
function records(value,limit,name){
 if(!Array.isArray(value)||value.length>limit||
    !value.every(safeObject))throw Error("Invalid or unbounded "+name+" owner records.");
 return value;
}
function unique(rows,key,label){
 const ids=rows.map(r=>r[key]);
 if(ids.some(id=>!UUID.test(id||""))||new Set(ids).size!==ids.length)
  throw Error("Duplicate or malformed "+label+" identity.");
}
function timestamp(value,now,maxAge){
 if(typeof value!=="string")return false;
 const parsed=Date.parse(value);
 return Number.isFinite(parsed)&&new Date(parsed).toISOString()===value&&
  parsed<=now+30000&&now-parsed<=maxAge;
}
function assertPayload(value,name){
 if(!safeObject(value))throw Error("Invalid "+name+" response.");
 let encoded;
 try{encoded=JSON.stringify(value);}catch{throw Error("Unreadable "+name+" response.");}
 if(!encoded||encoded.length>MAX_RESPONSE)
  throw Error("Oversized "+name+" response.");
}
const safeStatus=(value,max=45)=>safeText(value,max)&&
 /^[a-z][a-z0-9_]*$/.test(value);
const timeValue=v=>typeof v==="string"&&Number.isFinite(Date.parse(v))
  ?new Date(v).toISOString():null;
const optId=v=>UUID.test(v||"")?v:null;
const countWindow=(list,predicate)=>list.filter(predicate).length;

/** Takes two real Edge Function list payloads, never merged across owner IDs.
 * May be called for one authenticated owner only, after checking auth identity.
 * Refuses malformed, stale, remotely enabled, contradictory, or missing data. */
export function buildCloudHostedOwnerSummary(enrollment,control,{now=Date.now()}={}){
 if(!Number.isFinite(now))throw Error("Invalid cloud status clock.");
 assertPayload(enrollment,"Docker enrollment");
 assertPayload(control,"Docker control");
 if(enrollment.remoteConnectivityEnabled!==false||
    control.remoteExecutionEnabled!==false||
    control.source!=="authenticated_server"||
    control.releaseExecutionAuthorized!==false||
    control.releaseIndependentApprovalVerified!==false||
    control.releaseReviewerIdentityIndependentlyVerified!==false)
  throw Error("Hosted execution posture could not be verified. Control status unavailable.");
 if(!timestamp(control.observedAt,now,MAX_AGE))
  throw Error("Hosted Docker records are stale; refresh and review account status.");
 const workspaces=records(enrollment.workspaces,3,"workspace");
 const agents=records(enrollment.agents,25,"enrollment");
 const reports=records(enrollment.reports,25,"signed report");
 const requests=records(control.requests,30,"operation");
 const incidents=records(control.incidents,50,"incident");
 const controlAgents=records(control.agents,10,"verified control agent");
 unique(workspaces,"id","workspace");
 unique(agents,"id","agent");
 unique(requests,"id","operation");
 unique(incidents,"id","incident");
 unique(controlAgents,"id","control agent");
 unique(reports,"agent_id","signed report agent");
 if(!safeObject(control.policy)||
    typeof control.policy.enabled!=="boolean"||
    !Number.isInteger(control.policy.daily_limit)||
    control.policy.daily_limit<1||control.policy.daily_limit>100||
    ![true,false,undefined].includes(control.policy.incident_hold))
  throw Error("Hosted owner review policy is incomplete.");
 if(!safeObject(control.dispatchOverview)||
    !Number.isSafeInteger(control.dispatchOverview.total)||
    control.dispatchOverview.total<0||control.dispatchOverview.total>30||
    !Number.isSafeInteger(control.dispatchOverview.requiresReconciliation)||
    control.dispatchOverview.requiresReconciliation<0||
    !Number.isSafeInteger(control.dispatchOverview.receiptPending)||
    control.dispatchOverview.receiptPending<0)
  throw Error("Hosted reconciliation counts are unavailable.");
 const ids=new Set(agents.map(a=>a.id));
 const verifiedAgents=new Set(agents.filter(a=>a.status==="key_verified").map(a=>a.id));
 const workspaceIds=new Set(workspaces.map(w=>w.id));
 for(const w of workspaces){
  if(!safeText(w.name,120))throw Error("Invalid account workspace label.");
 }
 for(const a of agents){
  if(!STATUS.has(a.status)||!workspaceIds.has(a.workspace_id)||
      !safeText(a.display_name,100))
   throw Error("Invalid owner agent enrollment or workspace relationship.");
 }
 for(const a of controlAgents){
  if(!verifiedAgents.has(a.id)||a.status!=="key_verified")
   throw Error("Control agent does not match the account's verified enrollment.");
 }
 for(const r of reports){
  if(!ids.has(r.agent_id)||typeof r.engine_available!=="boolean"&&
    r.engine_available!==null)
   throw Error("Signed report not linked to the account's enrolled agent.");
  if(r.last_received_at!==null&&r.last_received_at!==undefined&&
    !timeValue(r.last_received_at))
   throw Error("Invalid signed report receipt time.");
  if(r.container_count!==null&&r.container_count!==undefined&&
    (!Number.isSafeInteger(r.container_count)||r.container_count<0))
   throw Error("Invalid signed report container count.");
 }
 for(const request of requests){
  if(!OPS.has(request.operation)||!HEX.test(request.container_id||"")||
     !ids.has(request.agent_id)||!safeStatus(request.effective_state)||
     !safeStatus(request.execution_status)||!timeValue(request.requested_at))
   throw Error("Malformed owner operation review record.");
 }
 for(const i of incidents){
  if(!safeStatus(i.status)||!timeValue(i.created_at))
   throw Error("Malformed owner incident record.");
 }
 const latest=reports.map(r=>({
  agentId:r.agent_id,
  label:agents.find(a=>a.id===r.agent_id)?.display_name||"Unidentified agent",
  enrolledStatus:agents.find(a=>a.id===r.agent_id)?.status||"unknown",
  receivedAt:timeValue(r.last_received_at),
  reportedEngineAvailable:r.engine_available===true,
  recent:verifiedAgents.has(r.agent_id)&&r.engine_available===true&&
    timestamp(r.last_received_at,now,SIGNED_REPORT_AGE),
  containerCount:Number.isSafeInteger(r.container_count)?r.container_count:null
 })).sort((a,b)=>Date.parse(b.receivedAt||"1970-01-01")-Date.parse(a.receivedAt||"1970-01-01"));
 const escalated=countWindow(incidents,i=>i.status==="escalated");
 const unresolved=Math.min(control.dispatchOverview.requiresReconciliation,30);
 return Object.freeze({
  schema:"eternyx-cloud-hosted-owner-summary-v1",
  source:"authenticated_owner_docker_server_records",
  observedAt:control.observedAt,
  freshness:"server_record_sample_not_live_engine",
  workspaces:workspaces.map(w=>({id:w.id,name:w.name})),
  enrollmentCount:agents.length,
  enrolledVerifiedCount:verifiedAgents.size,
  reports:latest.slice(0,25),
  recentSignedEngineReports:latest.filter(r=>r.recent).length,
  requestCount:requests.length,
  recentRequests:requests.slice(0,8).map(r=>({
   id:r.id,operation:r.operation,containerPrefix:r.container_id.slice(0,12),
   effectiveState:r.effective_state,executionStatus:r.execution_status,
   requestedAt:timeValue(r.requested_at),
   requiresAttention:r.reconciliation?.attentionRequired===true
  })),
  incidentCount:incidents.length,
  escalatedIncidentCount:escalated,
  reconciliationRequired:unresolved,
  receiptPending:Math.min(control.dispatchOverview.receiptPending,30),
  reviewPolicyEnabled:control.policy.enabled,
  incidentHoldActive:control.policy.incident_hold===true,
  dailyReviewPlanLimit:control.policy.daily_limit,
  limitsAreReviewPlansNotComputeQuota:true,
  hostedAccountApiReachable:true,
  hostedDockerExecutionConnected:false,
  kubernetesClusterConnected:false,
  physicalHostIsolationProven:false,
  provisioningEnabled:false,
  billingIntegrationVerified:false,
  productionDeploymentAuthorized:false
 });
}
