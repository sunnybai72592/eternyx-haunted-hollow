/**
 * Real, owner-scoped results query projection and local evidence review.
 * No writes, grade calculations, answer keys, local storage or new APIs.
 * The authenticated server query and finalized grade ledger remain authoritative.
 */
import { validExamId } from "./educationExam.mjs";
import { educationSafeCsvCell, educationResultProvenance, educationAnswerReviewLabel } from "./educationPrivateAnswerReview.mjs";

export const EDUCATION_RESULT_MAX_ROWS = 100;
export const EDUCATION_RESULT_SORTS = Object.freeze(["recorded", "reverse", "question"]);

function parsedQuestion(value){
  if(value===null||value===undefined)return null;
  if(Array.isArray(value)){
    if(value.length===0)return null;
    if(value.length!==1)throw new Error("An answer returned ambiguous question metadata.");
    return value[0];
  }
  if(typeof value!=="object")throw new Error("An answer returned invalid question metadata.");
  return value;
}

/**
 * The query already has an attempt_id condition and the attempt is read with
 * user_id === the active owner. Check that every joined question (if readable)
 * belongs to that specific assessment and each answer ID occurs once.
 */
export function normalizeEducationResultEvidence(rows,testId,revealGrades=false){
  if(!validExamId(testId)||!Array.isArray(rows)||rows.length>EDUCATION_RESULT_MAX_ROWS)
    throw new Error("The owned assessment answer collection could not be verified.");
  const seen=new Set();
  return rows.map((answer,index)=>{
    if(!answer||typeof answer!=="object"||Array.isArray(answer)||
       !validExamId(answer.question_id)||seen.has(answer.question_id))
      throw new Error("Returned answers contain invalid or duplicate question references.");
    seen.add(answer.question_id);
    const question=parsedQuestion(answer.questions);
    if(question!==null&&(!question||typeof question!=="object"||Array.isArray(question)||
       question.id!==answer.question_id||question.test_id!==testId))
      throw new Error("Returned question metadata does not belong to this assessment.");
    const known=question!==null;
    const prompt=known?question.question_text:null;
    if(known&&(
      typeof prompt!=="string"||prompt.trim().length===0||prompt.length>4000||
      !Number.isSafeInteger(question.points)||question.points<1||question.points>1000
    ))throw new Error("Returned question wording or possible points could not be verified.");
    const selected=answer.selected_option_id;
    const written=answer.short_answer_text;
    if(selected!==null&&selected!==undefined&&!validExamId(selected))
      throw new Error("An answer contained an invalid selected-choice reference.");
    if(written!==null&&written!==undefined&&
       (typeof written!=="string"||written.length>5000))
      throw new Error("A written answer is missing or exceeds the permitted length.");
    if(selected&&typeof written==="string"&&written.trim()!=="")
      throw new Error("An answer contained conflicting selected and written responses.");
    let correct=null,awarded=null;
    if(revealGrades&&known){
      if(answer.is_correct!==null&&answer.is_correct!==undefined&&
         typeof answer.is_correct!=="boolean")
        throw new Error("A verified answer had a malformed correctness verdict.");
      if(answer.points_awarded!==null&&answer.points_awarded!==undefined&&
         (!Number.isSafeInteger(answer.points_awarded)||
          answer.points_awarded<0||answer.points_awarded>question.points))
        throw new Error("A verified answer contained inconsistent awarded points.");
      correct=answer.is_correct??null;
      awarded=answer.points_awarded??null;
    }
    const visibleAnswer=typeof written==="string"&&written.length>0?written:
      selected?"Selected option recorded":"No answer";
    return Object.freeze({
      id:answer.question_id,
      question_text:known?prompt:"Question metadata restricted",
      points:known?question.points:null,
      is_correct:correct,points_awarded:awarded,
      user_answer:visibleAnswer,response_number:index+1,
      metadata_available:known,
    });
  });
}

