// Offline read-only comparison of an owner-dashboard export with operator-local
// claim evidence. Dashboard JSON is NOT cryptographically authenticated.
import {readLabClaim} from "./dockerLabRecovery.mjs";
import {verifyLabAudit} from "./dockerLabAttestation.mjs";
import {isAbsolute} from "node:path";
import {validateOwnerClaimExport} from "./dockerLabOwnerExport.mjs";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ID=/^[a-f0-9]{64}$/;
const OPERATIONS=new Set(["start","stop","restart"]);
const RECEIPTS=new Set(["reported_completed","reported_failed","reported_guard_denied"]);
function exact(v,fields){
 return !!v&&typeof v==="object"&&!Array.isArray(v)&&
 Object.keys(v).sort().join(",")===fields.slice().sort().join(",");
}
export function reviewLocalClaimAgainstOwnerExport(data,claimId,{
 journalDir,pinnedAgentPublicKey=null,signedAudit=null,now=Date.now()
}={}){
 validateOwnerClaimExport(data);
 if(!UUID.test(claimId||"")||typeof journalDir!=="string"||!isAbsolute(journalDir))
   throw Error("Claim ID and absolute operator journal directory required.");
 const record=data.requests.find(r=>r.claimId===claimId);
 if(!record)return {claimId,status:"not_in_bounded_export",attentionRequired:true,
   serverExportVerified:false,remoteOperationVerified:false,signedLocalProofVerified:false,
   findings:["No matching claim in this bounded owner export; never infer success."]};
 const findings=[];
 let local;
 try{local=readLabClaim(claimId,journalDir);}
 catch{return {claimId,status:"local_journal_missing_or_invalid",attentionRequired:true,
   serverExportVerified:false,remoteOperationVerified:false,signedLocalProofVerified:false,
   findings:["No valid private local journal for this claim; investigate on the operator host."]};}
 if(local.agentId!==record.agentId)findings.push("agent_identity_mismatch");
 if(local.operation!==record.operation)findings.push("operation_mismatch");
 if(local.containerId!==record.containerId)findings.push("container_identity_mismatch");
 const reported=RECEIPTS.has(record.executionStatus);
 const claimedOutcome=reported?record.executionStatus.slice("reported_".length):null;
 if(claimedOutcome!==null&&local.outcome!==claimedOutcome)
   findings.push("agent_report_vs_local_outcome_mismatch");
 if(reported&&local.acknowledged===false)findings.push("server_reported_but_local_ack_missing");
 if(!reported&&local.acknowledged===true)findings.push("local_ack_but_no_server_receipt_in_export");
 if(!reported&&local.attempted===true)findings.push("local_attempt_without_server_receipt");
 if(!reported&&local.outcome!==null)findings.push("local_outcome_not_reflected_on_server");
 if(record.executionStatus==="claimed"&&record.claimedAt&&now-Date.parse(record.claimedAt)>300000)
   findings.push("claim_older_than_receipt_window");
 let proof=false;
 if(pinnedAgentPublicKey!==null||signedAudit!==null){
   if(!pinnedAgentPublicKey||!signedAudit)throw Error("Both independently pinned key and audit proof required.");
   try{
     const verified=verifyLabAudit(signedAudit,pinnedAgentPublicKey,journalDir);
     if(verified.claimId!==claimId)throw Error("Proof claim ID mismatch");
     proof=true;
   }catch{findings.push("local_audit_signature_invalid");}
 }
 const mismatched=findings.length>0;
 return {claimId,status:mismatched?"manual_investigation_required":reported?
   "consistent_agent_assertions":"pending_or_unreported",
   attentionRequired:mismatched||!reported||record.executionStatus!=="reported_completed"||!proof,
   serverExportVerified:false,remoteOperationVerified:false,
   signedLocalProofVerified:proof,localReceiptAcknowledged:local.acknowledged,
   agentReportedStatus:record.executionStatus,
   findings:mismatched?findings:["No inconsistency found in available records; execution remains unverified."]};
}
