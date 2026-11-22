// Receipt-only checks: never write receipt_accepted for a mismatched claim.
// Acknowledgement is an enrolled-key self-report, not independent Docker proof.
export function validateDockerReceiptAcknowledgement(result,claimId,outcome){
 const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
 if(!result||typeof result!=="object"||Array.isArray(result)||
   !UUID.test(claimId||"")||!["completed","failed","guard_denied"].includes(outcome)||
   result.accepted!==true||result.claimId!==claimId||
   result.status!=="reported_"+outcome||
   typeof result.alreadyRecorded!=="boolean"||
   result.verification!=="agent_signature_only"||
   result.independentExecutionAudit!==false)
   throw Error("Receipt acknowledgement did not match the signed claim outcome.");
 return {accepted:true,claimId,status:result.status,
   alreadyRecorded:result.alreadyRecorded,independentlyVerified:false};
}
