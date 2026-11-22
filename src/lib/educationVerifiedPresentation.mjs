/**
 * Safe presentation projection: no score is official without a matching,
 * completed ledger receipt. Never promote legacy/partial attempt columns.
 */
export function projectVerifiedAttempt(attempt, receipt, verifiedMode) {
  if (!attempt || !verifiedMode) return attempt;
  const completed = ["submitted", "auto_submitted"].includes(attempt.status) &&
    typeof attempt.end_time === "string" && Number.isFinite(Date.parse(attempt.end_time));
  const matched = completed && receipt?.grade_status === "finalized" &&
    receipt.attempt_id === attempt.id &&
    Number.isSafeInteger(receipt.score) && Number.isSafeInteger(receipt.max_score) &&
    receipt.score >= 0 && receipt.max_score > 0 &&
    receipt.score <= receipt.max_score;
  return {
    ...attempt,
    score: matched ? receipt.score : null,
    max_score: matched ? receipt.max_score : null,
  };
}

/** Grade details cannot appear in exports until the ledger is verified. */
export function projectVerifiedAnswers(rows, revealGrades) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => revealGrades ? row : {
    ...row, is_correct: null, points_awarded: null,
  });
}
