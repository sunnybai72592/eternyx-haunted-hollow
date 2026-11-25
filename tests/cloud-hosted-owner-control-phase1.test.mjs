import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildCloudHostedOwnerSummary}
 from "../src/lib/cloudHostedOwnerSummary.mjs";

const USER_A="11111111-1111-4111-8111-111111111111";
const USER_B="22222222-2222-4222-8222-222222222222";
const at=new Date("2026-11-25T12:00:00.000Z");
const earlier=(minutes)=>new Date(at.valueOf()-minutes*60000).toISOString();
const clone=x=>structuredClone(x);
function fixtures(owner=USER_A){
 const a=owner===USER_A;
 const workspace=a?"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa":
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 const agent=a?"cccccccc-cccc-4ccc-8ccc-cccccccccccc":
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
 const req=a?"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee":
  "ffffffff-ffff-4fff-8fff-ffffffffffff";
 const incident=a?"12345678-1234-4234-8234-123456789abc":
  "23456789-2345-4234-8234-23456789abcd";
 const enrollment={
  workspaces:[{id:workspace,name:a?"Owner A private lab":"Owner B private lab",created_at:earlier(10)}],
  agents:[{id:agent,workspace_id:workspace,display_name:a?"Agent A":"Agent B",
    status:"key_verified",created_at:earlier(9),key_verified_at:earlier(8),revoked_at:null}],
  reports:[{agent_id:agent,last_signed_at:earlier(2),last_received_at:earlier(1),
    engine_available:true,engine_version:"25.0.0",container_count:3,accepted_count:1}],
  remoteConnectivityEnabled:false,
  note:"Key verification proves private-key possession, not server ownership."
 };
 const control={
  source:"authenticated_server",remoteExecutionEnabled:false,
  releaseExecutionAuthorized:false,releaseIndependentApprovalVerified:false,
  releaseReviewerIdentityIndependentlyVerified:false,
  observedAt:at.toISOString(),
  policy:{enabled:true,daily_limit:5,incident_hold:false},
  agents:[{id:agent,display_name:a?"Agent A":"Agent B",status:"key_verified"}],
  requests:[{id:req,agent_id:agent,container_id:"a".repeat(64),operation:"stop",
   state:"approved",effective_state:"approved",execution_status:"not_dispatched",
   requested_at:earlier(3),expires_at:earlier(-7),
   reconciliation:{status:"not_dispatched",attentionRequired:false,receiptPresent:false,ageSeconds:null}}],
  dispatchOverview:{window:"last_30",total:1,requiresReconciliation:0,
   receiptPending:0,notDispatched:1,agentReportedComplete:0,agentReportedIssue:0},
  incidents:[{id:incident,claim_id:null,status:"escalated",reason:"investigation",
   created_at:earlier(5),updated_at:earlier(4)}]
 };
 return {enrollment,control,workspace,agent,req,incident};
}
const build=(a,atTime=at)=>buildCloudHostedOwnerSummary(a.enrollment,a.control,{now:atTime.valueOf()});

test("actual owner-A hosted control and enrollment payloads yield only bounded read-only account status",()=>{
 const e=fixtures(),s=build(e);
 assert.equal(s.schema,"eternyx-cloud-hosted-owner-summary-v1");
 assert.equal(s.source,"authenticated_owner_docker_server_records");
 assert.equal(s.hostedAccountApiReachable,true);
 assert.equal(s.workspaces.length,1);
 assert.equal(s.workspaces[0].name,"Owner A private lab");
 assert.equal(s.enrolledVerifiedCount,1);
 assert.equal(s.recentSignedEngineReports,1);
 assert.equal(s.requestCount,1);
 assert.equal(s.recentRequests[0].executionStatus,"not_dispatched");
 assert.equal(s.incidentCount,1);
 assert.equal(s.escalatedIncidentCount,1);
 assert.equal(s.dailyReviewPlanLimit,5);
 for(const flag of [
  "hostedDockerExecutionConnected","kubernetesClusterConnected",
  "physicalHostIsolationProven","provisioningEnabled",
  "billingIntegrationVerified","productionDeploymentAuthorized"
 ])assert.equal(s[flag],false,flag);
 assert.equal(s.limitsAreReviewPlansNotComputeQuota,true);
 assert.doesNotMatch(JSON.stringify(s),/engine_version|owner_id|service_role|apikey|token|secret|fullContainerId/);
 assert.equal(Object.isFrozen(s),true);
});

