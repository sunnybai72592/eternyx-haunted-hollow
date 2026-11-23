/**
 * Local CBT lifecycle admission and restoration checks. All grading, timing,
 * enrollment and submission authority still belongs to the server.
 * These guards do not start attempts, access the network or store answers.
 */
import {validExamId} from "./educationExam.mjs";

const statuses=new Set(["in_progress","submitted","auto_submitted","cheated"]);
const completed=new Set(["submitted","auto_submitted","cheated"]);

/** Accept only the exact learner-facing fields returned by the attempt RPC. */
export function validateEducationAttemptEnvelope(value){
  if(!value||typeof value!=="object"||Array.isArray(value)||
     !validExamId(value.id)||!statuses.has(value.status)||
     typeof value.start_time!=="string"||
     !Number.isFinite(Date.parse(value.start_time))){
    throw new Error("The server returned an invalid or unsupported assessment attempt.");
  }
  return Object.freeze({
    id:value.id,start_time:value.start_time,status:value.status,
  });
}

export function isEducationTerminalAttempt(status){
  return completed.has(status);
}

/**
 * No inputs or server writes should occur between React Query's successful
 * fetch and hydration of that exact user's, exact attempt's saved answers.
 */
export function educationExamRestoreGate({
  atomicEnabled,ownerId,attemptId,restoredSuccess,restoredScope,
  queueScope,queueReady,
}={}){
  if(atomicEnabled!==true)return true; // legacy mode has no atomic restoration
  if(!validExamId(ownerId)||!validExamId(attemptId))return false;
  const expected=ownerId+":"+attemptId;
  return restoredSuccess===true&&restoredScope===expected&&
    queueScope===expected&&queueReady===true;
}

/** The same server-confirmed transition refreshes both catalog and history. */
export function educationExamAffectedQueryKeys(ownerId){
  if(!validExamId(ownerId))throw new Error("An authenticated student is required.");
  return Object.freeze([
    Object.freeze(["education-owned-attempt-list",ownerId]),
    Object.freeze(["education-private-history",ownerId]),
  ]);
}
