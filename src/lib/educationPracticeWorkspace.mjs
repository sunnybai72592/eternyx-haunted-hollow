/**
 * Learner-only worksheet practice. No gradebook, answer key, server calls,
 * browser persistence, or implicit marks. Every imported property is
 * allowlisted; instructor-only bank JSON is intentionally NOT accepted.
 */
import {educationSafeCsvCell} from "./educationPrivateAnswerReview.mjs";

export const PRACTICE_WORKSHEET_FORMAT="eternyx-learner-practice-worksheet";
export const PRACTICE_SESSION_FORMAT="eternyx-learner-practice-session";
export const PRACTICE_FILE_MAX_BYTES=1_250_000;
export const PRACTICE_ANSWER_MAX=5000;
export const PRACTICE_MAX_QUESTIONS=100;
const notice="Practice worksheet only. This is not a timed or graded exam.";
const types=new Set(["multiple_choice","true_false","short_answer"]);
const strict=(v,keys)=>!!v&&typeof v==="object"&&!Array.isArray(v)&&
  JSON.stringify(Object.keys(v).sort())===JSON.stringify([...keys].sort());
const within=(v,min,max)=>typeof v==="string"&&v.trim().length>=min&&v.length<=max;
function fail(){throw new Error("This is not a valid, learner-safe ETERNYX practice worksheet or session.");}
function integer(v,min,max){return Number.isSafeInteger(v)&&v>=min&&v<=max;}

