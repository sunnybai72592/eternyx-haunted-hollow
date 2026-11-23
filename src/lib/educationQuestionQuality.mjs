/**
 * Read-only question-bank quality review and student worksheet projections.
 *
 * Warnings are editorial aids, never automatic assessment grades. No backend
 * access, persistence, model inference, publishing or learner answer keys.
 */
import {
  QUESTION_BANK_VERSION,QUESTION_BANK_LIMITS,
  validateQuestionBank,learnerQuestionPreview,
} from "./educationQuestionBank.mjs";
import {duplicatePromptWarnings} from "./educationBankWorkbench.mjs";
import {educationSafeCsvCell} from "./educationPrivateAnswerReview.mjs";

export const EDUCATION_BANK_QUALITY_FILTERS=Object.freeze(["all","fix","review","ready"]);
const qualityStates=new Set(EDUCATION_BANK_QUALITY_FILTERS);
const normalize=text=>typeof text==="string"?text.trim().replace(/\s+/gu," ").toLocaleLowerCase():"";

function perQuestionIssues(question,number){
  const state=validateQuestionBank({
    version:QUESTION_BANK_VERSION,
    title:"Review bank",description:"",duration_minutes:30,
    questions:[question],
  });
  return state.issues.map(issue=>issue.replace(/^Question 1:/,"Question "+number+":"));
}

function repeatedChoices(question,number){
  if(question?.type!=="multiple_choice"||!Array.isArray(question.options))return [];
  const found=new Map(),warnings=[];
  for(const [index,choice] of question.options.entries()){
    const key=normalize(choice?.text);
    if(!key)continue;
    if(found.has(key)){
      warnings.push("Question "+number+": choice "+(index+1)+
        " repeats the wording of choice "+found.get(key)+".");
    }else found.set(key,index+1);
  }
  return warnings;
}

export function auditEducationQuestionBank(bank){
  if(!bank||typeof bank!=="object"||!Array.isArray(bank.questions)||
     bank.questions.length>QUESTION_BANK_LIMITS.questions)
    throw new Error("A bounded local question bank is required for quality review.");
  const duplicated=new Map();
  for(const warning of duplicatePromptWarnings(bank)){
    const arr=duplicated.get(warning.questionId)||[];
    arr.push("Question "+warning.questionNumber+
      ": prompt repeats question "+warning.firstNumber+".");
    duplicated.set(warning.questionId,arr);
  }
  const items=bank.questions.map((question,index)=>{
    const issues=perQuestionIssues(question,index+1);
    const warnings=[
      ...repeatedChoices(question,index+1),
      ...(duplicated.get(question?.id)||[]),
    ];
    const state=issues.length?"fix":warnings.length?"review":"ready";
    return Object.freeze({
      id:question?.id??null,number:index+1,type:question?.type??"unknown",
      points:Number.isSafeInteger(question?.points)&&question.points>0?question.points:0,
      state,issues:Object.freeze(issues),warnings:Object.freeze(warnings),
    });
  });
  const counts={
    total:items.length,
    fix:items.filter(item=>item.state==="fix").length,
    review:items.filter(item=>item.state==="review").length,
    ready:items.filter(item=>item.state==="ready").length,
    maxPoints:items.reduce((sum,item)=>sum+item.points,0),
    multipleChoice:items.filter(item=>item.type==="multiple_choice").length,
    trueFalse:items.filter(item=>item.type==="true_false").length,
    written:items.filter(item=>item.type==="short_answer").length,
  };
  const readiness=validateQuestionBank(bank);
  return Object.freeze({
    items:Object.freeze(items),
    counts:Object.freeze(counts),
    validForExport:readiness.valid,
    bankIssues:Object.freeze([...readiness.issues]),
  });
}

export function filterEducationBankAudit(items,filter="all"){
  if(!Array.isArray(items)||!qualityStates.has(filter))
    throw new Error("Invalid question quality filter.");
  return filter==="all"?[...items]:items.filter(item=>item.state===filter);
}

export function nextEducationBankQualityIndex(items,currentIndex,filter="fix"){
  if(!Array.isArray(items)||!Number.isSafeInteger(currentIndex)||
     !["fix","review"].includes(filter)||!items.length)return -1;
  for(let step=1;step<=items.length;step++){
    const index=((currentIndex+step)%items.length+items.length)%items.length;
    if(items[index]?.state===filter)return index;
  }
  return -1;
}

function privateWorksheet(bank){
  if(!validateQuestionBank(bank).valid)
    throw new Error("Complete validation before preparing a student worksheet.");
  const learner=learnerQuestionPreview(bank);
  // Explicit allowlist: no source objects or option IDs/answer booleans.
  return {
    format:"eternyx-learner-practice-worksheet",
    version:1,
    title:bank.title.trim(),
    description:bank.description,
    suggested_duration_minutes:bank.duration_minutes,
    questions:learner.map((question,index)=>({
      number:index+1,type:question.type,text:question.text,points:question.points,
      choices:question.options.map(option=>option.text),
    })),
    notice:"Practice worksheet only. This is not a timed or graded exam.",
  };
}

export function buildEducationLearnerWorksheetJson(bank){
  const content=JSON.stringify(privateWorksheet(bank),null,2)+"\n";
  if(new TextEncoder().encode(content).length>1_000_000)
    throw new Error("Student worksheet exceeds the 1 MB local export limit.");
  return content;
}

export function buildEducationLearnerWorksheetText(bank){
  const sheet=privateWorksheet(bank);
  const lines=[
    "ETERNYX Education · Learner practice worksheet",
    sheet.title,
    sheet.description,
    "Suggested duration: "+sheet.suggested_duration_minutes+" min",
    "Total questions: "+sheet.questions.length,
    "Practice worksheet only. Not a timed or graded exam.",
    "",
  ];
  const labels="ABCDEFGH";
  for(const question of sheet.questions){
    lines.push(question.number+". "+question.text+
      " ("+question.points+" points; "+question.type.replaceAll("_"," ")+")");
    if(question.choices.length){
      question.choices.forEach((choice,index)=>lines.push("   "+labels[index]+". "+choice));
    }else lines.push("   Written response: _______________________________");
    lines.push("");
  }
  const content=lines.join("\n")+"\n";
  if(new TextEncoder().encode(content).length>1_000_000)
    throw new Error("Student worksheet exceeds the 1 MB local export limit.");
  return content;
}

/**
 * This blueprint is an instructor-only self-audit of user-authored structure,
 * not a gradebook and not an official external audit certificate.
 */
export function buildEducationBankAuditCsv(bank){
  const audit=auditEducationQuestionBank(bank);
  const header=["Question number","Question type","Maximum points","Review status",
    "Validation issues","Editorial warnings"];
  const row=values=>values.map(educationSafeCsvCell).join(",");
  const lines=[row(header)];
  for(const item of audit.items){
    lines.push(row([
      item.number,item.type,item.points,item.state,
      item.issues.join(" | "),item.warnings.join(" | "),
    ]));
  }
  return "\uFEFF"+lines.join("\r\n")+"\r\n";
}