test("two account fixtures remain distinct and cross-tenant identity mixing is refused",()=>{
 const a=fixtures(USER_A),b=fixtures(USER_B);
 const aa=build(a),bb=build(b);
 assert.notEqual(aa.workspaces[0].id,bb.workspaces[0].id);
 assert.notEqual(aa.reports[0].agentId,bb.reports[0].agentId);
 assert.notEqual(aa.recentRequests[0].id,bb.recentRequests[0].id);
 assert.throws(()=>buildCloudHostedOwnerSummary(a.enrollment,b.control,{now:at.valueOf()}),
  /does not match|not linked|account|Control agent/);
 assert.throws(()=>buildCloudHostedOwnerSummary(b.enrollment,a.control,{now:at.valueOf()}));
});

test("anonymous, missing, denied or stale server status NEVER becomes an apparently connected cloud state",()=>{
 const {enrollment,control}=fixtures();
 for(const x of [
  null,[],undefined,{error:"Sign in"},{},
  {...control,source:"browser_local"},
  {...control,remoteExecutionEnabled:true},
  {...control,releaseExecutionAuthorized:true},
  {...control,releaseIndependentApprovalVerified:true},
  {...control,releaseReviewerIdentityIndependentlyVerified:true},
  {...control,observedAt:earlier(17)},
  {...control,observedAt:"not a date"},
  {...control,observedAt:new Date(at.valueOf()+360000).toISOString()}
 ])assert.throws(()=>buildCloudHostedOwnerSummary(enrollment,x,{now:at.valueOf()}));
 for(const x of [null,[],{},{
   ...enrollment,remoteConnectivityEnabled:true
 }])assert.throws(()=>buildCloudHostedOwnerSummary(x,control,{now:at.valueOf()}));
});

test("expired, unavailable or revoked signed agent heartbeats never imply live Engine connectivity",()=>{
 const f=fixtures();
 f.enrollment.reports[0].last_received_at=earlier(4);
 assert.equal(build(f).recentSignedEngineReports,0);
 f.enrollment.reports[0].last_received_at=earlier(1);
 f.enrollment.reports[0].engine_available=false;
 assert.equal(build(f).recentSignedEngineReports,0);
 f.enrollment.reports[0].engine_available=true;
 f.enrollment.agents[0].status="revoked";
 f.control.agents=[];
 assert.equal(build(f).enrolledVerifiedCount,0);
 assert.equal(build(f).recentSignedEngineReports,0);
});

