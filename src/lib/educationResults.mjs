/** Display values only; authoritative grading stays on the server. */
export function summarizeAttempt(attempt) {
  const status = typeof attempt?.status === "string" ? attempt.status : "unknown";
  const completed = ["submitted", "auto_submitted", "cheated"].includes(status);
  const score = attempt?.score;
  const maxScore = attempt?.max_score;
  const graded = completed && Number.isFinite(score) && Number.isFinite(maxScore) &&
    score >= 0 && maxScore > 0 && score <= maxScore;
  return {
    status,
    completed,
    graded,
    score: graded ? score : null,
    maxScore: graded ? maxScore : null,
    percentage: graded ? score / maxScore * 100 : null,
    headline: !completed ? "Assessment in progress" :
      graded ? "Score recorded" : "Grading pending",
  };
}

export function formatAssessmentDate(value) {
  if (typeof value !== "string" || !value) return "Not available";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Not available";
}

export function assessmentDuration(start, end) {
  const a = typeof start === "string" ? Date.parse(start) : NaN;
  const b = typeof end === "string" ? Date.parse(end) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return "Not available";
  const seconds = Math.floor((b - a) / 1000);
  return Math.floor(seconds / 60) + "m " + (seconds % 60) + "s";
}

/** A verified written response earns numeric points, not a fabricated right/wrong label. */
export function describeAssessmentAnswerGrading(question, officialGradeRecorded) {
  if (!officialGradeRecorded) return "Grading: Pending";
  const hasPoints = Number.isSafeInteger(question?.points_awarded) &&
    Number.isSafeInteger(question?.points) && question.points > 0 &&
    question.points_awarded >= 0 && question.points_awarded <= question.points;
  if (question?.is_correct === null || question?.is_correct === undefined) {
    return hasPoints
      ? "Grading: Written response reviewed · " + question.points_awarded +
        " / " + question.points + " points"
      : "Grading: Pending";
  }
  if (typeof question.is_correct !== "boolean") return "Grading: Pending";
  return "Grading: " + (question.is_correct ? "Correct" : "Incorrect") +
    (hasPoints ? " · " + question.points_awarded + " / " + question.points + " points" : "");
}

/** Text export contains only the authenticated user's server-returned attempt. */
export function buildAssessmentReport(attempt, test, questions = []) {
  const summary = summarizeAttempt(attempt);
  if (!summary.completed) throw new Error("An assessment must be submitted before a report can be exported.");
  const lines = [
    "ETERNYX Education · Assessment report",
    "Assessment: " + (test?.title || "Assessment"),
    "Attempt ID: " + attempt.id,
    "Status: " + summary.status,
    "Started: " + formatAssessmentDate(attempt.start_time),
    "Completed: " + formatAssessmentDate(attempt.end_time),
    "Duration: " + assessmentDuration(attempt.start_time, attempt.end_time),
    summary.graded ? "Recorded score: " + summary.score + " / " + summary.maxScore +
      " (" + summary.percentage.toFixed(1) + "%)" : "Score: Grading pending",
    "Pass/fail: Not declared (no verified passing threshold)",
    attempt.is_mobile_locked ? "Browser-background flag: Reported" : "Browser-background flag: Not reported",
    "",
    "Submitted answers",
  ];
  for (const [index, question] of questions.entries()) {
    lines.push(
      String(index + 1) + ". " + String(question.question_text || "Question"),
      "Answer: " + String(question.user_answer || "No answer"),
      describeAssessmentAnswerGrading(question, summary.graded),
      ""
    );
  }
  lines.push("This report reproduces available server records. It is not an official certificate.");
  return lines.join("\n") + "\n";
}
