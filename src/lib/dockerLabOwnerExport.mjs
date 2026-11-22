// Browser/Node compatible owner export contract: deliberately UNSIGNED data.
// The export must not be treated as cryptographically authenticated by the CLI.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ID=/^[a-f0-9]{64}$/;
const OPERATIONS=new Set(["start","stop","restart"]);
const RECEIPTS=new Set(["reported_completed","reported_failed","reported_guard_denied"]);
function exact(v,fields){
 return !!v&&typeof v==="object"&&!Array.isArray(v)&&
 Object.keys(v).sort().join(",")===fields.slice().sort().join(",");
}
export function validateOwnerClaimExport(data){
 if(!exact(data,["schema","exportedAt","observedAt","requests","authenticity"])||
   data.schema!=="eternyx-docker-owner-claims-v1"||
   data.authenticity!=="unverified-browser-export" ||
   typeof data.exportedAt!=="string"||!Number.isFinite(Date.parse(data.exportedAt))||
   typeof data.observedAt!=="string"||!Number.isFinite(Date.parse(data.observedAt))||
   new Date(data.exportedAt).toISOString()!==data.exportedAt||
   new Date(data.observedAt).toISOString()!==data.observedAt||
   Date.parse(data.exportedAt)<Date.parse(data.observedAt)||
   !Array.isArray(data.requests)||data.requests.length>30||
   !data.requests.every(r=>
      exact(r,["requestId","claimId","agentId","operation","containerId","executionStatus","claimedAt","reportedAt"])&&
      UUID.test(r.requestId||"")&&
      (r.claimId===null||UUID.test(r.claimId||""))&&
      UUID.test(r.agentId||"")&&
      OPERATIONS.has(r.operation)&&ID.test(r.containerId||"")&&
      (r.claimId===null?r.executionStatus==="not_dispatched":
       r.executionStatus==="claimed"||RECEIPTS.has(r.executionStatus))&&
      (r.claimedAt===null||typeof r.claimedAt==="string"&&Number.isFinite(Date.parse(r.claimedAt)))&&
      (r.reportedAt===null||typeof r.reportedAt==="string"&&Number.isFinite(Date.parse(r.reportedAt)))&&
      (r.claimId===null?r.claimedAt===null&&r.reportedAt===null:
       typeof r.claimedAt==="string")&&
      (!RECEIPTS.has(r.executionStatus)||typeof r.reportedAt==="string")
   ))throw Error("Invalid or oversized browser-owner Docker snapshot.");
 const requestIds=data.requests.map(r=>r.requestId);
 const claimIds=data.requests.filter(r=>r.claimId).map(r=>r.claimId);
 if(new Set(requestIds).size!==requestIds.length||new Set(claimIds).size!==claimIds.length)
   throw Error("Duplicate operation or claim in exported owner snapshot.");
 return data;
}

export function buildDockerOwnerClaimExport(requests,observedAt,now=Date.now()){
 if(!Array.isArray(requests)||requests.length>30||
    typeof observedAt!=="string"||!Number.isFinite(Date.parse(observedAt)))
    throw Error("No bounded authenticated Docker claim response available.");
 const payload={
   schema:"eternyx-docker-owner-claims-v1",authenticity:"unverified-browser-export",
   observedAt,exportedAt:new Date(Math.max(now,Date.parse(observedAt))).toISOString(),
   requests:requests.map(r=>({
     requestId:r.id,claimId:r.dispatch_claim_id??null,
     agentId:r.agent_id,operation:r.operation,containerId:r.container_id,
     executionStatus:r.execution_status,
     claimedAt:r.dispatch_claimed_at??null,reportedAt:r.dispatch_reported_at??null,
   })),
 };
 return validateOwnerClaimExport(payload);
}
