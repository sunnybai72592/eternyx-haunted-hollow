/**
 * Privacy-safe learner exam navigation. This UI derives completion only from
 * the active assessment's question IDs and the learner's own in-memory answers.
 * It never sees instructor keys, correctness or grades.
 *
 * Review flags are ephemeral device-only hints: they are NOT exam submissions
 * and are NOT persisted to the assessment backend or localStorage.
 */
function questionId(item) {
  return item && typeof item.id === "string" && item.id.length > 0 ? item.id : null;
}

export function isEducationQuestionAnswered(answer) {
  if (!answer || typeof answer !== "object") return false;
  return (typeof answer.selectedOptionId === "string" &&
      answer.selectedOptionId.trim().length > 0) ||
    (typeof answer.shortAnswer === "string" &&
      answer.shortAnswer.trim().length > 0);
}

export function createEducationExamReview(questions, answers, flagged) {
  if (!Array.isArray(questions) || !(answers instanceof Map) ||
      !(flagged instanceof Set)) throw new TypeError("Invalid exam review inputs");
  const unique=new Set();
  const entries=questions.map((question,index)=>{
    const id=questionId(question);
    if(!id || unique.has(id))throw new Error("Exam questions must have unique IDs");
    unique.add(id);
    return Object.freeze({
      id,index,number:index+1,
      answered:isEducationQuestionAnswered(answers.get(id)),
      flagged:flagged.has(id),
    });
  });
  const answered=entries.filter(item=>item.answered).length;
  const flaggedCount=entries.filter(item=>item.flagged).length;
  const unanswered=entries.length-answered;
  return Object.freeze({
    entries:Object.freeze(entries),
    total:entries.length,answered,unanswered,
    flagged:flaggedCount,
    readyToReview:unanswered===0,
  });
}

export function toggleEducationReviewFlag(flags,questionIdValue,questions) {
  if(!(flags instanceof Set) || !Array.isArray(questions) ||
     !questions.some(q=>questionId(q)===questionIdValue))
    throw new Error("Cannot flag an unrecognized question");
  const next=new Set(flags);
  if(next.has(questionIdValue))next.delete(questionIdValue);
  else next.add(questionIdValue);
  return next;
}

/** Return original question index, wrapping around, or -1 when none qualify. */
export function nextEducationReviewIndex(entries,fromIndex,mode) {
  if(!Array.isArray(entries) || !Number.isSafeInteger(fromIndex) ||
     !["unanswered","flagged"].includes(mode))return -1;
  const count=entries.length;
  if(count===0)return -1;
  for(let step=1;step<=count;step++){
    const index=((fromIndex+step)%count+count)%count;
    const item=entries[index];
    if(mode==="flagged" ? item.flagged : !item.answered)return index;
  }
  return -1;
}

/** No input answer payloads, grade information or flag IDs are serialized. */
export function educationReviewSummaryMessage(review) {
  if(!review || !Number.isSafeInteger(review.total))return "Exam review unavailable.";
  const waiting=review.unanswered===1?"1 unanswered question":review.unanswered+" unanswered questions";
  const flagged=review.flagged===1?"1 flagged for review":review.flagged+" flagged for review";
  return waiting+" · "+flagged+".";
}