export function validatePracticeWorksheet(raw){
  if(!strict(raw,["format","version","title","description",
      "suggested_duration_minutes","questions","notice"]) ||
    raw.format!==PRACTICE_WORKSHEET_FORMAT || raw.version!==1 ||
    !within(raw.title,1,160) || !within(raw.description,0,1500) ||
    !integer(raw.suggested_duration_minutes,1,1440) ||
    raw.notice!==notice || !Array.isArray(raw.questions) ||
    raw.questions.length<1 || raw.questions.length>PRACTICE_MAX_QUESTIONS)fail();
  const questions=raw.questions.map((question,index)=>{
    if(!strict(question,["number","type","text","points","choices"]) ||
      question.number!==index+1 || !types.has(question.type) ||
      !within(question.text,1,2000) ||
      !integer(question.points,1,1000) ||
      !Array.isArray(question.choices))fail();
    const count=question.choices.length;
    if(question.type==="short_answer" ? count!==0 :
      question.type==="true_false" ? count!==2 : count<2||count>8)fail();
    if(question.choices.some(v=>!within(v,1,500)))fail();
    // Duplicate choices would make the learner's response ambiguous.
    if(new Set(question.choices.map(v=>v.trim().toLocaleLowerCase())).size!==count)fail();
    return Object.freeze({
      number:question.number,type:question.type,
      text:question.text,points:question.points,
      choices:Object.freeze([...question.choices]),
    });
  });
  return Object.freeze({
    format:PRACTICE_WORKSHEET_FORMAT,version:1,title:raw.title,
    description:raw.description,
    suggested_duration_minutes:raw.suggested_duration_minutes,
    questions:Object.freeze(questions),notice,
  });
}
export function blankPracticeResponses(worksheet){
  validatePracticeWorksheet(worksheet);
  return worksheet.questions.map(q=>Object.freeze({
    number:q.number,choice_index:null,written_text:"",
  }));
}
function validatePracticeResponses(worksheet,responses){
  if(!Array.isArray(responses)||responses.length!==worksheet.questions.length)fail();
  return responses.map((r,i)=>{
    const q=worksheet.questions[i];
    if(!strict(r,["number","choice_index","written_text"]) ||
      r.number!==q.number || !within(r.written_text,0,PRACTICE_ANSWER_MAX) ||
      (q.type==="short_answer"
        ? r.choice_index!==null
        : r.written_text!=="" ||
          !(r.choice_index===null || integer(r.choice_index,0,q.choices.length-1))))fail();
    return Object.freeze({number:r.number,choice_index:r.choice_index,written_text:r.written_text});
  });
}
function validateFlags(worksheet,flags){
  if(!Array.isArray(flags)||flags.length>PRACTICE_MAX_QUESTIONS ||
     flags.some(n=>!integer(n,1,worksheet.questions.length)) ||
     new Set(flags).size!==flags.length ||
     flags.some((n,i)=>i>0&&n<=flags[i-1]))fail();
  return Object.freeze([...flags]);
}
export function parseEducationPracticeFile(text){
  if(typeof text!=="string"||!text.trim()||
    new TextEncoder().encode(text).byteLength>PRACTICE_FILE_MAX_BYTES)fail();
  let object;
  try{object=JSON.parse(text);}catch{fail();}
  if(object?.format===PRACTICE_WORKSHEET_FORMAT){
    const worksheet=validatePracticeWorksheet(object);
    return {worksheet,responses:blankPracticeResponses(worksheet),flags:[]};
  }
  if(!strict(object,["format","version","worksheet","responses","flagged_numbers"]) ||
    object.format!==PRACTICE_SESSION_FORMAT||object.version!==1)fail();
  const worksheet=validatePracticeWorksheet(object.worksheet);
  return {
    worksheet,
    responses:validatePracticeResponses(worksheet,object.responses),
    flags:validateFlags(worksheet,object.flagged_numbers),
  };
}
export function updatePracticeResponse(worksheet,responses,number,choice_index,written_text){
  const w=validatePracticeWorksheet(worksheet);
  const old=validatePracticeResponses(w,responses);
  if(!integer(number,1,w.questions.length))fail();
  const next=old.map(row=>row.number===number
    ? {number,choice_index,written_text}:row);
  return validatePracticeResponses(w,next);
}
export function togglePracticeFlag(worksheet,flags,number){
  const w=validatePracticeWorksheet(worksheet);
  const old=validateFlags(w,flags);
  if(!integer(number,1,w.questions.length))fail();
  return validateFlags(w,old.includes(number)
    ? old.filter(n=>n!==number)
    : [...old,number].sort((a,b)=>a-b));
}
export function summarizePractice(worksheet,responses,flags){
  const w=validatePracticeWorksheet(worksheet);
  const answers=validatePracticeResponses(w,responses);
  const marked=validateFlags(w,flags);
  const answered=answers.reduce((n,row,i)=>n+
    (w.questions[i].type==="short_answer"
      ? Number(row.written_text.trim().length>0)
      : Number(row.choice_index!==null)),0);
  return Object.freeze({
    total:w.questions.length,answered,unanswered:w.questions.length-answered,
    flagged:marked.length,percentage:Math.round(100*answered/w.questions.length),
    next_unanswered:answers.find((r,i)=>w.questions[i].type==="short_answer"
      ? !r.written_text.trim():r.choice_index===null)?.number??null,
  });
}
export function buildPracticeSessionJson(worksheet,responses,flags){
  const w=validatePracticeWorksheet(worksheet);
  const valid=validatePracticeResponses(w,responses);
  const marked=validateFlags(w,flags);
  const result=JSON.stringify({
    format:PRACTICE_SESSION_FORMAT,version:1,
    worksheet:w,responses:valid,flagged_numbers:marked,
  },null,2)+"\n";
  if(new TextEncoder().encode(result).byteLength>PRACTICE_FILE_MAX_BYTES)fail();
  return result;
}
export function buildPracticeAnswerCsv(worksheet,responses){
  const w=validatePracticeWorksheet(worksheet);
  const answers=validatePracticeResponses(w,responses);
  const safe=items=>items.map(educationSafeCsvCell).join(",");
  const rows=[safe(["Worksheet","Question","Question type","Prompt","My answer",
    "Progress","Grade status"])];
  for(let i=0;i<w.questions.length;i++){
    const q=w.questions[i],r=answers[i];
    const text=q.type==="short_answer"?r.written_text:
      (r.choice_index===null?"":q.choices[r.choice_index]);
    rows.push(safe([w.title,q.number,q.type,q.text,text,
      text.trim()?"Answered":"Not answered","Unscored local practice"]));
  }
  return "\uFEFF"+rows.join("\r\n")+"\r\n";
}