test("malformed owner response, duplicate IDs, orphan agent/workspace, extreme counts and impossible policy all fail closed",()=>{
 const f=fixtures();
 for(const patch of [
  {workspaces:[...f.enrollment.workspaces,...f.enrollment.workspaces]},
  {agents:[...f.enrollment.agents,...f.enrollment.agents]},
  {agents:[{...f.enrollment.agents[0],workspace_id:USER_B}]},
  {agents:[{...f.enrollment.agents[0],status:"fake_success"}]},
  {reports:[{...f.enrollment.reports[0],agent_id:USER_B}]},
  {reports:[{...f.enrollment.reports[0],container_count:-10}]},
  {workspaces:Array.from({length:4},(_,i)=>({...f.enrollment.workspaces[0],id:
   String(i+1).repeat(8)+"-"+String(i+1).repeat(4)+"-4"+String(i+1).repeat(3)+
   "-8"+String(i+1).repeat(3)+"-"+String(i+1).repeat(12)}))}
 ])assert.throws(()=>build({...f,enrollment:{...f.enrollment,...patch}}));
 for(const patch of [
  {policy:{enabled:true,daily_limit:-1}},
  {policy:{enabled:true,daily_limit:100000}},
  {agents:[{id:USER_B,display_name:"Other owner",status:"key_verified"}]},
  {requests:[{...f.control.requests[0],agent_id:USER_B}]},
  {requests:[{...f.control.requests[0],operation:"exec"}]},
  {requests:[{...f.control.requests[0],container_id:"short"}]},
  {incidents:[{...f.control.incidents[0],status:"staged<script>"}]},
  {dispatchOverview:{total:31,requiresReconciliation:0,receiptPending:0}},
  {dispatchOverview:null}
 ])assert.throws(()=>build({...f,control:{...f.control,...patch}}));
});

test("incidents and unresolved claims are bounded, never invented from missing response values",()=>{
 const f=fixtures();
 f.control.policy.incident_hold=true;
 f.control.dispatchOverview.requiresReconciliation=1;
 f.control.dispatchOverview.receiptPending=1;
 f.control.requests[0].reconciliation.attentionRequired=true;
 const s=build(f);
 assert.equal(s.incidentHoldActive,true);
 assert.equal(s.reconciliationRequired,1);
 assert.equal(s.receiptPending,1);
 assert.equal(s.recentRequests[0].requiresAttention,true);
 assert.equal(s.hostedDockerExecutionConnected,false);
});

test("Cloud UI only calls fixed owner-guarded list actions; account-switch rechecks clear stale state",()=>{
 const page=readFileSync(new URL("../src/pages/CloudIntegrations.tsx",import.meta.url),"utf8");
 const panel=readFileSync(new URL("../src/components/cloud/HostedCloudControlCenter.tsx",import.meta.url),"utf8");
 const enrollment=readFileSync(new URL("../supabase/functions/docker-enrollment/index.ts",import.meta.url),"utf8");
 const control=readFileSync(new URL("../supabase/functions/docker-control/index.ts",import.meta.url),"utf8");
 assert.match(page,/import HostedCloudControlCenter from/);
 assert.match(page,/<HostedCloudControlCenter \/>/);
 assert.match(panel,/supabase\.auth\.getUser\(\)/);
 assert.match(panel,/supabase\.auth\.getSession\(\)/);
 assert.match(panel,/before\.data\.user\?\.id!==owner/);
 assert.match(panel,/after\.data\.session\?\.user\.id!==owner/);
 assert.match(panel,/serial\.current!==token/);
 assert.match(panel,/state\.ownerId===owner/);
 assert.match(panel,/useEffect\(\(\)=>\{\s*void load\(\);\s*return \(\)=>\{serial\.current\+\+;\}/);
 assert.match(panel,/supabase\.functions\.invoke\("docker-enrollment",\{body:\{action:"list"\}\}\)/);
 assert.match(panel,/supabase\.functions\.invoke\("docker-control",\{body:\{action:"list"\}\}\)/);
 assert.doesNotMatch(panel,/functions\.invoke\([^,]+,\{body:\{action:"(?:request|decide|policy|revoke|begin|verify|execute|delete|create_workspace)"/);
 assert.doesNotMatch(panel,/\bfetch\(["']https?:|DOCKER_HOST|service_role|docker\.sock|Deno\.Command/);
 assert.match(enrollment,/verifiedDockerOwnerId\(user,supabase\)/);
 assert.match(enrollment,/\.eq\("owner_id",owner\)/);
 assert.match(enrollment,/remoteConnectivityEnabled:false/);
 assert.match(control,/verifiedDockerOwnerId\(user,supabase\)/);
 assert.match(control,/\.eq\("owner_id",owner\)/);
 assert.match(control,/remoteExecutionEnabled:false/);
});
