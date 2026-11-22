/**
 * Local review of a student's own server-returned answers. This code is
 * deliberately unable to produce grading authority, access instructor keys,
 * issue certificates, or persist sensitive answers.
 */
export const EDUCATION_ANSWER_REVIEW_FILTERS = Object.freeze([
  "all", "pending", "reviewed", "correct", "incorrect",
]);

function safePoints(answer) {
  return Number.isSafeInteger(answer?.points_awarded) &&
    Number.isSafeInteger(answer?.points) &&
    answer.points > 0 && answer.points_awarded >= 0 &&
    answer.points_awarded <= answer.points;
}

/** A readable status is a presentation hint, NOT a server grading decision. */
export function educationAnswerReviewStatus(answer, revealGrades) {
  if (!revealGrades) return "pending";
  if (answer?.is_correct === true) return "correct";
  if (answer?.is_correct === false) return "incorrect";
  if (safePoints(answer)) return "reviewed";
  return "pending";
}

export function educationAnswerReviewLabel(answer, revealGrades) {
  const state=educationAnswerReviewStatus(answer,revealGrades);
  if(state==="correct")return "Marked correct";
  if(state==="incorrect")return "Marked incorrect";
  if(state==="reviewed")return "Written answer reviewed";
  return "Grading pending";
}

/**
 * Counts only returned, owned answer rows. Never represents the total number
 * of questions on a test or fabricates marks while verification is pending.
 */
export function summarizeEducationAnswerReview(rows,revealGrades) {
  if(!Array.isArray(rows))return Object.freeze({
    returned:0,pending:0,reviewed:0,correct:0,incorrect:0,
  });
  const counts={returned:rows.length,pending:0,reviewed:0,correct:0,incorrect:0};
  for(const row of rows)counts[educationAnswerReviewStatus(row,revealGrades)]++;
  return Object.freeze(counts);
}

/** Search only rows already returned by a user's own authenticated query. */
export function filterEducationAnswerReview(rows,search="",filter="all",revealGrades=false) {
  if(!Array.isArray(rows)||typeof search!=="string"||
    !EDUCATION_ANSWER_REVIEW_FILTERS.includes(filter))
    throw new Error("Invalid answer review filter");
  const term=search.trim().toLocaleLowerCase().slice(0,120);
  return rows.filter(row=>
    (filter==="all" || (revealGrades
      ? (filter==="reviewed"
        ? educationAnswerReviewStatus(row,true)!=="pending"
        : educationAnswerReviewStatus(row,true)===filter)
      : filter==="pending")) &&
    (!term || [row?.question_text,row?.user_answer].some(text=>
      typeof text==="string"&&text.toLocaleLowerCase().includes(term)))
  );
}

export function educationResultProvenance(verifiedMode,receipt,verifiedGradeRevealed) {
  if(!verifiedMode)return "Legacy recorded grade (not independently verified)";
  if(verifiedGradeRevealed && receipt?.grade_status==="finalized")
    return "Final grade verified against the official assessment ledger";
  if(receipt?.grade_status==="pending_review")
    return "Official written review is pending; no final grade available";
  if(receipt?.grade_status==="in_progress")
    return "Attempt is still in progress; no final grade available";
  return "Official grade verification incomplete; no final grade available";
}

/**
 * CSV injection protection is required because learner-written responses and
 * assessment titles can start with spreadsheet formula instructions.
 * Quotes alone do NOT prevent spreadsheets from evaluating formula cells.
 */
export function educationSafeCsvCell(input) {
  let value=String(input??"");
  if (/^[\s\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value)) {
    value="'"+value;
  }
  return '"'+value.replace(/"/g,'""')+'"';
}

export function buildEducationPrivateAnswerCsv({
  attempt,test,answers,verifiedMode,receipt,gradeRevealed,
}) {
  if(!attempt || typeof attempt.id!=="string" ||
     !["submitted","auto_submitted","cheated"].includes(attempt.status) ||
     !Array.isArray(answers)) {
    throw new Error("A submitted owned assessment is required for CSV export");
  }
  const canReleaseNumericMarks=verifiedMode && gradeRevealed &&
    receipt?.grade_status==="finalized" && receipt.attempt_id===attempt.id;
  const provenance=educationResultProvenance(verifiedMode,receipt,canReleaseNumericMarks);
  const columns=[
    "Assessment","Attempt ID","Grade provenance","Response number",
    "Question","Submitted answer","Review status",
    "Awarded points","Possible points",
  ];
  const lines=[columns.map(educationSafeCsvCell).join(",")];
  for(const [index,row] of answers.entries()){
    if(!row || typeof row.question_text!=="string" ||
       typeof row.user_answer!=="string") {
      throw new Error("Invalid student answer row; private export canceled");
    }
    const status=canReleaseNumericMarks
      ? educationAnswerReviewLabel(row,true) : "Marks not independently verified";
    const marks=canReleaseNumericMarks && safePoints(row)
      ? [String(row.points_awarded),String(row.points)] : ["",""];
    lines.push([
      test?.title||"Assessment",attempt.id,provenance,index+1,
      row.question_text,row.user_answer,status,...marks,
    ].map(educationSafeCsvCell).join(","));
  }
  return "\uFEFF"+lines.join("\r\n")+"\r\n";
}

export function annotateEducationTextReport(text,provenance) {
  if(typeof text!=="string"||!text.startsWith("ETERNYX Education · Assessment report\n") ||
     typeof provenance!=="string"||!provenance) {
    throw new Error("An authenticated local report is required");
  }
  return text.replace("ETERNYX Education · Assessment report\n",
    "ETERNYX Education · Assessment report\nGrade provenance: "+provenance+"\n");
}
