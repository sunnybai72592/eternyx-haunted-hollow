/**
 * Browser-only exam presentation guardrails. Server atomic CBT RPCs and RLS
 * continue to own identity, deadlines, answer admission and actual grades.
 * No answer keys, correctness data, local storage, or grade inference.
 */
import {validExamId} from "./educationExam.mjs";

export const EDUCATION_EXAM_MAX_ANSWER_CHARS=5000;
export const EDUCATION_EXAM_MAX_QUESTIONS=100;
export const EDUCATION_EXAM_MAX_CHOICES=8;
const objectiveTypes=new Set(["multiple_choice","true_false"]);
const knownTypes=new Set(["multiple_choice","true_false","short_answer"]);

function cleanedText(value,limit){
  return typeof value==="string"&&value.trim().length>0&&
    value.length<=limit;
}
function questionSet(questions){
  if(!Array.isArray(questions)||questions.length<1||
     questions.length>EDUCATION_EXAM_MAX_QUESTIONS)
    throw new Error("Assessment questions are missing or exceed the configured limit.");
  const seen=new Set();
  for(const question of questions){
    if(!question||!validExamId(question.id)||seen.has(question.id)||
       !knownTypes.has(question.question_type)||
       !cleanedText(question.question_text,4000)||
       !Number.isSafeInteger(question.points)||question.points<1||question.points>1000||
       !Number.isSafeInteger(question.order_index)||question.order_index<0){
      throw new Error("Assessment question metadata is invalid or duplicated.");
    }
    seen.add(question.id);
  }
  return seen;
}

/** Reject malformed question metadata BEFORE a new attempt may be started. */
export function validateEducationExamQuestions(questions,testId){
  if(!validExamId(testId))throw new Error("Invalid assessment identifier.");
  questionSet(questions);
  return questions.map(q=>({
    id:q.id,question_text:q.question_text,question_type:q.question_type,
    points:q.points,order_index:q.order_index,
  }));
}

export function validateEducationExamDetails(test,questions,expectedId){
  if(!test||test.id!==expectedId||!validExamId(expectedId)||
     test.is_active!==true||!cleanedText(test.title,300)||
     !Number.isSafeInteger(test.duration_minutes)||
     test.duration_minutes<1||test.duration_minutes>1440)
    throw new Error("Assessment metadata could not be confirmed.");
  return {
    id:test.id,title:test.title,is_active:true,
    duration_minutes:test.duration_minutes,
    questions:validateEducationExamQuestions(questions,expectedId),
  };
}

/** Never request or accept a correct-answer field for the learner. */
export function validateEducationExamOptions(rows,question){
  if(!question||!objectiveTypes.has(question.question_type)||!validExamId(question.id)||
     !Array.isArray(rows)||rows.length<2||rows.length>EDUCATION_EXAM_MAX_CHOICES||
     (question.question_type==="true_false"&&rows.length!==2))
    throw new Error("This assessment question has no valid set of choices.");
  const ids=new Set(),texts=new Set(),result=[];
  for(const item of rows){
    const text=item?.option_text;
    const normalized=typeof text==="string"
      ?text.trim().replace(/\s+/gu," ").toLocaleLowerCase():"";
    if(!item||!validExamId(item.id)||ids.has(item.id)||
       !cleanedText(text,1000)||texts.has(normalized))
      throw new Error("Question choices are incomplete, duplicated or unavailable.");
    ids.add(item.id);texts.add(normalized);
    result.push({id:item.id,option_text:text});
  }
  return result;
}

/**
 * Restore only selected answers for the actual, currently returned questions.
 * A malformed or foreign row must fail the restore query; never invent an
 * unanswered fresh attempt because server data was inconsistent.
 */
export function restoreEducationExamAnswers(rows,questions){
  const ids=questionSet(questions);
  if(!Array.isArray(rows)||rows.length>questions.length)
    throw new Error("The saved answer collection could not be verified.");
  const questionsById=new Map(questions.map(q=>[q.id,q]));
  const seen=new Set(),answers=[];
  for(const row of rows){
    if(!row||!validExamId(row.question_id)||!ids.has(row.question_id)||
       seen.has(row.question_id))
      throw new Error("Saved answers contain unknown or duplicate question references.");
    seen.add(row.question_id);
    const question=questionsById.get(row.question_id);
    const selected=row.selected_option_id;
    const written=row.short_answer_text;
    if(selected!==null&&selected!==undefined&&!validExamId(selected))
      throw new Error("Saved choice reference is malformed.");
    if(written!==null&&written!==undefined&&
       (typeof written!=="string"||written.length>EDUCATION_EXAM_MAX_ANSWER_CHARS))
      throw new Error("Saved written response is malformed or too long.");
    if(question.question_type==="short_answer"){
      if(selected!==null&&selected!==undefined)
        throw new Error("Written response contained an unrelated choice.");
    }else if(written!==null&&written!==undefined&&written.trim()!==""){
      throw new Error("Multiple-choice response contained unrelated written text.");
    }
    answers.push({
      questionId:row.question_id,
      selectedOptionId:selected||undefined,
      shortAnswer:written||undefined,
    });
  }
  return answers;
}

export function educationChoiceSelectionStatus(answer,choices){
  const selected=answer?.selectedOptionId;
  if(typeof selected!=="string"||!selected)return "none";
  if(choices===null||choices===undefined)return "pending";
  if(!Array.isArray(choices))return "unavailable";
  return choices.some(option=>option?.id===selected)?"valid":"unavailable";
}

/**
 * A saved option no longer present in the just-loaded choice set must not
 * count as an answered CURRENT question. The raw restored response remains
 * untouched and is never automatically overwritten on the server.
 */
export function projectEducationExamReviewAnswers(answers,question,choices){
  if(!(answers instanceof Map))throw new Error("Assessment answer map is unavailable.");
  if(!question||!objectiveTypes.has(question.question_type))return answers;
  const answer=answers.get(question.id);
  if(educationChoiceSelectionStatus(answer,choices)!=="unavailable")return answers;
  const projection=new Map(answers);
  projection.set(question.id,{questionId:question.id});
  return projection;
}

/** Reject fabricated browser choices and out-of-bounds written responses. */
export function createEducationExamAnswer(question,value,choices){
  if(!question||!validExamId(question.id)||!knownTypes.has(question.question_type)||
     typeof value!=="string")throw new Error("Invalid assessment answer.");
  if(question.question_type==="short_answer"){
    if(value.length>EDUCATION_EXAM_MAX_ANSWER_CHARS)
      throw new Error("Written response exceeds the 5,000-character limit.");
    return {questionId:question.id,shortAnswer:value};
  }
  if(!Array.isArray(choices)||!choices.some(option=>option?.id===value))
    throw new Error("Select a choice that is currently available for this question.");
  return {questionId:question.id,selectedOptionId:value};
}
