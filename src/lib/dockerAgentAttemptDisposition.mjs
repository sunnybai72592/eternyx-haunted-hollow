// Pure fail-closed decision for the signed local lab agent's journal boundary.
// An attempted Docker command can finish, fail, time out or lose its response.
// Without a verified postcondition, NONE of those observations may be reported
// as a definite failed/completed mutation or sent as a signed receipt.
export function classifyDockerAgentAttempt({attempted,postconditionConfirmed}){
 if(typeof attempted!=="boolean"||typeof postconditionConfirmed!=="boolean"||
    (postconditionConfirmed&&!attempted))
  throw Error("Invalid signed agent attempt or postcondition evidence.");
 if(!attempted)return {
  outcome:"guard_denied",keepRecoveryLockUntilDurableOutcome:true,
  maySendTerminalReceipt:true
 };
 if(postconditionConfirmed)return {
  outcome:"completed",keepRecoveryLockUntilDurableOutcome:true,
  maySendTerminalReceipt:true
 };
 return {
  outcome:null,keepRecoveryLockUntilDurableOutcome:true,
  maySendTerminalReceipt:false
 };
}

export function requireDurableTerminalBeforeReceipt(journal,expectedOutcome){
 if(!journal||typeof journal!=="object"||
    !["guard_denied","completed","failed"].includes(expectedOutcome)||
    journal.outcome!==expectedOutcome||journal.acknowledged===true||
    journal.attentionRequired!==true||
    (expectedOutcome==="guard_denied"&&journal.attempted!==false)||
    (["completed","failed"].includes(expectedOutcome)&&journal.attempted!==true))
  throw Error("Signed receipt forbidden without exact durable terminal journal.");
 return true;
}
