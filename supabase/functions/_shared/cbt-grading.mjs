/**
 * Deterministic grading plan for submitted CBT attempts.
 *
 * Only a trusted server may supply the option answer key. Student-controlled
 * grading fields are ignored; short answers are never automatically marked
 * incorrect or credited before a verified manual-review service exists.
 */
export function buildTrustedGradingPlan(questions, answers, selectedOptions) {
  if (!Array.isArray(questions) || !questions.length || questions.length > 500 ||
      !Array.isArray(answers) || !Array.isArray(selectedOptions)) {
    throw new Error("Invalid assessment grading input.");
  }

  const questionById = new Map();
  let maxScore = 0;
  for (const question of questions) {
    if (!question || typeof question.id !== "string" || !question.id ||
        questionById.has(question.id) ||
        !["multiple_choice", "true_false", "short_answer"].includes(question.question_type) ||
        !Number.isInteger(question.points) || question.points < 0 || question.points > 100_000) {
      throw new Error("Invalid question in assessment.");
    }
    maxScore += question.points;
    if (maxScore > 2_147_483_647) throw new Error("Assessment score exceeds database limits.");
    questionById.set(question.id, question);
  }

  const optionById = new Map();
  for (const option of selectedOptions) {
    if (!option || typeof option.id !== "string" || typeof option.question_id !== "string" ||
        typeof option.is_correct !== "boolean" || optionById.has(option.id)) {
      throw new Error("Invalid selected option in assessment.");
    }
    optionById.set(option.id, option);
  }

  const seenAnswers = new Set();
  const updates = [];
  let score = 0;
  let pendingManualReview = 0;

  for (const answer of answers) {
    const question = questionById.get(answer?.question_id);
    if (!answer || typeof answer.id !== "string" || !answer.id ||
        !question || seenAnswers.has(question.id) ||
        (answer.selected_option_id !== null && answer.selected_option_id !== undefined &&
          typeof answer.selected_option_id !== "string") ||
        (answer.short_answer_text !== null && answer.short_answer_text !== undefined &&
          typeof answer.short_answer_text !== "string")) {
      throw new Error("Invalid submitted answer in assessment.");
    }
    seenAnswers.add(question.id);

    const selectedId = answer.selected_option_id ?? null;
    const written = answer.short_answer_text ?? "";
    if (written.length > 5000) throw new Error("Short answer exceeds the review limit.");

    if (question.question_type === "short_answer") {
      if (selectedId) throw new Error("A written question cannot use a selected option.");
      const needsReview = written.trim().length > 0;
      if (needsReview) pendingManualReview++;
      // Never trust client-writable is_correct / points_awarded for manual grading.
      updates.push({
        id: answer.id, is_correct: null,
        points_awarded: needsReview ? null : 0,
      });
      continue;
    }

    if (written.trim()) throw new Error("An objective question cannot use written grading.");
    if (!selectedId) {
      updates.push({ id: answer.id, is_correct: null, points_awarded: 0 });
      continue;
    }
    const option = optionById.get(selectedId);
    if (!option || option.question_id !== question.id) {
      throw new Error("Selected option does not belong to its question.");
    }
    const awarded = option.is_correct ? question.points : 0;
    score += awarded;
    updates.push({ id: answer.id, is_correct: option.is_correct, points_awarded: awarded });
  }

  const gradingPending = pendingManualReview > 0;
  return {
    updates,
    score: gradingPending ? null : score,
    maxScore,
    percentage: gradingPending ? null : (maxScore ? score / maxScore * 100 : null),
    gradingPending,
    pendingManualReview,
    questionCount: questions.length,
    answeredCount: seenAnswers.size,
  };
}
