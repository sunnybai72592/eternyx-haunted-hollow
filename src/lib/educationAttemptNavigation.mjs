import { validExamId } from "./educationExam.mjs";

/**
 * The catalog must not create a new CBT attempt when an existing attempt
 * already belongs to this user. Failed/unknown ownership checks fail closed.
 */
export function educationAttemptNavigation(testId, attempt, checked, ownerId) {
  const unavailable={label:"Attempt status unavailable",path:null,status:"unavailable"};
  if (!checked || !validExamId(testId) || !validExamId(ownerId)) return unavailable;
  if (!attempt) return {
    label:"Open assessment",path:"/test/"+testId,status:"available",
  };
  if (!validExamId(attempt.id) || attempt.test_id!==testId ||
      attempt.user_id!==ownerId) return unavailable;
  if (attempt.status==="in_progress") return {
    label:"Continue assessment",path:"/test/"+testId,status:"in_progress",
  };
  if (["submitted","auto_submitted","cheated"].includes(attempt.status)) return {
    label:"View submitted results",path:"/test-results/"+attempt.id,status:"submitted",
  };
  return unavailable;
}
