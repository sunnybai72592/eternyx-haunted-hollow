/**
 * Pure, local-only instructor question-bank editing helpers.
 *
 * No HTTP, persistence, background synchronization or DB access. Answer
 * keys stay only in the authenticated editor's in-memory draft or in an
 * explicit user-exported JSON file.
 */
import { QUESTION_BANK_LIMITS, QUESTION_TYPES, validateQuestionBankDraft } from "./educationQuestionBank.mjs";

const idPattern = /^[a-z0-9_-]{1,64}$/i;
const types = new Set(["all", ...QUESTION_TYPES]);
const own = (items,id) => items.some(item => item.id === id);

export function duplicateBankQuestion(bank, questionId, makeId) {
  if (!validateQuestionBankDraft(bank).valid ||
      typeof questionId !== "string" || typeof makeId !== "function") {
    throw new Error("A valid local question bank and selected question are required.");
  }
  if (bank.questions.length >= QUESTION_BANK_LIMITS.questions)
    throw new Error("This question bank has reached its 100-question limit.");
  const index = bank.questions.findIndex(q=>q.id === questionId);
  if (index < 0) throw new Error("Question not found in this bank.");
  const original = bank.questions[index];
  const used = new Set(bank.questions.flatMap(q=>[q.id,...q.options.map(o=>o.id)]));
  const generate = () => {
    const id = makeId();
    if (typeof id !== "string" || !idPattern.test(id) || used.has(id))
      throw new Error("Duplicate or invalid question identifier.");
    used.add(id);
    return id;
  };
  const copy = {
    id:generate(),type:original.type,text:original.text,
    points:original.points,
    options:original.options.map(option=>({
      id:generate(),text:option.text,correct:option.correct,
    })),
  };
  const next = {
    ...bank,
    questions:[
      ...bank.questions.slice(0,index+1),copy,
      ...bank.questions.slice(index+1),
    ],
  };
  if (!validateQuestionBankDraft(next).valid)
    throw new Error("Duplicate question failed local draft validation.");
  return {bank:next,questionId:copy.id};
}

export function moveBankQuestion(bank, questionId, direction) {
  if (!validateQuestionBankDraft(bank).valid || ![-1,1].includes(direction))
    throw new Error("Invalid bank or move direction.");
  const from=bank.questions.findIndex(q=>q.id===questionId);
  const to=from+direction;
  if(from<0||to<0||to>=bank.questions.length)return bank;
  const questions=[...bank.questions];
  [questions[from],questions[to]]=[questions[to],questions[from]];
  return {...bank,questions};
}

export function searchBankQuestions(bank,search="",type="all") {
  if(!bank||!Array.isArray(bank.questions)||typeof search!=="string"||
     !types.has(type))throw new Error("Invalid question filter.");
  const needle=search.trim().toLocaleLowerCase().slice(0,120);
  return bank.questions
    .map((q,index)=>({id:q.id,index,type:q.type,text:q.text,points:q.points}))
    .filter(q=>(type==="all"||q.type===type)&&
      (!needle||q.text.toLocaleLowerCase().includes(needle)));
}

/** Duplicate prompts are editorial warnings, not fabricated grading rules. */
export function duplicatePromptWarnings(bank) {
  if(!bank||!Array.isArray(bank.questions))return [];
  const seen=new Map(),warnings=[];
  for(const [index,q] of bank.questions.entries()){
    if(!q||typeof q.text!=="string")continue;
    const normalized=q.text.trim().replace(/\s+/g," ").toLocaleLowerCase();
    if(normalized.length<3)continue;
    if(seen.has(normalized)){
      warnings.push({
        questionId:q.id,questionNumber:index+1,
        firstNumber:seen.get(normalized),
      });
    }else seen.set(normalized,index+1);
  }
  return warnings;
}

/** Map real validator issue labels back to editable question IDs. */
export function questionIssueTargets(bank, issues) {
  if(!Array.isArray(bank?.questions)||!Array.isArray(issues))return [];
  const targets=[];
  for(const issue of issues){
    if(typeof issue!=="string")continue;
    const match=/^Question ([1-9]\d*):/.exec(issue);
    if(!match)continue;
    const index=Number(match[1])-1;
    if(index>=0&&index<bank.questions.length&&bank.questions[index]){
      targets.push({id:bank.questions[index].id,index,issue});
    }
  }
  return targets;
}

/**
 * Bounded, in-memory-only history. Every state is immutable by contract;
 * edits replace the bank instead of modifying its nested arrays in place.
 * reset() drops ALL old answer-key snapshots on draft import/account switch.
 */
export function createBankUndoHistory(initial,limit=30) {
  if(!validateQuestionBankDraft(initial).valid ||
     !Number.isSafeInteger(limit)||limit<1||limit>100)
    throw new Error("Invalid local history configuration.");
  let current=initial,past=[],future=[];
  function status(){return Object.freeze({
    bank:current,undoCount:past.length,redoCount:future.length,
  });}
  function edit(updater) {
    if(typeof updater!=="function")throw new Error("Draft updater is required.");
    const next=updater(current);
    if(next===current)return status();
    if(!validateQuestionBankDraft(next).valid)
      throw new Error("Invalid draft change; previous answer key was retained.");
    past.push(current);
    if(past.length>limit)past.shift();
    current=next;
    future=[];
    return status();
  }
  function undo(){
    if(!past.length)return status();
    future.push(current);
    current=past.pop();
    return status();
  }
  function redo(){
    if(!future.length)return status();
    past.push(current);
    if(past.length>limit)past.shift();
    current=future.pop();
    return status();
  }
  function reset(next){
    if(!validateQuestionBankDraft(next).valid)
      throw new Error("Invalid replacement bank.");
    current=next;past=[];future=[];
    return status();
  }
  return Object.freeze({status,edit,undo,redo,reset});
}