export function summarizeEducationResultEvidence(rows){
  if(!Array.isArray(rows)||rows.length>EDUCATION_RESULT_MAX_ROWS)
    throw new Error("Invalid authenticated results evidence.");
  const counts={
    returned:rows.length,verifiedQuestionMetadata:0,restrictedQuestionMetadata:0,
    writtenResponses:0,selectedOptions:0,blankResponses:0,
  };
  for(const row of rows){
    if(!row||!validExamId(row.id)||!Number.isSafeInteger(row.response_number)||
       row.response_number<1)
      throw new Error("Invalid result evidence row.");
    if(row.metadata_available)counts.verifiedQuestionMetadata++;
    else counts.restrictedQuestionMetadata++;
    if(row.user_answer==="Selected option recorded")counts.selectedOptions++;
    else if(row.user_answer==="No answer")counts.blankResponses++;
    else counts.writtenResponses++;
  }
  return Object.freeze(counts);
}

export function sortEducationResultEvidence(rows,mode="recorded"){
  if(!Array.isArray(rows)||!EDUCATION_RESULT_SORTS.includes(mode))
    throw new Error("Invalid result sorting mode.");
  const compare=(a,b)=>mode==="question"
    ? a.question_text.localeCompare(b.question_text)||a.response_number-b.response_number
    : mode==="reverse"? b.response_number-a.response_number
    : a.response_number-b.response_number;
  return [...rows].sort(compare);
}

/**
 * Export ONLY the filtered displayed normalized rows. The original source
 * response number remains attached even if the user sorts/filters.
 * Never leak numeric marks on legacy or incomplete ledger verification.
 */
export function buildEducationVisibleResultCsv({
 attempt,answers,receipt,verifiedMode=false,gradeRevealed=false,scope="Current displayed answers",
}){
  if(!attempt||!validExamId(attempt.id)||
     !["submitted","auto_submitted","cheated"].includes(attempt.status)||
     !Array.isArray(answers)||answers.length>EDUCATION_RESULT_MAX_ROWS||
     typeof scope!=="string"||scope.length>160||
     answers.some(row=>!row||!validExamId(row.id)||row.metadata_available!==true||
       !Number.isSafeInteger(row.response_number)||row.response_number<1||
       typeof row.question_text!=="string"||typeof row.user_answer!=="string"))
    throw new Error("The displayed private answers cannot be safely exported.");
  const numbers=new Set();
  for(const answer of answers){
    if(numbers.has(answer.response_number))
      throw new Error("Displayed answers contain duplicate source response numbers.");
    numbers.add(answer.response_number);
  }
  const trusted=verifiedMode&&gradeRevealed&&
    receipt?.grade_status==="finalized"&&receipt.attempt_id===attempt.id&&
    Number.isSafeInteger(receipt.score)&&Number.isSafeInteger(receipt.max_score)&&
    receipt.score>=0&&receipt.max_score>0&&receipt.score<=receipt.max_score&&
    typeof receipt.finalized_at==="string"&&Number.isFinite(Date.parse(receipt.finalized_at));
  const provenance=educationResultProvenance(verifiedMode,receipt,trusted);
  const csv=values=>values.map(educationSafeCsvCell).join(",");
  const lines=[csv([
    "Assessment attempt","Export scope","Grade provenance","Original response number",
    "Question","Submitted response","Review status","Awarded points","Possible points",
  ])];
  for(const answer of answers){
    const marked=trusted&&
      Number.isSafeInteger(answer.points_awarded)&&
      Number.isSafeInteger(answer.points)&&answer.points>0&&
      answer.points_awarded>=0&&answer.points_awarded<=answer.points;
    lines.push(csv([
      attempt.id,scope,provenance,answer.response_number,
      answer.question_text,answer.user_answer,
      trusted?educationAnswerReviewLabel(answer,true):"Marks not independently verified",
      marked?answer.points_awarded:"",marked?answer.points:"",
    ]));
  }
  return "\uFEFF"+lines.join("\r\n")+"\r\n";
}
