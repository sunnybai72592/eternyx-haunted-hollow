/**
 * Privacy-safe CBT deadline and submission status decisions.
 * Browser projections NEVER finalize exams or award grades.
 * A real owner-scoped server read is required before confirming submission.
 */
import {validExamId} from "./educationExam.mjs";

const terminalStatuses=new Set(["submitted","auto_submitted","cheated"]);

export function educationDeadlineSafety(status,deadline,now=Date.now()){
  if(status!=="in_progress")
    return Object.freeze({
      editAllowed:false,expired:false,deadlineKnown:false,
      state:terminalStatuses.has(status)?"submitted":"unavailable",
    });
  if(!Number.isSafeInteger(deadline)||deadline<=0||
     !Number.isFinite(now)||now<0)
    return Object.freeze({
      editAllowed:false,expired:false,deadlineKnown:false,state:"unavailable",
    });
  const expired=now>=deadline;
  return Object.freeze({
    editAllowed:!expired,expired,deadlineKnown:true,
    state:expired?"expired":"open",
  });
}

/**
 * Validate ALL server-returned columns and the exact authenticated scope.
 * A mismatch or unsupported status must never become a fresh attempt, a
 * provisional success message, or a trusted final grade.
 */
export function verifyEducationOwnedSubmission(row,attemptId,ownerId,testId) {
  if(!validExamId(attemptId)||!validExamId(ownerId)||!validExamId(testId)||
     !row||typeof row!=="object"||Array.isArray(row)||
     row.id!==attemptId||row.user_id!==ownerId||row.test_id!==testId||
     !["in_progress","submitted","auto_submitted","cheated"].includes(row.status)) {
    throw new Error("The attempt status response could not be verified for this account.");
  }
  const started=typeof row.start_time==="string"?Date.parse(row.start_time):NaN;
  if(!Number.isFinite(started))
    throw new Error("The attempt's original start time could not be verified.");
  if(row.end_time!==null&&row.end_time!==undefined&&
     (typeof row.end_time!=="string"||!Number.isFinite(Date.parse(row.end_time))))
    throw new Error("The returned completion timestamp is invalid.");
  return Object.freeze({
    id:attemptId,
    status:row.status,
    confirmed:terminalStatuses.has(row.status),
    flagged:row.status==="cheated",
    startedAt:row.start_time,
    endedAt:typeof row.end_time==="string"?row.end_time:null,
  });
}

export function educationSubmissionRecoveryMessage(receipt,deadline,now=Date.now()){
  if(!receipt||typeof receipt!=="object")
    return "Submission status has not been verified with the server.";
  if(receipt.confirmed===true)
    return receipt.flagged===true
      ?"Server confirms a submitted, flagged attempt. Open its result for verified details."
      :"Server confirms the attempt is submitted. Open your recorded result.";
  if(receipt.status!=="in_progress")
    return "The server returned an unsupported attempt state. No submission was confirmed.";
  const deadlineState=educationDeadlineSafety("in_progress",deadline,now);
  return deadlineState.state==="expired"
    ?"Server still reports an in-progress attempt after its original deadline. Retry submission only; late answers cannot be accepted."
    :deadlineState.state==="open"
      ?"Server still reports this attempt in progress. Check saved answers and retry submission when ready."
      :"Server still reports this attempt in progress, but its original deadline cannot be verified. Do not edit or submit until the server is checked.";
}

/**
 * The status checker may only look up an existing real attempt.
 * It must never call start_cbt_attempt or infer completion from a rejected RPC.
 */
export function educationSubmissionReadScope(attemptId,ownerId,testId) {
  if(!validExamId(attemptId)||!validExamId(ownerId)||!validExamId(testId))
    throw new Error("Authenticated assessment identity is required.");
  return Object.freeze({attemptId,ownerId,testId});
}
